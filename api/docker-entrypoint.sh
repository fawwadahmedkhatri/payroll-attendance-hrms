#!/bin/sh
set -e

echo "Applying database migrations…"
npx prisma migrate deploy

if [ "$SEED_ON_START" = "true" ]; then
  echo "Seeding sample data (skipped automatically if employees already exist)…"
  node dist/prisma/seed.js
fi

exec node dist/src/server.js
