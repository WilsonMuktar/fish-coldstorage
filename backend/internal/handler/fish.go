package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/samudera/fish-coldstorage/internal/audit"
	"github.com/samudera/fish-coldstorage/internal/domain"
	"github.com/samudera/fish-coldstorage/internal/repo"
)

type FishHandler struct {
	repo    *repo.FishRepo
	dataDir string
	apiURL  string
	audit   *audit.Log
}

func NewFishHandler(r *repo.FishRepo, dataDir, apiURL string, auditLog *audit.Log) *FishHandler {
	return &FishHandler{repo: r, dataDir: dataDir, apiURL: apiURL, audit: auditLog}
}

func (h *FishHandler) populatePhotoURL(f *domain.FishType) {
	if f.PhotoPath != "" {
		f.PhotoURL = fmt.Sprintf("%s/data/%s", h.apiURL, f.PhotoPath)
	}
}

func (h *FishHandler) populateVesselPhotoURL(v *domain.Vessel) {
	if v.PhotoPath != "" {
		v.PhotoURL = fmt.Sprintf("%s/data/%s", h.apiURL, v.PhotoPath)
	}
}

// GET /v1/fish/types
func (h *FishHandler) ListTypes(w http.ResponseWriter, r *http.Request) {
	types, err := h.repo.ListTypes(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	for i := range types {
		h.populatePhotoURL(&types[i])
	}
	if types == nil {
		types = []domain.FishType{}
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: types, Total: len(types)})
}

// POST /v1/fish/types
func (h *FishHandler) CreateType(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Code             string  `json:"code"`
		Name             string  `json:"name"`
		Desc             string  `json:"description"`
		Aliases          string  `json:"aliases"`
		IsSorted         bool    `json:"is_sorted"`
		SourceFishTypeID string  `json:"source_fish_type_id"`
		Grade            string  `json:"grade"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Code == "" || req.Name == "" {
		writeError(w, http.StatusBadRequest, "code and name required")
		return
	}
	var srcID *uuid.UUID
	if req.SourceFishTypeID != "" {
		id, err := uuid.Parse(req.SourceFishTypeID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid source_fish_type_id")
			return
		}
		srcID = &id
	}
	ft, err := h.repo.CreateType(r.Context(), req.Code, req.Name, req.Desc, req.IsSorted, srcID, req.Grade)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if req.Aliases != "" {
		_ = h.repo.UpdateType(r.Context(), ft.ID, req.Name, req.Desc, req.Aliases, "")
		ft.Aliases = req.Aliases
	}
	h.audit.Record(r.Context(), r, "fish_type", "create", ft.ID, map[string]string{"code": ft.Code, "name": ft.Name})
	writeJSON(w, http.StatusCreated, ft)
}

// PUT /v1/fish/types/{id}/canonical — set or clear alias grouping
func (h *FishHandler) UpdateCanonical(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req struct {
		CanonicalFishTypeID string `json:"canonical_fish_type_id"` // empty string = clear
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	var canonID *uuid.UUID
	if req.CanonicalFishTypeID != "" {
		parsed, err := uuid.Parse(req.CanonicalFishTypeID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid canonical_fish_type_id")
			return
		}
		// Prevent self-reference
		if parsed == id {
			writeError(w, http.StatusBadRequest, "cannot be its own canonical")
			return
		}
		canonID = &parsed
	}
	if err := h.repo.UpdateCanonical(r.Context(), id, canonID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.audit.Record(r.Context(), r, "fish_type", "update_canonical", id,
		map[string]string{"canonical_fish_type_id": req.CanonicalFishTypeID})
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// PUT /v1/fish/types/{id}
func (h *FishHandler) UpdateType(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req struct {
		Name    string `json:"name"`
		Desc    string `json:"description"`
		Aliases string `json:"aliases"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	ft, err := h.repo.GetTypeByID(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "fish type not found")
		return
	}
	if req.Name == "" {
		req.Name = ft.Name
	}
	if err := h.repo.UpdateType(r.Context(), id, req.Name, req.Desc, req.Aliases, ft.PhotoPath); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.audit.Record(r.Context(), r, "fish_type", "update", id, map[string]string{"name": req.Name, "aliases": req.Aliases})
	ft.Name = req.Name
	ft.Description = req.Desc
	ft.Aliases = req.Aliases
	h.populatePhotoURL(ft)
	writeJSON(w, http.StatusOK, ft)
}

// DELETE /v1/fish/types/{id}
func (h *FishHandler) DeleteType(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	ft, _ := h.repo.GetTypeByID(r.Context(), id)
	if err := h.repo.DeleteType(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	changes := map[string]string{"id": id.String()}
	if ft != nil {
		changes["code"] = ft.Code
		changes["name"] = ft.Name
	}
	h.audit.Record(r.Context(), r, "fish_type", "delete", id, changes)
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// POST /v1/fish/types/{id}/photo  (multipart form: field "photo")
func (h *FishHandler) UploadPhoto(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
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

	dir := filepath.Join(h.dataDir, "fish")
	if err := os.MkdirAll(dir, 0755); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create directory")
		return
	}
	filename := fmt.Sprintf("%s_%s", id.String(), header.Filename)
	fp := filepath.Join(dir, filename)
	out, err := os.Create(fp)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not save file")
		return
	}
	defer out.Close()
	if _, err := io.Copy(out, file); err != nil {
		writeError(w, http.StatusInternalServerError, "could not write file")
		return
	}

	photoPath := filepath.Join("fish", filename)
	ft, err := h.repo.GetTypeByID(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "fish type not found")
		return
	}
	if err := h.repo.UpdateType(r.Context(), id, ft.Name, ft.Description, ft.Aliases, photoPath); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	ft.PhotoPath = photoPath
	h.populatePhotoURL(ft)
	h.audit.Record(r.Context(), r, "fish_type", "upload_photo", id, map[string]string{"photo": photoPath})
	writeJSON(w, http.StatusOK, ft)
}

// GET /v1/fish/stock
func (h *FishHandler) ListStock(w http.ResponseWriter, r *http.Request) {
	stocks, err := h.repo.ListStock(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: stocks, Total: len(stocks)})
}

// GET /v1/fish/transactions[?fish_type_id=uuid]
func (h *FishHandler) ListTransactions(w http.ResponseWriter, r *http.Request) {
	limit, offset := paginate(r)
	var fishTypeID *uuid.UUID
	if raw := r.URL.Query().Get("fish_type_id"); raw != "" {
		if id, err := uuid.Parse(raw); err == nil {
			fishTypeID = &id
		}
	}
	txns, total, err := h.repo.ListTransactions(r.Context(), limit, offset, fishTypeID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	for i := range txns {
		if txns[i].ReceiptImagePath != "" {
			txns[i].ReceiptImagePath = fmt.Sprintf("%s/data/%s", h.apiURL, txns[i].ReceiptImagePath)
		}
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: txns, Total: total, Limit: limit})
}

// POST /v1/fish/transactions
func (h *FishHandler) CreateTransaction(w http.ResponseWriter, r *http.Request) {
	var t domain.FishTransaction
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.repo.CreateTransaction(r.Context(), &t); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Upsert stock
	delta := t.Quantity
	if t.TransactionType == domain.TxSell {
		delta = -t.Quantity
	}
	if err := h.repo.UpsertStock(r.Context(), nil, t.FishTypeID, t.StorageLocationID, delta); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.audit.Record(r.Context(), r, "fish_transaction", "create", t.ID,
		map[string]interface{}{"type": t.TransactionType, "code": t.FishCode, "qty": t.Quantity, "date": t.TransactionDate})
	writeJSON(w, http.StatusCreated, t)
}

// GET /v1/vessels
// GET /v1/public/fish-types?is_sorted=true — no auth, used by review page dropdowns
func (h *FishHandler) ListPublicFishTypes(w http.ResponseWriter, r *http.Request) {
	types, err := h.repo.ListTypes(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if filterSorted := r.URL.Query().Get("is_sorted"); filterSorted != "" {
		want := filterSorted == "true"
		filtered := types[:0]
		for _, ft := range types {
			if ft.IsSorted == want {
				filtered = append(filtered, ft)
			}
		}
		types = filtered
	}
	if types == nil {
		types = []domain.FishType{}
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: types, Total: len(types)})
}

// GET /v1/public/stock/{code} — no auth, used by review page
func (h *FishHandler) GetPublicStockByCode(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	info, err := h.repo.GetStockByCode(r.Context(), code)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"fish_code":    code,
		"available_kg": info.AvailableKg,
		"is_sorted":    info.IsSorted,
		"exists":       info.Exists,
	})
}

// GET /v1/public/stock — no auth, returns all fish stock (used by Telegram bot)
func (h *FishHandler) ListPublicStock(w http.ResponseWriter, r *http.Request) {
	stocks, err := h.repo.ListStock(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: stocks, Total: len(stocks)})
}

func (h *FishHandler) ListVessels(w http.ResponseWriter, r *http.Request) {
	vessels, err := h.repo.ListVessels(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	for i := range vessels {
		h.populateVesselPhotoURL(&vessels[i])
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: vessels, Total: len(vessels)})
}

// POST /v1/vessels
func (h *FishHandler) CreateVessel(w http.ResponseWriter, r *http.Request) {
	var v domain.Vessel
	if err := json.NewDecoder(r.Body).Decode(&v); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if v.Name == "" {
		writeError(w, http.StatusBadRequest, "name required")
		return
	}
	if err := h.repo.CreateVessel(r.Context(), &v); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, v)
}

// PUT /v1/vessels/{id}
func (h *FishHandler) UpdateVessel(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req struct {
		Name           string `json:"name"`
		RegistrationNo string `json:"registration_no"`
		CaptainName    string `json:"captain_name"`
		OwnerName      string `json:"owner_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name required")
		return
	}
	if err := h.repo.UpdateVessel(r.Context(), id, req.Name, req.RegistrationNo, req.CaptainName, req.OwnerName); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// POST /v1/vessels/{id}/photo  (multipart form: field "photo")
func (h *FishHandler) UploadVesselPhoto(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
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

	dir := filepath.Join(h.dataDir, "vessels")
	if err := os.MkdirAll(dir, 0755); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create directory")
		return
	}
	filename := fmt.Sprintf("%s_%s", id.String(), header.Filename)
	fp := filepath.Join(dir, filename)
	out, err := os.Create(fp)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not save file")
		return
	}
	defer out.Close()
	if _, err := io.Copy(out, file); err != nil {
		writeError(w, http.StatusInternalServerError, "could not write file")
		return
	}

	photoPath := filepath.Join("vessels", filename)
	if err := h.repo.UpdateVesselPhoto(r.Context(), id, photoPath); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	photoURL := fmt.Sprintf("%s/data/%s", h.apiURL, photoPath)
	h.audit.Record(r.Context(), r, "vessel", "upload_photo", id, map[string]string{"photo": photoPath})
	writeJSON(w, http.StatusOK, map[string]string{"photo_url": photoURL, "photo_path": photoPath})
}

// POST /v1/perkapal
func (h *FishHandler) CreateTimbangan(w http.ResponseWriter, r *http.Request) {
	var t domain.TimbanganRecord
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.repo.CreateTimbanganRecord(r.Context(), &t); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, t)
}

// POST /v1/perkapal/{id}/approve — placeholder, timbangan approval handled via review flow
func (h *FishHandler) ApproveTimbangan(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// GET /v1/perkapal
func (h *FishHandler) ListTimbangan(w http.ResponseWriter, r *http.Request) {
	limit, offset := paginate(r)
	recs, err := h.repo.ListTimbanganRecords(r.Context(), limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: recs, Total: len(recs), Limit: limit})
}

