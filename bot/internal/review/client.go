package review

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/samudera/bot/internal/model"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

type SubmitRequest struct {
	ImageData         string      `json:"image_data"`
	ImageFilename     string      `json:"image_filename"`
	ReceiptType       string      `json:"receipt_type"`
	SubmittedVia      string      `json:"submitted_via"`
	TelegramMessageID *int64      `json:"telegram_message_id,omitempty"`
	TelegramChatID    *int64      `json:"telegram_chat_id,omitempty"`
	IntentData        interface{} `json:"intent_data"`
}

type SubmitResponse struct {
	ReceiptID   string `json:"receipt_id"`
	ReviewURL   string `json:"review_url"`
	ReviewToken string `json:"review_token"`
}

func (c *Client) Submit(ctx context.Context, imgBytes []byte, filename string, msgID int64, chatID int64, intent *model.Intent) (*SubmitResponse, error) {
	imageB64 := base64.StdEncoding.EncodeToString(imgBytes)

	receiptType := intent.Type
	// Use the specific subtype (bon_penjualan/bon_pengeluaran) when available
	if intent.Receipt != nil && intent.Receipt.ReceiptType != "" {
		receiptType = intent.Receipt.ReceiptType
	}
	if receiptType == "" {
		receiptType = "unknown"
	}

	msgIDPtr := &msgID
	chatIDPtr := &chatID

	req := SubmitRequest{
		ImageData:         imageB64,
		ImageFilename:     filename,
		ReceiptType:       receiptType,
		SubmittedVia:      "telegram",
		TelegramMessageID: msgIDPtr,
		TelegramChatID:    chatIDPtr,
		IntentData:        intent,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/reviews/submit", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("review service unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("review service error %d: %s", resp.StatusCode, b)
	}

	var result SubmitResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) Ping(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/health", nil)
	if err != nil {
		return err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("review service unreachable at %s: %w", c.baseURL, err)
	}
	resp.Body.Close()
	return nil
}
