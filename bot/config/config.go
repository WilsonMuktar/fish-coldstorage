package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	TelegramToken     string
	TelegramGroupID   int64
	AdminChatID       int64
	OllamaBaseURL     string
	OllamaModel       string
	OCRServiceURL     string
	ReviewServiceURL  string
	Debug             bool
}

func Load() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("no .env file, reading from environment")
	}

	groupID, _ := strconv.ParseInt(os.Getenv("TELEGRAM_GROUP_ID"), 10, 64)
	adminID, _ := strconv.ParseInt(os.Getenv("TELEGRAM_ADMIN_CHAT_ID"), 10, 64)
	debug, _ := strconv.ParseBool(os.Getenv("DEBUG"))

	ollamaModel := os.Getenv("OLLAMA_MODEL")
	if ollamaModel == "" {
		ollamaModel = "qwen2.5vl:7b"
	}
	ollamaURL := os.Getenv("OLLAMA_BASE_URL")
	if ollamaURL == "" {
		ollamaURL = "http://localhost:11434"
	}

	ocrURL := os.Getenv("OCR_SERVICE_URL")
	if ocrURL == "" {
		ocrURL = "http://localhost:8000"
	}

	reviewURL := os.Getenv("REVIEW_SERVICE_URL")
	if reviewURL == "" {
		reviewURL = "http://localhost:8002"
	}

	return &Config{
		TelegramToken:    os.Getenv("TELEGRAM_BOT_TOKEN"),
		TelegramGroupID:  groupID,
		AdminChatID:      adminID,
		OllamaBaseURL:    ollamaURL,
		OllamaModel:      ollamaModel,
		OCRServiceURL:    ocrURL,
		ReviewServiceURL: reviewURL,
		Debug:            debug,
	}
}
