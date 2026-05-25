package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/samudera/fish-coldstorage/internal/audit"
	"github.com/samudera/fish-coldstorage/internal/config"
	"github.com/samudera/fish-coldstorage/internal/db"
	"github.com/samudera/fish-coldstorage/internal/handler"
	"github.com/samudera/fish-coldstorage/internal/middleware"
	"github.com/samudera/fish-coldstorage/internal/ocr"
	"github.com/samudera/fish-coldstorage/internal/ollama"
	"github.com/samudera/fish-coldstorage/internal/repo"
	"github.com/samudera/fish-coldstorage/internal/service"
)

func main() {
	cfg := config.Load()

	pool, err := db.Connect(cfg)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()

	if err := runMigrations(pool); err != nil {
		log.Fatalf("migrations: %v", err)
	}

	if err := middleware.LoadPublicKey(cfg.AuthPublicKeyPath); err != nil {
		log.Printf("WARNING: could not load auth public key from %s: %v", cfg.AuthPublicKeyPath, err)
		log.Printf("JWT validation will be DISABLED — set AUTH_PUBLIC_KEY_PATH to enable")
	}

	// Repos
	fishRepo := repo.NewFishRepo(pool)
	sortingRepo := repo.NewSortingRepo(pool)
	itemRepo := repo.NewItemRepo(pool)
	receiptRepo := repo.NewReceiptRepo(pool)
	invoiceRepo := repo.NewInvoiceRepo(pool)
	employeeRepo := repo.NewEmployeeRepo(pool)
	titipanRepo := repo.NewTitipanRepo(pool)
	lendingRepo := repo.NewLendingRepo(pool)
	beliIkanRepo := repo.NewBeliIkanRepo(pool)
	expenseRepo := repo.NewExpenseRepo(pool)

	// Services
	// BASE_URL = frontend URL, used in review links sent to Telegram
	baseURL := os.Getenv("BASE_URL")
	if baseURL == "" {
		baseURL = fmt.Sprintf("http://localhost:%s", cfg.ServerPort)
	}
	// API_URL = backend URL, used for image serving; defaults to BASE_URL if not set
	apiURL := os.Getenv("API_URL")
	if apiURL == "" {
		apiURL = fmt.Sprintf("http://localhost:%s", cfg.ServerPort)
	}
	reviewSvc := service.NewReviewService(receiptRepo, fishRepo, pool, cfg.DataDir, baseURL, apiURL, beliIkanRepo, expenseRepo, sortingRepo, itemRepo)
	dashboardSvc := service.NewDashboardService(fishRepo, receiptRepo, invoiceRepo, beliIkanRepo, expenseRepo)

	// Audit log
	auditLog := audit.New(pool)

	// Data directory for file uploads
	dataDir := cfg.DataDir
	if dataDir == "" {
		dataDir = "data"
	}

	// Handlers
	reviewH := handler.NewReviewHandler(reviewSvc, auditLog)
	fishH := handler.NewFishHandler(fishRepo, cfg.DataDir, apiURL, auditLog)
	sortingH := handler.NewSortingHandler(sortingRepo, fishRepo, auditLog)
	auditH := handler.NewAuditHandler(auditLog)
	itemH := handler.NewItemHandler(itemRepo)
	employeeH := handler.NewEmployeeHandler(employeeRepo)
	invoiceH := handler.NewInvoiceHandler(invoiceRepo)
	titipanH := handler.NewTitipanHandler(titipanRepo)
	lendingH := handler.NewLendingHandler(lendingRepo)
	dashboardH := handler.NewDashboardHandler(dashboardSvc)
	beliIkanH := handler.NewBeliIkanHandler(beliIkanRepo, fishRepo)
	expenseH := handler.NewExpenseHandler(expenseRepo, dataDir)
	ocrClient := ocr.NewClient(cfg.OCRURL)
	ollamaClient := ollama.NewClient(cfg.OllamaURL, cfg.OllamaModel, os.Getenv("OLLAMA_DEBUG") == "1")
	ocrH := handler.NewOCRHandler(ocrClient, ollamaClient)

	r := chi.NewRouter()
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)
	r.Use(corsMiddleware)

	// Proxy /v1/auth/* → auth service
	authServiceURL := cfg.AuthServiceURL
	if authServiceURL == "" {
		authServiceURL = "http://localhost:9001"
	}
	authTarget, _ := url.Parse(authServiceURL)
	authProxy := httputil.NewSingleHostReverseProxy(authTarget)
	authProxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Del("Access-Control-Allow-Origin")
		resp.Header.Del("Access-Control-Allow-Methods")
		resp.Header.Del("Access-Control-Allow-Headers")
		return nil
	}
	r.Handle("/v1/auth/*", authProxy)

	// Health
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Static files for receipt images
	r.Handle("/data/*", http.StripPrefix("/data/", http.FileServer(http.Dir(dataDir))))

	// Public routes — no auth required, but will capture identity if JWT present
	r.Group(func(r chi.Router) {
		r.Use(middleware.OptionalJWTMiddleware)
		r.Get("/v1/reviews/{token}", reviewH.GetForReview)
		r.Post("/v1/reviews/{token}/approve", reviewH.Approve)
		r.Post("/v1/reviews/{token}/reject", reviewH.Reject)
		r.Get("/v1/public/vessels", fishH.ListVessels)
		r.Get("/v1/public/fish-types", fishH.ListPublicFishTypes)
		r.Get("/v1/public/stock/{code}", fishH.GetPublicStockByCode)
		r.Get("/v1/public/stock", fishH.ListPublicStock)
		// Additional public read endpoints for bot queries (read-only, no sensitive data)
		r.Get("/v1/public/transactions", fishH.ListTransactions)
		r.Get("/v1/public/timbangan", fishH.ListTimbangan)
		r.Get("/v1/public/dashboard", dashboardH.Stats)
		r.Get("/v1/public/expenses", expenseH.List)
		r.Get("/v1/public/beli-ikan", beliIkanH.List)
	})

	// Bot submission endpoint — protected by bot token or open (bot is on local network)
	r.Post("/v1/reviews/submit", reviewH.Submit)

	// Authenticated routes
	r.Group(func(r chi.Router) {
		r.Use(middleware.JWTMiddleware)

		r.Get("/v1/dashboard", dashboardH.Stats)
		r.Get("/v1/profit", dashboardH.Profit)

		// Fish
		r.Get("/v1/fish/types", fishH.ListTypes)
		r.Post("/v1/fish/types", fishH.CreateType)
		r.Put("/v1/fish/types/{id}", fishH.UpdateType)
		r.Delete("/v1/fish/types/{id}", fishH.DeleteType)
		r.Post("/v1/fish/types/{id}/photo", fishH.UploadPhoto)
		r.Put("/v1/fish/types/{id}/canonical", fishH.UpdateCanonical)
		r.Get("/v1/fish/stock", fishH.ListStock)
		r.Get("/v1/fish/transactions", fishH.ListTransactions)
		r.Post("/v1/fish/transactions", fishH.CreateTransaction)

		// Items
		r.Get("/v1/item-categories", itemH.ListCategories)
		r.Get("/v1/items", itemH.ListItems)
		r.Post("/v1/items", itemH.CreateItem)
		r.Put("/v1/items/{id}", itemH.UpdateItem)
		r.Delete("/v1/items/{id}", itemH.DeleteItem)
		r.Get("/v1/items/stock", itemH.ListStock)
		r.Get("/v1/items/transactions", itemH.ListTransactions)
		r.Post("/v1/items/transactions", itemH.CreateTransaction)

		// Vessels / Perkapal
		r.Get("/v1/vessels", fishH.ListVessels)
		r.Post("/v1/vessels", fishH.CreateVessel)
		r.Put("/v1/vessels/{id}", fishH.UpdateVessel)
		r.Post("/v1/vessels/{id}/photo", fishH.UploadVesselPhoto)
		r.Get("/v1/perkapal", fishH.ListTimbangan)
		r.Post("/v1/perkapal", fishH.CreateTimbangan)
		r.Post("/v1/perkapal/{id}/approve", fishH.ApproveTimbangan)

		// Reviews (authenticated list)
		r.Get("/v1/reviews", reviewH.List)
		r.Post("/v1/reviews/{token}/revise", reviewH.Revise)

		// Sorting operations
		r.Get("/v1/sorting", sortingH.List)
		r.Post("/v1/sorting", sortingH.Create)

		// Audit log
		r.Get("/v1/audit", auditH.List)

		// Titipan
		r.Get("/v1/titipan", titipanH.List)
		r.Post("/v1/titipan", titipanH.Create)
		r.Get("/v1/titipan/{id}", titipanH.Get)
		r.Post("/v1/titipan/{id}/withdraw", titipanH.Withdraw)
		r.Get("/v1/titipan/{id}/transactions", titipanH.ListTransactions)

		// Karyawan / Employees
		r.Get("/v1/karyawan", employeeH.List)
		r.Post("/v1/karyawan", employeeH.Create)
		r.Put("/v1/karyawan/{id}", employeeH.Update)

		// Absensi
		r.Get("/v1/absen", employeeH.ListAttendance)
		r.Post("/v1/absen", employeeH.BulkAttendance)
		r.Post("/v1/absen/scan", employeeH.ScanAttendance)

		// Invoice
		r.Get("/v1/invoice", invoiceH.List)
		r.Post("/v1/invoice", invoiceH.Create)
		r.Get("/v1/invoice/{id}", invoiceH.Get)
		r.Post("/v1/invoice/{id}/issue", invoiceH.Issue)
		r.Post("/v1/invoice/{id}/pay", invoiceH.RecordPayment)
		r.Get("/v1/invoice/{id}/schedules", invoiceH.ListSchedules)
		r.Post("/v1/invoice/{id}/schedules", invoiceH.CreateSchedule)

		// Cicilan
		r.Get("/v1/cicilan", invoiceH.ListAllSchedules)
		r.Post("/v1/cicilan/{schedule_id}/pay", invoiceH.PaySchedule)

		// Pinjaman / Lending
		r.Get("/v1/pinjaman", lendingH.List)
		r.Post("/v1/pinjaman", lendingH.Create)
		r.Post("/v1/pinjaman/{id}/bayar", lendingH.RecordPayment)

		// Beli Ikan (fish purchase payment)
		r.Get("/v1/beli-ikan", beliIkanH.List)
		r.Post("/v1/beli-ikan", beliIkanH.Create)

		// Expenses (OpEx)
		r.Get("/v1/expenses", expenseH.List)
		r.Post("/v1/expenses", expenseH.Create)
		r.Post("/v1/expenses/{id}/photo", expenseH.UploadPhoto)

		// OCR + Ollama extraction
		r.Post("/v1/ocr-extract", ocrH.Extract)
	})

	addr := fmt.Sprintf(":%s", cfg.ServerPort)
	log.Printf("fish-coldstorage API starting on %s", addr)
	srv := &http.Server{
		Addr:         addr,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 3 * time.Minute,
		IdleTimeout:  120 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("server: %v", err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func runMigrations(pool *pgxpool.Pool) error {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	for _, f := range []string{
		"migrations/000001_init.up.sql",
		"migrations/000002_sorting.up.sql",
		"migrations/000003_timbangan_status.up.sql",
		"migrations/000004_vessel_photo.up.sql",
		"migrations/000005_beli_ikan.up.sql",
		"migrations/000006_expenses.up.sql",
		"migrations/000007_expense_photo.up.sql",
		"migrations/000008_fish_type_canonical.up.sql",
		"migrations/000009_sorting_receipt.up.sql",
		"migrations/000010_attendance_shift.up.sql",
		"migrations/000011_employee_code.up.sql",
	} {
		sql, err := os.ReadFile(f)
		if err != nil {
			log.Printf("migration %s not found, skipping: %v", f, err)
			continue
		}
		if _, err := pool.Exec(ctx, string(sql)); err != nil {
			return fmt.Errorf("%s: %w", f, err)
		}
	}
	return nil
}
