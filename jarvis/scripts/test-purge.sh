#!/usr/bin/env bash
# End to end: seed, add a REAL event that points at a seed task (the production
# failure), purge through the real npm script, then assert in Postgres that no
# seed rows remain and that an ordinary ledger delete is still rejected.
#
# Needs the local stack (npx supabase start) and .env.local with
# NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SEED_USER_ID.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
UID_=$(grep '^SEED_USER_ID=' .env.local | cut -d= -f2)
q() { psql "$DB" -X -q -At -v ON_ERROR_STOP=1 -c "$1"; }

echo "== seed"
npm run -s seed | tail -3

echo "== a real event against a seed task"
TASK=$(q "select id from tasks where user_id = '$UID_' and source = 'seed' order by created_at desc, id limit 1")
EVENT=$(q "insert into activity_events (user_id, event_type, task_id, quantity, xp, source) values ('$UID_', 'task_completed', '$TASK', 0, 10, 'manual') returning id")
echo "   inserted event $EVENT against task $TASK"

echo "== purge"
npm run -s seed:purge | tail -4

echo "== assertions"
LEFT=$(q "select (select count(*) from activity_events where user_id = '$UID_' and source = 'seed')
             + (select count(*) from tasks where user_id = '$UID_' and source = 'seed')
             + (select count(*) from goals where user_id = '$UID_' and source = 'seed')
             + (select count(*) from milestones m join goals g on g.id = m.goal_id where g.user_id = '$UID_' and m.source = 'seed')
             + (select count(*) from projects where user_id = '$UID_' and source = 'seed')
             + (select count(*) from habits where user_id = '$UID_' and source = 'seed')
             + (select count(*) from memories where user_id = '$UID_' and source = 'seed')")
[ "$LEFT" = "0" ] || { echo "FAIL: $LEFT seed rows remain"; exit 1; }
echo "   ok  zero source='seed' rows remain"

# Track the exact event inserted above, by id: earlier runs may have left
# other real events against seed tasks.
REAL=$(q "select count(*) from activity_events where id = $EVENT and task_id = '$TASK' and quantity = 0 and xp = 10")
[ "$REAL" = "1" ] || { echo "FAIL: real event $EVENT did not survive unchanged"; exit 1; }
echo "   ok  real event $EVENT survives unchanged, still pointing at task $TASK"

if psql "$DB" -X -At -v ON_ERROR_STOP=1 -c "delete from activity_events where user_id = '$UID_'" 2>"${TMPDIR:-/tmp}/purge-delete.err"; then
  echo "FAIL: an ordinary delete from activity_events succeeded"; exit 1
fi
grep -q "append-only" "${TMPDIR:-/tmp}/purge-delete.err" || { echo "FAIL: delete failed for another reason"; cat "${TMPDIR:-/tmp}/purge-delete.err"; exit 1; }
echo "   ok  an ordinary delete from activity_events is still rejected"
echo "PURGE TEST PASSED"
