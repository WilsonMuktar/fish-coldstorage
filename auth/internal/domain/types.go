package domain

import "time"

type Person struct {
	PersonID        string    `json:"person_id"`
	PersonCategory  string    `json:"person_category"`
	FirstName       string    `json:"first_name"`
	LastName        string    `json:"last_name"`
	FullName        string    `json:"full_name,omitempty"`
	Email           string    `json:"email,omitempty"`
	PhoneNumber     string    `json:"phone_number,omitempty"`
	Address         string    `json:"address,omitempty"`
	City            string    `json:"city,omitempty"`
	State           string    `json:"state,omitempty"`
	Country         string    `json:"country,omitempty"`
	PostalCode      string    `json:"postal_code,omitempty"`
	PersonImagePath string    `json:"person_image_path,omitempty"`
	Notes           string    `json:"notes,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type User struct {
	ID          string     `json:"id"`
	PersonID    string     `json:"person_id"`
	DisplayName string     `json:"display_name,omitempty"`
	TelegramID  int64      `json:"telegram_id,omitempty"`
	Role        string     `json:"role"`
	UserType    string     `json:"user_type"`
	IsActive    bool       `json:"is_active"`
	CreatedBy   string     `json:"created_by,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	LastLoginAt *time.Time `json:"last_login_at,omitempty"`
	Person      *Person    `json:"person,omitempty"`
}

type RefreshToken struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	TokenHash string    `json:"-"`
	ExpiresAt time.Time `json:"expires_at"`
	Revoked   bool      `json:"revoked"`
	CreatedAt time.Time `json:"created_at"`
}

// Request/response types
type CreatePersonRequest struct {
	PersonCategory string `json:"person_category"`
	FirstName      string `json:"first_name"`
	LastName       string `json:"last_name"`
	Email          string `json:"email"`
	PhoneNumber    string `json:"phone_number"`
	Address        string `json:"address"`
	City           string `json:"city"`
	State          string `json:"state"`
	Country        string `json:"country"`
	PostalCode     string `json:"postal_code"`
	Notes          string `json:"notes"`
}

type UpdatePersonRequest struct {
	PersonCategory string `json:"person_category"`
	FirstName      string `json:"first_name"`
	LastName       string `json:"last_name"`
	Email          string `json:"email"`
	PhoneNumber    string `json:"phone_number"`
	Address        string `json:"address"`
	City           string `json:"city"`
	State          string `json:"state"`
	Country        string `json:"country"`
	PostalCode     string `json:"postal_code"`
	Notes          string `json:"notes"`
}

type CreateUserRequest struct {
	PersonID    string `json:"person_id"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
	UserType    string `json:"user_type"`
	Password    string `json:"password"`
}

type UpdateUserRequest struct {
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
	UserType    string `json:"user_type"`
	Password    string `json:"password"`
	IsActive    *bool  `json:"is_active"`
}

type LoginRequest struct {
	Phone    string `json:"phone"`
	Password string `json:"password"`
}

type LoginReply struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	User         *User  `json:"user"`
}

type RefreshTokenRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type LogoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type LinkTelegramRequest struct {
	TelegramID int64 `json:"telegram_id"`
}

type TokenClaimsReply struct {
	UserID     string `json:"user_id"`
	PersonID   string `json:"person_id"`
	Role       string `json:"role"`
	UserType   string `json:"user_type"`
	TelegramID int64  `json:"telegram_id"`
	Valid      bool   `json:"valid"`
}

type ListPeoplesResponse struct {
	Data  []*Person `json:"data"`
	Total int       `json:"total"`
}

type ListUsersResponse struct {
	Data  []*User `json:"data"`
	Total int     `json:"total"`
}
