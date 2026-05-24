package service

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/samudera/auth-service/internal/domain"
	"github.com/samudera/auth-service/internal/repo"
)

type Claims struct {
	UserID     string `json:"sub"`
	PersonID   string `json:"person_id"`
	Name       string `json:"name"`
	Role       string `json:"role"`
	UserType   string `json:"user_type"`
	TelegramID int64  `json:"telegram_id"`
	jwt.RegisteredClaims
}

type AuthService struct {
	userRepo   *repo.UserRepo
	peopleRepo *repo.PeopleRepo
	tokenRepo  *repo.TokenRepo
	privateKey *rsa.PrivateKey
	publicKey  *rsa.PublicKey
	accessTTL  int
	refreshTTL int
}

func NewAuthService(u *repo.UserRepo, p *repo.PeopleRepo, t *repo.TokenRepo, priv *rsa.PrivateKey, pub *rsa.PublicKey, accessTTL, refreshTTL int) *AuthService {
	return &AuthService{
		userRepo: u, peopleRepo: p, tokenRepo: t,
		privateKey: priv, publicKey: pub,
		accessTTL: accessTTL, refreshTTL: refreshTTL,
	}
}

func (s *AuthService) Login(ctx context.Context, phone, password string) (*domain.LoginReply, error) {
	person, err := s.peopleRepo.GetByPhone(ctx, phone)
	if err != nil {
		return nil, fmt.Errorf("invalid credentials")
	}
	user, err := s.userRepo.GetByPersonID(ctx, person.PersonID)
	if err != nil {
		return nil, fmt.Errorf("invalid credentials")
	}
	if !user.IsActive {
		return nil, fmt.Errorf("account is inactive")
	}
	hash, err := s.userRepo.GetPasswordHash(ctx, user.ID)
	if err != nil || hash == "" {
		return nil, fmt.Errorf("invalid credentials")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		return nil, fmt.Errorf("invalid credentials")
	}
	_ = s.userRepo.UpdateLastLogin(ctx, user.ID)
	user.Person = person
	return s.issueTokenPair(ctx, user)
}

func (s *AuthService) Refresh(ctx context.Context, rawToken string) (*domain.LoginReply, error) {
	tokenHash := hashToken(rawToken)
	userID, expiresAt, revoked, err := s.tokenRepo.GetByHash(ctx, tokenHash)
	if err != nil || revoked || time.Now().After(expiresAt) {
		return nil, fmt.Errorf("invalid or expired refresh token")
	}
	_ = s.tokenRepo.Revoke(ctx, tokenHash)
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	user.Person, _ = s.peopleRepo.GetByID(ctx, user.PersonID)
	return s.issueTokenPair(ctx, user)
}

func (s *AuthService) Logout(ctx context.Context, rawToken string) error {
	return s.tokenRepo.Revoke(ctx, hashToken(rawToken))
}

func (s *AuthService) ValidateToken(tokenStr string) (*domain.TokenClaimsReply, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return s.publicKey, nil
	})
	if err != nil {
		return &domain.TokenClaimsReply{Valid: false}, nil
	}
	return &domain.TokenClaimsReply{
		UserID: claims.UserID, PersonID: claims.PersonID,
		Role: claims.Role, UserType: claims.UserType,
		TelegramID: claims.TelegramID, Valid: true,
	}, nil
}

func (s *AuthService) issueTokenPair(ctx context.Context, user *domain.User) (*domain.LoginReply, error) {
	now := time.Now()
	displayName := user.DisplayName
	if displayName == "" && user.Person != nil {
		displayName = user.Person.FirstName
		if user.Person.LastName != "" {
			displayName += " " + user.Person.LastName
		}
	}
	accessClaims := &Claims{
		UserID: user.ID, PersonID: user.PersonID,
		Name: displayName,
		Role: user.Role, UserType: user.UserType, TelegramID: user.TelegramID,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "auth-service",
			Subject:   user.ID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Duration(s.accessTTL) * time.Second)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, accessClaims)
	accessToken, err := token.SignedString(s.privateKey)
	if err != nil {
		return nil, fmt.Errorf("sign token: %w", err)
	}

	rawRefresh := generateToken()
	refreshHash := hashToken(rawRefresh)
	expiresAt := now.Add(time.Duration(s.refreshTTL) * time.Second)
	if err := s.tokenRepo.Store(ctx, user.ID, refreshHash, expiresAt); err != nil {
		return nil, fmt.Errorf("store refresh token: %w", err)
	}
	return &domain.LoginReply{
		AccessToken: accessToken, RefreshToken: rawRefresh,
		ExpiresIn: s.accessTTL, User: user,
	}, nil
}

func generateToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
