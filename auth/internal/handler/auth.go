package handler

import (
	"encoding/json"
	"net/http"

	"github.com/samudera/auth-service/internal/domain"
	"github.com/samudera/auth-service/internal/service"
)

type AuthHandler struct {
	svc          *service.AuthService
	publicKeyPEM string
}

func NewAuthHandler(svc *service.AuthService, publicKeyPEM string) *AuthHandler {
	return &AuthHandler{svc: svc, publicKeyPEM: publicKeyPEM}
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req domain.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Phone == "" || req.Password == "" {
		Error(w, http.StatusBadRequest, "phone and password are required")
		return
	}
	reply, err := h.svc.Login(r.Context(), req.Phone, req.Password)
	if err != nil {
		Error(w, http.StatusUnauthorized, err.Error())
		return
	}
	JSON(w, http.StatusOK, reply)
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req domain.RefreshTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	reply, err := h.svc.Refresh(r.Context(), req.RefreshToken)
	if err != nil {
		Error(w, http.StatusUnauthorized, err.Error())
		return
	}
	JSON(w, http.StatusOK, reply)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	var req domain.LogoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	_ = h.svc.Logout(r.Context(), req.RefreshToken)
	w.WriteHeader(http.StatusNoContent)
}

func (h *AuthHandler) PublicKey(w http.ResponseWriter, r *http.Request) {
	JSON(w, http.StatusOK, map[string]string{"public_key_pem": h.publicKeyPEM})
}

func (h *AuthHandler) ValidateToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	reply, _ := h.svc.ValidateToken(req.Token)
	JSON(w, http.StatusOK, reply)
}
