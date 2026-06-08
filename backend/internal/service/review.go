package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/samudera/fish-coldstorage/internal/domain"
	"github.com/samudera/fish-coldstorage/internal/repo"
)

type ReviewService struct {
	receiptRepo  *repo.ReceiptRepo
	fishRepo     *repo.FishRepo
	sortingRepo  *repo.SortingRepo
	beliIkanRepo *repo.BeliIkanRepo
	expenseRepo  *repo.ExpenseRepo
	itemRepo     *repo.ItemRepo
	db           *pgxpool.Pool
	dataDir      string
	baseURL      string // frontend URL — used for review links
	apiURL       string // backend URL — used for image serving
}

func NewReviewService(receiptRepo *repo.ReceiptRepo, fishRepo *repo.FishRepo, db *pgxpool.Pool, dataDir, baseURL, apiURL string, beliIkanRepo *repo.BeliIkanRepo, expenseRepo *repo.ExpenseRepo, sortingRepo *repo.SortingRepo, itemRepo *repo.ItemRepo) *ReviewService {
	return &ReviewService{
		receiptRepo:  receiptRepo,
		fishRepo:     fishRepo,
		sortingRepo:  sortingRepo,
		beliIkanRepo: beliIkanRepo,
		expenseRepo:  expenseRepo,
		itemRepo:     itemRepo,
		db:           db,
		dataDir:      dataDir,
		baseURL:      baseURL,
		apiURL:       apiURL,
	}
}

func (s *ReviewService) Submit(ctx context.Context, req *domain.SubmitReviewRequest) (*domain.SubmitReviewResponse, error) {
	// Decode and save image
	var imagePath string
	if req.ImageData != "" {
		imgBytes, err := base64.StdEncoding.DecodeString(req.ImageData)
		if err != nil {
			return nil, fmt.Errorf("invalid image_data base64: %w", err)
		}
		dir := filepath.Join(s.dataDir, "receipts")
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, err
		}
		fn := fmt.Sprintf("%s_%s", uuid.New().String(), req.ImageFilename)
		fp := filepath.Join(dir, fn)
		if err := os.WriteFile(fp, imgBytes, 0644); err != nil {
			return nil, err
		}
		imagePath = filepath.Join("receipts", fn)
	}

	extractedJSON, err := json.Marshal(req.IntentData)
	if err != nil {
		return nil, err
	}

	token := uuid.New().String()

	rec := &domain.Receipt{
		ReceiptType:         req.ReceiptType,
		Status:              domain.ReceiptPending,
		SubmittedVia:        req.SubmittedVia,
		TelegramMessageID:   req.TelegramMessageID,
		TelegramChatID:      req.TelegramChatID,
		ImagePath:           imagePath,
		ExtractedData:       extractedJSON,
		ReviewToken:         token,
		ReviewTokenExpiry:   time.Now().Add(100 * 365 * 24 * time.Hour), // effectively permanent
		ReviewTokenUsed:     false,
	}

	if err := s.receiptRepo.Create(ctx, rec); err != nil {
		return nil, fmt.Errorf("create receipt: %w", err)
	}

	reviewURL := fmt.Sprintf("%s/review/%s", s.baseURL, token)
	return &domain.SubmitReviewResponse{
		ReceiptID:   rec.ID.String(),
		ReviewURL:   reviewURL,
		ReviewToken: token,
	}, nil
}

func (s *ReviewService) GetForReview(ctx context.Context, token string) (*domain.Receipt, error) {
	rec, err := s.receiptRepo.GetByToken(ctx, token)
	if err != nil {
		return nil, fmt.Errorf("receipt not found")
	}
	if rec.ImagePath != "" {
		if len(rec.ImagePath) > 4 && rec.ImagePath[:4] == "http" {
			rec.ImageURL = rec.ImagePath
		} else {
			rec.ImageURL = fmt.Sprintf("%s/data/%s", s.apiURL, rec.ImagePath)
		}
	}
	return rec, nil
}

func (s *ReviewService) Approve(ctx context.Context, token string, confirmedData interface{}, reviewerPersonID *uuid.UUID) error {
	rec, err := s.receiptRepo.GetByToken(ctx, token)
	if err != nil {
		return fmt.Errorf("receipt not found")
	}
	if rec.Status != domain.ReceiptPending {
		return fmt.Errorf("receipt is not pending")
	}

	// Run the domain-specific processing first — if it fails, the receipt stays
	// pending so the user can fix the data and retry.
	var processErr error
	switch rec.ReceiptType {
	case domain.ReceiptTimbangan:
		processErr = s.processTimbangan(ctx, rec, confirmedData)
	case domain.ReceiptBonPenjualan:
		processErr = s.processBonPenjualan(ctx, rec, confirmedData)
	case domain.ReceiptBonKeluar:
		processErr = s.processBonPengeluaran(ctx, rec, confirmedData)
	case domain.ReceiptSortir:
		processErr = s.processSortir(ctx, rec, confirmedData)
	case domain.ReceiptBeliIkan:
		processErr = s.processBeliIkan(ctx, rec, confirmedData)
	case domain.ReceiptBeliItem:
		processErr = s.processExpense(ctx, rec, confirmedData, "beli_item")
	case domain.ReceiptBayarJasa:
		processErr = s.processExpense(ctx, rec, confirmedData, "bayar_jasa")
	}
	if processErr != nil {
		return processErr
	}

	// Only mark approved after all domain work succeeds.
	return s.receiptRepo.Approve(ctx, rec.ID, confirmedData, reviewerPersonID)
}

func (s *ReviewService) Reject(ctx context.Context, token string, reason string, reviewerPersonID *uuid.UUID) error {
	rec, err := s.receiptRepo.GetByToken(ctx, token)
	if err != nil {
		return fmt.Errorf("receipt not found")
	}
	if rec.Status != domain.ReceiptPending {
		return fmt.Errorf("receipt is not pending")
	}
	return s.receiptRepo.Reject(ctx, rec.ID, reason, reviewerPersonID)
}

// processTimbangan creates fish_transactions, upserts fish_stock, and inserts a timbangan_record.
func (s *ReviewService) processTimbangan(ctx context.Context, rec *domain.Receipt, confirmedData interface{}) error {
	raw, err := json.Marshal(confirmedData)
	if err != nil {
		return err
	}

	var intent struct {
		Timbangan *struct {
			VesselName  string `json:"vessel_name"`
			Transports  string `json:"transports"`
			Date        string `json:"date"`
			FishColumns []struct {
				FishCode    string  `json:"fish_type_code"`
				FishName    string  `json:"fish_type_name"`
				PricePerKg  float64 `json:"price_per_kg"`
				QuantityKg  float64 `json:"quantity_kg"`
				TotalWeight float64 `json:"total_weight"`
			} `json:"fish_columns"`
			TotalKg float64 `json:"total_kg"`
		} `json:"timbangan"`
	}
	if err := json.Unmarshal(raw, &intent); err != nil {
		return err
	}
	if intent.Timbangan == nil {
		return nil
	}

	t := intent.Timbangan
	txDate := time.Now()
	if t.Date != "" {
		if parsed, err := time.Parse("2006-01-02", t.Date); err == nil {
			txDate = parsed
		}
	}

	// Resolve or create vessel
	var vesselID *uuid.UUID
	if t.VesselName != "" {
		v, err := s.fishRepo.GetVesselByName(ctx, t.VesselName)
		if err != nil {
			// Vessel not found — create it automatically from the receipt
			newV := &domain.Vessel{Name: t.VesselName}
			if createErr := s.fishRepo.CreateVessel(ctx, newV); createErr == nil {
				vesselID = &newV.ID
			}
		} else {
			vesselID = &v.ID
		}
	}

	var totalKg float64
	for _, col := range t.FishColumns {
		qty := col.QuantityKg
		if qty <= 0 {
			qty = col.TotalWeight
		}
		if qty <= 0 {
			continue
		}
		totalKg += qty

		fishType, err := s.fishRepo.GetTypeByCode(ctx, col.FishCode)
		if err != nil {
			name := col.FishName
			if name == "" {
				name = col.FishCode
			}
			fishType, err = s.fishRepo.CreateType(ctx, col.FishCode, name, "", false, nil, "")
			if err != nil {
				return fmt.Errorf("ensure fish type %s: %w", col.FishCode, err)
			}
		}

		tx := &domain.FishTransaction{
			FishTypeID:      fishType.ID,
			FishCode:        col.FishCode,
			TransactionType: domain.TxBuy,
			Quantity:        qty,
			PricePerKg:      col.PricePerKg,
			TotalAmount:     qty * col.PricePerKg,
			VesselID:        vesselID,
			VesselName:      t.VesselName,
			ReceiptID:       &rec.ID,
			TransactionDate: txDate,
		}
		if err := s.fishRepo.CreateTransaction(ctx, tx); err != nil {
			return fmt.Errorf("create transaction for %s: %w", col.FishCode, err)
		}

		if err := s.fishRepo.UpsertStock(ctx, nil, fishType.ID, nil, qty); err != nil {
			return fmt.Errorf("upsert stock for %s: %w", col.FishCode, err)
		}
	}

	// Use confirmed total if provided, otherwise sum from columns
	if t.TotalKg > 0 {
		totalKg = t.TotalKg
	}

	// Marshal fish_columns back to JSONB for the timbangan_record
	fishColumnsJSON, err := json.Marshal(t.FishColumns)
	if err != nil {
		fishColumnsJSON = json.RawMessage("[]")
	}

	timRec := &domain.TimbanganRecord{
		ReceiptID:     rec.ID,
		VesselID:      vesselID,
		VesselName:    t.VesselName,
		Transports:    t.Transports,
		TimbangDate:   txDate,
		TotalWeightKg: totalKg,
		FishColumns:   json.RawMessage(fishColumnsJSON),
	}
	if err := s.fishRepo.InsertTimbanganRecord(ctx, timRec); err != nil {
		return fmt.Errorf("insert timbangan record: %w", err)
	}

	return nil
}

func (s *ReviewService) processBonPenjualan(ctx context.Context, rec *domain.Receipt, confirmedData interface{}) error {
	raw, err := json.Marshal(confirmedData)
	if err != nil {
		return err
	}

	var payload struct {
		Receipt *struct {
			Date       string `json:"date"`
			VendorName string `json:"vendor_name"`
			ReceiptNo  string `json:"receipt_no"`
			Items      []struct {
				FishCode   string  `json:"fish_code"`
				Quantity   float64 `json:"quantity"`
				UnitPrice  float64 `json:"unit_price"`
				TotalPrice float64 `json:"total_price"`
			} `json:"items"`
			TotalAmount float64 `json:"total_amount"`
		} `json:"receipt"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return err
	}
	if payload.Receipt == nil {
		return nil
	}
	r := payload.Receipt

	// Stock check — all items must be is_sorted=true and have sufficient stock
	for _, item := range r.Items {
		if item.FishCode == "" || item.Quantity <= 0 {
			continue
		}
		info, err := s.fishRepo.GetStockByCode(ctx, item.FishCode)
		if err != nil {
			return fmt.Errorf("cek stok %s gagal: %w", item.FishCode, err)
		}
		if !info.Exists {
			return fmt.Errorf("kode ikan '%s' tidak ditemukan di sistem", item.FishCode)
		}
		if !info.IsSorted {
			return fmt.Errorf("kode ikan '%s' bukan ikan sortir (is_sorted=false) — hanya ikan sortir yang dapat dijual", item.FishCode)
		}
		if info.AvailableKg < item.Quantity {
			return fmt.Errorf("stok %s tidak cukup: tersedia %.0f kg, dibutuhkan %.0f kg", item.FishCode, info.AvailableKg, item.Quantity)
		}
	}

	txDate := time.Now()
	if r.Date != "" {
		if parsed, err := time.Parse("2006-01-02", r.Date); err == nil {
			txDate = parsed
		}
	}

	// Deduct stock and record sell transactions
	for _, item := range r.Items {
		if item.FishCode == "" || item.Quantity <= 0 {
			continue
		}
		fishType, err := s.fishRepo.GetTypeByCode(ctx, item.FishCode)
		if err != nil {
			return fmt.Errorf("kode ikan %s tidak ditemukan: %w", item.FishCode, err)
		}

		tx := &domain.FishTransaction{
			FishTypeID:      fishType.ID,
			FishCode:        item.FishCode,
			TransactionType: domain.TxSell,
			Quantity:        item.Quantity,
			PricePerKg:      item.UnitPrice,
			TotalAmount:     item.TotalPrice,
			PersonName:      r.VendorName,
			ReceiptID:       &rec.ID,
			TransactionDate: txDate,
			Notes:           fmt.Sprintf("BON %s", r.ReceiptNo),
		}
		if err := s.fishRepo.CreateTransaction(ctx, tx); err != nil {
			return fmt.Errorf("catat transaksi %s: %w", item.FishCode, err)
		}

		if err := s.fishRepo.UpsertStock(ctx, nil, fishType.ID, nil, -item.Quantity); err != nil {
			return fmt.Errorf("kurangi stok %s: %w", item.FishCode, err)
		}
	}

	return nil
}

// processBonPengeluaran records a bon_pengeluaran as an expense.
// Confirmed data uses the receipt shape: {receipt: {date, vendor_name, items, total_amount}}.
func (s *ReviewService) processBonPengeluaran(ctx context.Context, rec *domain.Receipt, confirmedData interface{}) error {
	raw, err := json.Marshal(confirmedData)
	if err != nil {
		return err
	}
	var payload struct {
		Receipt *struct {
			Date        string  `json:"date"`
			VendorName  string  `json:"vendor_name"`
			ReceiptNo   string  `json:"receipt_no"`
			TotalAmount float64 `json:"total_amount"`
			Notes       string  `json:"notes"`
			Subcategory string  `json:"subcategory"` // "bayar_jasa" | "beli_item" | "" (defaults to "bon_pengeluaran")
			Items       []struct {
				ItemName   string  `json:"item_name"`
				Quantity   float64 `json:"quantity"`
				Unit       string  `json:"unit"`
				UnitPrice  float64 `json:"unit_price"`
				TotalPrice float64 `json:"total_price"`
			} `json:"items"`
		} `json:"receipt"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return err
	}
	if payload.Receipt == nil {
		return nil
	}
	r := payload.Receipt

	date := time.Now()
	if r.Date != "" {
		if parsed, err := time.Parse("2006-01-02", r.Date); err == nil {
			date = parsed
		}
	}

	// Build description from vendor + receipt_no, or fall back to first item name
	desc := r.VendorName
	if r.ReceiptNo != "" {
		desc = fmt.Sprintf("%s — No. %s", desc, r.ReceiptNo)
	}
	if desc == "" && len(r.Items) > 0 {
		desc = r.Items[0].ItemName
	}

	// Notes: join item names if multiple, or use existing notes
	notes := r.Notes
	if notes == "" && len(r.Items) > 0 {
		var names []string
		for _, it := range r.Items {
			if it.ItemName != "" {
				names = append(names, it.ItemName)
			}
		}
		if len(names) > 0 {
			notes = strings.Join(names, "; ")
		}
	}

	category := "bon_pengeluaran"
	if r.Subcategory == "bayar_jasa" || r.Subcategory == "beli_item" {
		category = r.Subcategory
	}

	receiptID := rec.ID
	e := &domain.Expense{
		Date:        date,
		Category:    category,
		Description: desc,
		Amount:      r.TotalAmount,
		Notes:       notes,
		ReceiptID:   &receiptID,
	}
	if err := s.expenseRepo.Create(ctx, e); err != nil {
		return err
	}

	// For beli_item: update item stock for each line
	if r.Subcategory == "beli_item" && s.itemRepo != nil {
		for _, it := range r.Items {
			if it.ItemName == "" || it.TotalPrice <= 0 {
				continue
			}
			item, err := s.itemRepo.GetItemByName(ctx, it.ItemName)
			if err != nil {
				// Auto-create the item so stock can be tracked
				code := strings.ToUpper(strings.ReplaceAll(it.ItemName, " ", "_"))
				item, err = s.itemRepo.CreateItem(ctx, code, it.ItemName, it.Unit, nil, it.UnitPrice)
				if err != nil {
					return fmt.Errorf("buat item %s: %w", it.ItemName, err)
				}
			}
			qty := it.Quantity
			if qty <= 0 {
				qty = 1
			}
			tx := &domain.ItemTransaction{
				ItemID:          item.ID,
				ItemName:        item.Name,
				TransactionType: "in",
				Quantity:        qty,
				UnitPrice:       it.UnitPrice,
				TotalAmount:     it.TotalPrice,
				PersonName:      r.VendorName,
				ReceiptID:       &receiptID,
				Notes:           r.Notes,
				TransactionDate: date,
			}
			if err := s.itemRepo.CreateTransaction(ctx, tx); err != nil {
				return fmt.Errorf("catat transaksi item %s: %w", it.ItemName, err)
			}
			if err := s.itemRepo.UpsertStock(ctx, item.ID, nil, qty); err != nil {
				return fmt.Errorf("update stok item %s: %w", it.ItemName, err)
			}
		}
	}

	return nil
}

func (s *ReviewService) processSortir(ctx context.Context, rec *domain.Receipt, confirmedData interface{}) error {
	raw, err := json.Marshal(confirmedData)
	if err != nil {
		return err
	}

	var payload struct {
		Sortir *struct {
			Date       string `json:"date"`
			VesselName string `json:"vessel_name"`
			Transports string `json:"transports"`
			Columns    []struct {
				SourceFishCode string  `json:"source_fish_code"`
				Category       string  `json:"category"`
				Grade          string  `json:"grade"`
				SortedFishCode string  `json:"sorted_fish_code"`
				TotalWeight    float64 `json:"total_weight"`
			} `json:"columns"`
			TotalWeight float64 `json:"total_weight"`
		} `json:"sortir"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return err
	}
	if payload.Sortir == nil {
		return nil
	}
	s_ := payload.Sortir

	txDate := time.Now()
	if s_.Date != "" {
		if parsed, err := time.Parse("2006-01-02", s_.Date); err == nil {
			txDate = parsed
		}
	}

	// Group total deduction per source fish code
	sourceDeductions := map[string]float64{}
	for _, col := range s_.Columns {
		if col.TotalWeight > 0 {
			sourceDeductions[col.SourceFishCode] += col.TotalWeight
		}
	}

	// Check RAW source stock is sufficient before doing anything.
	// If the source fish type doesn't exist yet, auto-create it (raw, is_sorted=false)
	// so historical sortir can be entered without pre-seeding every fish code.
	for srcCode, needed := range sourceDeductions {
		info, err := s.fishRepo.GetStockByCode(ctx, srcCode)
		if err != nil {
			return fmt.Errorf("cek stok sumber %s gagal: %w", srcCode, err)
		}
		if !info.Exists {
			if _, createErr := s.fishRepo.CreateType(ctx, srcCode, srcCode, "Auto-created from sortir source", false, nil, ""); createErr != nil {
				return fmt.Errorf("kode ikan sumber '%s' tidak ditemukan dan gagal dibuat otomatis: %w", srcCode, createErr)
			}
			continue
		}
		if info.IsSorted {
			return fmt.Errorf("kode ikan '%s' sudah merupakan ikan sortir, tidak bisa dijadikan sumber sortir", srcCode)
		}
		if info.AvailableKg < needed {
			return fmt.Errorf("stok RAW %s tidak cukup: tersedia %.0f kg, dibutuhkan %.0f kg", srcCode, info.AvailableKg, needed)
		}
	}

	// Process each sorted column
	for _, col := range s_.Columns {
		if col.TotalWeight <= 0 {
			continue
		}

		// Ensure sorted fish type exists — create if not.
		// If the code resolves to a raw (is_sorted=false) type, we must not reuse
		// that row. Instead auto-suffix the code with "-SORTIR" so the sorted
		// variant gets its own dedicated row with is_sorted=true.
		sortedCode := col.SortedFishCode
		sortedFishType, err := s.fishRepo.GetTypeByCode(ctx, col.SortedFishCode)
		if err == nil && !sortedFishType.IsSorted {
			// Code exists but belongs to a raw type — use suffixed code
			sortedCode = col.SortedFishCode + "-SORTIR"
			sortedFishType, err = s.fishRepo.GetTypeByCode(ctx, sortedCode)
		}
		if err != nil || !sortedFishType.IsSorted {
			// Look up the source fish type for the FK (alias-aware)
			srcFishType, srcErr := s.fishRepo.GetTypeByCodeOrAlias(ctx, col.SourceFishCode)
			var srcID *uuid.UUID
			if srcErr == nil {
				srcID = &srcFishType.ID
			}
			gradeLabel := col.Grade
			if col.Category != "" && col.Category != "SF" {
				gradeLabel = col.Category + " " + col.Grade
			}
			sortedFishType, err = s.fishRepo.CreateType(
				ctx,
				sortedCode,
				sortedCode,
				fmt.Sprintf("Auto-created from sortir: %s %s %s", col.SourceFishCode, col.Category, col.Grade),
				true,
				srcID,
				gradeLabel,
			)
			if err != nil {
				return fmt.Errorf("buat jenis ikan sortir %s: %w", sortedCode, err)
			}
		}

		// Record sorting output as a stock-in transaction for sorted fish
		tx := &domain.FishTransaction{
			FishTypeID:      sortedFishType.ID,
			FishCode:        col.SortedFishCode,
			TransactionType: domain.TxAdjust,
			Quantity:        col.TotalWeight,
			PricePerKg:      0,
			TotalAmount:     0,
			ReceiptID:       &rec.ID,
			TransactionDate: txDate,
			Notes:           fmt.Sprintf("Sortir dari %s grade %s", col.SourceFishCode, col.Grade),
		}
		if err := s.fishRepo.CreateTransaction(ctx, tx); err != nil {
			return fmt.Errorf("catat transaksi sortir %s: %w", col.SortedFishCode, err)
		}

		// Add sorted stock
		if err := s.fishRepo.UpsertStock(ctx, nil, sortedFishType.ID, nil, col.TotalWeight); err != nil {
			return fmt.Errorf("tambah stok sortir %s: %w", col.SortedFishCode, err)
		}
	}

	// Per-source: deduct RAW stock and record a sorting_operation row.
	// Use GetTypeByCodeOrAlias so "BDR" deducts from "BH" (alias) when BH has more stock.
	for srcCode, totalOut := range sourceDeductions {
		srcFishType, err := s.fishRepo.GetTypeByCodeOrAlias(ctx, srcCode)
		if err != nil {
			return fmt.Errorf("kode ikan sumber %s tidak ditemukan: %w", srcCode, err)
		}
		if err := s.fishRepo.UpsertStock(ctx, nil, srcFishType.ID, nil, -totalOut); err != nil {
			return fmt.Errorf("kurangi stok RAW %s: %w", srcCode, err)
		}

		// Build outputs slice for this source
		var sortOutputs []domain.SortingOutput
		for _, col := range s_.Columns {
			if col.SourceFishCode != srcCode || col.TotalWeight <= 0 {
				continue
			}
			sortedFT, ftErr := s.fishRepo.GetTypeByCode(ctx, col.SortedFishCode)
			if ftErr != nil {
				continue
			}
			sortOutputs = append(sortOutputs, domain.SortingOutput{
				FishTypeID:   sortedFT.ID,
				FishTypeCode: sortedFT.Code,
				OutputKg:     col.TotalWeight,
			})
		}

		sortOp := &domain.SortingOperation{
			SourceFishTypeID: srcFishType.ID,
			InputKg:          totalOut,
			WasteKg:          0,
			Notes:            fmt.Sprintf("Dari bon sortir %s", rec.ReviewToken),
			SortDate:         txDate,
			ReceiptID:        &rec.ID,
			Outputs:          sortOutputs,
		}
		// Insert into sorting_operations (best-effort; stock already updated above)
		if s.sortingRepo != nil {
			if soErr := s.sortingRepo.InsertOperationOnly(ctx, sortOp); soErr != nil {
				// non-fatal — log but don't fail the approval
				fmt.Fprintf(os.Stderr, "warn: insert sorting_operation for %s: %v\n", srcCode, soErr)
			}
		}
	}

	return nil
}

func (s *ReviewService) processBeliIkan(ctx context.Context, rec *domain.Receipt, confirmedData interface{}) error {
	raw, err := json.Marshal(confirmedData)
	if err != nil {
		return err
	}
	var intent struct {
		BeliIkan *struct {
			VesselName   string   `json:"vessel_name"`
			Date         string   `json:"date"`
			Notes        string   `json:"notes"`
			TimbanganIDs []string `json:"timbangan_ids"`
			Items        []struct {
				FishCode   string  `json:"fish_code"`
				QuantityKg float64 `json:"quantity_kg"`
				PricePerKg float64 `json:"price_per_kg"`
			} `json:"items"`
		} `json:"beli_ikan"`
	}
	if err := json.Unmarshal(raw, &intent); err != nil {
		return err
	}
	if intent.BeliIkan == nil {
		return nil
	}
	b := intent.BeliIkan
	buyDate := time.Now()
	if b.Date != "" {
		if parsed, err := time.Parse("2006-01-02", b.Date); err == nil {
			buyDate = parsed
		}
	}
	var vesselID *uuid.UUID
	if b.VesselName != "" {
		v, err := s.fishRepo.GetVesselByName(ctx, b.VesselName)
		if err != nil {
			newV := &domain.Vessel{Name: b.VesselName}
			if createErr := s.fishRepo.CreateVessel(ctx, newV); createErr == nil {
				vesselID = &newV.ID
			}
		} else {
			vesselID = &v.ID
		}
	}
	var items []domain.BeliIkanItem
	var total float64
	for _, it := range b.Items {
		itemTotal := it.QuantityKg * it.PricePerKg
		var fishTypeID *uuid.UUID
		if ft, err := s.fishRepo.GetTypeByCode(ctx, it.FishCode); err == nil {
			fishTypeID = &ft.ID
		}
		items = append(items, domain.BeliIkanItem{
			FishCode:    it.FishCode,
			FishTypeID:  fishTypeID,
			QuantityKg:  it.QuantityKg,
			PricePerKg:  it.PricePerKg,
			TotalAmount: itemTotal,
		})
		total += itemTotal
	}
	var timIDs []uuid.UUID
	for _, idStr := range b.TimbanganIDs {
		if id, err := uuid.Parse(idStr); err == nil {
			timIDs = append(timIDs, id)
		}
	}
	receiptID := rec.ID
	beliRec := &domain.BeliIkanRecord{
		ReceiptID:    &receiptID,
		VesselID:     vesselID,
		VesselName:   b.VesselName,
		BuyDate:      buyDate,
		Notes:        b.Notes,
		TotalAmount:  total,
		Items:        items,
		TimbanganIDs: timIDs,
	}
	return s.beliIkanRepo.Create(ctx, beliRec)
}

func (s *ReviewService) processExpense(ctx context.Context, rec *domain.Receipt, confirmedData interface{}, category string) error {
	raw, err := json.Marshal(confirmedData)
	if err != nil {
		return err
	}
	var payload struct {
		Expense *struct {
			Date        string  `json:"date"`
			Description string  `json:"description"`
			Amount      float64 `json:"amount"`
			Notes       string  `json:"notes"`
		} `json:"expense"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return err
	}
	if payload.Expense == nil {
		return nil
	}
	p := payload.Expense
	date := time.Now()
	if p.Date != "" {
		if parsed, err := time.Parse("2006-01-02", p.Date); err == nil {
			date = parsed
		}
	}
	receiptID := rec.ID
	e := &domain.Expense{
		Date:        date,
		Category:    category,
		Description: p.Description,
		Amount:      p.Amount,
		Notes:       p.Notes,
		ReceiptID:   &receiptID,
	}
	return s.expenseRepo.Create(ctx, e)
}

// Revise undoes all stock/transaction effects of an approved receipt, resets it
// to pending, and records a revision log entry so the reviewer can re-approve
// with corrected data.
func (s *ReviewService) Revise(ctx context.Context, token string, reviewerPersonID *uuid.UUID) error {
	rec, err := s.receiptRepo.GetByToken(ctx, token)
	if err != nil {
		return fmt.Errorf("receipt not found")
	}
	if rec.Status != domain.ReceiptApproved {
		return fmt.Errorf("only approved receipts can be revised")
	}

	if err := s.reverseReceiptEffects(ctx, rec); err != nil {
		return fmt.Errorf("reverse effects: %w", err)
	}

	return s.receiptRepo.ResetToPending(ctx, rec.ID, reviewerPersonID)
}

// reverseReceiptEffects undoes stock movements for a receipt by reversing each
// fish_transaction linked to it, then deletes side-effect records.
func (s *ReviewService) reverseReceiptEffects(ctx context.Context, rec *domain.Receipt) error {
	// Fetch all fish transactions linked to this receipt
	rows, err := s.db.Query(ctx, `
		SELECT fish_type_id, transaction_type, quantity
		FROM fish_transactions WHERE receipt_id = $1`, rec.ID)
	if err != nil {
		return err
	}
	type txRow struct {
		FishTypeID      uuid.UUID
		TransactionType string
		Quantity        float64
	}
	var txns []txRow
	for rows.Next() {
		var t txRow
		if err := rows.Scan(&t.FishTypeID, &t.TransactionType, &t.Quantity); err != nil {
			rows.Close()
			return err
		}
		txns = append(txns, t)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	// Reverse stock for each transaction
	for _, t := range txns {
		var delta float64
		switch t.TransactionType {
		case "buy":
			delta = -t.Quantity // undo stock-in
		case "sell":
			delta = t.Quantity // undo stock-out
		case "adjust":
			delta = -t.Quantity // undo sortir output stock-in
		default:
			continue
		}
		if err := s.fishRepo.UpsertStock(ctx, nil, t.FishTypeID, nil, delta); err != nil {
			return fmt.Errorf("reverse stock for %s: %w", t.FishTypeID, err)
		}
	}

	// Reverse item stock for beli_item receipts
	if s.itemRepo != nil {
		itemRows, err := s.db.Query(ctx, `
			SELECT item_id, transaction_type, quantity
			FROM item_transactions WHERE receipt_id = $1`, rec.ID)
		if err != nil {
			return err
		}
		type itemTxRow struct {
			ItemID          uuid.UUID
			TransactionType string
			Quantity        float64
		}
		var itemTxns []itemTxRow
		for itemRows.Next() {
			var t itemTxRow
			if err := itemRows.Scan(&t.ItemID, &t.TransactionType, &t.Quantity); err != nil {
				itemRows.Close()
				return err
			}
			itemTxns = append(itemTxns, t)
		}
		itemRows.Close()
		for _, t := range itemTxns {
			delta := -t.Quantity // in → undo stock-in
			if t.TransactionType == "out" {
				delta = t.Quantity // out → undo stock-out
			}
			if err := s.itemRepo.UpsertStock(ctx, t.ItemID, nil, delta); err != nil {
				return fmt.Errorf("reverse item stock %s: %w", t.ItemID, err)
			}
		}
	}

	// Delete linked records — beli_ikan children cascade automatically
	for _, q := range []string{
		`DELETE FROM beli_ikan_records WHERE receipt_id = $1`,
		`DELETE FROM fish_transactions WHERE receipt_id = $1`,
		`DELETE FROM item_transactions WHERE receipt_id = $1`,
		`DELETE FROM timbangan_records WHERE receipt_id = $1`,
		`DELETE FROM expenses WHERE receipt_id = $1`,
	} {
		if _, err := s.db.Exec(ctx, q, rec.ID); err != nil {
			return err
		}
	}

	return nil
}

func (s *ReviewService) List(ctx context.Context, status string, limit, offset int) ([]domain.Receipt, error) {
	return s.receiptRepo.List(ctx, status, limit, offset)
}
