package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/samudera/bot/internal/model"
	"github.com/samudera/bot/internal/ocr"
	"github.com/samudera/bot/internal/ollama"
	"github.com/samudera/bot/internal/review"
	"github.com/samudera/bot/internal/stockapi"
)

// pendingPhoto holds a downloaded image waiting for the user to pick a receipt type.
type pendingPhoto struct {
	imgBytes []byte
	filename string
	msg      *tgbotapi.Message
	storedAt time.Time
}

type Handler struct {
	bot          *tgbotapi.BotAPI
	ai           *ollama.Client
	ocrClient    *ocr.Client
	reviewClient *review.Client
	stockClient  *stockapi.Client
	groupID      int64
	adminID      int64

	pendingMu     sync.Mutex
	pendingPhotos map[string]*pendingPhoto // key: "chatID:messageID"
}

func New(bot *tgbotapi.BotAPI, ai *ollama.Client, ocrClient *ocr.Client, reviewClient *review.Client, stockClient *stockapi.Client, groupID, adminID int64) *Handler {
	h := &Handler{
		bot:           bot,
		ai:            ai,
		ocrClient:     ocrClient,
		reviewClient:  reviewClient,
		stockClient:   stockClient,
		groupID:       groupID,
		adminID:       adminID,
		pendingPhotos: make(map[string]*pendingPhoto),
	}
	go h.cleanupPending()
	return h
}

// cleanupPending removes stale pending photos (older than 10 minutes) every 5 minutes.
func (h *Handler) cleanupPending() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		h.pendingMu.Lock()
		for k, p := range h.pendingPhotos {
			if time.Since(p.storedAt) > 10*time.Minute {
				delete(h.pendingPhotos, k)
			}
		}
		h.pendingMu.Unlock()
	}
}

// receiptTypeButtons returns the inline keyboard for selecting a receipt type.
// The callback data format is "rt:<pendingKey>:<receiptType>".
var receiptTypeButtons = [][]string{
	{"Timbangan Ikan Basah", "timbangan_ikan_basah"},
	{"Timbangan Sortir", "timbangan_sortir"},
	{"Bon Penjualan", "bon_penjualan"},
	{"Bon Pengeluaran", "bon_pengeluaran"},
	{"Beli Ikan (HPP)", "beli_ikan"},
	{"Beli Item", "beli_item"},
	{"Bayar Jasa", "bayar_jasa"},
}

func receiptTypeKeyboard(pendingKey string) tgbotapi.InlineKeyboardMarkup {
	var rows [][]tgbotapi.InlineKeyboardButton
	for _, pair := range receiptTypeButtons {
		label, rtype := pair[0], pair[1]
		rows = append(rows, tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData(label, "rt:"+pendingKey+":"+rtype),
		))
	}
	return tgbotapi.NewInlineKeyboardMarkup(rows...)
}

// Dispatch routes an incoming update to the right handler.
func (h *Handler) Dispatch(update tgbotapi.Update) {
	// Handle inline keyboard callbacks (receipt type selection)
	if update.CallbackQuery != nil {
		h.handleCallback(update.CallbackQuery)
		return
	}

	if update.Message == nil {
		return
	}
	msg := update.Message

	log.Printf("[msg] chat_id=%d user_id=%d type=%s text=%q", msg.Chat.ID, msg.From.ID, msg.Chat.Type, msg.Text)

	if msg.Chat.ID != h.groupID && msg.Chat.ID != h.adminID {
		log.Printf("ignoring message from chat %d (not group or admin)", msg.Chat.ID)
		return
	}

	switch {
	case msg.Photo != nil:
		h.handlePhoto(msg)
	case msg.Document != nil && isImage(msg.Document.MimeType):
		h.handleDocument(msg)
	case msg.Text != "":
		h.handleText(msg)
	}
}

func (h *Handler) handlePhoto(msg *tgbotapi.Message) {
	h.sendTyping(msg.Chat.ID)
	photos := msg.Photo
	largest := photos[len(photos)-1]
	imgBytes, err := h.downloadFile(largest.FileID)
	if err != nil {
		log.Printf("photo download error: %v", err)
		h.reply(msg, "Gagal mengunduh foto. Coba kirim ulang.")
		return
	}
	h.askReceiptType(msg, imgBytes, "photo.jpg")
}

func (h *Handler) handleDocument(msg *tgbotapi.Message) {
	h.sendTyping(msg.Chat.ID)
	imgBytes, err := h.downloadFile(msg.Document.FileID)
	if err != nil {
		log.Printf("document download error: %v", err)
		h.reply(msg, "Gagal mengunduh file. Coba kirim ulang.")
		return
	}
	h.askReceiptType(msg, imgBytes, msg.Document.FileName)
}

// askReceiptType stores the image and asks the user to pick a receipt type via inline buttons.
func (h *Handler) askReceiptType(msg *tgbotapi.Message, imgBytes []byte, filename string) {
	pendingKey := fmt.Sprintf("%d:%d", msg.Chat.ID, msg.MessageID)
	h.pendingMu.Lock()
	h.pendingPhotos[pendingKey] = &pendingPhoto{
		imgBytes: imgBytes,
		filename: filename,
		msg:      msg,
		storedAt: time.Now(),
	}
	h.pendingMu.Unlock()

	out := tgbotapi.NewMessage(msg.Chat.ID, "📋 Foto diterima. Pilih jenis bon untuk akurasi OCR:")
	out.ReplyToMessageID = msg.MessageID
	out.ReplyMarkup = receiptTypeKeyboard(pendingKey)
	if _, err := h.bot.Send(out); err != nil {
		log.Printf("send keyboard error: %v", err)
	}
}

// handleCallback processes inline keyboard button presses.
func (h *Handler) handleCallback(cb *tgbotapi.CallbackQuery) {
	// Acknowledge the tap immediately so the button spinner stops
	ack := tgbotapi.NewCallback(cb.ID, "")
	h.bot.Request(ack) //nolint:errcheck

	data := cb.Data
	if !strings.HasPrefix(data, "rt:") {
		return
	}
	// data = "rt:<chatID>:<messageID>:<receiptType>"
	// pendingKey is "chatID:messageID" so we need 3 parts after the "rt:" prefix
	parts := strings.SplitN(strings.TrimPrefix(data, "rt:"), ":", 3)
	if len(parts) != 3 {
		return
	}
	pendingKey, receiptHint := parts[0]+":"+parts[1], parts[2]

	h.pendingMu.Lock()
	pending, ok := h.pendingPhotos[pendingKey]
	if ok {
		delete(h.pendingPhotos, pendingKey)
	}
	h.pendingMu.Unlock()

	if !ok {
		// Expired or already handled
		edit := tgbotapi.NewEditMessageText(cb.Message.Chat.ID, cb.Message.MessageID,
			"⚠️ Sesi foto sudah habis. Kirim ulang foto.")
		h.bot.Send(edit) //nolint:errcheck
		return
	}

	// Replace the keyboard message with a confirmation
	labelMap := map[string]string{
		"timbangan_ikan_basah": "Timbangan Ikan Basah",
		"timbangan_sortir":     "Timbangan Sortir",
		"bon_penjualan":        "Bon Penjualan",
		"bon_pengeluaran":      "Bon Pengeluaran",
		"beli_ikan":            "Beli Ikan (HPP)",
		"beli_item":            "Beli Item",
		"bayar_jasa":           "Bayar Jasa",
	}
	label := labelMap[receiptHint]
	edit := tgbotapi.NewEditMessageText(cb.Message.Chat.ID, cb.Message.MessageID,
		fmt.Sprintf("✅ Jenis bon: *%s*\n\nSedang menganalisis gambar...\n_Mohon tunggu 30–90 detik._", label))
	edit.ParseMode = tgbotapi.ModeMarkdown
	h.bot.Send(edit) //nolint:errcheck

	// Process the image with the hint in a goroutine (same as before)
	go h.processImage(pending.msg, pending.imgBytes, pending.filename, receiptHint)
}

// processImage runs OCR → Qwen → submit to review service.
// receiptHint is the user-selected receipt type (e.g. "timbangan_ikan_basah"); empty means auto-detect.
func (h *Handler) processImage(msg *tgbotapi.Message, imgBytes []byte, filename, receiptHint string) {
	// No hard timeout — OCR + vision can take several minutes on slow hardware.
	ctx := context.Background()

	// Keepalive: send typing every 5s and a "still working" message after 90s.
	keepaliveDone := make(chan struct{})
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		longWarnAt := time.NewTimer(90 * time.Second)
		defer longWarnAt.Stop()
		for {
			select {
			case <-keepaliveDone:
				return
			case <-ticker.C:
				h.sendTyping(msg.Chat.ID)
			case <-longWarnAt.C:
				h.reply(msg, "⏳ Masih memproses, mohon tunggu sebentar lagi...")
			}
		}
	}()
	defer close(keepaliveDone)

	h.sendTyping(msg.Chat.ID)

	var intent *model.Intent

	ocrResult, err := h.ocrClient.Extract(ctx, imgBytes, filename)
	if err != nil {
		log.Printf("OCR error (falling back to vision): %v", err)
		intent, err = h.ai.ExtractFromReceipt(ctx, imgBytes)
		if err != nil {
			log.Printf("vision fallback error: %v", err)
		}
	} else {
		structuredText := ocrResult.FormatTableText()
		log.Printf("OCR extracted from %s (%d chars):\n%s", filename, len(structuredText), structuredText)
		intent, err = h.ai.ExtractFromOCRTextWithHint(ctx, structuredText, receiptHint)
		if err != nil {
			log.Printf("Qwen structuring error: %v", err)
		}
	}

	// When the user explicitly selected beli_item or bayar_jasa, override the intent
	// type regardless of what Ollama returned (Ollama returns bon_pengeluaran for both).
	if receiptHint == "beli_item" || receiptHint == "bayar_jasa" {
		if intent == nil {
			intent = &model.Intent{}
		}
		intent.Type = receiptHint
		if intent.Receipt != nil {
			intent.Receipt.ReceiptType = receiptHint
		}
	}

	// Submit to review service and get back a review URL
	reviewURL := h.submitToReview(ctx, imgBytes, filename, msg, intent)

	h.handleIntent(msg, intent, reviewURL)
}

// submitToReview posts the image + intent to fish-coldstorage and returns the review URL.
// Returns empty string on failure (non-fatal — bot still replies with extracted data).
func (h *Handler) submitToReview(ctx context.Context, imgBytes []byte, filename string, msg *tgbotapi.Message, intent *model.Intent) string {
	if h.reviewClient == nil || intent == nil {
		return ""
	}
	msgID := int64(msg.MessageID)
	chatID := msg.Chat.ID
	resp, err := h.reviewClient.Submit(ctx, imgBytes, filename, msgID, chatID, intent)
	if err != nil {
		log.Printf("review submit error: %v", err)
		return ""
	}
	log.Printf("review submitted: id=%s url=%s", resp.ReceiptID, resp.ReviewURL)
	return resp.ReviewURL
}

func (h *Handler) handleText(msg *tgbotapi.Message) {
	text := strings.TrimSpace(msg.Text)
	if strings.HasPrefix(text, "/") {
		h.handleCommand(msg, text)
		return
	}
	if len([]rune(text)) < 5 {
		return
	}
	h.sendTyping(msg.Chat.ID)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	intent, err := h.ai.ExtractFromText(ctx, text)
	if err != nil {
		log.Printf("text extraction error: %v", err)
		intent = &model.Intent{Type: model.IntentUnknown, ReplyText: "Maaf, tidak bisa diproses. Coba lagi."}
	}
	h.handleIntent(msg, intent, "")
}

func (h *Handler) handleCommand(msg *tgbotapi.Message, text string) {
	cmd := strings.ToLower(strings.Fields(text)[0])
	switch cmd {
	case "/start", "/help":
		h.reply(msg, helpText())
	case "/status":
		h.reply(msg, "Bot aktif. Model: siap.")
	default:
		h.reply(msg, fmt.Sprintf("Perintah %q belum tersedia.", cmd))
	}
}

func (h *Handler) handleIntent(msg *tgbotapi.Message, intent *model.Intent, reviewURL string) {
	if intent == nil {
		h.reply(msg, "Tidak ada data yang bisa diekstrak.")
		return
	}
	log.Printf("[intent] type=%q confidence=%.2f", intent.Type, intent.Confidence)

	switch intent.Type {
	case model.IntentTimbangan:
		h.replyTimbangan(msg, intent, reviewURL)
	case model.IntentSortir:
		h.replySortir(msg, intent, reviewURL)
	case model.IntentReceipt:
		h.replyReceipt(msg, intent, reviewURL)
	case model.IntentStockIn, model.IntentStockOut:
		h.replyStockOp(msg, intent)
	case model.IntentQuery:
		h.handleQuery(msg, intent)
	case model.IntentHelp, model.IntentUnknown:
		if intent.ReplyText != "" {
			h.reply(msg, intent.ReplyText)
		}
	default:
		h.reply(msg, "Maaf, tidak dimengerti.")
	}
}

func (h *Handler) handleQuery(msg *tgbotapi.Message, intent *model.Intent) {
	if intent.Query == nil || intent.Query.QueryType == "" || intent.Query.QueryType == "general" {
		if intent.ReplyText != "" {
			h.reply(msg, intent.ReplyText)
		}
		return
	}

	if h.stockClient == nil {
		h.reply(msg, "Fitur query data belum dikonfigurasi.")
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	switch intent.Query.QueryType {
	case "stock_by_code":
		code := intent.Query.FishCode
		if code == "" {
			h.reply(msg, "Kode ikan tidak terdeteksi. Contoh: \"berapa stok BH?\"")
			return
		}
		entry, err := h.stockClient.GetStockByCode(ctx, code)
		if err != nil {
			log.Printf("stock query error: %v", err)
			h.reply(msg, "Gagal mengambil data stok. Coba lagi.")
			return
		}
		if entry == nil {
			h.replyMarkdown(msg, fmt.Sprintf("Kode ikan *%s* tidak ditemukan di sistem.", code))
			return
		}
		h.replyMarkdown(msg, fmt.Sprintf("*Stok %s*\n`%.0f kg` tersedia", code, entry.TotalQuantity))

	case "top_stock":
		n := intent.Query.TopN
		if n <= 0 {
			n = 5
		}
		entries, err := h.stockClient.GetAllStock(ctx)
		if err != nil {
			log.Printf("stock query error: %v", err)
			h.reply(msg, "Gagal mengambil data stok. Coba lagi.")
			return
		}
		top := stockapi.TopByStock(entries, n)
		if len(top) == 0 {
			h.reply(msg, "Belum ada data stok.")
			return
		}
		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("*Top %d Stok Ikan:*\n\n", len(top)))
		for i, e := range top {
			sb.WriteString(fmt.Sprintf("%d. *%s* — `%.0f kg`\n", i+1, stockapi.DisplayCode(e), e.TotalQuantity))
		}
		h.replyMarkdown(msg, sb.String())

	case "price_by_code":
		code := intent.Query.FishCode
		if code == "" {
			h.reply(msg, "Kode ikan tidak terdeteksi. Contoh: \"harga BH berapa?\"")
			return
		}
		txns, err := h.stockClient.GetRecentTransactions(ctx, 50)
		if err != nil {
			log.Printf("transaction query error: %v", err)
			h.reply(msg, "Gagal mengambil data transaksi. Coba lagi.")
			return
		}
		price, found := stockapi.LastPriceForCode(txns, code)
		if !found {
			h.replyMarkdown(msg, fmt.Sprintf("Belum ada data harga untuk *%s* dari transaksi terakhir.", code))
			return
		}
		h.replyMarkdown(msg, fmt.Sprintf("*Harga terakhir %s*\nRp `%.0f`/kg", code, price))

	case "recent_timbangan":
		n := intent.Query.TopN
		if n <= 0 {
			n = 5
		}
		recs, err := h.stockClient.GetRecentTimbangan(ctx, n)
		if err != nil {
			log.Printf("timbangan query error: %v", err)
			h.reply(msg, "Gagal mengambil data timbangan. Coba lagi.")
			return
		}
		if len(recs) == 0 {
			h.reply(msg, "Belum ada data timbangan.")
			return
		}
		var sb strings.Builder
		sb.WriteString("*Timbangan Terakhir:*\n\n")
		for _, r := range recs {
			sb.WriteString(fmt.Sprintf("▸ *%s* — `%.0f kg` (%s)\n",
				r.VesselName, r.TotalWeightKg, r.TimbangDate.Format("02 Jan 2006")))
		}
		h.replyMarkdown(msg, sb.String())

	case "recent_expenses":
		n := intent.Query.TopN
		if n <= 0 {
			n = 5
		}
		exps, err := h.stockClient.GetRecentExpenses(ctx, n)
		if err != nil {
			log.Printf("expense query error: %v", err)
			h.reply(msg, "Gagal mengambil data pengeluaran. Coba lagi.")
			return
		}
		if len(exps) == 0 {
			h.reply(msg, "Belum ada data pengeluaran.")
			return
		}
		var sb strings.Builder
		sb.WriteString("*Pengeluaran Terakhir:*\n\n")
		for _, e := range exps {
			sb.WriteString(fmt.Sprintf("▸ *%s* — Rp `%.0f` (%s)\n",
				e.Description, e.Amount, e.Date.Format("02 Jan")))
		}
		h.replyMarkdown(msg, sb.String())

	case "recent_beli_ikan":
		n := intent.Query.TopN
		if n <= 0 {
			n = 5
		}
		items, err := h.stockClient.GetRecentBeliIkan(ctx, n)
		if err != nil {
			log.Printf("beli ikan query error: %v", err)
			h.reply(msg, "Gagal mengambil data pembelian ikan. Coba lagi.")
			return
		}
		if len(items) == 0 {
			h.reply(msg, "Belum ada data pembelian ikan.")
			return
		}
		var sb strings.Builder
		sb.WriteString("*Pembelian Ikan Terakhir:*\n\n")
		for _, b := range items {
			sb.WriteString(fmt.Sprintf("▸ *%s* — Rp `%.0f` (%s)\n",
				b.VesselName, b.TotalAmount, b.BuyDate.Format("02 Jan 2006")))
		}
		h.replyMarkdown(msg, sb.String())

	case "dashboard":
		stats, err := h.stockClient.GetDashboard(ctx)
		if err != nil {
			log.Printf("dashboard query error: %v", err)
			h.reply(msg, "Gagal mengambil data ringkasan. Coba lagi.")
			return
		}
		var sb strings.Builder
		sb.WriteString("*Ringkasan Gudang:*\n\n")
		sb.WriteString(fmt.Sprintf("🐟 Stok ikan basah: `%.0f kg`\n", stats.RawFishStockKg))
		sb.WriteString(fmt.Sprintf("🧊 Stok ikan sortir: `%.0f kg`\n", stats.SortedFishStockKg))
		if stats.PendingReviews > 0 {
			sb.WriteString(fmt.Sprintf("⏳ Review pending: *%d*\n", stats.PendingReviews))
		}
		h.replyMarkdown(msg, sb.String())

	default:
		if intent.ReplyText != "" {
			h.reply(msg, intent.ReplyText)
		}
	}
}

func (h *Handler) replyTimbangan(msg *tgbotapi.Message, intent *model.Intent, reviewURL string) {
	t := intent.Timbangan
	if t == nil {
		h.reply(msg, "Formulir timbangan tidak bisa dibaca. Pastikan foto jelas dan coba lagi.")
		return
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("*Timbangan Ikan Basah* (%.0f%% yakin)\n\n", intent.Confidence*100))
	sb.WriteString(fmt.Sprintf("Tanggal  : `%s`\n", t.Date))
	sb.WriteString(fmt.Sprintf("Kapal    : `%s`\n", t.VesselName))
	sb.WriteString(fmt.Sprintf("Transport: `%s`\n", t.Transports))

	if len(t.FishColumns) > 0 {
		sb.WriteString("\n*Detail per Jenis Ikan:*\n")
		for _, col := range t.FishColumns {
			sb.WriteString(fmt.Sprintf("\n▸ *%s*", col.FishCode))
			if col.PricePerKg > 0 {
				sb.WriteString(fmt.Sprintf(" — Rp %.0f/kg", col.PricePerKg))
			}
			sb.WriteString("\n")
			if len(col.WeightBatches) > 0 {
				batchStrs := make([]string, len(col.WeightBatches))
				for i, w := range col.WeightBatches {
					batchStrs[i] = fmt.Sprintf("%.0f", w)
				}
				sb.WriteString(fmt.Sprintf("  Batch : %s kg\n", strings.Join(batchStrs, ", ")))
			}
			sb.WriteString(fmt.Sprintf("  Total : `%.0f kg`\n", col.TotalWeight))
		}
	}
	sb.WriteString(fmt.Sprintf("\n*Grand Total: `%.0f kg`*\n", t.TotalWeight))
	if t.Notes != "" {
		sb.WriteString(fmt.Sprintf("Catatan: %s\n", t.Notes))
	}

	sb.WriteString(reviewFooter(reviewURL))

	rawJSON, _ := json.MarshalIndent(intent, "", "  ")
	log.Printf("[timbangan] from user %d:\n%s", msg.From.ID, rawJSON)
	h.replyMarkdown(msg, sb.String())
}

func (h *Handler) replySortir(msg *tgbotapi.Message, intent *model.Intent, reviewURL string) {
	s := intent.Sortir
	if s == nil {
		h.reply(msg, "Formulir sortir tidak bisa dibaca. Pastikan foto jelas dan coba lagi.")
		return
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("*Timbangan Sortir* (%.0f%% yakin)\n\n", intent.Confidence*100))
	sb.WriteString(fmt.Sprintf("Tanggal  : `%s`\n", s.Date))
	sb.WriteString(fmt.Sprintf("Kapal    : `%s`\n", s.VesselName))

	if len(s.Columns) > 0 {
		sb.WriteString("\n*Hasil Sortir:*\n")
		for _, col := range s.Columns {
			sb.WriteString(fmt.Sprintf("▸ *%s* (%s) — `%.0f kg`\n", col.SourceFishCode, col.Grade, col.TotalWeight))
		}
	}
	sb.WriteString(fmt.Sprintf("\n*Grand Total: `%.0f kg`*\n", s.TotalWeight))
	sb.WriteString(reviewFooter(reviewURL))

	rawJSON, _ := json.MarshalIndent(intent, "", "  ")
	log.Printf("[sortir] from user %d:\n%s", msg.From.ID, rawJSON)
	h.replyMarkdown(msg, sb.String())
}

func (h *Handler) replyReceipt(msg *tgbotapi.Message, intent *model.Intent, reviewURL string) {
	r := intent.Receipt
	if r == nil {
		h.reply(msg, "Struk tidak bisa dibaca. Pastikan foto jelas dan coba lagi.")
		return
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("*Struk Terdeteksi* (%.0f%% yakin)\n", intent.Confidence*100))
	sb.WriteString(fmt.Sprintf("Tipe: `%s`\n", r.ReceiptType))
	if r.ReceiptNo != "" {
		sb.WriteString(fmt.Sprintf("No. Bon: `%s`\n", r.ReceiptNo))
	}
	if r.Date != "" {
		sb.WriteString(fmt.Sprintf("Tanggal: `%s`\n", r.Date))
	}
	if r.VendorName != "" {
		sb.WriteString(fmt.Sprintf("Pihak: `%s`\n", r.VendorName))
	}
	if len(r.Items) > 0 {
		sb.WriteString("\n*Item:*\n")
		for _, item := range r.Items {
			name := item.FishCode
			if name == "" {
				name = item.ItemName
			}
			line := fmt.Sprintf("• %s — %.2f %s", name, item.Quantity, item.Unit)
			if item.TotalPrice > 0 {
				line += fmt.Sprintf(" @ Rp %.0f", item.TotalPrice)
			}
			sb.WriteString(line + "\n")
		}
	}
	if r.TotalAmount > 0 {
		sb.WriteString(fmt.Sprintf("\nTotal: `Rp %.0f`\n", r.TotalAmount))
	}
	if r.Notes != "" {
		sb.WriteString(fmt.Sprintf("Catatan: %s\n", r.Notes))
	}

	sb.WriteString(reviewFooter(reviewURL))

	rawJSON, _ := json.MarshalIndent(intent, "", "  ")
	log.Printf("[receipt] from user %d:\n%s", msg.From.ID, rawJSON)
	h.replyMarkdown(msg, sb.String())
}

func (h *Handler) replyStockOp(msg *tgbotapi.Message, intent *model.Intent) {
	op := intent.StockOp
	if op == nil {
		h.reply(msg, "Data operasi stok tidak lengkap.")
		return
	}
	direction := "Masuk"
	if op.Direction == "out" {
		direction = "Keluar"
	}
	name := op.FishCode
	if name == "" {
		name = op.ItemName
	}
	text := fmt.Sprintf("*Stok %s* (%.0f%% yakin)\n", direction, intent.Confidence*100)
	text += fmt.Sprintf("Item: `%s`\n", name)
	text += fmt.Sprintf("Jumlah: `%.2f %s`\n", op.Quantity, op.Unit)
	if op.PersonName != "" {
		text += fmt.Sprintf("Pihak: `%s`\n", op.PersonName)
	}
	if op.Notes != "" {
		text += fmt.Sprintf("Catatan: %s\n", op.Notes)
	}
	text += "\n_Fitur input langsung aktif setelah sistem utama terhubung._"
	h.replyMarkdown(msg, text)
}

// reviewFooter returns the review link line, or a fallback if submission failed.
func reviewFooter(reviewURL string) string {
	if reviewURL != "" {
		return fmt.Sprintf("\n🔗 *Review & Simpan:*\n%s", reviewURL)
	}
	return "\n_⚠️ Gagal membuat link review. Data tidak tersimpan._"
}

func (h *Handler) downloadFile(fileID string) ([]byte, error) {
	fileConfig := tgbotapi.FileConfig{FileID: fileID}
	file, err := h.bot.GetFile(fileConfig)
	if err != nil {
		return nil, fmt.Errorf("get file info: %w", err)
	}
	url := file.Link(h.bot.Token)
	resp, err := http.Get(url) //nolint:gosec
	if err != nil {
		return nil, fmt.Errorf("http get: %w", err)
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

func (h *Handler) reply(msg *tgbotapi.Message, text string) {
	out := tgbotapi.NewMessage(msg.Chat.ID, text)
	out.ReplyToMessageID = msg.MessageID
	if _, err := h.bot.Send(out); err != nil {
		log.Printf("send error: %v", err)
	}
}

func (h *Handler) replyMarkdown(msg *tgbotapi.Message, text string) {
	out := tgbotapi.NewMessage(msg.Chat.ID, text)
	out.ReplyToMessageID = msg.MessageID
	out.ParseMode = tgbotapi.ModeMarkdown
	if _, err := h.bot.Send(out); err != nil {
		log.Printf("send error: %v", err)
	}
}

func (h *Handler) sendTyping(chatID int64) {
	action := tgbotapi.NewChatAction(chatID, tgbotapi.ChatTyping)
	h.bot.Send(action) //nolint:errcheck
}

func isImage(mime string) bool {
	return strings.HasPrefix(mime, "image/")
}

func ackMessage(msg *tgbotapi.Message) string {
	name := "Bos"
	if msg.From != nil && msg.From.FirstName != "" {
		name = msg.From.FirstName
	}
	return fmt.Sprintf(
		"📋 *SBA Bot menerima bon dari %s*\n\nSedang menganalisis gambar dan mengekstrak data bon...\n_Mohon tunggu sebentar, proses ini membutuhkan 30–60 detik._",
		name,
	)
}

func helpText() string {
	return `*Samudera Bahari Abadi Bot*

📸 *Kirim foto struk* — pilih jenis bon, bot ekstrak data otomatis.

💬 *Tanya data real-time:*
• "berapa stok BH?"
• "ikan apa yang paling banyak?"
• "top 5 stok ikan sekarang?"
• "harga BH terakhir?"
• "timbangan kapal terakhir?"
• "pengeluaran terakhir?"
• "beli ikan terakhir?"
• "ringkasan stok gudang?"

📝 *Input teks timbangan:*
• "beli 50kg tuna dari Pak Budi"
• "jual 30kg BH ke CV Maju"

Perintah:
/help — tampilkan pesan ini
/status — cek status bot`
}
