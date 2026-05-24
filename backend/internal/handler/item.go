package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/samudera/fish-coldstorage/internal/domain"
	"github.com/samudera/fish-coldstorage/internal/repo"
)

type ItemHandler struct {
	repo *repo.ItemRepo
}

func NewItemHandler(r *repo.ItemRepo) *ItemHandler { return &ItemHandler{repo: r} }

// GET /v1/item-categories
func (h *ItemHandler) ListCategories(w http.ResponseWriter, r *http.Request) {
	cats, err := h.repo.ListCategories(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if cats == nil {
		cats = []domain.ItemCategory{}
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: cats, Total: len(cats)})
}

// GET /v1/items
func (h *ItemHandler) ListItems(w http.ResponseWriter, r *http.Request) {
	items, err := h.repo.ListItems(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if items == nil {
		items = []domain.Item{}
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: items, Total: len(items)})
}

// POST /v1/items
func (h *ItemHandler) CreateItem(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Code          string  `json:"code"`
		Name          string  `json:"name"`
		Unit          string  `json:"unit"`
		CategoryID    string  `json:"category_id"`
		PriceEstimate float64 `json:"price_estimate"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Code == "" || req.Name == "" {
		writeError(w, http.StatusBadRequest, "code and name required")
		return
	}
	var catID *uuid.UUID
	if req.CategoryID != "" {
		id, err := uuid.Parse(req.CategoryID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid category_id")
			return
		}
		catID = &id
	}
	if req.Unit == "" {
		req.Unit = "pcs"
	}
	it, err := h.repo.CreateItem(r.Context(), req.Code, req.Name, req.Unit, catID, req.PriceEstimate)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, it)
}

// PUT /v1/items/{id}
func (h *ItemHandler) UpdateItem(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req struct {
		Name          string  `json:"name"`
		Unit          string  `json:"unit"`
		CategoryID    string  `json:"category_id"`
		PriceEstimate float64 `json:"price_estimate"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	existing, err := h.repo.GetItemByID(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}
	if req.Name == "" {
		req.Name = existing.Name
	}
	if req.Unit == "" {
		req.Unit = existing.Unit
	}
	var catID *uuid.UUID
	if req.CategoryID != "" {
		cid, err := uuid.Parse(req.CategoryID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid category_id")
			return
		}
		catID = &cid
	}
	if err := h.repo.UpdateItem(r.Context(), id, req.Name, req.Unit, catID, req.PriceEstimate); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	existing.Name = req.Name
	existing.Unit = req.Unit
	existing.PriceEstimate = req.PriceEstimate
	writeJSON(w, http.StatusOK, existing)
}

// DELETE /v1/items/{id}
func (h *ItemHandler) DeleteItem(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.repo.DeleteItem(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// GET /v1/items/stock
func (h *ItemHandler) ListStock(w http.ResponseWriter, r *http.Request) {
	stocks, err := h.repo.ListStock(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if stocks == nil {
		stocks = []domain.ItemStock{}
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: stocks, Total: len(stocks)})
}

// GET /v1/items/transactions
func (h *ItemHandler) ListTransactions(w http.ResponseWriter, r *http.Request) {
	limit, offset := paginate(r)
	var itemID *uuid.UUID
	if idStr := r.URL.Query().Get("item_id"); idStr != "" {
		if id, err := uuid.Parse(idStr); err == nil {
			itemID = &id
		}
	}
	txns, err := h.repo.ListTransactions(r.Context(), limit, offset, itemID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if txns == nil {
		txns = []domain.ItemTransaction{}
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: txns, Total: len(txns), Limit: limit})
}

// POST /v1/items/transactions
func (h *ItemHandler) CreateTransaction(w http.ResponseWriter, r *http.Request) {
	var t domain.ItemTransaction
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.repo.CreateTransaction(r.Context(), &t); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	delta := t.Quantity
	if t.TransactionType == "sell" || t.TransactionType == "keluar" {
		delta = -t.Quantity
	}
	_ = h.repo.UpsertStock(r.Context(), t.ItemID, nil, delta)
	writeJSON(w, http.StatusCreated, t)
}
