#!/usr/bin/env bash
# Run backend tests against an isolated DB (never the live disputeiq.db).
set -e
cd "$(dirname "$0")"
rm -f .test.db .test.db-wal .test.db-shm
export DATABASE_PATH=./.test.db
node --test tests/webhook.test.js
node --test tests/evidence.test.js
node --test tests/classification.test.js
node --test tests/contradiction.test.js
node --test tests/timeline.test.js
node --test tests/ers.test.js
node --test tests/responseDraft.test.js
rm -f .test.db .test.db-wal .test.db-shm
