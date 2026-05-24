package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/samudera/fish-coldstorage/internal/domain"
	"github.com/samudera/fish-coldstorage/internal/repo"
)

type TitipanHandler struct {
	repo *repo.TitipanRepo
}

func NewTitipanHandler(r *repo.TitipanRepo) *TitipanHandler { return &TitipanHandler{repo: r} }

// GET /v1/titipan
func (h *TitipanHandler) List(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	recs, err := h.repo.List(r.Context(), status)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: recs, Total: len(recs)})
}

// POST /v1/titipan
func (h *TitipanHandler) Create(w http.ResponseWriter, r *http.Request) {
	var t domain.TitipanRecord
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if t.DepositKg <= 0 {
		writeError(w, http.StatusBadRequest, "deposit_kg must be positive")
		return
	}
	if err := h.repo.Create(r.Context(), &t); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, t)
}

// GET /v1/titipan/{id}
func (h *TitipanHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	t, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, t)
}

// POST /v1/titipan/{id}/withdraw
func (h *TitipanHandler) Withdraw(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req struct {
		Quantity float64 `json:"quantity"`
		Notes    string  `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Quantity <= 0 {
		writeError(w, http.StatusBadRequest, "quantity must be positive")
		return
	}
	if err := h.repo.Withdraw(r.Context(), id, req.Quantity, req.Notes); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// GET /v1/titipan/{id}/transactions
func (h *TitipanHandler) ListTransactions(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	txns, err := h.repo.ListTransactions(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: txns, Total: len(txns)})
}
