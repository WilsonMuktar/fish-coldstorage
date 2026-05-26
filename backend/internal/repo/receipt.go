package repo

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/samudera/fish-coldstorage/internal/domain"
)

type ReceiptRepo struct{ db *pgxpool.Pool }

func NewReceiptRepo(db *pgxpool.Pool) *ReceiptRepo { return &ReceiptRepo{db: db} }

func (r *ReceiptRepo) Create(ctx context.Context, rec *domain.Receipt) error {
	rec.ID = uuid.New()
	rec.SubmittedAt = time.Now()
	_, err := r.db.Exec(ctx, `
		INSERT INTO receipts(id,receipt_type,status,submitted_via,telegram_message_id,telegram_chat_id,
			image_path,extracted_data,review_token,review_token_expiry,review_token_used,submitted_at)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		rec.ID, rec.ReceiptType, rec.Status, rec.SubmittedVia,
		rec.TelegramMessageID, rec.TelegramChatID,
		rec.ImagePath, rec.ExtractedData,
		rec.ReviewToken, rec.ReviewTokenExpiry, false, rec.SubmittedAt)
	return err
}

func (r *ReceiptRepo) GetByToken(ctx context.Context, token string) (*domain.Receipt, error) {
	var rec domain.Receipt
	err := r.db.QueryRow(ctx, `
		SELECT id,receipt_type,status,submitted_via,telegram_message_id,telegram_chat_id,
			   image_path,extracted_data,confirmed_data,review_token,review_token_expiry,
			   review_token_used,reviewed_by_person_id,reviewed_at,COALESCE(rejection_reason,''),submitted_at
		FROM receipts WHERE review_token=$1`, token).Scan(
		&rec.ID, &rec.ReceiptType, &rec.Status, &rec.SubmittedVia,
		&rec.TelegramMessageID, &rec.TelegramChatID,
		&rec.ImagePath, &rec.ExtractedData, &rec.ConfirmedData,
		&rec.ReviewToken, &rec.ReviewTokenExpiry,
		&rec.ReviewTokenUsed, &rec.ReviewedByPersonID, &rec.ReviewedAt,
		&rec.RejectionReason, &rec.SubmittedAt)
	if err != nil {
		return nil, err
	}
	return &rec, nil
}

func (r *ReceiptRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Receipt, error) {
	var rec domain.Receipt
	err := r.db.QueryRow(ctx, `
		SELECT id,receipt_type,status,submitted_via,telegram_message_id,telegram_chat_id,
			   image_path,extracted_data,confirmed_data,review_token,review_token_expiry,
			   review_token_used,reviewed_by_person_id,reviewed_at,COALESCE(rejection_reason,''),submitted_at
		FROM receipts WHERE id=$1`, id).Scan(
		&rec.ID, &rec.ReceiptType, &rec.Status, &rec.SubmittedVia,
		&rec.TelegramMessageID, &rec.TelegramChatID,
		&rec.ImagePath, &rec.ExtractedData, &rec.ConfirmedData,
		&rec.ReviewToken, &rec.ReviewTokenExpiry,
		&rec.ReviewTokenUsed, &rec.ReviewedByPersonID, &rec.ReviewedAt,
		&rec.RejectionReason, &rec.SubmittedAt)
	if err != nil {
		return nil, err
	}
	return &rec, nil
}

func (r *ReceiptRepo) List(ctx context.Context, status string, limit, offset int) ([]domain.Receipt, error) {
	var rows pgx.Rows
	var err error
	if status != "" {
		rows, err = r.db.Query(ctx, `
			SELECT id,receipt_type,status,submitted_via,telegram_message_id,telegram_chat_id,
				   image_path,extracted_data,confirmed_data,review_token,review_token_expiry,
				   review_token_used,reviewed_by_person_id,reviewed_at,COALESCE(rejection_reason,''),submitted_at
			FROM receipts WHERE status=$1 ORDER BY submitted_at DESC LIMIT $2 OFFSET $3`,
			status, limit, offset)
	} else {
		rows, err = r.db.Query(ctx, `
			SELECT id,receipt_type,status,submitted_via,telegram_message_id,telegram_chat_id,
				   image_path,extracted_data,confirmed_data,review_token,review_token_expiry,
				   review_token_used,reviewed_by_person_id,reviewed_at,COALESCE(rejection_reason,''),submitted_at
			FROM receipts ORDER BY submitted_at DESC LIMIT $1 OFFSET $2`,
			limit, offset)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Receipt
	for rows.Next() {
		var rec domain.Receipt
		if err := rows.Scan(
			&rec.ID, &rec.ReceiptType, &rec.Status, &rec.SubmittedVia,
			&rec.TelegramMessageID, &rec.TelegramChatID,
			&rec.ImagePath, &rec.ExtractedData, &rec.ConfirmedData,
			&rec.ReviewToken, &rec.ReviewTokenExpiry,
			&rec.ReviewTokenUsed, &rec.ReviewedByPersonID, &rec.ReviewedAt,
			&rec.RejectionReason, &rec.SubmittedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (r *ReceiptRepo) CountByStatus(ctx context.Context, status string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM receipts WHERE status=$1`, status).Scan(&count)
	return count, err
}

func (r *ReceiptRepo) Approve(ctx context.Context, id uuid.UUID, confirmedData interface{}, reviewerPersonID *uuid.UUID) error {
	var data []byte
	var err error
	if raw, ok := confirmedData.(json.RawMessage); ok {
		data = raw
	} else {
		data, err = json.Marshal(confirmedData)
		if err != nil {
			return err
		}
	}
	now := time.Now()
	_, err = r.db.Exec(ctx, `
		UPDATE receipts SET status='approved', confirmed_data=$1, reviewed_by_person_id=$2,
			reviewed_at=$3, review_token_used=true WHERE id=$4`,
		data, reviewerPersonID, now, id)
	return err
}

func (r *ReceiptRepo) Reject(ctx context.Context, id uuid.UUID, reason string, reviewerPersonID *uuid.UUID) error {
	now := time.Now()
	_, err := r.db.Exec(ctx, `
		UPDATE receipts SET status='rejected', rejection_reason=$1, reviewed_by_person_id=$2,
			reviewed_at=$3, review_token_used=true WHERE id=$4`,
		reason, reviewerPersonID, now, id)
	return err
}

func (r *ReceiptRepo) ResetToPending(ctx context.Context, id uuid.UUID, reviewerPersonID *uuid.UUID) error {
	_, err := r.db.Exec(ctx, `
		UPDATE receipts SET status='pending', reviewed_at=NULL,
			reviewed_by_person_id=$1, review_token_used=false WHERE id=$2`,
		reviewerPersonID, id)
	return err
}

func (r *ReceiptRepo) MarkTokenUsed(ctx context.Context, token string) error {
	_, err := r.db.Exec(ctx, `UPDATE receipts SET review_token_used=true WHERE review_token=$1`, token)
	return err
}

func (r *ReceiptRepo) UpdateImagePath(ctx context.Context, token, imagePath string) error {
	_, err := r.db.Exec(ctx, `UPDATE receipts SET image_path=$1 WHERE review_token=$2`, imagePath, token)
	return err
}

// ListVendorNames returns distinct vendor_name values from approved receipts of the given type.
func (r *ReceiptRepo) ListVendorNames(ctx context.Context, receiptType string) ([]string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT DISTINCT confirmed_data->'receipt'->>'vendor_name'
		FROM receipts
		WHERE receipt_type = $1
		  AND status = 'approved'
		  AND confirmed_data->'receipt'->>'vendor_name' IS NOT NULL
		  AND confirmed_data->'receipt'->>'vendor_name' != ''
		ORDER BY 1`, receiptType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			continue
		}
		out = append(out, name)
	}
	return out, rows.Err()
}
