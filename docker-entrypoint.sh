#!/bin/sh
set -e

echo ""
echo "  ╔═══════════════════════════════════════════╗"
echo "  ║         Feed2040 - Starting up...        ║"
echo "  ╚═══════════════════════════════════════════╝"
echo ""

# ── Wait for database ─────────────────────────────
echo "⏳ Waiting for database..."
MAX_RETRIES=30
RETRY=0

DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')

while ! nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
  RETRY=$((RETRY + 1))
  if [ $RETRY -ge $MAX_RETRIES ]; then
    echo "❌ Database not available after $MAX_RETRIES attempts!"
    exit 1
  fi
  echo "   Attempt $RETRY/$MAX_RETRIES..."
  sleep 2
done
echo "✅ Database is ready!"

# ── Run migrations ────────────────────────────────
echo ""
echo "📦 Running database migrations..."
node /app/scripts/migrate.js
echo ""

# ── Status ────────────────────────────────────────
echo "  ╔═══════════════════════════════════════════╗"
echo "  ║       Feed2040 is ready! 🚀              ║"
echo "  ╠═══════════════════════════════════════════╣"
echo "  ║  URL:   http://localhost:${PORT:-3000}              ║"
echo "  ║  Setup: /setup (first-time admin)         ║"
echo "  ║  Feeds: auto-refresh every ${REFRESH_INTERVAL_MINUTES:-15} min       ║"
echo "  ║                                           ║"
echo "  ║  AI & Telegram keys can be configured     ║"
echo "  ║  from Settings in the web UI.             ║"
echo "  ╚═══════════════════════════════════════════╝"
echo ""

# ── Start cron worker ─────────────────────────────
node /app/scripts/cron-refresh.js &

# ── Start Telegram bot poller ─────────────────────
node /app/scripts/telegram-poll.js &

exec "$@"
