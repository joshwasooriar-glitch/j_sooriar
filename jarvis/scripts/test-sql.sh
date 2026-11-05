#!/usr/bin/env bash
# Runs tests/sql/*.sql against a real Postgres with the migrations applied.
# Default target is the local Supabase stack from `npx supabase start`.
set -euo pipefail
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
status=0
for f in "$(dirname "$0")"/../tests/sql/*.sql; do
  echo "== $(basename "$f")"
  # Results go to /dev/null; the ok lines are NOTICEs on stderr. pipefail
  # makes a psql failure fail the pipeline even though sed succeeds.
  if ! psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -o /dev/null -f "$f" 2>&1 | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR): +//'; then
    status=1
  fi
done
exit $status
