package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	PostgresDSN        string
	JWTPrivateKeyPath  string
	JWTPublicKeyPath   string
	JWTAccessTokenTTL  int // seconds
	JWTRefreshTokenTTL int // seconds
	HTTPPort           string
	GRPCPort           string
}

func Load() *Config {
	_ = godotenv.Load()

	host := getEnv("POSTGRES_HOST", "localhost")
	port := getEnv("POSTGRES_PORT", "5432")
	db   := getEnv("POSTGRES_DB", "auth_db")
	user := getEnv("POSTGRES_USER", "authuser")
	pass := getEnv("POSTGRES_PASSWORD", "changeme")
	dsn  := "postgres://" + user + ":" + pass + "@" + host + ":" + port + "/" + db + "?sslmode=disable"

	accessTTL, _ := strconv.Atoi(getEnv("JWT_ACCESS_TOKEN_TTL", "900"))
	refreshTTL, _ := strconv.Atoi(getEnv("JWT_REFRESH_TOKEN_TTL", "2592000"))

	return &Config{
		PostgresDSN:        dsn,
		JWTPrivateKeyPath:  getEnv("JWT_PRIVATE_KEY_PATH", "/secrets/private.pem"),
		JWTPublicKeyPath:   getEnv("JWT_PUBLIC_KEY_PATH", "/secrets/public.pem"),
		JWTAccessTokenTTL:  accessTTL,
		JWTRefreshTokenTTL: refreshTTL,
		HTTPPort:           getEnv("HTTP_PORT", "8001"),
		GRPCPort:           getEnv("GRPC_PORT", "9010"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	log.Printf("env %s not set, using default", key)
	return fallback
}
