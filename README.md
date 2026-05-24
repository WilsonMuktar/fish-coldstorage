# Fish Cold Storage Management System

Internal management system for a fish cold storage business. Handles fish purchasing, sorting operations, item inventory, expenses, employee attendance, and sales — with receipt scanning via Telegram bot.

## Structure

```
fish-coldstorage/
├── auth/       — JWT auth service (Go)
├── backend/    — Main API (Go + PostgreSQL)
├── bot/        — Telegram bot with OCR receipt scanning (Go + PaddleOCR)
├── frontend/   — Web portal (Next.js 14)
├── docs/       — Database schema (schema.sql)
└── spec/       — Business logic specs
```

## Stack

- **Backend**: Go, chi router, pgx, PostgreSQL
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, shadcn/ui
- **Bot**: Go Telegram bot, PaddleOCR / GOT-OCR for receipt scanning, Ollama for LLM parsing
- **Auth**: Go JWT service with RS256 (access + refresh tokens)
- **Infrastructure**: Docker Compose per service

## Setup

Each service has its own `docker-compose.yml`. Copy `.env.example` to `.env` and fill in the values.

```bash
# Start auth service
cd auth && cp .env.example .env && docker compose up -d

# Start backend API
cd backend && cp .env.example .env && docker compose up -d

# Start Telegram bot
cd bot && cp .env.example .env && docker compose up -d

# Start frontend (dev)
cd frontend && npm install && npm run dev
```

See `docs/schema.sql` for the full database schema.
