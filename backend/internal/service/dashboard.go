package service

import (
	"context"
	"time"

	"github.com/samudera/fish-coldstorage/internal/domain"
	"github.com/samudera/fish-coldstorage/internal/repo"
)

type DashboardService struct {
	fishRepo     *repo.FishRepo
	receiptRepo  *repo.ReceiptRepo
	invoiceRepo  *repo.InvoiceRepo
	beliIkanRepo *repo.BeliIkanRepo
	expenseRepo  *repo.ExpenseRepo
}

func NewDashboardService(fishRepo *repo.FishRepo, receiptRepo *repo.ReceiptRepo, invoiceRepo *repo.InvoiceRepo, beliIkanRepo *repo.BeliIkanRepo, expenseRepo *repo.ExpenseRepo) *DashboardService {
	return &DashboardService{fishRepo: fishRepo, receiptRepo: receiptRepo, invoiceRepo: invoiceRepo, beliIkanRepo: beliIkanRepo, expenseRepo: expenseRepo}
}

func (s *DashboardService) GetStats(ctx context.Context) (*domain.DashboardStats, error) {
	stocks, err := s.fishRepo.ListStock(ctx)
	if err != nil {
		return nil, err
	}

	rawKg, sortedKg, err := s.fishRepo.StockTotals(ctx)
	if err != nil {
		rawKg, sortedKg = 0, 0
	}
	totalKg := rawKg + sortedKg

	pendingCount, err := s.receiptRepo.CountByStatus(ctx, string(domain.ReceiptPending))
	if err != nil {
		return nil, err
	}

	ar, err := s.invoiceRepo.SumAR(ctx)
	if err != nil {
		return nil, err
	}

	ap, err := s.invoiceRepo.SumAP(ctx)
	if err != nil {
		return nil, err
	}

	recent, _, err := s.fishRepo.ListTransactions(ctx, 10, 0, nil)
	if err != nil {
		recent = nil
	}

	return &domain.DashboardStats{
		TotalFishStock:     totalKg,
		RawFishStock:       rawKg,
		SortedFishStock:    sortedKg,
		PendingReviews:     pendingCount,
		TotalAR:            ar,
		TotalAP:            ap,
		FishStockSummary:   stocks,
		RecentTransactions: recent,
	}, nil
}

func (s *DashboardService) GetProfitLoss(ctx context.Context, period string) (*domain.ProfitLossStats, error) {
	now := time.Now()
	var from, to *time.Time
	switch period {
	case "today":
		t := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		tomorrow := t.AddDate(0, 0, 1)
		from, to = &t, &tomorrow
	case "week":
		t := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).AddDate(0, 0, -6)
		from = &t
	case "month":
		// current calendar month: 1st of this month → now
		t := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		from = &t
	case "last_month":
		// previous calendar month: 1st → last day
		first := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		prevFirst := first.AddDate(0, -1, 0)
		from, to = &prevFirst, &first
	}
	stats, err := s.beliIkanRepo.GetProfitLoss(ctx, from, to)
	if err != nil {
		return nil, err
	}
	stats.Period = period
	if stats.Period == "" {
		stats.Period = "all"
	}
	opex, err := s.expenseRepo.SumByPeriod(ctx, from, to)
	if err != nil {
		return nil, err
	}
	stats.OpEx = opex
	stats.NetProfit = stats.GrossProfit - opex
	return stats, nil
}
