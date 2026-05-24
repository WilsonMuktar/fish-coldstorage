package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/samudera/auth-service/internal/domain"
	"github.com/samudera/auth-service/internal/service"
)

type PeopleHandler struct{ svc *service.PeopleService }

func NewPeopleHandler(svc *service.PeopleService) *PeopleHandler { return &PeopleHandler{svc: svc} }

func (h *PeopleHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req domain.CreatePersonRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	p, err := h.svc.Create(r.Context(), &req)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusCreated, p)
}

func (h *PeopleHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	p, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		Error(w, http.StatusNotFound, "person not found")
		return
	}
	JSON(w, http.StatusOK, p)
}

func (h *PeopleHandler) List(w http.ResponseWriter, r *http.Request) {
	category := r.URL.Query().Get("category")
	q := r.URL.Query().Get("q")
	list, total, err := h.svc.List(r.Context(), category, q)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]any{"data": list, "total": total})
}

func (h *PeopleHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req domain.UpdatePersonRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	p, err := h.svc.Update(r.Context(), id, &req)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, p)
}

func (h *PeopleHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.svc.Delete(r.Context(), id); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
