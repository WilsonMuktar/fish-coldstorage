package stockapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"time"
)

type StockEntry struct {
	FishTypeID    string     `json:"fish_type_id"`
	FishCode      string     `json:"fish_code"`
	FishName      string     `json:"fish_name"`
	AllCodes      string     `json:"all_codes"`
	TotalQuantity float64    `json:"total_quantity"`
	UpdatedAt     *time.Time `json:"updated_at"`
}

type Transaction struct {
	ID              string    `json:"id"`
	FishCode        string    `json:"fish_code"`
	TransactionType string    `json:"transaction_type"`
	Quantity        float64   `json:"quantity"`
	PricePerKg      float64   `json:"price_per_kg"`
	TotalAmount     float64   `json:"total_amount"`
	PersonName      string    `json:"person_name"`
	VesselName      string    `json:"vessel_name"`
	Notes           string    `json:"notes"`
	TransactionDate time.Time `json:"transaction_date"`
}

type TimbanganRecord struct {
	ID            string          `json:"id"`
	VesselName    string          `json:"vessel_name"`
	Transports    string          `json:"transports"`
	TimbangDate   time.Time       `json:"timbang_date"`
	TotalWeightKg float64         `json:"total_weight_kg"`
	FishColumns   json.RawMessage `json:"fish_columns"`
	ReviewToken   string          `json:"review_token"`
}

type DashboardStats struct {
	TotalFishStockKg   float64 `json:"total_fish_stock_kg"`
	RawFishStockKg     float64 `json:"raw_fish_stock_kg"`
	SortedFishStockKg  float64 `json:"sorted_fish_stock_kg"`
	PendingReviews     int     `json:"pending_reviews"`
}

type Expense struct {
	ID          string    `json:"id"`
	Date        time.Time `json:"date"`
	Category    string    `json:"category"`
	Description string    `json:"description"`
	Amount      float64   `json:"amount"`
	Notes       string    `json:"notes"`
}

type BeliIkan struct {
	ID         string    `json:"id"`
	VesselName string    `json:"vessel_name"`
	BuyDate    time.Time `json:"buy_date"`
	TotalAmount float64  `json:"total_amount"`
	Notes      string    `json:"notes"`
}

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

func getJSON[T any](ctx context.Context, c *Client, path string) (T, error) {
	var zero T
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return zero, err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return zero, fmt.Errorf("API unreachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return zero, fmt.Errorf("API error %d: %s", resp.StatusCode, b)
	}
	var result T
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return zero, err
	}
	return result, nil
}

func (c *Client) GetAllStock(ctx context.Context) ([]StockEntry, error) {
	result, err := getJSON[struct {
		Data []StockEntry `json:"data"`
	}](ctx, c, "/v1/public/stock")
	if err != nil {
		return nil, err
	}
	return result.Data, nil
}

func (c *Client) GetStockByCode(ctx context.Context, code string) (*StockEntry, error) {
	var entry struct {
		FishCode    string  `json:"fish_code"`
		AvailableKg float64 `json:"available_kg"`
		IsSorted    bool    `json:"is_sorted"`
		Exists      bool    `json:"exists"`
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/v1/public/stock/"+code, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("stock API unreachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("stock API error %d: %s", resp.StatusCode, b)
	}
	if err := json.NewDecoder(resp.Body).Decode(&entry); err != nil {
		return nil, err
	}
	if !entry.Exists {
		return nil, nil
	}
	return &StockEntry{
		FishCode:      entry.FishCode,
		TotalQuantity: entry.AvailableKg,
	}, nil
}

func (c *Client) GetRecentTransactions(ctx context.Context, limit int) ([]Transaction, error) {
	path := fmt.Sprintf("/v1/public/transactions?limit=%d", limit)
	result, err := getJSON[struct {
		Data []Transaction `json:"data"`
	}](ctx, c, path)
	if err != nil {
		return nil, err
	}
	return result.Data, nil
}

func (c *Client) GetRecentTimbangan(ctx context.Context, limit int) ([]TimbanganRecord, error) {
	path := fmt.Sprintf("/v1/public/timbangan?limit=%d", limit)
	result, err := getJSON[struct {
		Data []TimbanganRecord `json:"data"`
	}](ctx, c, path)
	if err != nil {
		return nil, err
	}
	return result.Data, nil
}

func (c *Client) GetDashboard(ctx context.Context) (*DashboardStats, error) {
	result, err := getJSON[DashboardStats](ctx, c, "/v1/public/dashboard")
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) GetRecentExpenses(ctx context.Context, limit int) ([]Expense, error) {
	path := fmt.Sprintf("/v1/public/expenses?limit=%d", limit)
	result, err := getJSON[struct {
		Data []Expense `json:"data"`
	}](ctx, c, path)
	if err != nil {
		return nil, err
	}
	return result.Data, nil
}

func (c *Client) GetRecentBeliIkan(ctx context.Context, limit int) ([]BeliIkan, error) {
	path := fmt.Sprintf("/v1/public/beli-ikan?limit=%d", limit)
	result, err := getJSON[struct {
		Data []BeliIkan `json:"data"`
	}](ctx, c, path)
	if err != nil {
		return nil, err
	}
	return result.Data, nil
}

// TopByStock returns entries sorted by TotalQuantity descending, limited to n items.
func TopByStock(entries []StockEntry, n int) []StockEntry {
	sorted := make([]StockEntry, len(entries))
	copy(sorted, entries)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].TotalQuantity > sorted[j].TotalQuantity
	})
	if n > 0 && n < len(sorted) {
		return sorted[:n]
	}
	return sorted
}

// DisplayCode returns AllCodes if set (e.g. "BH / BDR"), otherwise FishCode.
func DisplayCode(e StockEntry) string {
	if e.AllCodes != "" {
		return e.AllCodes
	}
	return e.FishCode
}

// LastPriceForCode returns the most recent buy price for a fish code from transactions.
func LastPriceForCode(txns []Transaction, code string) (float64, bool) {
	for _, t := range txns {
		if t.FishCode == code && t.TransactionType == "buy" && t.PricePerKg > 0 {
			return t.PricePerKg, true
		}
	}
	return 0, false
}
