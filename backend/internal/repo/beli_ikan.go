package repo

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/samudera/fish-coldstorage/internal/domain"
)

type BeliIkanRepo struct{ db *pgxpool.Pool }

func NewBeliIkanRepo(db *pgxpool.Pool) *BeliIkanRepo { return &BeliIkanRepo{db: db} }

// Create inserts a beli_ikan_record with its items and optional timbangan links.
func (r *BeliIkanRepo) Create(ctx context.Context, rec *domain.BeliIkanRecord) error {
	rec.ID = uuid.New()
	rec.CreatedAt = time.Now()
	_, err := r.db.Exec(ctx,
		`INSERT INTO beli_ikan_records(id, receipt_id, vessel_id, vessel_name, buy_date, notes, total_amount)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
		rec.ID, rec.ReceiptID, rec.VesselID, rec.VesselName, rec.BuyDate.Format("2006-01-02"), rec.Notes, rec.TotalAmount)
	if err != nil {
		return err
	}
	for i := range rec.Items {
		rec.Items[i].ID = uuid.New()
		rec.Items[i].BeliIkanID = rec.ID
		_, err = r.db.Exec(ctx,
			`INSERT INTO beli_ikan_items(id, beli_ikan_id, fish_type_id, fish_code, quantity_kg, price_per_kg, total_amount)
             VALUES($1,$2,$3,$4,$5,$6,$7)`,
			rec.Items[i].ID, rec.ID, rec.Items[i].FishTypeID, rec.Items[i].FishCode,
			rec.Items[i].QuantityKg, rec.Items[i].PricePerKg, rec.Items[i].TotalAmount)
		if err != nil {
			return err
		}
	}
	for _, timID := range rec.TimbanganIDs {
		_, _ = r.db.Exec(ctx,
			`INSERT INTO beli_ikan_timbangan_links(beli_ikan_id, timbangan_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
			rec.ID, timID)
	}
	return nil
}

// List returns beli_ikan records with their items, newest first.
func (r *BeliIkanRepo) List(ctx context.Context, limit, offset int) ([]domain.BeliIkanRecord, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, receipt_id, vessel_id, COALESCE(vessel_name,''), buy_date, COALESCE(notes,''), total_amount, created_at
         FROM beli_ikan_records ORDER BY buy_date DESC, created_at DESC LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.BeliIkanRecord
	for rows.Next() {
		var rec domain.BeliIkanRecord
		if err := rows.Scan(&rec.ID, &rec.ReceiptID, &rec.VesselID, &rec.VesselName,
			&rec.BuyDate, &rec.Notes, &rec.TotalAmount, &rec.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, rec)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Load items for each record
	for i := range out {
		irows, err := r.db.Query(ctx,
			`SELECT id, beli_ikan_id, fish_type_id, fish_code, quantity_kg, price_per_kg, total_amount
             FROM beli_ikan_items WHERE beli_ikan_id=$1`, out[i].ID)
		if err != nil {
			continue
		}
		for irows.Next() {
			var item domain.BeliIkanItem
			_ = irows.Scan(&item.ID, &item.BeliIkanID, &item.FishTypeID, &item.FishCode,
				&item.QuantityKg, &item.PricePerKg, &item.TotalAmount)
			out[i].Items = append(out[i].Items, item)
		}
		irows.Close()
	}
	return out, nil
}

// GetProfitLoss returns P&L stats for the given time range (nil = all-time).
func (r *BeliIkanRepo) GetProfitLoss(ctx context.Context, from, to *time.Time) (*domain.ProfitLossStats, error) {
	stats := &domain.ProfitLossStats{}

	// Revenue + sold kg from sell transactions
	revRow := r.db.QueryRow(ctx,
		`SELECT COALESCE(SUM(total_amount),0), COALESCE(SUM(quantity),0)
         FROM fish_transactions
         WHERE transaction_type='sell'
           AND ($1::timestamptz IS NULL OR transaction_date >= $1)
           AND ($2::timestamptz IS NULL OR transaction_date < $2)`,
		from, to)
	if err := revRow.Scan(&stats.Revenue, &stats.SoldKg); err != nil {
		return nil, err
	}

	// COGS + bought kg from beli_ikan_items
	cogsRow := r.db.QueryRow(ctx,
		`SELECT COALESCE(SUM(bi.total_amount),0), COALESCE(SUM(bi.quantity_kg),0)
         FROM beli_ikan_items bi
         JOIN beli_ikan_records br ON br.id = bi.beli_ikan_id
         WHERE ($1::date IS NULL OR br.buy_date >= $1::date)
           AND ($2::date IS NULL OR br.buy_date < $2::date)`,
		from, to)
	if err := cogsRow.Scan(&stats.COGS, &stats.BoughtKg); err != nil {
		return nil, err
	}

	// Unpaid timbangan (all-time: timbangan records without any beli_ikan link)
	unpaidRow := r.db.QueryRow(ctx,
		`SELECT COALESCE(SUM(tr.total_weight_kg),0)
         FROM timbangan_records tr
         WHERE NOT EXISTS (
             SELECT 1 FROM beli_ikan_timbangan_links btl WHERE btl.timbangan_id = tr.id
         )`)
	_ = unpaidRow.Scan(&stats.UnpaidTimbanganKg)

	stats.GrossProfit = stats.Revenue - stats.COGS
	if stats.Revenue > 0 {
		stats.GrossMarginPct = (stats.GrossProfit / stats.Revenue) * 100
	}
	return stats, nil
}
