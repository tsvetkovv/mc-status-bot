#!/bin/sh -ex

echo "$DATABASE_PATH"

if [ ! -d "/sqlite/data" ]; then
  mkdir -p /sqlite/data
fi
chmod -R 755 /sqlite

npx prisma migrate deploy
sqlite3 /sqlite/data/sqlite.db "PRAGMA journal_mode = WAL;"

ls -al

npm run start:force