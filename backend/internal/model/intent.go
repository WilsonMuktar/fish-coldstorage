package model

// Intent is what the bot extracted from a message or receipt.
type Intent struct {
	Type string `json:"type"` // see IntentType* constants below

	// populated for timbangan_ikan_basah receipts
	Timbangan *TimbanganData `json:"timbangan,omitempty"`

	// populated for timbangan_sortir receipts
	Sortir *SortirData `json:"sortir,omitempty"`

	// populated for bon_pengeluaran / bon_penjualan receipts
	Receipt *ReceiptData `json:"receipt,omitempty"`

	// populated for beli_ikan (fish purchase invoice / HPP)
	BeliIkan *BeliIkanData `json:"beli_ikan,omitempty"`

	// populated for free-text stock operations
	StockOp *StockOperation `json:"stock_op,omitempty"`

	// raw reply text when the model is just answering a question
	ReplyText string `json:"reply_text,omitempty"`

	// confidence 0–1 from model
	Confidence float64 `json:"confidence,omitempty"`
}

const (
	IntentReceipt   = "receipt"              // bon_pengeluaran or bon_penjualan
	IntentTimbangan = "timbangan_ikan_basah" // fish weighing form (raw fish in)
	IntentSortir    = "timbangan_sortir"     // fish sorting form (raw → sorted grades)
	IntentBeliIkan  = "beli_ikan"            // fish purchase invoice (HPP)
	IntentStockIn   = "stock_in"             // "beli 50kg tuna"
	IntentStockOut  = "stock_out"            // "jual 30kg BH"
	IntentQuery     = "query"                // "berapa stok tuna sekarang?"
	IntentHelp      = "help"                 // "cara pakai bot?"
	IntentUnknown   = "unknown"
)

// SortirData maps to a timbangan_sortir (fish sorting) form.
// Each column = one sorted fish type output from a raw source fish.
type SortirData struct {
	Date        string      `json:"date"`         // YYYY-MM-DD
	VesselName  string      `json:"vessel_name"`  // NAMA KAPAL
	Transports  string      `json:"transports"`
	Columns     []SortirCol `json:"columns"`      // one entry per fish-type column
	TotalWeight float64     `json:"total_weight"` // GT grand total
	Notes       string      `json:"notes,omitempty"`
	RawText     string      `json:"raw_text,omitempty"`
}

// SortirCol is one column in the sorting form.
// sorted_fish_code derivation rule:
//   - SF (segar/fresh) category is dropped:  BDR + SF + 300-500 → "BDR 300-500"
//   - PC/SP categories are kept:             BDR + PC + 300-500 → "BDR PC 300-500"
type SortirCol struct {
	SourceFishCode string  `json:"source_fish_code"` // raw fish code, e.g. BDR, SLM, SLM HIS
	Category       string  `json:"category"`         // SF | PC | SP
	Grade          string  `json:"grade"`            // size/grade, e.g. 300-500, 1UP, 2UP
	SortedFishCode string  `json:"sorted_fish_code"` // derived, e.g. BDR 300-500, BDR PC 300-500
	TotalWeight    float64 `json:"total_weight"`
}

// TimbanganData maps directly to one timbangan_ikan_basah form.
// Each column in the form is one fish type with its price and weight batches.
type TimbanganData struct {
	Date        string             `json:"date"`         // YYYY-MM-DD (from TGL field)
	VesselName  string             `json:"vessel_name"`  // NAMA KAPAL
	Transports  string             `json:"transports"`   // TRANSPORTS field
	FishColumns []TimbanganFishCol `json:"fish_columns"` // one entry per fish-type column
	TotalWeight float64            `json:"total_weight"` // grand total across all columns
	Notes       string             `json:"notes,omitempty"` // "Total = X, Dari gudang: Y"
	RawText     string             `json:"raw_text,omitempty"`
}

// TimbanganFishCol represents one fish-type column in the timbangan form.
type TimbanganFishCol struct {
	FishCode      string    `json:"fish_code"`      // e.g. BH, TUNA, SRK K
	PricePerKg    float64   `json:"price_per_kg"`   // price in IDR from row 2
	WeightBatches []float64 `json:"weight_batches"` // individual batch weights from row 3
	TotalWeight   float64   `json:"total_weight"`   // sum row at bottom of column (row 4)
}

// ReceiptData is used for bon_pengeluaran and bon_penjualan.
type ReceiptData struct {
	ReceiptType string        `json:"receipt_type"` // bon_pengeluaran | bon_penjualan
	ReceiptNo   string        `json:"receipt_no,omitempty"`
	Date        string        `json:"date,omitempty"` // YYYY-MM-DD
	VendorName  string        `json:"vendor_name,omitempty"`
	Items       []ReceiptItem `json:"items"`
	TotalAmount float64       `json:"total_amount,omitempty"`
	Notes       string        `json:"notes,omitempty"`
	RawText     string        `json:"raw_text,omitempty"`
}

type ReceiptItem struct {
	FishCode   string  `json:"fish_code,omitempty"` // BH, TUNA, SR, etc.
	ItemName   string  `json:"item_name,omitempty"`
	Quantity   float64 `json:"quantity"`
	Unit       string  `json:"unit,omitempty"` // kg, ekor, pcs
	UnitPrice  float64 `json:"unit_price,omitempty"`
	TotalPrice float64 `json:"total_price,omitempty"`
}

// BeliIkanData is used for bon_pembelian_ikan (fish purchase / HPP).
type BeliIkanData struct {
	Date          string        `json:"date"`
	ReceiptNo     string        `json:"receipt_no,omitempty"`
	VendorName    string        `json:"vendor_name,omitempty"`
	VesselName    string        `json:"vessel_name,omitempty"`
	TotalWeightKg float64       `json:"total_weight_kg,omitempty"`
	Items         []BeliIkanItem `json:"items"`
	GrandTotal    float64       `json:"grand_total,omitempty"`
	Notes         string        `json:"notes,omitempty"`
}

type BeliIkanItem struct {
	FishCode    string  `json:"fish_code"`
	QuantityKg  float64 `json:"quantity_kg"`
	PricePerKg  float64 `json:"price_per_kg"`
	TotalAmount float64 `json:"total_amount"`
}

type StockOperation struct {
	Direction  string  `json:"direction"` // in | out
	FishCode   string  `json:"fish_code,omitempty"`
	ItemName   string  `json:"item_name,omitempty"`
	Quantity   float64 `json:"quantity"`
	Unit       string  `json:"unit"`
	PersonName string  `json:"person_name,omitempty"`
	Notes      string  `json:"notes,omitempty"`
}
