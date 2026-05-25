#!/bin/sh
set -e

# Start auth service in background on internal port 9001
HTTP_PORT=9001 GRPC_PORT=9010 ./auth-service &

# Wait for auth to be ready (up to 20 seconds)
echo "Waiting for auth service..."
for i in $(seq 1 20); do
    if wget -q -O- http://localhost:9001/health > /dev/null 2>&1; then
        echo "Auth service ready"
        break
    fi
    sleep 1
done

# Start backend in foreground — keeps container alive
exec ./api
