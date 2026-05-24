package ollama

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

type Client struct {
	baseURL    string
	model      string
	httpClient *http.Client
	debug      bool
}

func NewClient(baseURL, model string, debug bool) *Client {
	return &Client{
		baseURL: baseURL,
		model:   model,
		debug:   debug,
		httpClient: &http.Client{
			Timeout: 10 * time.Minute, // model inference can be slow
		},
	}
}

// chatRequest mirrors Ollama's /api/chat payload.
type chatRequest struct {
	Model    string         `json:"model"`
	Messages []message      `json:"messages"`
	Stream   bool           `json:"stream"`
	Format   string         `json:"format,omitempty"`
	Options  *modelOptions  `json:"options,omitempty"`
}

type modelOptions struct {
	NumPredict int `json:"num_predict"` // max output tokens
}

type message struct {
	Role    string   `json:"role"`
	Content string   `json:"content"`
	Images  []string `json:"images,omitempty"` // base64-encoded
}

type chatResponse struct {
	Message struct {
		Content string `json:"content"`
	} `json:"message"`
	Error string `json:"error,omitempty"`
}

// Chat sends a text-only prompt and returns the model's response.
func (c *Client) Chat(ctx context.Context, systemPrompt, userMessage string) (string, error) {
	return c.chat(ctx, systemPrompt, userMessage, nil)
}

// ChatWithImage sends a prompt along with an image (file path) and returns the response.
func (c *Client) ChatWithImage(ctx context.Context, systemPrompt, userMessage, imagePath string) (string, error) {
	imgData, err := imageToBase64(imagePath)
	if err != nil {
		return "", fmt.Errorf("reading image: %w", err)
	}
	return c.chat(ctx, systemPrompt, userMessage, []string{imgData})
}

// ChatWithImageBytes sends a prompt with raw image bytes.
func (c *Client) ChatWithImageBytes(ctx context.Context, systemPrompt, userMessage string, imageBytes []byte) (string, error) {
	encoded := base64.StdEncoding.EncodeToString(imageBytes)
	return c.chat(ctx, systemPrompt, userMessage, []string{encoded})
}

func (c *Client) chat(ctx context.Context, systemPrompt, userMessage string, images []string) (string, error) {
	msgs := []message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userMessage, Images: images},
	}

	req := chatRequest{
		Model:    c.model,
		Messages: msgs,
		Stream:   false,
		Format:   "json",
		Options:  &modelOptions{NumPredict: 2048},
	}

	body, err := json.Marshal(req)
	if err != nil {
		return "", err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("ollama request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if c.debug {
		fmt.Fprintf(os.Stderr, "[ollama] raw response: %s\n", respBody)
	}

	var chatResp chatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return "", fmt.Errorf("parsing ollama response: %w", err)
	}
	if chatResp.Error != "" {
		return "", fmt.Errorf("ollama error: %s", chatResp.Error)
	}

	return chatResp.Message.Content, nil
}

// Ping checks that Ollama is reachable and the model is available.
func (c *Client) Ping(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/tags", nil)
	if err != nil {
		return err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("ollama unreachable at %s: %w", c.baseURL, err)
	}
	defer resp.Body.Close()

	var tags struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tags); err != nil {
		return err
	}

	for _, m := range tags.Models {
		if m.Name == c.model || m.Name == c.model+":latest" {
			return nil
		}
	}
	return fmt.Errorf("model %q not found in Ollama — run: ollama pull %s", c.model, c.model)
}

func imageToBase64(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(data), nil
}
