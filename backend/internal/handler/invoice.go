package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/samudera/fish-coldstorage/internal/domain"
	"github.com/samudera/fish-coldstorage/internal/repo"
)

type InvoiceHandler struct {
	repo *repo.InvoiceRepo
}

func NewInvoiceHandler(r *repo.InvoiceRepo) *InvoiceHandler { return &InvoiceHandler{repo: r} }

// GET /v1/invoice?type=ar|ap
func (h *InvoiceHandler) List(w http.ResponseWriter, r *http.Request) {
	invType := r.URL.Query().Get("type")
	limit, offset := paginate(r)
	invs, err := h.repo.List(r.Context(), invType, limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: invs, Total: len(invs), Limit: limit})
}

// POST /v1/invoice
func (h *InvoiceHandler) Create(w http.ResponseWriter, r *http.Request) {
	var inv domain.Invoice
	if err := json.NewDecoder(r.Body).Decode(&inv); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.repo.Create(r.Context(), &inv); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, inv)
}

// GET /v1/invoice/{id}
func (h *InvoiceHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	inv, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "invoice not found")
		return
	}
	writeJSON(w, http.StatusOK, inv)
}

// POST /v1/invoice/{id}/issue
func (h *InvoiceHandler) Issue(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.repo.UpdateStatus(r.Context(), id, "issued"); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// POST /v1/invoice/{id}/pay
func (h *InvoiceHandler) RecordPayment(w http.ResponseWriter, r *http.Request) {
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
	if err := h.repo.AddPayment(r.Context(), id, req.Amount); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// GET /v1/cicilan — all schedules with invoice metadata
func (h *InvoiceHandler) ListAllSchedules(w http.ResponseWriter, r *http.Request) {
	limit, offset := paginate(r)
	scheds, err := h.repo.ListAllSchedules(r.Context(), limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: scheds, Total: len(scheds), Limit: limit})
}

// GET /v1/invoice/{id}/schedules
func (h *InvoiceHandler) ListSchedules(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	scheds, err := h.repo.ListSchedules(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: scheds, Total: len(scheds)})
}

// POST /v1/invoice/{id}/schedules
func (h *InvoiceHandler) CreateSchedule(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var s domain.InstallmentSchedule
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	s.InvoiceID = id
	if err := h.repo.CreateSchedule(r.Context(), &s); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, s)
}

// POST /v1/cicilan/{schedule_id}/pay
func (h *InvoiceHandler) PaySchedule(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "schedule_id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid schedule_id")
		return
	}
	var req struct {
		Amount float64 `json:"amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Amount <= 0 {
		writeError(w, http.StatusBadRequest, "amount must be positive")
		return
	}
	if err := h.repo.PaySchedule(r.Context(), id, req.Amount); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
