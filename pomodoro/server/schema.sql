PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_expiry ON auth_sessions(expires_at);
CREATE TABLE IF NOT EXISTS settings (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 focus_minutes INTEGER NOT NULL DEFAULT 25 CHECK(focus_minutes BETWEEN 1 AND 180),
 short_minutes INTEGER NOT NULL DEFAULT 5 CHECK(short_minutes BETWEEN 1 AND 60),
 long_minutes INTEGER NOT NULL DEFAULT 15 CHECK(long_minutes BETWEEN 1 AND 120),
 long_every INTEGER NOT NULL DEFAULT 4 CHECK(long_every BETWEEN 2 AND 12)
);
CREATE TABLE IF NOT EXISTS projects (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#6c63ff', created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS project_owner ON projects(user_id);
CREATE TABLE IF NOT EXISTS tasks (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 title TEXT NOT NULL, estimated INTEGER NOT NULL DEFAULT 1 CHECK(estimated BETWEEN 1 AND 999),
 done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1)), created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS task_owner ON tasks(user_id);
CREATE TABLE IF NOT EXISTS focus_sessions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
 task_title TEXT NOT NULL, project_title TEXT NOT NULL, project_color TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('focus','short','long')),
 status TEXT NOT NULL CHECK(status IN ('running','paused','completed','cancelled')),
 target_seconds INTEGER NOT NULL CHECK(target_seconds > 0), elapsed_seconds INTEGER NOT NULL DEFAULT 0,
 started_at INTEGER NOT NULL, running_since INTEGER, ended_at INTEGER,
 mood INTEGER CHECK(mood BETWEEN 1 AND 5), distraction TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_session ON focus_sessions(user_id) WHERE status IN ('running','paused');
CREATE INDEX IF NOT EXISTS session_history ON focus_sessions(user_id, ended_at);
CREATE TABLE IF NOT EXISTS weekly_reviews (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 week_start TEXT NOT NULL, wins TEXT NOT NULL DEFAULT '', challenges TEXT NOT NULL DEFAULT '',
 next_week TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,week_start)
);
PRAGMA user_version = 1;
