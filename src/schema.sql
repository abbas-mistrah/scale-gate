PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  sector TEXT NOT NULL,
  geography TEXT NOT NULL DEFAULT 'Europe',
  risk_appetite TEXT NOT NULL DEFAULT 'balanced',
  currency TEXT NOT NULL DEFAULT 'EUR',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS use_cases (
  id INTEGER PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  department TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  business_outcome TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'pilot',
  status TEXT NOT NULL DEFAULT 'active',
  risk_tier TEXT NOT NULL DEFAULT 'medium',
  autonomy_level INTEGER NOT NULL DEFAULT 1,
  pilot_users INTEGER NOT NULL DEFAULT 0,
  target_users INTEGER NOT NULL DEFAULT 0,
  baseline_minutes REAL NOT NULL DEFAULT 0,
  treatment_minutes REAL NOT NULL DEFAULT 0,
  tasks_per_user_month REAL NOT NULL DEFAULT 0,
  labor_cost_hour REAL NOT NULL DEFAULT 0,
  setup_cost REAL NOT NULL DEFAULT 0,
  annual_platform_cost REAL NOT NULL DEFAULT 0,
  revenue_uplift REAL NOT NULL DEFAULT 0,
  risk_avoidance REAL NOT NULL DEFAULT 0,
  adoption REAL NOT NULL DEFAULT 0,
  attribution REAL NOT NULL DEFAULT 0.7,
  human_review_rate REAL NOT NULL DEFAULT 0,
  review_minutes REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY,
  use_case_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  value REAL NOT NULL,
  target REAL NOT NULL,
  unit TEXT NOT NULL DEFAULT 'ratio',
  direction TEXT NOT NULL DEFAULT 'min',
  sample_size INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT '',
  measured_at TEXT NOT NULL,
  UNIQUE(use_case_id, key),
  FOREIGN KEY (use_case_id) REFERENCES use_cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS controls (
  id INTEGER PRIMARY KEY,
  use_case_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'medium',
  mandatory INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'missing',
  owner TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  framework_ref TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(use_case_id, key),
  FOREIGN KEY (use_case_id) REFERENCES use_cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY,
  use_case_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  domain TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 0.5,
  verified INTEGER NOT NULL DEFAULT 0,
  observed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (use_case_id) REFERENCES use_cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evaluations (
  id INTEGER PRIMARY KEY,
  use_case_id INTEGER NOT NULL,
  decision TEXT NOT NULL,
  confidence REAL NOT NULL,
  quality_score REAL NOT NULL,
  value_score REAL NOT NULL,
  control_score REAL NOT NULL,
  adoption_score REAL NOT NULL,
  annual_benefit REAL NOT NULL,
  annual_cost REAL NOT NULL,
  first_year_roi REAL NOT NULL,
  blockers_json TEXT NOT NULL,
  warnings_json TEXT NOT NULL,
  conditions_json TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (use_case_id) REFERENCES use_cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_metrics_use_case ON metrics(use_case_id);
CREATE INDEX IF NOT EXISTS idx_controls_use_case ON controls(use_case_id);
CREATE INDEX IF NOT EXISTS idx_evidence_use_case ON evidence(use_case_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_use_case ON evaluations(use_case_id, id DESC);
