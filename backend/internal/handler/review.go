package handler

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/samudera/fish-coldstorage/internal/audit"
	"github.com/samudera/fish-coldstorage/internal/domain"
	"github.com/samudera/fish-coldstorage/internal/middleware"
	"github.com/samudera/fish-coldstorage/internal/repo"
	"github.com/samudera/fish-coldstorage/internal/service"
	"github.com/samudera/fish-coldstorage/internal/storage"
)

type ReviewHandler struct {
	svc         *service.ReviewService
	receiptRepo *repo.ReceiptRepo
	r2          *storage.R2Client
	audit       *audit.Log
}

func NewReviewHandler(svc *service.ReviewService, receiptRepo *repo.ReceiptRepo, r2 *storage.R2Client, auditLog *audit.Log) *ReviewHandler {
	return &ReviewHandler{svc: svc, receiptRepo: receiptRepo, r2: r2, audit: auditLog}
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

// GET /v1/public/vendors?type=bon_penjualan|bon_pengeluaran
func (h *ReviewHandler) ListVendors(w http.ResponseWriter, r *http.Request) {
	receiptType := r.URL.Query().Get("type")
	if receiptType == "" {
		receiptType = "bon_pengeluaran"
	}
	names, err := h.receiptRepo.ListVendorNames(r.Context(), receiptType)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"data": names})
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

// POST /v1/reviews/{token}/photo — replace receipt image (multipart: field "photo")
func (h *ReviewHandler) UploadPhoto(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	rec, err := h.receiptRepo.GetByToken(r.Context(), token)
	if err != nil {
		writeError(w, http.StatusNotFound, "receipt not found")
		return
	}
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "file too large (max 10MB)")
		return
	}
	file, header, err := r.FormFile("photo")
	if err != nil {
		writeError(w, http.StatusBadRequest, "photo field required")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	key := "receipts/" + rec.ID.String() + "_" + header.Filename
	imageURL, err := h.r2.Replace(r.Context(), rec.ImagePath, key, data, header.Filename)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "upload failed: "+err.Error())
		return
	}
	if err := h.receiptRepo.UpdateImagePath(r.Context(), token, imageURL); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.audit.Record(r.Context(), r, "receipt", "upload_photo", rec.ID, map[string]string{"token": token})
	writeJSON(w, http.StatusOK, map[string]string{"image_url": imageURL})
}
