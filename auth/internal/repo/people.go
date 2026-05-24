package repo

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/samudera/auth-service/internal/domain"
)

type PeopleRepo struct{ db *pgxpool.Pool }

func NewPeopleRepo(db *pgxpool.Pool) *PeopleRepo { return &PeopleRepo{db: db} }

const personSelect = `SELECT person_id,COALESCE(person_category,''),first_name,COALESCE(last_name,''),
	COALESCE(email,''),COALESCE(phone_number,''),COALESCE(address,''),COALESCE(city,''),
	COALESCE(state,''),COALESCE(country,''),COALESCE(postal_code,''),COALESCE(notes,''),
	created_at,updated_at`

func scanPerson(row interface {
	Scan(...interface{}) error
}, p *domain.Person) error {
	return row.Scan(&p.PersonID, &p.PersonCategory, &p.FirstName, &p.LastName, &p.Email,
		&p.PhoneNumber, &p.Address, &p.City, &p.State, &p.Country, &p.PostalCode,
		&p.Notes, &p.CreatedAt, &p.UpdatedAt)
}

func (r *PeopleRepo) Create(ctx context.Context, req *domain.CreatePersonRequest) (*domain.Person, error) {
	p := &domain.Person{}
	err := r.db.QueryRow(ctx, `
		INSERT INTO peoples (person_category,first_name,last_name,email,phone_number,address,city,state,country,postal_code,notes)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		RETURNING person_id,COALESCE(person_category,''),first_name,COALESCE(last_name,''),
		COALESCE(email,''),COALESCE(phone_number,''),COALESCE(address,''),COALESCE(city,''),
		COALESCE(state,''),COALESCE(country,''),COALESCE(postal_code,''),COALESCE(notes,''),
		created_at,updated_at`,
		req.PersonCategory, req.FirstName, req.LastName, req.Email, req.PhoneNumber,
		req.Address, req.City, req.State, req.Country, req.PostalCode, req.Notes,
	).Scan(&p.PersonID, &p.PersonCategory, &p.FirstName, &p.LastName, &p.Email,
		&p.PhoneNumber, &p.Address, &p.City, &p.State, &p.Country, &p.PostalCode,
		&p.Notes, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create person: %w", err)
	}
	p.FullName = p.FirstName + " " + p.LastName
	return p, nil
}

func (r *PeopleRepo) GetByID(ctx context.Context, id string) (*domain.Person, error) {
	p := &domain.Person{}
	err := r.db.QueryRow(ctx,
		personSelect+` FROM peoples WHERE person_id=$1`, id,
	).Scan(&p.PersonID, &p.PersonCategory, &p.FirstName, &p.LastName, &p.Email,
		&p.PhoneNumber, &p.Address, &p.City, &p.State, &p.Country, &p.PostalCode,
		&p.Notes, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get person: %w", err)
	}
	p.FullName = p.FirstName + " " + p.LastName
	return p, nil
}

func (r *PeopleRepo) List(ctx context.Context, category, q string) ([]*domain.Person, int, error) {
	where := "WHERE 1=1"
	args := []any{}
	i := 1
	if category != "" {
		where += fmt.Sprintf(" AND person_category=$%d", i)
		args = append(args, category)
		i++
	}
	if q != "" {
		where += fmt.Sprintf(" AND (first_name ILIKE $%d OR last_name ILIKE $%d OR phone_number ILIKE $%d)", i, i, i)
		args = append(args, "%"+q+"%")
	}
	rows, err := r.db.Query(ctx, personSelect+` FROM peoples `+where+` ORDER BY last_name,first_name`, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var list []*domain.Person
	for rows.Next() {
		p := &domain.Person{}
		if err := rows.Scan(&p.PersonID, &p.PersonCategory, &p.FirstName, &p.LastName, &p.Email,
			&p.PhoneNumber, &p.Address, &p.City, &p.State, &p.Country, &p.PostalCode,
			&p.Notes, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, 0, err
		}
		p.FullName = p.FirstName + " " + p.LastName
		list = append(list, p)
	}
	return list, len(list), nil
}

func (r *PeopleRepo) Update(ctx context.Context, id string, req *domain.UpdatePersonRequest) (*domain.Person, error) {
	p := &domain.Person{}
	err := r.db.QueryRow(ctx, `
		UPDATE peoples SET person_category=$1,first_name=$2,last_name=$3,email=$4,phone_number=$5,
		address=$6,city=$7,state=$8,country=$9,postal_code=$10,notes=$11,updated_at=NOW()
		WHERE person_id=$12
		RETURNING person_id,COALESCE(person_category,''),first_name,COALESCE(last_name,''),
		COALESCE(email,''),COALESCE(phone_number,''),COALESCE(address,''),COALESCE(city,''),
		COALESCE(state,''),COALESCE(country,''),COALESCE(postal_code,''),COALESCE(notes,''),
		created_at,updated_at`,
		req.PersonCategory, req.FirstName, req.LastName, req.Email, req.PhoneNumber,
		req.Address, req.City, req.State, req.Country, req.PostalCode, req.Notes, id,
	).Scan(&p.PersonID, &p.PersonCategory, &p.FirstName, &p.LastName, &p.Email,
		&p.PhoneNumber, &p.Address, &p.City, &p.State, &p.Country, &p.PostalCode,
		&p.Notes, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update person: %w", err)
	}
	p.FullName = p.FirstName + " " + p.LastName
	return p, nil
}

func (r *PeopleRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM peoples WHERE person_id=$1`, id)
	return err
}

func (r *PeopleRepo) GetByPhone(ctx context.Context, phone string) (*domain.Person, error) {
	p := &domain.Person{}
	err := r.db.QueryRow(ctx,
		personSelect+` FROM peoples WHERE phone_number=$1`, phone,
	).Scan(&p.PersonID, &p.PersonCategory, &p.FirstName, &p.LastName, &p.Email,
		&p.PhoneNumber, &p.Address, &p.City, &p.State, &p.Country, &p.PostalCode,
		&p.Notes, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get person by phone: %w", err)
	}
	p.FullName = p.FirstName + " " + p.LastName
	return p, nil
}
