FROM golang:1.22-alpine AS build-backend
WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
RUN CGO_ENABLED=0 GOOS=linux go build -o bin/api ./cmd/api

FROM golang:1.22-alpine AS build-auth
WORKDIR /app/auth
COPY auth/go.mod auth/go.sum ./
RUN go mod download
COPY auth/ .
RUN CGO_ENABLED=0 GOOS=linux go build -o bin/auth-service ./cmd/server

FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app

COPY --from=build-backend /app/backend/bin/api ./api
COPY --from=build-backend /app/backend/migrations/ ./migrations/

COPY --from=build-auth /app/auth/bin/auth-service ./auth-service
COPY --from=build-auth /app/auth/migrations/ ./auth-migrations/

RUN mkdir -p data/receipts secrets

COPY start.sh .
RUN chmod +x start.sh

EXPOSE 8002
CMD ["./start.sh"]
