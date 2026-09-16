#!/bin/sh
# Fly.io (volume) uchun entrypoint:
#   1) /data papkasini tayyorlaydi (volume birinchi marta mount qilingan bo'lsa)
#   2) Volume bo'sh bo'lsa — repo'dagi boshlang'ich snapshotlarni ko'chiradi
#      (mavjud fayllar ustidan YOZILMAYDI: cp -n)
#   3) node dist/index.js ni PID 1 sifatida ishga tushiradi (signal'lar to'g'ri yetadi)
set -e

DATA_ROOT="${DATA_ROOT:-/data}"
SNAP_DIR="${SNAPSHOTS_DIR:-$DATA_ROOT/snapshots}"
# Obraz ichidagi boshlang'ich snapshotlar (Dockerfile: /app/seed/snapshots)
SEED_DIR="${SEED_DIR:-/app/seed/snapshots}"

mkdir -p "$SNAP_DIR"

if [ -d "$SEED_DIR" ]; then
  # -n: mavjud faylni almashtirmaydi (sync yozgan yangi ma'lumot saqlanadi)
  cp -n "$SEED_DIR"/*.json "$SNAP_DIR"/ 2>/dev/null || true
fi

# store.json shu papkaga yoziladi (dirname(SNAPSHOTS_DIR)) — volume'da qoladi
echo "[entrypoint] SNAPSHOTS_DIR=$SNAP_DIR · store=$(dirname "$SNAP_DIR")/store.json"

exec "$@"
