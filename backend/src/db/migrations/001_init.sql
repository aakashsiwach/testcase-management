-- Initial schema for the Test Case Management System

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'tester'
                CHECK (role IN ('admin', 'test-lead', 'tester', 'read-only')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX users_email_lower_idx ON users (LOWER(email));

CREATE TABLE projects (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  version     VARCHAR(50) NOT NULL DEFAULT '1.0',
  status      VARCHAR(20) NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'on-hold', 'completed', 'archived')),
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_members (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_members_user_idx ON project_members (user_id);

CREATE TABLE test_cases (
  id             SERIAL PRIMARY KEY,
  project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title          VARCHAR(255) NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  priority       VARCHAR(10) NOT NULL DEFAULT 'Medium'
                 CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
  type           VARCHAR(20) NOT NULL DEFAULT 'Functional'
                 CHECK (type IN ('Functional', 'Integration', 'Regression', 'Smoke', 'UI', 'API')),
  preconditions  TEXT NOT NULL DEFAULT '',
  postconditions TEXT NOT NULL DEFAULT '',
  tags           TEXT[] NOT NULL DEFAULT '{}',
  assigned_to    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  version        INTEGER NOT NULL DEFAULT 1,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX test_cases_project_idx ON test_cases (project_id);
CREATE INDEX test_cases_project_priority_idx ON test_cases (project_id, priority);
CREATE INDEX test_cases_project_type_idx ON test_cases (project_id, type);
CREATE INDEX test_cases_assigned_idx ON test_cases (assigned_to);
CREATE INDEX test_cases_tags_idx ON test_cases USING GIN (tags);
CREATE INDEX test_cases_fts_idx ON test_cases
  USING GIN (to_tsvector('english', title || ' ' || description));

CREATE TABLE test_steps (
  id              SERIAL PRIMARY KEY,
  test_case_id    INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  step_number     INTEGER NOT NULL CHECK (step_number > 0),
  action          TEXT NOT NULL,
  expected_result TEXT NOT NULL DEFAULT '',
  UNIQUE (test_case_id, step_number)
);

CREATE TABLE test_suites (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        VARCHAR(150) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX test_suites_project_idx ON test_suites (project_id);

CREATE TABLE test_suite_cases (
  suite_id     INTEGER NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
  test_case_id INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (suite_id, test_case_id)
);
CREATE INDEX test_suite_cases_case_idx ON test_suite_cases (test_case_id);

CREATE TABLE test_runs (
  id           SERIAL PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  suite_id     INTEGER REFERENCES test_suites(id) ON DELETE SET NULL,
  name         VARCHAR(200) NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'in-progress'
               CHECK (status IN ('in-progress', 'completed', 'aborted')),
  case_ids     INTEGER[] NOT NULL DEFAULT '{}',
  started_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX test_runs_project_idx ON test_runs (project_id, started_at DESC);
CREATE INDEX test_runs_suite_idx ON test_runs (suite_id);

CREATE TABLE test_executions (
  id               SERIAL PRIMARY KEY,
  test_case_id     INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id           INTEGER REFERENCES test_runs(id) ON DELETE SET NULL,
  executed_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status           VARCHAR(10) NOT NULL CHECK (status IN ('Pass', 'Fail', 'Blocked', 'Skipped')),
  comments         TEXT NOT NULL DEFAULT '',
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  executed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX test_executions_case_idx ON test_executions (test_case_id, executed_at DESC);
CREATE INDEX test_executions_project_idx ON test_executions (project_id, executed_at);
CREATE INDEX test_executions_executed_by_idx ON test_executions (executed_by);
CREATE INDEX test_executions_run_idx ON test_executions (run_id);

CREATE TABLE execution_attachments (
  id           SERIAL PRIMARY KEY,
  execution_id INTEGER NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
  filename     VARCHAR(255) NOT NULL,
  mime_type    VARCHAR(100) NOT NULL,
  size_bytes   INTEGER NOT NULL,
  data         BYTEA NOT NULL,
  uploaded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX execution_attachments_exec_idx ON execution_attachments (execution_id);

CREATE TABLE defects (
  id           SERIAL PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  test_case_id INTEGER REFERENCES test_cases(id) ON DELETE SET NULL,
  execution_id INTEGER REFERENCES test_executions(id) ON DELETE SET NULL,
  title        VARCHAR(255) NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  severity     VARCHAR(10) NOT NULL DEFAULT 'Medium'
               CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
  status       VARCHAR(20) NOT NULL DEFAULT 'Open'
               CHECK (status IN ('Open', 'In Progress', 'Resolved', 'Closed')),
  reported_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_to  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX defects_project_status_idx ON defects (project_id, status);
CREATE INDEX defects_case_idx ON defects (test_case_id);

CREATE TABLE test_case_versions (
  id           SERIAL PRIMARY KEY,
  test_case_id INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  version      INTEGER NOT NULL,
  snapshot     JSONB NOT NULL,
  changed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (test_case_id, version)
);

CREATE TABLE test_case_comments (
  id           SERIAL PRIMARY KEY,
  test_case_id INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX test_case_comments_case_idx ON test_case_comments (test_case_id, created_at);

CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  project_id  INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  action      VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id   INTEGER,
  details     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);
CREATE INDEX audit_logs_project_idx ON audit_logs (project_id, created_at DESC);
