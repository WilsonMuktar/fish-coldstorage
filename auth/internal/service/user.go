package service

import (
	"context"
	"fmt"

	"golang.org/x/crypto/bcrypt"

	"github.com/samudera/auth-service/internal/domain"
	"github.com/samudera/auth-service/internal/repo"
)

type UserService struct {
	userRepo   *repo.UserRepo
	peopleRepo *repo.PeopleRepo
}

func NewUserService(u *repo.UserRepo, p *repo.PeopleRepo) *UserService {
	return &UserService{userRepo: u, peopleRepo: p}
}

func (s *UserService) Create(ctx context.Context, req *domain.CreateUserRequest, createdByID string) (*domain.User, error) {
	if req.PersonID == "" || req.Password == "" {
		return nil, fmt.Errorf("person_id and password are required")
	}
	if req.Role == "" {
		req.Role = "default"
	}
	if req.UserType == "" {
		req.UserType = "worker"
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	user, err := s.userRepo.Create(ctx, req.PersonID, req.DisplayName, req.Role, req.UserType, string(hash), createdByID)
	if err != nil {
		return nil, err
	}
	person, _ := s.peopleRepo.GetByID(ctx, user.PersonID)
	user.Person = person
	return user, nil
}

func (s *UserService) GetByID(ctx context.Context, id string) (*domain.User, error) {
	user, err := s.userRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	user.Person, _ = s.peopleRepo.GetByID(ctx, user.PersonID)
	return user, nil
}

func (s *UserService) GetByTelegram(ctx context.Context, telegramID int64) (*domain.User, error) {
	user, err := s.userRepo.GetByTelegram(ctx, telegramID)
	if err != nil {
		return nil, err
	}
	user.Person, _ = s.peopleRepo.GetByID(ctx, user.PersonID)
	return user, nil
}

func (s *UserService) List(ctx context.Context) ([]*domain.User, error) {
	users, err := s.userRepo.List(ctx)
	if err != nil {
		return nil, err
	}
	for _, u := range users {
		u.Person, _ = s.peopleRepo.GetByID(ctx, u.PersonID)
	}
	return users, nil
}

func (s *UserService) Update(ctx context.Context, id string, req *domain.UpdateUserRequest) (*domain.User, error) {
	if req.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			return nil, fmt.Errorf("hash password: %w", err)
		}
		if err := s.userRepo.UpdatePassword(ctx, id, string(hash)); err != nil {
			return nil, err
		}
	}
	return s.userRepo.Update(ctx, id, req)
}

func (s *UserService) Deactivate(ctx context.Context, id string) (*domain.User, error) {
	return s.userRepo.Deactivate(ctx, id)
}

func (s *UserService) LinkTelegram(ctx context.Context, userID string, telegramID int64) (*domain.User, error) {
	user, err := s.userRepo.UpdateTelegram(ctx, userID, telegramID)
	if err != nil {
		return nil, err
	}
	user.Person, _ = s.peopleRepo.GetByID(ctx, user.PersonID)
	return user, nil
}
