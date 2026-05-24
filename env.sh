#!/usr/bin/env bash
# Source this file to load all service env vars into your shell:
#   source env.sh
# This file is gitignored — never commit it.

# ─── AUTH SERVICE ───────────────────────────────────────────────
export POSTGRES_HOST=postgres-auth
export POSTGRES_PORT=5432
export POSTGRES_DB=auth_db
export POSTGRES_USER=authuser
export POSTGRES_PASSWORD="Samudera@2024!"
export JWT_PRIVATE_KEY_PATH=/secrets/private.pem
export JWT_PUBLIC_KEY_PATH=/secrets/public.pem
export JWT_ACCESS_TOKEN_TTL=900
export JWT_REFRESH_TOKEN_TTL=2592000
export HTTP_PORT=8001
export GRPC_PORT=9010

# ─── BACKEND API ────────────────────────────────────────────────
export DB_HOST=postgres-fish
export DB_PORT=5432
export DB_USER=postgres
export DB_PASSWORD="Samudera@2024!"
export DB_NAME=fishstorage
export DB_SSLMODE=disable
export SERVER_PORT=8002
export AUTH_SERVICE_URL=http://host.docker.internal:8001
export AUTH_PUBLIC_KEY_PATH=secrets/auth_public.pem
export BASE_URL=http://192.168.50.116:3000
export API_URL=http://192.168.50.116:8002
export DATA_DIR=data
export OCR_URL=http://host.docker.internal:8000
export OLLAMA_URL=http://host.docker.internal:11434
export OLLAMA_DEBUG=0

# ─── TELEGRAM BOT ───────────────────────────────────────────────
export TELEGRAM_BOT_TOKEN=7743817958:AAGUhJqSC-JXpgeep84Fgt8UznPeRzNTXHw
export TELEGRAM_GROUP_ID=-1003843329845
export TELEGRAM_ADMIN_CHAT_ID=7171193592
export OLLAMA_BASE_URL=http://localhost:11434
export OLLAMA_MODEL=qwen2.5vl:7b
export BOT_DB_USER=samudera
export BOT_DB_PASSWORD="Samudera@2024!"
export BOT_DB_HOST=postgres
export BOT_DB_PORT=5432
export BOT_DB_NAME=fishstorage_db
export DEBUG=true

echo "✓ All env vars loaded (auth, backend, bot)"
