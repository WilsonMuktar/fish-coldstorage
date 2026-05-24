package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/samudera/fish-coldstorage/internal/audit"
	"github.com/samudera/fish-coldstorage/internal/domain"
	"github.com/samudera/fish-coldstorage/internal/middleware"
	"github.com/samudera/fish-coldstorage/internal/service"
)

type ReviewHandler struct {
	svc   *service.ReviewService
	audit *audit.Log
}

func NewReviewHandler(svc *service.ReviewService, auditLog *audit.Log) *ReviewHandler {
	return &ReviewHandler{svc: svc, audit: auditLog}
}

// POST /v1/reviews/submit — called by the Telegram bot
func (h *ReviewHandler) Submit(w http.ResponseWriter, r *http.Request) {
	var req domain.SubmitReviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ReceiptType == "" {
		req.ReceiptType = domain.ReceiptTimbangan
	}
	if req.SubmittedVia == "" {
		req.SubmittedVia = "telegram"
	}

	resp, err := h.svc.Submit(r.Context(), &req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

// GET /v1/reviews/{token} — public, no auth
func (h *ReviewHandler) GetForReview(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	rec, err := h.svc.GetForReview(r.Context(), token)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rec)
}

// POST /v1/reviews/{token}/approve — no auth (tokenized link)
func (h *ReviewHandler) Approve(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")

	var req domain.ApproveReviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Reviewer identity from JWT if present, else nil
	var reviewerID *[16]byte
	claims := middleware.GetClaims(r)
	if claims != nil && claims.PersonID != "" {
		// parse UUID — if it fails, just leave nil
	}
	_ = reviewerID

	if err := h.svc.Approve(r.Context(), token, req.ConfirmedData, nil); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.audit.Record(r.Context(), r, "receipt", "approve", uuid.Nil, map[string]string{"token": token})
	writeJSON(w, http.StatusOK, map[string]string{"status": "approved"})
}

// POST /v1/reviews/{token}/revise — requires auth
func (h *ReviewHandler) Revise(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")

	var reviewerPersonID *uuid.UUID
	if claims := middleware.GetClaims(r); claims != nil && claims.PersonID != "" {
		if id, err := uuid.Parse(claims.PersonID); err == nil {
			reviewerPersonID = &id
		}
	}

	if err := h.svc.Revise(r.Context(), token, reviewerPersonID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.audit.Record(r.Context(), r, "receipt", "revise", uuid.Nil, map[string]string{"token": token})
	writeJSON(w, http.StatusOK, map[string]string{"status": "pending"})
}

// POST /v1/reviews/{token}/reject — no auth (tokenized link)
func (h *ReviewHandler) Reject(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")

	var req domain.RejectReviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Reason == "" {
		writeError(w, http.StatusBadRequest, "reason is required")
		return
	}

	if err := h.svc.Reject(r.Context(), token, req.Reason, nil); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.audit.Record(r.Context(), r, "receipt", "reject", uuid.Nil, map[string]string{"token": token, "reason": req.Reason})
	writeJSON(w, http.StatusOK, map[string]string{"status": "rejected"})
}

// GET /v1/reviews — list receipts (authenticated)
func (h *ReviewHandler) List(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	limit, offset := paginate(r)
	recs, err := h.svc.List(r.Context(), status, limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: recs, Total: len(recs), Page: 1, Limit: limit})
}
