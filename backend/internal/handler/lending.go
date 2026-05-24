package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/samudera/fish-coldstorage/internal/domain"
	"github.com/samudera/fish-coldstorage/internal/repo"
)

type LendingHandler struct {
	repo *repo.LendingRepo
}

func NewLendingHandler(r *repo.LendingRepo) *LendingHandler { return &LendingHandler{repo: r} }

// GET /v1/pinjaman
func (h *LendingHandler) List(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	recs, err := h.repo.List(r.Context(), status)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: recs, Total: len(recs)})
}

// POST /v1/pinjaman
func (h *LendingHandler) Create(w http.ResponseWriter, r *http.Request) {
	var l domain.LendingRecord
	if err := json.NewDecoder(r.Body).Decode(&l); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if l.Amount <= 0 {
		writeError(w, http.StatusBadRequest, "amount must be positive")
		return
	}
	if err := h.repo.Create(r.Context(), &l); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, l)
}

// POST /v1/pinjaman/{id}/bayar
func (h *LendingHandler) RecordPayment(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req struct {
		Amount float64 `json:"amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Amount <= 0 {
		writeError(w, http.StatusBadRequest, "amount must be positive")
		return
	}
	if err := h.repo.RecordPayment(r.Context(), id, req.Amount); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
