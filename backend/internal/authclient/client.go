package authclient

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func New(baseURL string) *Client {
	return &Client{
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: 5 * time.Second},
	}
}

type PersonInfo struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Phone      string `json:"phone"`
	PersonType string `json:"person_type"`
	TelegramID int64  `json:"telegram_id"`
}

func (c *Client) GetPerson(ctx context.Context, personID string) (*PersonInfo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		fmt.Sprintf("%s/grpc/persons/%s", c.baseURL, personID), nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("auth-service unreachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("person not found: %s", personID)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("auth-service error %d", resp.StatusCode)
	}
	var p PersonInfo
	if err := json.NewDecoder(resp.Body).Decode(&p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (c *Client) GetByTelegram(ctx context.Context, telegramID int64) (*PersonInfo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		fmt.Sprintf("%s/grpc/persons/telegram/%d", c.baseURL, telegramID), nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("auth-service unreachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("telegram user not registered: %d", telegramID)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("auth-service error %d", resp.StatusCode)
	}
	var p PersonInfo
	if err := json.NewDecoder(resp.Body).Decode(&p); err != nil {
		return nil, err
	}
	return &p, nil
}
