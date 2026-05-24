.PHONY: build run keys docker-up docker-down test

build:
	go build -o bin/auth-service ./cmd/server

run:
	go run ./cmd/server

keys:
	@mkdir -p secrets
	openssl genrsa -out secrets/private.pem 2048
	openssl rsa -in secrets/private.pem -pubout -out secrets/public.pem
	@echo "Keys generated at secrets/private.pem and secrets/public.pem"

docker-up:
	docker compose up -d

docker-down:
	docker compose down

test:
	go test ./...
