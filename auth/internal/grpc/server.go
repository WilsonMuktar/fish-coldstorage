package grpc

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/samudera/auth-service/internal/service"
)

type Server struct {
	userSvc   *service.UserService
	authSvc   *service.AuthService
	peopleSvc *service.PeopleService
}

func NewServer(u *service.UserService, a *service.AuthService, p *service.PeopleService) *Server {
	return &Server{userSvc: u, authSvc: a, peopleSvc: p}
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Post("/auth.v1.UserService/GetByTelegram", s.GetByTelegram)
	r.Post("/auth.v1.PeopleService/GetPerson", s.GetPerson)
	r.Post("/auth.v1.AuthService/ValidateToken", s.ValidateToken)
	return r
}

func (s *Server) GetByTelegram(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TelegramId int64 `json:"telegram_id"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	user, err := s.userSvc.GetByTelegram(r.Context(), req.TelegramId)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "not found"})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

func (s *Server) GetPerson(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PersonId string `json:"person_id"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	person, err := s.peopleSvc.GetByID(r.Context(), req.PersonId)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "not found"})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(person)
}

func (s *Server) ValidateToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string `json:"token"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	reply, _ := s.authSvc.ValidateToken(req.Token)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(reply)
}
