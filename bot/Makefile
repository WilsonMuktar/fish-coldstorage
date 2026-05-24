# local dev (requires Ollama running natively)
run:
	go run ./cmd/bot

build:
	go build -o bin/bot ./cmd/bot

tidy:
	go mod tidy

# docker
up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f bot

restart:
	docker compose restart bot

# ollama (run natively on Mac, not in Docker)
pull-model:
	ollama pull qwen2.5vl:7b

ping-ollama:
	curl -s http://localhost:11434/api/tags | python3 -m json.tool
