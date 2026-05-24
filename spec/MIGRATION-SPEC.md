# Migration Procedure — Development to Mac Mini Server

**Version:** 1.0.0
**Date:** 2026-05-22
**Status:** Draft

---

## Table of Contents

1. [Overview](#1-overview)
2. [Pre-Migration Checklist](#2-pre-migration-checklist)
3. [Mac Mini Server Setup](#3-mac-mini-server-setup)
4. [Network Configuration](#4-network-configuration)
5. [Install Required Software](#5-install-required-software)
6. [Transfer Codebase](#6-transfer-codebase)
7. [Transfer Data](#7-transfer-data)
8. [Environment Configuration](#8-environment-configuration)
9. [Start Services](#9-start-services)
10. [Post-Migration Verification](#10-post-migration-verification)
11. [NAS Backup Reconfiguration](#11-nas-backup-reconfiguration)
12. [Telegram Bot Cutover](#12-telegram-bot-cutover)
13. [Rollback Procedure](#13-rollback-procedure)
14. [Production Hardening](#14-production-hardening)
15. [Maintenance Reference](#15-maintenance-reference)

---

## 1. Overview

This document covers the complete procedure for migrating the Fish Cold Storage Management System from a development machine to a dedicated Mac Mini server on the local network. Docker containers make this migration straightforward — no application dependencies need to be reinstalled on the target machine.

### Migration approach

```
Development Mac                          Mac Mini Server
─────────────────                        ─────────────────
All Docker services     ──migrate──→     Same Docker services
fishstorage_db (PostgreSQL)              fishstorage_db (restored)
auth_db (PostgreSQL)                     auth_db (restored)
receipts volume (images)                 receipts volume (copied)
.env config                              .env (updated IPs)
NAS backup config                        NAS backup (reconfigured)
```

### Estimated migration time

| Task | Time |
|---|---|
| Mac Mini OS + software setup | 30–60 min |
| Network configuration | 15 min |
| Code transfer | 5 min |
| Data transfer (depends on DB size) | 10–30 min |
| Service startup + verification | 15 min |
| **Total** | **~2 hours** |

### Zero-downtime strategy

- Keep development machine running until Mac Mini is fully verified
- Switch over by updating `REVIEW_BASE_URL` in `.env` to Mac Mini IP
- Old development machine becomes backup/dev environment

---

## 2. Pre-Migration Checklist

Complete all items before starting migration.

### Development machine

- [ ] All code committed and pushed to git repository
- [ ] Latest database backup exists on NAS
- [ ] All pending receipt reviews approved or noted
- [ ] `.env` file backed up securely (contains tokens + passwords)
- [ ] Docker volumes noted: `pgdata`, `pgdata-auth`, `receipts`, `local-backup`
- [ ] Note current Docker image versions: `docker images`
- [ ] Note current service health: `docker compose ps`

### Mac Mini

- [ ] macOS version confirmed (12 Monterey or later recommended)
- [ ] Minimum specs: 8GB RAM, 256GB storage
- [ ] Connected to local network via ethernet (preferred over WiFi for server)
- [ ] Static local IP assigned (see Section 4)
- [ ] Apple ID logged in (for software downloads if needed)
- [ ] Remote login (SSH) enabled: System Settings → Sharing → Remote Login → ON

### Network

- [ ] NAS accessible from Mac Mini (`ping {NAS_IP}`)
- [ ] NAS SMB share credentials ready
- [ ] Local network IP range known (e.g. 192.168.1.x)
- [ ] Router admin access available (for static IP assignment)

---

## 3. Mac Mini Server Setup

### 3.1 Prevent sleep

The Mac Mini must never sleep while acting as a server.

```bash
# Disable all sleep (run in Terminal on Mac Mini)
sudo pmset -a sleep 0
sudo pmset -a disksleep 0
sudo pmset -a displaysleep 0
sudo pmset -a powernap 0

# Verify settings
pmset -g
```

### 3.2 Enable automatic login

So services restart after a power cycle without manual login:

```
System Settings → Users & Groups → Automatic Login → select your user
```

> Set a firmware password separately if security is a concern.

### 3.3 Enable SSH remote access

```
System Settings → Sharing → Remote Login → ON
Allow access for: All users (or specific admin user)
```

Test from development machine:
```bash
ssh username@{MAC_MINI_IP}
```

### 3.4 Set hostname

```bash
sudo scutil --set HostName macmini-samudera
sudo scutil --set LocalHostName macmini-samudera
sudo scutil --set ComputerName "MacMini Samudera"
```

---

## 4. Network Configuration

### 4.1 Assign static local IP to Mac Mini

**Option A — via Router (recommended)**

1. Find Mac Mini MAC address:
   ```bash
   ifconfig en0 | grep ether
   ```
2. Log into router admin panel (usually `192.168.1.1` or `192.168.0.1`)
3. Go to DHCP → Static Leases (or Address Reservation)
4. Add Mac Mini MAC address → assign fixed IP (e.g. `192.168.1.100`)
5. Reboot Mac Mini to apply

**Option B — via macOS network settings**

```
System Settings → Network → Ethernet → Details → TCP/IP
Configure IPv4: Manually
IP Address: 192.168.1.100
Subnet Mask: 255.255.255.0
Router: 192.168.1.1 (your router IP)
```

### 4.2 Confirm IP from development machine

```bash
ping 192.168.1.100
ssh username@192.168.1.100
```

### 4.3 Note all IPs for .env update

| Device | IP |
|---|---|
| Mac Mini (server) | `192.168.1.100` (example) |
| NAS | `192.168.1.x` (your NAS IP) |
| Development Mac | `192.168.1.x` (for reference) |

---

## 5. Install Required Software

All commands run on Mac Mini via SSH or Terminal.

### 5.1 Install Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Add to PATH (Apple Silicon)
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### 5.2 Install OrbStack (recommended over Docker Desktop)

OrbStack is faster and lighter than Docker Desktop on macOS:

```bash
brew install orbstack
```

Or download from https://orbstack.dev — open the `.dmg`, drag to Applications, launch once to initialize.

> **Why OrbStack over Docker Desktop:**
> - Uses ~50% less RAM
> - Faster container startup
> - Better macOS integration
> - Free for personal/small team use

### 5.3 Verify Docker is available

```bash
docker --version
docker compose version
```

### 5.4 Install git

```bash
brew install git

# Configure
git config --global user.name "Samudera Server"
git config --global user.email "server@samudera.local"
```

### 5.5 Install make (for Makefile shortcuts)

```bash
xcode-select --install
# Or:
brew install make
```

### 5.6 Verify NAS mount capability (CIFS/SMB)

```bash
# Test SMB connection to NAS
mount -t smbfs //{NAS_USER}:{NAS_PASS}@{NAS_IP}/backups /tmp/nastest
ls /tmp/nastest
umount /tmp/nastest
```

---

## 6. Transfer Codebase

### 6.1 Set up git repository access

**Option A — Clone from git remote (recommended)**

```bash
# On Mac Mini
cd /opt
sudo mkdir samudera
sudo chown $(whoami) samudera
cd samudera

git clone https://github.com/yourname/fish-coldstorage.git
git clone https://github.com/yourname/auth-service.git
```

**Option B — rsync from development machine**

```bash
# Run from development Mac
rsync -avz --exclude '.git' --exclude 'node_modules' --exclude '*.log' \
  /path/to/fish-coldstorage/ \
  username@192.168.1.100:/opt/samudera/fish-coldstorage/

rsync -avz --exclude '.git' --exclude '*.log' \
  /path/to/auth-service/ \
  username@192.168.1.100:/opt/samudera/auth-service/
```

### 6.2 Verify directory structure on Mac Mini

```bash
ls /opt/samudera/
# auth-service/
# fish-coldstorage/
```

---

## 7. Transfer Data

### 7.1 Stop services on development machine

```bash
# On development Mac
cd /path/to/fish-coldstorage
docker compose stop bot frontend  # stop user-facing services first
# Keep postgres running for dump
```

### 7.2 Dump databases

```bash
# On development Mac

# Fish coldstorage database
docker compose exec postgres pg_dump \
  -U fishuser fishstorage_db | gzip > /tmp/fishstorage_migration.sql.gz

# Auth database
docker compose -f ../auth-service/docker-compose.yml exec postgres-auth pg_dump \
  -U authuser auth_db | gzip > /tmp/auth_migration.sql.gz

# Verify dumps
ls -lh /tmp/*_migration.sql.gz
```

### 7.3 Transfer database dumps to Mac Mini

```bash
# From development Mac
rsync -avz /tmp/fishstorage_migration.sql.gz \
  username@192.168.1.100:/tmp/

rsync -avz /tmp/auth_migration.sql.gz \
  username@192.168.1.100:/tmp/
```

### 7.4 Transfer receipts volume

```bash
# Find volume path on development Mac
docker volume inspect fish-coldstorage_receipts | grep Mountpoint

# Typically: /var/lib/docker/volumes/fish-coldstorage_receipts/_data
# On OrbStack it may be different — check the output above

# Copy to Mac Mini (run from development Mac)
rsync -avz --progress \
  /var/lib/docker/volumes/fish-coldstorage_receipts/_data/ \
  username@192.168.1.100:/tmp/receipts_migration/
```

### 7.5 Transfer JWT secrets

```bash
# From development Mac (secrets folder contains auth_public.pem, private.pem)
rsync -avz /path/to/auth-service/secrets/ \
  username@192.168.1.100:/opt/samudera/auth-service/secrets/

rsync -avz /path/to/fish-coldstorage/secrets/ \
  username@192.168.1.100:/opt/samudera/fish-coldstorage/secrets/
```

---

## 8. Environment Configuration

### 8.1 Create .env files on Mac Mini

```bash
# On Mac Mini
cd /opt/samudera/auth-service
cp .env.example .env
nano .env   # or use any editor
```

**auth-service `.env` — update these values:**

```env
POSTGRES_HOST=postgres-auth
POSTGRES_PORT=5433
POSTGRES_DB=auth_db
POSTGRES_USER=authuser
POSTGRES_PASSWORD=your_strong_password

JWT_PRIVATE_KEY_PATH=/secrets/private.pem
JWT_PUBLIC_KEY_PATH=/secrets/public.pem
JWT_ACCESS_TOKEN_TTL=900
JWT_REFRESH_TOKEN_TTL=2592000

HTTP_PORT=8001
GRPC_PORT=9010
```

```bash
# On Mac Mini
cd /opt/samudera/fish-coldstorage
cp .env.example .env
nano .env
```

**fish-coldstorage `.env` — update these values:**

```env
# PostgreSQL
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=fishstorage_db
POSTGRES_USER=fishuser
POSTGRES_PASSWORD=your_strong_password

# Auth service (Mac Mini internal Docker network)
AUTH_SERVICE_GRPC=auth-service:9010
AUTH_PUBLIC_KEY_PATH=/secrets/auth_public.pem

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_GROUP_ID=-1003843329845
TELEGRAM_ADMIN_CHAT_ID=7171193592

# OCR
OCR_SERVICE_URL=http://ocr-service:8100

# Frontend — UPDATE TO MAC MINI IP
NEXT_PUBLIC_API_URL=http://192.168.1.100:8000
NEXT_PUBLIC_APP_URL=http://192.168.1.100:3000

# Review links — UPDATE TO MAC MINI IP
REVIEW_BASE_URL=http://192.168.1.100:3000

# NAS Backup — UPDATE NAS IP IF CHANGED
NAS_IP=192.168.1.x
NAS_USER=backup_user
NAS_PASS=your_nas_password
NAS_BACKUP_SHARE=backups
LOCAL_BACKUP_PATH=/local-backup
LOCAL_BACKUP_RETAIN_DAYS=7
NAS_DAILY_RETAIN_DAYS=30
NAS_WEEKLY_RETAIN_DAYS=365

# Storage
RECEIPT_STORAGE_PATH=/data/receipts
DEFAULT_CURRENCY=IDR
```

### 8.2 Key differences from development .env

| Variable | Development | Mac Mini |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | `http://192.168.1.100:8000` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | `http://192.168.1.100:3000` |
| `REVIEW_BASE_URL` | `http://192.168.1.x:3000` | `http://192.168.1.100:3000` |
| `POSTGRES_PASSWORD` | dev password | strong production password |

---

## 9. Start Services

### 9.1 Start auth-service first

```bash
# On Mac Mini
cd /opt/samudera/auth-service

# Start PostgreSQL first
docker compose up -d postgres-auth

# Wait for healthy
docker compose ps
# postgres-auth should show (healthy)

# Run migrations
docker compose run --rm auth-service make migrate

# Restore auth database
gunzip -c /tmp/auth_migration.sql.gz | \
  docker compose exec -T postgres-auth psql -U authuser auth_db

# Start all auth services
docker compose up -d

# Verify
docker compose ps
docker compose logs auth-service --tail=50
```

### 9.2 Start fish-coldstorage

```bash
# On Mac Mini
cd /opt/samudera/fish-coldstorage

# Start PostgreSQL first
docker compose up -d postgres

# Wait for healthy
docker compose ps

# Run migrations
docker compose run --rm api make migrate

# Restore fishstorage database
gunzip -c /tmp/fishstorage_migration.sql.gz | \
  docker compose exec -T postgres psql -U fishuser fishstorage_db

# Restore receipts volume
docker compose up -d  # creates the receipts volume
docker compose stop   # stop before copying data in

# Copy receipt images into volume
docker run --rm \
  -v fish-coldstorage_receipts:/target \
  -v /tmp/receipts_migration:/source \
  alpine sh -c "cp -r /source/. /target/"

# Start all services
docker compose up -d

# Verify all running
docker compose ps
```

### 9.3 Verify all services

```bash
# Check all containers are Up
docker compose ps

# Expected output:
# NAME                STATUS          PORTS
# postgres            Up (healthy)    5432/tcp
# ocr-service         Up              8100/tcp
# api                 Up              8000, 9000/tcp
# bot                 Up
# frontend            Up              3000/tcp
# backup              Up

# Check logs for errors
docker compose logs --tail=50 api
docker compose logs --tail=50 bot
docker compose logs --tail=50 ocr-service
```

---

## 10. Post-Migration Verification

Run through this checklist after services are up.

### 10.1 Web portal

```bash
# From any device on the same network
# Open browser: http://192.168.1.100:3000

# Test:
# [ ] Login page loads
# [ ] Login with admin credentials works
# [ ] Dashboard loads and shows data
# [ ] Fish stock page shows correct data
# [ ] Item stock page shows correct data
```

### 10.2 API health check

```bash
curl http://192.168.1.100:8000/health
# Expected: {"status":"ok"}

curl http://192.168.1.100:8001/health
# Expected: {"status":"ok"} (auth-service)
```

### 10.3 Database record count verification

```bash
# On Mac Mini — compare record counts with development machine

docker compose exec postgres psql -U fishuser fishstorage_db -c "
SELECT
  (SELECT COUNT(*) FROM fish_transactions) as fish_tx,
  (SELECT COUNT(*) FROM item_transactions) as item_tx,
  (SELECT COUNT(*) FROM receipts) as receipts,
  (SELECT COUNT(*) FROM employees) as employees,
  (SELECT COUNT(*) FROM invoices) as invoices;
"
```

Compare output with same query on development machine — numbers must match.

### 10.4 Telegram bot

```bash
# Send test message in group
# Bot should respond to /start
# Send a test receipt photo
# Verify review link works (http://192.168.1.100:3000/review/...)
# Verify review link opens correctly on mobile
```

### 10.5 OCR service

```bash
curl -X POST http://192.168.1.100:8100/ocr \
  -H "Content-Type: application/json" \
  -d '{"image": "'$(base64 -i /path/to/test_receipt.jpg)'"}'
# Expected: { "text": "...", "confidence": 0.xx }
```

### 10.6 NAS backup test

```bash
# Trigger manual backup
docker compose exec backup sh /backup.sh

# Verify on NAS:
# /backups/daily/fishstorage_{timestamp}.sql.gz should exist

# Verify Telegram notification received by admin
```

---

## 11. NAS Backup Reconfiguration

If Mac Mini has a different IP or the NAS mount path changes:

### 11.1 Update .env

```env
NAS_IP=192.168.1.x        # confirm NAS IP is unchanged
NAS_BACKUP_SHARE=backups  # confirm share name
```

### 11.2 Re-test NAS mount

```bash
# Inside backup container
docker compose exec backup sh -c "ls /nas/backups/"
# Should list existing backup files
```

### 11.3 Verify cron schedule

```bash
docker compose exec backup crontab -l
# Should show: 0 2 * * * /bin/sh /backup.sh
```

---

## 12. Telegram Bot Cutover

The bot connects outbound to Telegram — only one instance should run at a time to avoid duplicate message processing.

### 12.1 Stop bot on development machine

```bash
# On development Mac
cd /path/to/fish-coldstorage
docker compose stop bot
```

### 12.2 Confirm bot running on Mac Mini

```bash
# On Mac Mini
docker compose ps bot
# Should show: Up

docker compose logs bot --tail=20
# Should show: "Bot started. Polling..."
```

### 12.3 Test in group

Send `/stock` in group — response should come from Mac Mini instance (verify by checking Mac Mini bot logs):

```bash
docker compose logs bot -f
# Watch for incoming update from /stock command
```

---

## 13. Rollback Procedure

If migration fails or issues are discovered after cutover:

### 13.1 Restart bot on development machine

```bash
# On development Mac
docker compose start bot
```

### 13.2 Stop bot on Mac Mini

```bash
# On Mac Mini
docker compose stop bot
```

### 13.3 Update REVIEW_BASE_URL back

```env
# On development Mac .env
REVIEW_BASE_URL=http://192.168.1.{old_dev_ip}:3000
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

```bash
docker compose up -d frontend
```

### 13.4 Restore from NAS backup if data was lost

```bash
# List available backups on NAS
ls /nas/backups/daily/

# Restore
gunzip -c /nas/backups/daily/fishstorage_{timestamp}.sql.gz | \
  docker compose exec -T postgres psql -U fishuser fishstorage_db
```

> Development machine database remains untouched during migration — it is the rollback source of truth.

---

## 14. Production Hardening

After successful migration, apply these additional settings on Mac Mini.

### 14.1 Auto-restart Docker on login

**OrbStack:** automatically starts on login by default.

**Docker Desktop:** Docker Desktop → Settings → General → Start Docker Desktop when you log in → ON

### 14.2 Set Docker Compose restart policy

Already configured in `docker-compose.yml`:
```yaml
restart: unless-stopped
```
All containers automatically restart on Mac Mini reboot.

### 14.3 Verify on reboot

```bash
# Reboot Mac Mini
sudo reboot

# After reboot, from another machine:
ssh username@192.168.1.100
docker compose -f /opt/samudera/fish-coldstorage/docker-compose.yml ps
# All services should show "Up"
```

### 14.4 Log rotation

Prevent Docker logs from filling disk:

```json
// /etc/docker/daemon.json  (create if not exists)
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

Restart Docker after changes.

### 14.5 Disk space monitoring

```bash
# Add to crontab — alert if disk > 80% full
# crontab -e
0 9 * * * df -h / | awk 'NR==2{if(int($5)>80) print "DISK WARNING: "$5" used on Mac Mini"}' | \
  xargs -I{} curl -s -X POST "https://api.telegram.org/bot{TOKEN}/sendMessage" \
  -d "chat_id=7171193592&text={}"
```

### 14.6 Health check script

```bash
# /opt/samudera/scripts/healthcheck.sh
#!/bin/bash

SERVICES=("postgres" "api" "bot" "frontend" "ocr-service")
FAILED=()

cd /opt/samudera/fish-coldstorage

for SERVICE in "${SERVICES[@]}"; do
  STATUS=$(docker compose ps $SERVICE --format json | python3 -c "import sys,json; print(json.load(sys.stdin)['State'])" 2>/dev/null)
  if [ "$STATUS" != "running" ]; then
    FAILED+=("$SERVICE")
  fi
done

if [ ${#FAILED[@]} -gt 0 ]; then
  MSG="ALERT Mac Mini: Services down: ${FAILED[*]}"
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=7171193592&text=$MSG"
fi
```

```bash
# Add to crontab — run every 5 minutes
*/5 * * * * /opt/samudera/scripts/healthcheck.sh
```

---

## 15. Maintenance Reference

### Common commands on Mac Mini

```bash
# Navigate to project
cd /opt/samudera/fish-coldstorage

# View all service status
docker compose ps

# View logs (live)
docker compose logs -f api
docker compose logs -f bot
docker compose logs -f ocr-service

# Restart a specific service
docker compose restart api
docker compose restart bot

# Stop everything
docker compose down

# Start everything
docker compose up -d

# Pull latest code and rebuild
git pull
docker compose build
docker compose up -d

# Run database migration after code update
docker compose run --rm api make migrate

# Manual database backup
docker compose exec backup sh /backup.sh

# Check disk usage
df -h
docker system df

# Clean up unused Docker images/volumes
docker system prune -f
```

### Updating the application

```bash
# On Mac Mini
cd /opt/samudera/fish-coldstorage

# Pull latest code
git pull origin main

# Rebuild affected services
docker compose build api bot frontend

# Apply migrations if schema changed
docker compose run --rm api make migrate

# Restart with zero-downtime where possible
docker compose up -d --no-deps api
docker compose up -d --no-deps bot
docker compose up -d --no-deps frontend

# Verify
docker compose ps
docker compose logs api --tail=20
```

### Emergency: complete restart

```bash
cd /opt/samudera/auth-service && docker compose down
cd /opt/samudera/fish-coldstorage && docker compose down

cd /opt/samudera/auth-service && docker compose up -d
sleep 10
cd /opt/samudera/fish-coldstorage && docker compose up -d
```

### Check backup history

```bash
# Local backups (last 7 days)
ls -lh /var/lib/docker/volumes/fish-coldstorage_local-backup/_data/

# NAS backups
docker compose exec backup ls -lh /nas/backups/daily/ | tail -10
docker compose exec backup ls -lh /nas/backups/weekly/ | tail -5
```

---

*Migration estimated time: ~2 hours. Rollback available at any point by restarting bot and services on development machine.*
