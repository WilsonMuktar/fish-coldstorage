package main

import (
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/samudera/auth-service/internal/config"
	"github.com/samudera/auth-service/internal/db"
	grpcserver "github.com/samudera/auth-service/internal/grpc"
	"github.com/samudera/auth-service/internal/handler"
	mw "github.com/samudera/auth-service/internal/middleware"
	"github.com/samudera/auth-service/internal/repo"
	"github.com/samudera/auth-service/internal/service"
)

func main() {
	cfg := config.Load()

	pool, err := db.New(cfg.PostgresDSN)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()

	// run migrations inline using SQL files
	runMigrations(context.Background(), pool)

	// load JWT keys
	privKey := loadPrivateKey(cfg.JWTPrivateKeyPath)
	pubKey := loadPublicKey(cfg.JWTPublicKeyPath)
	pubKeyPEM := readFile(cfg.JWTPublicKeyPath)

	// repos
	peopleRepo := repo.NewPeopleRepo(pool)
	userRepo := repo.NewUserRepo(pool)
	tokenRepo := repo.NewTokenRepo(pool)

	// services
	peopleSvc := service.NewPeopleService(peopleRepo)
	userSvc := service.NewUserService(userRepo, peopleRepo)
	authSvc := service.NewAuthService(userRepo, peopleRepo, tokenRepo, privKey, pubKey, cfg.JWTAccessTokenTTL, cfg.JWTRefreshTokenTTL)

	// handlers
	peopleH := handler.NewPeopleHandler(peopleSvc)
	userH := handler.NewUserHandler(userSvc)
	authH := handler.NewAuthHandler(authSvc, pubKeyPEM)

	// gRPC-over-HTTP server (port 9010)
	grpcSrv := grpcserver.NewServer(userSvc, authSvc, peopleSvc)

	r := chi.NewRouter()
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(corsMiddleware)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Auth (public)
	r.Post("/v1/auth/login", authH.Login)
	r.Post("/v1/auth/refresh", authH.Refresh)
	r.Post("/v1/auth/logout", authH.Logout)
	r.Get("/v1/auth/public-key", authH.PublicKey)
	r.Post("/v1/auth/validate", authH.ValidateToken)

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(mw.JWTMiddleware(pubKey))

		// People
		r.Get("/v1/users/by-telegram/{telegram_id}", userH.GetByTelegram)
		r.Post("/v1/peoples", peopleH.Create)
		r.Get("/v1/peoples", peopleH.List)
		r.Get("/v1/peoples/{id}", peopleH.Get)
		r.Put("/v1/peoples/{id}", peopleH.Update)
		r.Delete("/v1/peoples/{id}", peopleH.Delete)

		// Users
		r.Post("/v1/users", userH.Create)
		r.Get("/v1/users", userH.List)
		r.Get("/v1/users/{id}", userH.Get)
		r.Put("/v1/users/{id}", userH.Update)
		r.Delete("/v1/users/{id}", userH.Deactivate)
		r.Post("/v1/users/{id}/telegram", userH.LinkTelegram)
	})

	// Start gRPC-over-HTTP on separate port
	go func() {
		log.Printf("gRPC-over-HTTP listening on :%s", cfg.GRPCPort)
		if err := http.ListenAndServe(":"+cfg.GRPCPort, grpcSrv.Router()); err != nil {
			log.Printf("grpc server error: %v", err)
		}
	}()

	log.Printf("auth-service HTTP listening on :%s", cfg.HTTPPort)
	srv := &http.Server{
		Addr:         ":" + cfg.HTTPPort,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("server: %v", err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func loadPrivateKey(path string) *rsa.PrivateKey {
	b := []byte(readFile(path))
	block, _ := pem.Decode(b)
	if block == nil {
		log.Fatalf("failed to decode private key PEM from %s", path)
	}
	key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		log.Fatalf("parse private key: %v", err)
	}
	return key
}

func loadPublicKey(path string) *rsa.PublicKey {
	b := []byte(readFile(path))
	block, _ := pem.Decode(b)
	if block == nil {
		log.Fatalf("failed to decode public key PEM from %s", path)
	}
	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		log.Fatalf("parse public key: %v", err)
	}
	return pub.(*rsa.PublicKey)
}

func readFile(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		log.Fatalf("read file %s: %v", path, err)
	}
	return string(b)
}

func runMigrations(ctx context.Context, pool *pgxpool.Pool) {
	files := []string{
		"migrations/000001_create_peoples.up.sql",
		"migrations/000002_create_users.up.sql",
		"migrations/000003_create_refresh_tokens.up.sql",
		"migrations/000004_create_audit_logs.up.sql",
	}
	for _, f := range files {
		sql, err := os.ReadFile(f)
		if err != nil {
			log.Printf("migration file not found: %s (skipping)", f)
			continue
		}
		if _, err := pool.Exec(ctx, string(sql)); err != nil {
			log.Printf("migration %s: %v", f, err)
		}
	}
}
