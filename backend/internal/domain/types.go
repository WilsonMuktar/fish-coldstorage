package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// ─── Enums ───────────────────────────────────────────────────────────────────

type FishTransactionType string

const (
	TxBuy    FishTransactionType = "buy"
	TxSell   FishTransactionType = "sell"
	TxAdjust FishTransactionType = "adjust"
)

type ReceiptStatus string

const (
	ReceiptPending  ReceiptStatus = "pending"
	ReceiptApproved ReceiptStatus = "approved"
	ReceiptRejected ReceiptStatus = "rejected"
)

type ReceiptType string

const (
	ReceiptTimbangan    ReceiptType = "timbangan_ikan_basah"
	ReceiptSortir       ReceiptType = "timbangan_sortir"
	ReceiptBonPenjualan ReceiptType = "bon_penjualan"
	ReceiptBonKeluar    ReceiptType = "bon_pengeluaran"
	ReceiptInvoice      ReceiptType = "invoice"
	ReceiptBeliIkan     ReceiptType = "beli_ikan"
	ReceiptBeliItem     ReceiptType = "beli_item"
	ReceiptBayarJasa    ReceiptType = "bayar_jasa"
)

// ─── Storage Location ────────────────────────────────────────────────────────

type StorageLocation struct {
	ID          uuid.UUID `json:"id"`
	Code        string    `json:"code"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
}

// ─── Fish ────────────────────────────────────────────────────────────────────

type FishType struct {
	ID                   uuid.UUID  `json:"id"`
	Code                 string     `json:"code"`
	Name                 string     `json:"name"`
	Description          string     `json:"description"`
	Aliases              string     `json:"aliases"`
	PhotoPath            string     `json:"photo_path,omitempty"`
	PhotoURL             string     `json:"photo_url,omitempty"`
	IsActive             bool       `json:"is_active"`
	IsSorted             bool       `json:"is_sorted"`
	SourceFishTypeID     *uuid.UUID `json:"source_fish_type_id,omitempty"`
	SourceFishTypeCode   string     `json:"source_fish_type_code,omitempty"`
	Grade                string     `json:"grade,omitempty"`
	CanonicalFishTypeID  *uuid.UUID `json:"canonical_fish_type_id,omitempty"`
	CreatedAt            time.Time  `json:"created_at"`
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

type SortingOutput struct {
	ID                 uuid.UUID `json:"id"`
	SortingOperationID uuid.UUID `json:"sorting_operation_id"`
	FishTypeID         uuid.UUID `json:"fish_type_id"`
	FishTypeCode       string    `json:"fish_type_code"`
	FishTypeName       string    `json:"fish_type_name"`
	OutputKg           float64   `json:"output_kg"`
}

type SortingOperation struct {
	ID                 uuid.UUID      `json:"id"`
	SourceFishTypeID   uuid.UUID      `json:"source_fish_type_id"`
	SourceFishTypeCode string         `json:"source_fish_type_code"`
	SourceFishTypeName string         `json:"source_fish_type_name"`
	InputKg            float64        `json:"input_kg"`
	WasteKg            float64        `json:"waste_kg"`
	Notes              string         `json:"notes,omitempty"`
	SortDate           time.Time      `json:"sort_date"`
	CreatedByName      string         `json:"created_by_name,omitempty"`
	ReceiptID          *uuid.UUID     `json:"receipt_id,omitempty"`
	ReviewToken        string         `json:"review_token,omitempty"`
	Outputs            []SortingOutput `json:"outputs"`
	CreatedAt          time.Time      `json:"created_at"`
}

type FishStock struct {
	ID                uuid.UUID `json:"id"`
	FishTypeID        uuid.UUID `json:"fish_type_id"`
	FishCode          string    `json:"fish_code"`
	StorageLocationID uuid.UUID `json:"storage_location_id"`
	Quantity          float64   `json:"quantity"`
	UpdatedAt         time.Time `json:"updated_at"`
}

type FishTransaction struct {
	ID                uuid.UUID           `json:"id"`
	FishTypeID        uuid.UUID           `json:"fish_type_id"`
	FishCode          string              `json:"fish_code"`
	TransactionType   FishTransactionType `json:"transaction_type"`
	Quantity          float64             `json:"quantity"`
	PricePerKg        float64             `json:"price_per_kg"`
	TotalAmount       float64             `json:"total_amount"`
	PersonID          *uuid.UUID          `json:"person_id,omitempty"`
	PersonName        string              `json:"person_name,omitempty"`
	VesselID          *uuid.UUID          `json:"vessel_id,omitempty"`
	VesselName        string              `json:"vessel_name,omitempty"`
	ReceiptID         *uuid.UUID          `json:"receipt_id,omitempty"`
	ReviewToken       string              `json:"review_token,omitempty"`
	ReceiptImagePath  string              `json:"receipt_image_path,omitempty"`
	StorageLocationID *uuid.UUID          `json:"storage_location_id,omitempty"`
	Notes             string              `json:"notes,omitempty"`
	TransactionDate   time.Time           `json:"transaction_date"`
	CreatedAt         time.Time           `json:"created_at"`
}

// ─── Items ───────────────────────────────────────────────────────────────────

type ItemCategory struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

type Item struct {
	ID           uuid.UUID `json:"id"`
	Code         string    `json:"code"`
	Name         string    `json:"name"`
	CategoryID   *uuid.UUID `json:"category_id,omitempty"`
	CategoryName string    `json:"category_name,omitempty"`
	Unit         string    `json:"unit"`
	PriceEstimate float64  `json:"price_estimate"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
}

type ItemStock struct {
	ID                uuid.UUID  `json:"id"`
	ItemID            uuid.UUID  `json:"item_id"`
	ItemCode          string     `json:"item_code"`
	ItemName          string     `json:"item_name,omitempty"`
	CategoryName      string     `json:"category_name,omitempty"`
	Unit              string     `json:"unit,omitempty"`
	StorageLocationID *uuid.UUID `json:"storage_location_id,omitempty"`
	Quantity          float64    `json:"quantity"`
	UpdatedAt         *time.Time `json:"updated_at"`
}

type ItemTransaction struct {
	ID              uuid.UUID `json:"id"`
	ItemID          uuid.UUID `json:"item_id"`
	ItemName        string    `json:"item_name,omitempty"`
	TransactionType string    `json:"transaction_type"`
	Quantity        float64   `json:"quantity"`
	UnitPrice       float64   `json:"unit_price"`
	TotalAmount     float64   `json:"total_amount"`
	PersonID        *uuid.UUID `json:"person_id,omitempty"`
	PersonName      string     `json:"person_name,omitempty"`
	ReceiptID       *uuid.UUID `json:"receipt_id,omitempty"`
	ReviewToken     string     `json:"review_token,omitempty"`
	Notes           string     `json:"notes,omitempty"`
	TransactionDate time.Time  `json:"transaction_date"`
	CreatedAt       time.Time  `json:"created_at"`
}

// ─── Vessels ─────────────────────────────────────────────────────────────────

type Vessel struct {
	ID             uuid.UUID  `json:"id"`
	Name           string     `json:"name"`
	RegistrationNo string     `json:"registration_no,omitempty"`
	OwnerPersonID  *uuid.UUID `json:"owner_person_id,omitempty"`
	OwnerName      string     `json:"owner_name,omitempty"`
	CaptainName    string     `json:"captain_name,omitempty"`
	PhotoPath      string     `json:"photo_path,omitempty"`
	PhotoURL       string     `json:"photo_url,omitempty"`
	IsActive       bool       `json:"is_active"`
	CreatedAt      time.Time  `json:"created_at"`
}

// ─── Timbangan ────────────────────────────────────────────────────────────────

type TimbanganRecord struct {
	ID              uuid.UUID  `json:"id"`
	ReceiptID       uuid.UUID  `json:"receipt_id"`
	ReviewToken     string     `json:"review_token,omitempty"`
	VesselID        *uuid.UUID `json:"vessel_id,omitempty"`
	VesselName      string     `json:"vessel_name"`
	Transports      string     `json:"transports"`
	TransportNumber string     `json:"transport_number"` // alias for frontend
	TimbangDate     time.Time  `json:"timbang_date"`
	WeighDate       string     `json:"weigh_date"`       // formatted date for frontend
	TotalWeightKg   float64    `json:"total_weight_kg"`
	TotalKg         float64    `json:"total_kg"`         // alias for frontend
	FishColumns     []byte     `json:"fish_columns"`     // JSONB
	Status          string     `json:"status"`
	CreatedBy       string     `json:"created_by"`
	CreatedAt       time.Time  `json:"created_at"`
}

// ─── Consignment (Titipan) ────────────────────────────────────────────────────

type TitipanRecord struct {
	ID            uuid.UUID `json:"id"`
	PersonID      uuid.UUID `json:"person_id"`
	PersonName    string    `json:"person_name,omitempty"`
	FishTypeID    *uuid.UUID `json:"fish_type_id,omitempty"`
	FishCode      string    `json:"fish_code,omitempty"`
	DepositKg     float64   `json:"deposit_kg"`
	RemainingKg   float64   `json:"remaining_kg"`
	PricePerKg    float64   `json:"price_per_kg"`
	DepositDate   time.Time `json:"deposit_date"`
	Status        string    `json:"status"`
	Notes         string    `json:"notes,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

type TitipanTransaction struct {
	ID              uuid.UUID `json:"id"`
	TitipanID       uuid.UUID `json:"titipan_id"`
	TransactionType string    `json:"transaction_type"` // deposit, withdrawal
	Quantity        float64   `json:"quantity"`
	Notes           string    `json:"notes,omitempty"`
	TransactionDate time.Time `json:"transaction_date"`
	CreatedAt       time.Time `json:"created_at"`
}

// ─── Employees ────────────────────────────────────────────────────────────────

type Employee struct {
	ID          uuid.UUID  `json:"id"`
	PersonID    *uuid.UUID `json:"person_id,omitempty"`
	Code        int        `json:"code"`
	Name        string     `json:"name"`
	Position    string     `json:"position"`
	Phone       string     `json:"phone,omitempty"`
	DailySalary float64    `json:"daily_salary"`
	IsActive    bool       `json:"is_active"`
	HiredAt     *time.Time `json:"hired_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

type AttendanceRecord struct {
	ID           uuid.UUID `json:"id"`
	EmployeeID   uuid.UUID `json:"employee_id"`
	EmployeeName string    `json:"employee_name,omitempty"`
	AttendDate   time.Time `json:"attend_date"`
	Shift        int       `json:"shift"` // 1=pagi, 2=sore
	Present      bool      `json:"present"`
	Notes        string    `json:"notes,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

// ─── Invoice ──────────────────────────────────────────────────────────────────

type Invoice struct {
	ID           uuid.UUID  `json:"id"`
	InvoiceNo    string     `json:"invoice_no"`
	PersonID     *uuid.UUID `json:"person_id,omitempty"`
	PersonName   string     `json:"person_name,omitempty"`
	InvoiceType  string     `json:"invoice_type"` // ar (receivable), ap (payable)
	TotalAmount  float64    `json:"total_amount"`
	PaidAmount   float64    `json:"paid_amount"`
	DueDate      *time.Time `json:"due_date,omitempty"`
	Status       string     `json:"status"` // draft, issued, partial, paid, overdue
	Notes        string     `json:"notes,omitempty"`
	IssuedAt     *time.Time `json:"issued_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
}

type InstallmentSchedule struct {
	ID          uuid.UUID  `json:"id"`
	InvoiceID   uuid.UUID  `json:"invoice_id"`
	DueDate     time.Time  `json:"due_date"`
	AmountDue   float64    `json:"amount_due"`
	AmountPaid  float64    `json:"amount_paid"`
	PaidAt      *time.Time `json:"paid_at,omitempty"`
	Status      string     `json:"status"` // pending, paid, overdue
	Notes       string     `json:"notes,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	// Enriched fields populated by ListAllSchedules (JOIN with invoices)
	InvoiceNo   string `json:"invoice_no,omitempty"`
	PersonName  string `json:"person_name,omitempty"`
	InvoiceType string `json:"invoice_type,omitempty"`
}

type InstallmentPayment struct {
	ID           uuid.UUID `json:"id"`
	ScheduleID   uuid.UUID `json:"schedule_id"`
	AmountPaid   float64   `json:"amount_paid"`
	PaymentDate  time.Time `json:"payment_date"`
	Notes        string    `json:"notes,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

// ─── Lending ──────────────────────────────────────────────────────────────────

type LendingRecord struct {
	ID              uuid.UUID  `json:"id"`
	PersonID        *uuid.UUID `json:"person_id,omitempty"`
	PersonName      string     `json:"person_name,omitempty"`
	Amount          float64    `json:"amount"`
	PaidAmount      float64    `json:"paid_amount"`
	LendingDate     time.Time  `json:"lending_date"`
	DueDate         *time.Time `json:"due_date,omitempty"`
	Status          string     `json:"status"` // active, partial, settled
	Notes           string     `json:"notes,omitempty"`
	Direction       string     `json:"direction"` // given, received
	CreatedAt       time.Time  `json:"created_at"`
}

// ─── Receipts / Review ────────────────────────────────────────────────────────

type Receipt struct {
	ID                  uuid.UUID        `json:"id"`
	ReceiptType         ReceiptType      `json:"receipt_type"`
	Status              ReceiptStatus    `json:"status"`
	SubmittedVia        string           `json:"submitted_via"`
	TelegramMessageID   *int64           `json:"telegram_message_id,omitempty"`
	TelegramChatID      *int64           `json:"telegram_chat_id,omitempty"`
	ImagePath           string           `json:"image_path,omitempty"`
	ImageURL            string           `json:"image_url,omitempty"`
	ExtractedData       json.RawMessage  `json:"extracted_data"`
	ConfirmedData       json.RawMessage  `json:"confirmed_data,omitempty"`
	ReviewToken         string           `json:"review_token"`
	ReviewTokenExpiry   time.Time        `json:"review_token_expiry"`
	ReviewTokenUsed     bool             `json:"review_token_used"`
	ReviewedByPersonID  *uuid.UUID       `json:"reviewed_by_person_id,omitempty"`
	ReviewedAt          *time.Time       `json:"reviewed_at,omitempty"`
	RejectionReason     string           `json:"rejection_reason,omitempty"`
	SubmittedAt         time.Time        `json:"submitted_at"`
}

type ReviewFieldChange struct {
	ID          uuid.UUID `json:"id"`
	ReceiptID   uuid.UUID `json:"receipt_id"`
	FieldPath   string    `json:"field_path"`
	OldValue    string    `json:"old_value,omitempty"`
	NewValue    string    `json:"new_value,omitempty"`
	ChangedAt   time.Time `json:"changed_at"`
}

// ─── Request/Response types ───────────────────────────────────────────────────

type SubmitReviewRequest struct {
	ImageData           string      `json:"image_data"`            // base64 encoded
	ImageFilename       string      `json:"image_filename"`
	ReceiptType         ReceiptType `json:"receipt_type"`
	SubmittedVia        string      `json:"submitted_via"`
	TelegramMessageID   *int64      `json:"telegram_message_id,omitempty"`
	TelegramChatID      *int64      `json:"telegram_chat_id,omitempty"`
	IntentData          interface{} `json:"intent_data"` // raw Intent JSON from bot
}

type SubmitReviewResponse struct {
	ReceiptID   string `json:"receipt_id"`
	ReviewURL   string `json:"review_url"`
	ReviewToken string `json:"review_token"`
}

type ApproveReviewRequest struct {
	ConfirmedData json.RawMessage `json:"confirmed_data"`
}

type RejectReviewRequest struct {
	Reason string `json:"reason"`
}

type FishStockSummary struct {
	FishTypeID        string     `json:"fish_type_id"`
	FishCode          string     `json:"fish_code"`
	FishName          string     `json:"fish_name"`
	// AllCodes is non-empty when this row represents a canonical group with aliases.
	// Format: "BDR / BH" — canonical code first, then alias codes.
	AllCodes          string     `json:"all_codes,omitempty"`
	TotalQuantity     float64    `json:"total_quantity"`
	SortedKg          float64    `json:"sorted_kg"`
	SoldKg            float64    `json:"sold_kg"`
	StorageLocation   string     `json:"storage_location,omitempty"`
	UpdatedAt         *time.Time `json:"updated_at"`
}

type DashboardStats struct {
	TotalFishStock     float64             `json:"total_fish_stock_kg"`
	RawFishStock       float64             `json:"raw_fish_stock_kg"`
	SortedFishStock    float64             `json:"sorted_fish_stock_kg"`
	PendingReviews     int                 `json:"pending_reviews"`
	TotalAR            float64             `json:"total_ar"`
	TotalAP            float64             `json:"total_ap"`
	FishStockSummary   []FishStockSummary  `json:"fish_stock_summary"`
	RecentTransactions []FishTransaction   `json:"recent_transactions"`
}

type ListResponse struct {
	Data  interface{} `json:"data"`
	Total int         `json:"total"`
	Page  int         `json:"page"`
	Limit int         `json:"limit"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

// ─── Beli Ikan (Fish Purchase Payment) ───────────────────────────────────────

type BeliIkanItem struct {
	ID          uuid.UUID  `json:"id"`
	BeliIkanID  uuid.UUID  `json:"beli_ikan_id"`
	FishTypeID  *uuid.UUID `json:"fish_type_id,omitempty"`
	FishCode    string     `json:"fish_code"`
	QuantityKg  float64    `json:"quantity_kg"`
	PricePerKg  float64    `json:"price_per_kg"`
	TotalAmount float64    `json:"total_amount"`
}

type BeliIkanRecord struct {
	ID           uuid.UUID      `json:"id"`
	ReceiptID    *uuid.UUID     `json:"receipt_id,omitempty"`
	VesselID     *uuid.UUID     `json:"vessel_id,omitempty"`
	VesselName   string         `json:"vessel_name"`
	BuyDate      time.Time      `json:"buy_date"`
	Notes        string         `json:"notes,omitempty"`
	TotalAmount  float64        `json:"total_amount"`
	Items        []BeliIkanItem `json:"items"`
	TimbanganIDs []uuid.UUID    `json:"timbangan_ids,omitempty"`
	CreatedAt    time.Time      `json:"created_at"`
}

type ProfitLossStats struct {
	Period              string  `json:"period"`
	Revenue             float64 `json:"revenue"`
	COGS                float64 `json:"cogs"`
	GrossProfit         float64 `json:"gross_profit"`
	GrossMarginPct      float64 `json:"gross_margin_pct"`
	SoldKg              float64 `json:"sold_kg"`
	BoughtKg            float64 `json:"bought_kg"`
	UnpaidTimbanganKg   float64 `json:"unpaid_timbangan_kg"`
	OpEx                float64 `json:"opex"`
	NetProfit           float64 `json:"net_profit"`
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

type Expense struct {
	ID          uuid.UUID  `json:"id"`
	Date        time.Time  `json:"date"`
	Category    string     `json:"category"`
	Description string     `json:"description"`
	Amount      float64    `json:"amount"`
	Notes       string     `json:"notes"`
	ReceiptID   *uuid.UUID `json:"receipt_id,omitempty"`
	ReviewToken string     `json:"review_token,omitempty"`
	PhotoPath   string     `json:"photo_path,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}
