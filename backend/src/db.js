// SQLite persistence via node:sqlite (Node >= 22).
// Single connection, WAL mode, idempotent schema migration.
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', config.databasePath);

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS disputes (
  id                    TEXT PRIMARY KEY,          -- internal id (disp_...)
  razorpayDisputeId    TEXT UNIQUE NOT NULL,       -- Razorpay dispute id (dupu_...)
  razorpayPaymentId    TEXT,
  razorpayOrderId      TEXT,
  amount               INTEGER,                    -- in paise
  currency             TEXT,
  reasonCode           TEXT,
  reasonLabel          TEXT,
  phase                TEXT,                       -- Razorpay lifecycle phase
  status               TEXT,
  createdAtRzp         INTEGER,                    -- Razorpay epoch seconds
  deadlineRzp          INTEGER,                    -- Razorpay epoch seconds (may be null)
  raw                  TEXT,                       -- raw Razorpay dispute JSON (debug/audit)
  createdAt            INTEGER NOT NULL,
  updatedAt            INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_events (
  eventId            TEXT PRIMARY KEY,             -- Razorpay event id (evt_...)
  eventType          TEXT NOT NULL,               -- payment.dispute.created, etc.
  accountId          TEXT,
  payload            TEXT,                        -- raw JSON payload
  receivedAt         INTEGER NOT NULL,
  status             TEXT NOT NULL,               -- RECEIVED | PROCESSED | FAILED | DUPLICATE
  attempts           INTEGER NOT NULL DEFAULT 0,
  error              TEXT,
  processedAt        INTEGER
);

CREATE TABLE IF NOT EXISTS audit_events (
  id          TEXT PRIMARY KEY,
  timestamp   INTEGER NOT NULL,
  actor       TEXT NOT NULL,                      -- RAZORPAY API | SYSTEM | MERCHANT | AI ENGINE
  eventType   TEXT NOT NULL,
  entityType  TEXT,
  entityId    TEXT,
  statusText  TEXT,
  metadata    TEXT,                               -- JSON
  requestId   TEXT
);

CREATE INDEX IF NOT EXISTS idx_disputes_rzpid  ON disputes(razorpayDisputeId);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_audit_entity    ON audit_events(entityId, eventType);

CREATE TABLE IF NOT EXISTS evidence_documents (
  id               TEXT PRIMARY KEY,              -- ev_...
  disputeId        TEXT NOT NULL,                 -- internal dispute id (disp_...)
  filename         TEXT NOT NULL,                 -- original filename (display only)
  safeName         TEXT NOT NULL,                 -- stored file name (uuid, no path)
  mimeType         TEXT NOT NULL,
  size             INTEGER NOT NULL,             -- bytes
  storageLocation  TEXT NOT NULL,                 -- logical path (never fs-absolute to client)
  processingStatus TEXT NOT NULL,                -- UPLOADED|PROCESSING|EXTRACTED|OCR_REQUIRED|EXTRACTION_FAILED|UNSUPPORTED
  extractionMethod TEXT,                          -- TXT_DIRECT|JSON_PARSE|PDF_TEXT|OCR
  extractedText    TEXT,                          -- may be large; detail endpoint only
  extractionError  TEXT,                          -- error category/message (no stack)
  characterCount   INTEGER,
  pageCount        INTEGER,
  processingMs     INTEGER,
  createdAt   INTEGER NOT NULL,
  updatedAt   INTEGER NOT NULL,
  FOREIGN KEY (disputeId) REFERENCES disputes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_evidence_dispute ON evidence_documents(disputeId);

CREATE TABLE IF NOT EXISTS evidence_classifications (
  id                TEXT PRIMARY KEY,             -- evc_...
  evidenceId        TEXT NOT NULL,                -- FK evidence_documents(id)
  disputeId         TEXT NOT NULL,
  evidenceType      TEXT NOT NULL,                -- one of EVIDENCE_TYPES
  confidence        INTEGER NOT NULL,             -- 0-100
  method            TEXT NOT NULL,                -- LLM | HEURISTIC
  model             TEXT,                         -- model id if LLM
  signals           TEXT,                         -- JSON array
  sourceSpans       TEXT,                         -- JSON array (provenance: snippet + match + type)
  sourceText        TEXT,                         -- truncated source text used
  fallbackReason    TEXT,                         -- set if LLM failed -> heuristic fallback
  createdAt         INTEGER NOT NULL,
  FOREIGN KEY (evidenceId) REFERENCES evidence_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (disputeId) REFERENCES disputes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_class_evidence ON evidence_classifications(evidenceId);
CREATE INDEX IF NOT EXISTS idx_class_dispute ON evidence_classifications(disputeId);

CREATE TABLE IF NOT EXISTS processing_jobs (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,
  entityId    TEXT,
  status      TEXT NOT NULL,
  createdAt   INTEGER NOT NULL,
  updatedAt   INTEGER NOT NULL
);
`);

// Slice 3: classification columns on evidence_documents (idempotent adds, so
// re-running migrations or sharing a DB across tests never throws "duplicate column").
function addColumnIfMissing(table, col, type) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
}
addColumnIfMissing('evidence_documents', 'evidenceType', 'TEXT');
addColumnIfMissing('evidence_documents', 'confidence', 'INTEGER');
addColumnIfMissing('evidence_documents', 'classificationMethod', 'TEXT');
addColumnIfMissing('evidence_documents', 'classificationSource', 'TEXT');
addColumnIfMissing('evidence_documents', 'classificationError', 'TEXT');

export function now() {
  return Math.floor(Date.now() / 1000);
}
