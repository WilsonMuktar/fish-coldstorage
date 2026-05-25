package middleware

import (
	"context"
	"crypto/rsa"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

func normalizePEM(raw string) string {
	raw = strings.ReplaceAll(raw, `\n`, "\n")
	raw = strings.TrimSpace(raw)
	if strings.Contains(raw, "\n") {
		return raw
	}
	// Single-line: strip header/footer, clean body, reassemble
	raw = strings.ReplaceAll(raw, "-----BEGIN PUBLIC KEY-----", "")
	raw = strings.ReplaceAll(raw, "-----END PUBLIC KEY-----", "")
	raw = strings.ReplaceAll(raw, " ", "")
	body := strings.TrimSpace(raw)
	var lines []string
	for len(body) > 64 {
		lines = append(lines, body[:64])
		body = body[64:]
	}
	if len(body) > 0 {
		lines = append(lines, body)
	}
	return "-----BEGIN PUBLIC KEY-----\n" + strings.Join(lines, "\n") + "\n-----END PUBLIC KEY-----\n"
}

type contextKey string

const claimsKey contextKey = "claims"

type Claims struct {
	UserID     string `json:"sub"`
	PersonID   string `json:"person_id"`
	Name       string `json:"name"`
	Role       string `json:"role"`
	UserType   string `json:"user_type"`
	TelegramID int64  `json:"telegram_id"`
	jwt.RegisteredClaims
}

var publicKey *rsa.PublicKey

func LoadPublicKey(path string) error {
	var pemData []byte
	if data, err := os.ReadFile(path); err == nil {
		pemData = data
	} else if envKey := os.Getenv("AUTH_PUBLIC_KEY"); envKey != "" {
		pemData = []byte(normalizePEM(envKey))
	} else {
		return err
	}
	key, err := jwt.ParseRSAPublicKeyFromPEM(pemData)
	if err != nil {
		return err
	}
	publicKey = key
	return nil
}

func JWTMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			writeError(w, http.StatusUnauthorized, "missing token")
			return
		}
		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

		if publicKey == nil {
			writeError(w, http.StatusInternalServerError, "auth public key not configured")
			return
		}
		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, errors.New("unexpected signing method")
			}
			return publicKey, nil
		})
		if err != nil || !token.Valid {
			writeError(w, http.StatusUnauthorized, "invalid token")
			return
		}

		ctx := context.WithValue(r.Context(), claimsKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// OptionalJWTMiddleware parses the JWT if present and injects claims, but never rejects the request.
func OptionalJWTMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") && publicKey != nil {
			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
			claims := &Claims{}
			token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
					return nil, errors.New("unexpected signing method")
				}
				return publicKey, nil
			})
			if err == nil && token.Valid {
				ctx := context.WithValue(r.Context(), claimsKey, claims)
				r = r.WithContext(ctx)
			}
		}
		next.ServeHTTP(w, r)
	})
}

func GetClaims(r *http.Request) *Claims {
	v, _ := r.Context().Value(claimsKey).(*Claims)
	return v
}

func RequireRole(roles ...string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(roles))
	for _, r := range roles {
		allowed[r] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := GetClaims(r)
			if claims == nil || !allowed[claims.Role] {
				writeError(w, http.StatusForbidden, "insufficient role")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func writeError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
