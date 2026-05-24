package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/samudera/fish-coldstorage/internal/domain"
	"github.com/samudera/fish-coldstorage/internal/repo"
)

type EmployeeHandler struct {
	repo *repo.EmployeeRepo
}

func NewEmployeeHandler(r *repo.EmployeeRepo) *EmployeeHandler { return &EmployeeHandler{repo: r} }

// GET /v1/karyawan
func (h *EmployeeHandler) List(w http.ResponseWriter, r *http.Request) {
	emps, err := h.repo.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: emps, Total: len(emps)})
}

// POST /v1/karyawan
func (h *EmployeeHandler) Create(w http.ResponseWriter, r *http.Request) {
	var e domain.Employee
	if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if e.Name == "" {
		writeError(w, http.StatusBadRequest, "name required")
		return
	}
	if err := h.repo.Create(r.Context(), &e); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, e)
}

// PUT /v1/karyawan/{id}
func (h *EmployeeHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var e domain.Employee
	if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	e.ID = id
	if err := h.repo.Update(r.Context(), &e); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, e)
}

// GET /v1/absen?date=YYYY-MM-DD
func (h *EmployeeHandler) ListAttendance(w http.ResponseWriter, r *http.Request) {
	dateStr := r.URL.Query().Get("date")
	var date time.Time
	if dateStr != "" {
		var err error
		date, err = time.Parse("2006-01-02", dateStr)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid date format, use YYYY-MM-DD")
			return
		}
	} else {
		date = time.Now().Truncate(24 * time.Hour)
	}

	recs, err := h.repo.ListAttendance(r.Context(), date)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: recs, Total: len(recs)})
}

// POST /v1/absen — bulk upsert
func (h *EmployeeHandler) BulkAttendance(w http.ResponseWriter, r *http.Request) {
	var recs []domain.AttendanceRecord
	if err := json.NewDecoder(r.Body).Decode(&recs); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.repo.UpsertAttendance(r.Context(), recs); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"saved": len(recs)})
}
