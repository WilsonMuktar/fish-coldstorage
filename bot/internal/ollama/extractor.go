package ollama

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/samudera/bot/internal/model"
)

// ExtractFromReceipt sends a receipt image and extracts structured data in one call (vision fallback).
func (c *Client) ExtractFromReceipt(ctx context.Context, imageBytes []byte) (*model.Intent, error) {
	raw, err := c.ChatWithImageBytes(ctx, SystemPromptReceipt,
		"Baca dokumen ini dan ekstrak semua datanya.", imageBytes)
	if err != nil {
		return nil, fmt.Errorf("model inference: %w", err)
	}
	return parseIntent(raw)
}

// ExtractFromOCRText structures pre-extracted OCR text into an Intent (text-only, faster).
func (c *Client) ExtractFromOCRText(ctx context.Context, ocrText string) (*model.Intent, error) {
	return c.ExtractFromOCRTextWithHint(ctx, ocrText, "")
}

// ExtractFromOCRTextWithHint is like ExtractFromOCRText but prepends a focused
// directive when the caller knows the receipt type in advance.
func (c *Client) ExtractFromOCRTextWithHint(ctx context.Context, ocrText, hint string) (*model.Intent, error) {
	prefix := hintPrefix(hint)
	userMsg := prefix + "Berikut teks OCR dari dokumen. Strukturkan ke JSON sesuai format:\n\n" + ocrText
	raw, err := c.Chat(ctx, buildReceiptTextPrompt(), userMsg)
	if err != nil {
		return nil, fmt.Errorf("model inference: %w", err)
	}
	return parseIntent(raw)
}

func hintPrefix(hint string) string {
	hints := map[string]string{
		"timbangan_ikan_basah": "FOKUS: Ini adalah TIMBANGAN IKAN BASAH. Gunakan HANYA format JENIS 1.\n\n",
		"timbangan_sortir":     "FOKUS: Ini adalah TIMBANGAN SORTIR. Gunakan HANYA format JENIS 1b.\n\n",
		"bon_penjualan":        "FOKUS: Ini adalah BON PENJUALAN. Gunakan HANYA format JENIS 3.\n\n",
		"bon_pengeluaran":      "FOKUS: Ini adalah BON PENGELUARAN. Gunakan HANYA format JENIS 2.\n\n",
		"beli_ikan":            "FOKUS: Ini adalah catatan BELI IKAN (HPP). Ekstrak vessel_name, date, dan daftar ikan beserta harga dan beratnya.\n\n",
		"beli_item":            "FOKUS: Ini adalah BON PEMBELIAN ITEM (beli_item). Gunakan format JENIS 2 (bon_pengeluaran).\n\n",
		"bayar_jasa":           "FOKUS: Ini adalah BON BAYAR JASA (bayar_jasa). Gunakan format JENIS 2 (bon_pengeluaran).\n\n",
	}
	if s, ok := hints[hint]; ok {
		return s
	}
	return ""
}

func buildReceiptTextPrompt() string {
	return SystemPromptReceiptText + `

ATURAN ANGKA INDONESIA:
- Titik (.) = pemisah ribuan BUKAN desimal. "23.000" = 23000. "22.500" = 22500.
- Tanda plus (+) = pemisah batch berat. "1349+180+378" = tiga batch: [1349,180,378]
- Harga ikan: 10000–100000 IDR/kg
- Tanggal: "21 MEI 2026" = "2026-05-21"

JENIS 1 - TIMBANGAN IKAN BASAH (ikan mentah masuk):
Input: === TABEL IKAN (KODE | HARGA | BATCH | TOTAL) ===
Setiap baris = satu jenis ikan RAW masuk dari kapal.
Input berformat: KODE | HARGA | BATCH | TOTAL
Setiap baris = satu kolom ikan. Kolom BATCH berisi angka dipisah +. Kolom TOTAL = total berat ikan tersebut.
WAJIB ekstrak SEMUA baris ikan, jangan lewati satu pun.
PENTING: Nilai TOTAL di kolom ke-4 adalah total_weight untuk ikan tersebut, BUKAN bagian dari weight_batches.

{"type":"timbangan_ikan_basah","timbangan":{"date":"YYYY-MM-DD","vessel_name":"...","transports":"...","fish_columns":[{"fish_code":"BH","price_per_kg":23000,"weight_batches":[1349,180,378,97,94,101],"total_weight":2199},{"fish_code":"BDR PC","price_per_kg":18000,"weight_batches":[240,190,87],"total_weight":517},{"fish_code":"SRR H","price_per_kg":21000,"weight_batches":[48,28],"total_weight":76}],"total_weight":6808,"notes":"Total=6808, Dari gudang: 6764, selisih: 44","raw_text":"..."},"confidence":0.9}

JENIS 1b - TIMBANGAN SORTIR (ikan disortir menjadi grade):
Input: === TABEL SORTIR (KODE | GRADE | TOTAL) ===
Setiap baris = satu kolom hasil sortir.
Fields: source_fish_code (kode ikan sumber, e.g. BDR, SLM, SLM HIS), category (SF/PC/SP), grade (ukuran: 300-500, 1UP, 2UP, dll), total_weight.
ATURAN sorted_fish_code:
- Kategori SF = segar/fresh, DIHAPUS dari kode: BDR+SF+300-500 → "BDR 300-500"
- Kategori PC atau SP = DIPERTAHANKAN: BDR+PC+300-500 → "BDR PC 300-500"
- Jika grade kosong: sorted_fish_code = source saja, e.g. "SLM HIS"
GT di footer = total_weight keseluruhan.
{"type":"timbangan_sortir","sortir":{"date":"2026-05-22","vessel_name":"KM. Mitra Bahari","transports":"-","columns":[{"source_fish_code":"BDR","category":"SF","grade":"300-500","sorted_fish_code":"BDR 300-500","total_weight":1775},{"source_fish_code":"BDR","category":"SF","grade":"500-900","sorted_fish_code":"BDR 500-900","total_weight":725},{"source_fish_code":"CKL","category":"SF","grade":"1UP","sorted_fish_code":"CKL 1UP","total_weight":0},{"source_fish_code":"BDR","category":"SF","grade":"200-300","sorted_fish_code":"BDR 200-300","total_weight":50},{"source_fish_code":"SLM","category":"SF","grade":"1UP","sorted_fish_code":"SLM 1UP","total_weight":175},{"source_fish_code":"SLM","category":"SF","grade":"500-900","sorted_fish_code":"SLM 500-900","total_weight":150},{"source_fish_code":"SLM HIS","category":"SF","grade":"","sorted_fish_code":"SLM HIS","total_weight":50},{"source_fish_code":"SLM","category":"SF","grade":"3UP","sorted_fish_code":"SLM 3UP","total_weight":77},{"source_fish_code":"SLM","category":"SF","grade":"2UP","sorted_fish_code":"SLM 2UP","total_weight":100},{"source_fish_code":"BDR","category":"PC","grade":"300-500","sorted_fish_code":"BDR PC 300-500","total_weight":100},{"source_fish_code":"BDR","category":"PC","grade":"500-900","sorted_fish_code":"BDR PC 500-900","total_weight":150},{"source_fish_code":"CKL","category":"PC","grade":"1UP","sorted_fish_code":"CKL PC 1UP","total_weight":125}],"total_weight":3477,"notes":"GT=3477","raw_text":"..."},"confidence":0.9}

JENIS 2 - BON PENGELUARAN:
{"type":"bon_pengeluaran","receipt":{"receipt_type":"bon_pengeluaran","receipt_no":null,"date":"YYYY-MM-DD","vendor_name":null,"items":[{"fish_code":null,"item_name":"...","quantity":1,"unit":"pcs","unit_price":0,"total_price":0}],"total_amount":0,"notes":null,"raw_text":"..."},"confidence":0.9}

JENIS 3 - BON PENJUALAN / BON KONTAN:
Input berformat baris OCR bebas (bukan KODE|HARGA|BATCH|TOTAL).
Cari: "BON/KONTAN No." = receipt_no, "tgl" = date, "Kepada" = vendor_name, "Jumlah: Rp." = total_amount.
Tabel transaksi: kolom Banyaknya(qty) | NAMA BARANG(nama ikan) | @ (harga satuan) | Jumlah Harga(total baris).
PENTING - kode ikan: nama barang bisa mengandung varian ukuran (contoh: "SSK 2UP PC", "SSK 3 4P PC").
  Normalisasi fish_code dengan menghapus varian ukuran (2UP, 3, 4P, dsb): "SSK 2UP PC" → fish_code="SSK PC", item_name="SSK 2UP PC".
  Varian ukuran biasanya berupa angka/huruf kecil di tengah nama kode ikan.
OCR bisa salah baca angka: "20.96" bisa berarti "2026", "1. 8 fs. 000" bisa berarti "1.875.000", gunakan konteks untuk koreksi.
{"type":"bon_penjualan","receipt":{"receipt_type":"bon_penjualan","receipt_no":"0005","date":"2026-05-21","vendor_name":"SKB","items":[{"fish_code":"SSK PC","item_name":"SSK 2UP PC","quantity":75,"unit":"kg","unit_price":25000,"total_price":1875000},{"fish_code":"SSK PC","item_name":"SSK 3 4P PC","quantity":225,"unit":"kg","unit_price":25000,"total_price":5625000}],"total_amount":7500000,"notes":null,"raw_text":"..."},"confidence":0.9}

Kembalikan HANYA JSON valid, tanpa markdown.`
}

// ExtractFromText parses a free-text Bahasa Indonesia message.
func (c *Client) ExtractFromText(ctx context.Context, text string) (*model.Intent, error) {
	raw, err := c.Chat(ctx, SystemPromptChat, text)
	if err != nil {
		return nil, fmt.Errorf("model inference: %w", err)
	}

	return parseIntent(raw)
}

func parseIntent(raw string) (*model.Intent, error) {
	// strip markdown fences if model ignores instructions
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)

	var loose looseIntent
	if err := json.Unmarshal([]byte(raw), &loose); err != nil {
		return &model.Intent{
			Type:      model.IntentUnknown,
			ReplyText: "Maaf, gagal memproses. Coba kirim ulang.",
		}, fmt.Errorf("json parse error (%w) — raw: %s", err, raw)
	}

	intent := &model.Intent{
		Type:       loose.Type,
		StockOp:    loose.StockOp,
		Query:      loose.Query,
		ReplyText:  loose.ReplyText,
		Confidence: loose.Confidence,
	}

	// timbangan form
	if loose.Type == model.IntentTimbangan && loose.Timbangan != nil {
		intent.Timbangan = &loose.Timbangan.TimbanganData
		if intent.Confidence == 0 && loose.Timbangan.Confidence > 0 {
			intent.Confidence = loose.Timbangan.Confidence
		}
	}

	// sortir form
	if loose.Type == model.IntentSortir && loose.Sortir != nil {
		intent.Sortir = &loose.Sortir.SortirData
		if intent.Confidence == 0 && loose.Sortir.Confidence > 0 {
			intent.Confidence = loose.Sortir.Confidence
		}
	}

	// bon receipts — also normalize any stray subtype Qwen might return
	if loose.Receipt != nil {
		intent.Receipt = &loose.Receipt.ReceiptData
		if intent.Confidence == 0 && loose.Receipt.Confidence > 0 {
			intent.Confidence = loose.Receipt.Confidence
		}
		if intent.Type != model.IntentTimbangan {
			intent.Type = model.IntentReceipt
		}
	}

	return intent, nil
}

// looseIntent decodes the raw model output tolerantly.
type looseIntent struct {
	Type       string                `json:"type"`
	Timbangan  *looseTimbangan       `json:"timbangan,omitempty"`
	Sortir     *looseSortir          `json:"sortir,omitempty"`
	Receipt    *looseReceipt         `json:"receipt,omitempty"`
	StockOp    *model.StockOperation `json:"stock_op,omitempty"`
	Query      *model.QueryData      `json:"query,omitempty"`
	ReplyText  string                `json:"reply_text,omitempty"`
	Confidence float64               `json:"confidence,omitempty"`
}

// looseTimbangan allows confidence inside the timbangan object (Qwen quirk).
type looseTimbangan struct {
	model.TimbanganData
	Confidence float64 `json:"confidence,omitempty"`
}

// looseSortir allows confidence inside the sortir object.
type looseSortir struct {
	model.SortirData
	Confidence float64 `json:"confidence,omitempty"`
}

// looseReceipt allows confidence inside the receipt object (Qwen quirk).
type looseReceipt struct {
	model.ReceiptData
	Confidence float64 `json:"confidence,omitempty"`
}
