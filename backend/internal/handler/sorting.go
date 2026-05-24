package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/samudera/fish-coldstorage/internal/audit"
	"github.com/samudera/fish-coldstorage/internal/domain"
	"github.com/samudera/fish-coldstorage/internal/middleware"
	"github.com/samudera/fish-coldstorage/internal/repo"
)

type SortingHandler struct {
	repo     *repo.SortingRepo
	fishRepo *repo.FishRepo
	audit    *audit.Log
}

func NewSortingHandler(r *repo.SortingRepo, fishRepo *repo.FishRepo, auditLog *audit.Log) *SortingHandler {
	return &SortingHandler{repo: r, fishRepo: fishRepo, audit: auditLog}
}

// POST /v1/sorting
func (h *SortingHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SourceFishTypeID string `json:"source_fish_type_id"`
		InputKg          float64 `json:"input_kg"`
		WasteKg          float64 `json:"waste_kg"`
		Notes            string  `json:"notes"`
		SortDate         string  `json:"sort_date"` // YYYY-MM-DD
		Outputs          []struct {
			FishTypeID string  `json:"fish_type_id"`
			OutputKg   float64 `json:"output_kg"`
		} `json:"outputs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.SourceFishTypeID == "" || req.InputKg <= 0 || len(req.Outputs) == 0 {
		writeError(w, http.StatusBadRequest, "source_fish_type_id, input_kg, and outputs required")
		return
	}

	srcID, err := uuid.Parse(req.SourceFishTypeID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid source_fish_type_id")
		return
	}

	sortDate := time.Now()
	if req.SortDate != "" {
		if d, err := time.Parse("2006-01-02", req.SortDate); err == nil {
			sortDate = d
		}
	}

	op := domain.SortingOperation{
		SourceFishTypeID: srcID,
		InputKg:          req.InputKg,
		WasteKg:          req.WasteKg,
		Notes:            req.Notes,
		SortDate:         sortDate,
	}

	claims := middleware.GetClaims(r)
	if claims != nil {
		op.CreatedByName = claims.PersonID
	}

	// Resolve source name for audit
	srcFt, _ := h.fishRepo.GetTypeByID(r.Context(), srcID)
	if srcFt != nil {
		op.SourceFishTypeCode = srcFt.Code
		op.SourceFishTypeName = srcFt.Name
	}

	for _, o := range req.Outputs {
		ftID, err := uuid.Parse(o.FishTypeID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid fish_type_id in outputs")
			return
		}
		out := domain.SortingOutput{FishTypeID: ftID, OutputKg: o.OutputKg}
		if ft, _ := h.fishRepo.GetTypeByID(r.Context(), ftID); ft != nil {
			out.FishTypeCode = ft.Code
			out.FishTypeName = ft.Name
		}
		op.Outputs = append(op.Outputs, out)
	}

	if err := h.repo.CreateOperation(r.Context(), &op, h.fishRepo); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.audit.Record(r.Context(), r, "sorting_operation", "create", op.ID, map[string]interface{}{
		"source": op.SourceFishTypeCode,
		"input_kg": op.InputKg,
		"waste_kg": op.WasteKg,
		"outputs":  len(op.Outputs),
	})
	writeJSON(w, http.StatusCreated, op)
}

// GET /v1/sorting[?fish_type_id=uuid]
func (h *SortingHandler) List(w http.ResponseWriter, r *http.Request) {
	if raw := r.URL.Query().Get("fish_type_id"); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid fish_type_id")
			return
		}
		ops, err := h.repo.ListByFishType(r.Context(), id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if ops == nil {
			ops = []domain.SortingOperation{}
		}
		writeJSON(w, http.StatusOK, domain.ListResponse{Data: ops, Total: len(ops)})
		return
	}

	limit, offset := paginate(r)
	ops, err := h.repo.List(r.Context(), limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	total, _ := h.repo.Count(r.Context())
	if ops == nil {
		ops = []domain.SortingOperation{}
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: ops, Total: total, Limit: limit})
}
