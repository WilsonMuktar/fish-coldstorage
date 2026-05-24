package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/samudera/fish-coldstorage/internal/domain"
	"github.com/samudera/fish-coldstorage/internal/repo"
)

type BeliIkanHandler struct {
	repo     *repo.BeliIkanRepo
	fishRepo *repo.FishRepo
}

func NewBeliIkanHandler(r *repo.BeliIkanRepo, fishRepo *repo.FishRepo) *BeliIkanHandler {
	return &BeliIkanHandler{repo: r, fishRepo: fishRepo}
}

// GET /v1/beli-ikan
func (h *BeliIkanHandler) List(w http.ResponseWriter, r *http.Request) {
	limit, offset := paginate(r)
	recs, err := h.repo.List(r.Context(), limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if recs == nil {
		recs = []domain.BeliIkanRecord{}
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: recs, Total: len(recs), Limit: limit})
}

// POST /v1/beli-ikan
func (h *BeliIkanHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		VesselName   string   `json:"vessel_name"`
		BuyDate      string   `json:"buy_date"`
		Notes        string   `json:"notes"`
		TimbanganIDs []string `json:"timbangan_ids"`
		Items        []struct {
			FishCode   string  `json:"fish_code"`
			QuantityKg float64 `json:"quantity_kg"`
			PricePerKg float64 `json:"price_per_kg"`
		} `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.VesselName == "" || len(req.Items) == 0 {
		writeError(w, http.StatusBadRequest, "vessel_name and items required")
		return
	}
	buyDate := time.Now()
	if req.BuyDate != "" {
		if parsed, err := time.Parse("2006-01-02", req.BuyDate); err == nil {
			buyDate = parsed
		}
	}
	var vesselID *uuid.UUID
	if v, err := h.fishRepo.GetVesselByName(r.Context(), req.VesselName); err == nil {
		vesselID = &v.ID
	}
	var items []domain.BeliIkanItem
	var total float64
	for _, it := range req.Items {
		itemTotal := it.QuantityKg * it.PricePerKg
		var fishTypeID *uuid.UUID
		if ft, err := h.fishRepo.GetTypeByCode(r.Context(), it.FishCode); err == nil {
			fishTypeID = &ft.ID
		}
		items = append(items, domain.BeliIkanItem{
			FishCode: it.FishCode, FishTypeID: fishTypeID,
			QuantityKg: it.QuantityKg, PricePerKg: it.PricePerKg, TotalAmount: itemTotal,
		})
		total += itemTotal
	}
	var timIDs []uuid.UUID
	for _, idStr := range req.TimbanganIDs {
		if id, err := uuid.Parse(idStr); err == nil {
			timIDs = append(timIDs, id)
		}
	}
	rec := &domain.BeliIkanRecord{
		VesselID: vesselID, VesselName: req.VesselName,
		BuyDate: buyDate, Notes: req.Notes,
		TotalAmount: total, Items: items, TimbanganIDs: timIDs,
	}
	if err := h.repo.Create(r.Context(), rec); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, rec)
}
