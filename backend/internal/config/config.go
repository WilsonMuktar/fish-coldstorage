package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	DBSSLMode  string

	ServerPort string

	AuthServiceURL    string
	AuthPublicKeyPath string

	DataDir string

	R2AccountID string
	R2AccessKey string
	R2SecretKey string
	R2Bucket    string

	TelegramBotToken string

	OCRURL      string // OCR service URL
	OllamaURL   string // Ollama URL
	OllamaModel string // Ollama model name
}

func Load() *Config {
	_ = godotenv.Load()

	return &Config{
		DBHost:     getenv("DB_HOST", "localhost"),
		DBPort:     getenv("DB_PORT", "5432"),
		DBUser:     getenv("DB_USER", "postgres"),
		DBPassword: getenv("DB_PASSWORD", ""),
		DBName:     getenv("DB_NAME", "fishstorage"),
		DBSSLMode:  getenv("DB_SSLMODE", "disable"),

		ServerPort: getenv("SERVER_PORT", "8002"),

		AuthServiceURL:    getenv("AUTH_SERVICE_URL", "http://localhost:8001"),
		AuthPublicKeyPath: getenv("AUTH_PUBLIC_KEY_PATH", "secrets/auth_public.pem"),

		DataDir: getenv("DATA_DIR", "data"),

		R2AccountID: getenv("R2_ACCOUNT_ID", ""),
		R2AccessKey: getenv("R2_ACCESS_KEY", ""),
		R2SecretKey: getenv("R2_SECRET_KEY", ""),
		R2Bucket:    getenv("R2_BUCKET", "fish-coldstorage"),

		TelegramBotToken: getenv("TELEGRAM_BOT_TOKEN", ""),

		OCRURL:      getenv("OCR_URL", "http://ocr:8000"),
		OllamaURL:   getenv("OLLAMA_URL", "http://host.docker.internal:11434"),
		OllamaModel: getenv("OLLAMA_MODEL", "qwen2.5vl:7b"),
	}
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func GetInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	i, err := strconv.Atoi(v)
	if err != nil {
		log.Printf("invalid int env %s=%q: %v", key, v, err)
		return def
	}
	return i
}
