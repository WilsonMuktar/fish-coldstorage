package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/samudera/auth-service/internal/domain"
	mw "github.com/samudera/auth-service/internal/middleware"
	"github.com/samudera/auth-service/internal/service"
)

type UserHandler struct{ svc *service.UserService }

func NewUserHandler(svc *service.UserService) *UserHandler { return &UserHandler{svc: svc} }

func (h *UserHandler) Create(w http.ResponseWriter, r *http.Request) {
	claims := mw.GetClaims(r.Context())
	var req domain.CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	createdBy := ""
	if claims != nil {
		createdBy = claims.UserID
	}
	u, err := h.svc.Create(r.Context(), &req, createdBy)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusCreated, u)
}

func (h *UserHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	u, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		Error(w, http.StatusNotFound, "user not found")
		return
	}
	JSON(w, http.StatusOK, u)
}

func (h *UserHandler) List(w http.ResponseWriter, r *http.Request) {
	users, err := h.svc.List(r.Context())
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]any{"data": users, "total": len(users)})
}

func (h *UserHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req domain.UpdateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	u, err := h.svc.Update(r.Context(), id, &req)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, u)
}

func (h *UserHandler) Deactivate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	u, err := h.svc.Deactivate(r.Context(), id)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, u)
}

func (h *UserHandler) GetByTelegram(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "telegram_id")
	telegramID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		Error(w, http.StatusBadRequest, "invalid telegram_id")
		return
	}
	u, err := h.svc.GetByTelegram(r.Context(), telegramID)
	if err != nil {
		Error(w, http.StatusNotFound, "user not found")
		return
	}
	JSON(w, http.StatusOK, u)
}

func (h *UserHandler) LinkTelegram(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req domain.LinkTelegramRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	u, err := h.svc.LinkTelegram(r.Context(), id, req.TelegramID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, u)
}
