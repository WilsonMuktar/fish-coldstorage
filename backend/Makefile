.PHONY: build run tidy docker docker-up docker-down migrate

build:
	go build -o bin/api ./cmd/api

run:
	go run ./cmd/api

tidy:
	go mod tidy

docker:
	docker build -t fish-coldstorage-api .

docker-up:
	docker compose up -d

docker-down:
	docker compose down

migrate:
	psql "$$DATABASE_URL" -f migrations/000001_init.up.sql

lint:
	golangci-lint run ./...
