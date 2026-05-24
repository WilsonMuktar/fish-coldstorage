package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/samudera/fish-coldstorage/internal/domain"
	"github.com/samudera/fish-coldstorage/internal/repo"
)

type ExpenseHandler struct {
	repo    *repo.ExpenseRepo
	dataDir string
}

func NewExpenseHandler(r *repo.ExpenseRepo, dataDir string) *ExpenseHandler {
	return &ExpenseHandler{repo: r, dataDir: dataDir}
}

// GET /v1/expenses?category=&limit=&offset=
func (h *ExpenseHandler) List(w http.ResponseWriter, r *http.Request) {
	category := r.URL.Query().Get("category")
	limit, offset := paginate(r)
	records, err := h.repo.List(r.Context(), category, nil, nil, limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if records == nil {
		records = []domain.Expense{}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"data": records})
}

// POST /v1/expenses
func (h *ExpenseHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Date        string  `json:"date"`
		Category    string  `json:"category"`
		Description string  `json:"description"`
		Amount      float64 `json:"amount"`
		Notes       string  `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Category == "" || req.Amount <= 0 {
		writeError(w, http.StatusBadRequest, "category and amount required")
		return
	}
	date := time.Now()
	if req.Date != "" {
		if parsed, err := time.Parse("2006-01-02", req.Date); err == nil {
			date = parsed
		}
	}
	e := &domain.Expense{
		Date:        date,
		Category:    req.Category,
		Description: req.Description,
		Amount:      req.Amount,
		Notes:       req.Notes,
	}
	if err := h.repo.Create(r.Context(), e); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, e)
}

// POST /v1/expenses/{id}/photo
func (h *ExpenseHandler) UploadPhoto(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "invalid form")
		return
	}
	file, header, err := r.FormFile("photo")
	if err != nil {
		writeError(w, http.StatusBadRequest, "photo required")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	dir := filepath.Join(h.dataDir, "expenses")
	if err := os.MkdirAll(dir, 0755); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	fn := fmt.Sprintf("%s_%s", uuid.New().String(), header.Filename)
	fp := filepath.Join(dir, fn)
	if err := os.WriteFile(fp, data, 0644); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	photoPath := filepath.Join("expenses", fn)
	if err := h.repo.UpdatePhoto(r.Context(), id, photoPath); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"photo_path": photoPath})
}
