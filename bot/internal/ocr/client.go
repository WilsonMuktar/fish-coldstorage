package ocr

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"time"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Minute,
		},
	}
}

// Result is the response from GOT-OCR 2.0.
type Result struct {
	Text   string `json:"text"`   // markdown or plain text
	Format string `json:"format"` // "markdown"
}

// TableColumns and Lines kept for compatibility — not used with GOT-OCR.
type TableColumn struct{}

func (r *Result) FormatTableText() string {
	return r.Text
}

// Extract sends an image to GOT-OCR and returns the extracted text.
func (c *Client) Extract(ctx context.Context, imageBytes []byte, filename string) (*Result, error) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)

	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename="%s"`, filename))
	h.Set("Content-Type", "image/jpeg")
	part, err := w.CreatePart(h)
	if err != nil {
		return nil, err
	}
	if _, err := io.Copy(part, bytes.NewReader(imageBytes)); err != nil {
		return nil, err
	}
	w.Close()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/ocr", &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", w.FormDataContentType())

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ocr service unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ocr service error %d: %s", resp.StatusCode, body)
	}

	var result Result
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("parsing ocr response: %w", err)
	}

	return &result, nil
}

// Ping checks that the OCR service is reachable.
func (c *Client) Ping(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/health", nil)
	if err != nil {
		return err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("ocr service unreachable at %s: %w", c.baseURL, err)
	}
	resp.Body.Close()
	return nil
}
