package service

import (
	"context"
	"fmt"

	"github.com/samudera/auth-service/internal/domain"
	"github.com/samudera/auth-service/internal/repo"
)

type PeopleService struct{ repo *repo.PeopleRepo }

func NewPeopleService(r *repo.PeopleRepo) *PeopleService { return &PeopleService{repo: r} }

func (s *PeopleService) Create(ctx context.Context, req *domain.CreatePersonRequest) (*domain.Person, error) {
	if req.FirstName == "" || req.LastName == "" {
		return nil, fmt.Errorf("first_name and last_name are required")
	}
	return s.repo.Create(ctx, req)
}

func (s *PeopleService) GetByID(ctx context.Context, id string) (*domain.Person, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *PeopleService) List(ctx context.Context, category, q string) ([]*domain.Person, int, error) {
	return s.repo.List(ctx, category, q)
}

func (s *PeopleService) Update(ctx context.Context, id string, req *domain.UpdatePersonRequest) (*domain.Person, error) {
	return s.repo.Update(ctx, id, req)
}

func (s *PeopleService) Delete(ctx context.Context, id string) error {
	return s.repo.Delete(ctx, id)
}
