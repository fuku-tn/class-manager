-- Schema chuẩn hóa. Viết theo kiểu SQLite nhưng giữ cấu trúc để chuyển sang Postgres/Supabase
-- gần như 1-1 (xem Documents/3-ky-thuat/code-guide.md, mục "Chuyển sang Supabase").

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'instructor' CHECK (role IN ('admin','instructor')),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS classes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL UNIQUE,          -- vd: P2.BIE.P101.HY.AA.260726
  name       TEXT NOT NULL,
  phase      TEXT,                          -- vd: Phase 1
  start_date TEXT,                          -- ISO yyyy-mm-dd
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','finished','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS class_instructors (
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (class_id, user_id)
);

-- Một người học (duy nhất theo student_code), có thể ghi danh nhiều lớp.
CREATE TABLE IF NOT EXISTS students (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  student_code TEXT NOT NULL UNIQUE,        -- vd: P.13027
  full_name    TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ghi danh = học viên trong một lớp.
CREATE TABLE IF NOT EXISTS enrollments (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id           INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id         INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  customer_id        TEXT,
  mode               TEXT CHECK (mode IN ('Online','Offline','Hybrid')),
  course_status      TEXT NOT NULL DEFAULT 'active'
                     CHECK (course_status IN ('active','deferred','dropped','completed')),
  certificate_status TEXT,
  form               TEXT,
  note               TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (class_id, student_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id     INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  session_no   INTEGER NOT NULL,
  title        TEXT,
  session_date TEXT,
  held         INTEGER NOT NULL DEFAULT 0,  -- 1 khi đã điểm danh -> tính vào mẫu số tỉ lệ
  UNIQUE (class_id, session_no)
);

CREATE TABLE IF NOT EXISTS attendance (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  enrollment_id INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('present','late','absent','excused')),
  note          TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (enrollment_id, session_id)
);

CREATE TABLE IF NOT EXISTS assignments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id   INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'hw' CHECK (kind IN ('hw','capstone')),
  seq        INTEGER NOT NULL,
  title      TEXT NOT NULL,
  due_date   TEXT,
  collected  INTEGER NOT NULL DEFAULT 0,    -- 1 khi đã bắt đầu thu/chấm -> tính vào mẫu số
  UNIQUE (class_id, kind, seq)
);

CREATE TABLE IF NOT EXISTS submissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  enrollment_id INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('submitted','resubmit','missing')),
  challenge     INTEGER NOT NULL DEFAULT 0, -- 1 nếu có làm bài Challenge
  note          TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (enrollment_id, assignment_id)
);

CREATE TABLE IF NOT EXISTS vouchers (
  enrollment_id   INTEGER PRIMARY KEY REFERENCES enrollments(id) ON DELETE CASCADE,
  amount          INTEGER,
  sent_date       TEXT,
  expiration_date TEXT,
  status          TEXT
);

CREATE INDEX IF NOT EXISTS idx_enrollments_class ON enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id);
