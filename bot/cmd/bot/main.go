package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/samudera/bot/config"
	"github.com/samudera/bot/internal/handler"
	"github.com/samudera/bot/internal/ocr"
	"github.com/samudera/bot/internal/ollama"
	"github.com/samudera/bot/internal/review"
	"github.com/samudera/bot/internal/stockapi"
)

func main() {
	cfg := config.Load()

	if cfg.TelegramToken == "" {
		log.Fatal("TELEGRAM_BOT_TOKEN is not set")
	}

	// verify Ollama is reachable
	ai := ollama.NewClient(cfg.OllamaBaseURL, cfg.OllamaModel, cfg.Debug)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	if err := ai.Ping(ctx); err != nil {
		cancel()
		log.Fatalf("Ollama check failed: %v", err)
	}
	cancel()
	log.Printf("Ollama OK — model: %s", cfg.OllamaModel)

	// verify OCR service is reachable
	ocrClient := ocr.NewClient(cfg.OCRServiceURL)
	ctx, cancel = context.WithTimeout(context.Background(), 10*time.Second)
	if err := ocrClient.Ping(ctx); err != nil {
		cancel()
		log.Fatalf("OCR service check failed: %v", err)
	}
	cancel()
	log.Printf("OCR service OK — %s", cfg.OCRServiceURL)

	// connect to review service (non-fatal — bot works without it but won't send review links)
	reviewClient := review.NewClient(cfg.ReviewServiceURL)
	ctx, cancel = context.WithTimeout(context.Background(), 5*time.Second)
	if err := reviewClient.Ping(ctx); err != nil {
		cancel()
		log.Printf("WARNING: review service not reachable at %s: %v", cfg.ReviewServiceURL, err)
		log.Printf("Bot will run without review links until fish-coldstorage is available.")
		reviewClient = nil
	} else {
		cancel()
		log.Printf("Review service OK — %s", cfg.ReviewServiceURL)
	}

	// stock client — same base URL as review service, uses public endpoint (no auth)
	stockClient := stockapi.NewClient(cfg.ReviewServiceURL)
	log.Printf("Stock API configured — %s/v1/public/stock", cfg.ReviewServiceURL)

	bot, err := tgbotapi.NewBotAPI(cfg.TelegramToken)
	if err != nil {
		log.Fatalf("Telegram init failed: %v", err)
	}
	bot.Debug = cfg.Debug
	log.Printf("Telegram bot connected: @%s", bot.Self.UserName)

	h := handler.New(bot, ai, ocrClient, reviewClient, stockClient, cfg.TelegramGroupID, cfg.AdminChatID)

	u := tgbotapi.NewUpdate(0)
	u.Timeout = 60
	updates := bot.GetUpdatesChan(u)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	log.Println("Bot running. Press Ctrl+C to stop.")
	for {
		select {
		case update := <-updates:
			go h.Dispatch(update)
		case <-stop:
			log.Println("Shutting down...")
			bot.StopReceivingUpdates()
			return
		}
	}
}
