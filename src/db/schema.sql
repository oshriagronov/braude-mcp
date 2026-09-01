-- D1 SQLite Schema for Braude MCP

-- 1. Academic Calendar Events
CREATE TABLE IF NOT EXISTS academic_calendar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_category TEXT NOT NULL, -- 'semester', 'exam', 'registration', 'holiday', 'other'
  start_date TEXT NOT NULL,
  end_date TEXT,
  description TEXT,
  updated_at TEXT NOT NULL
);

-- 2. Courses Catalog
CREATE TABLE IF NOT EXISTS courses (
  course_code TEXT PRIMARY KEY,
  course_name TEXT NOT NULL,
  department TEXT,
  credits REAL,
  is_taught TEXT,
  description TEXT,
  syllabus_url TEXT,
  updated_at TEXT NOT NULL
);

-- 3. Course Schedule Groups
CREATE TABLE IF NOT EXISTS course_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_code TEXT NOT NULL,
  group_number TEXT NOT NULL,
  group_type TEXT NOT NULL, -- 'lecture', 'recitation', 'lab', 'other'
  group_type_hebrew TEXT NOT NULL,
  instructor TEXT NOT NULL,
  day_of_week TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  location TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (course_code) REFERENCES courses(course_code)
);

-- Indices for rapid query execution
CREATE INDEX IF NOT EXISTS idx_courses_name ON courses(course_name);
CREATE INDEX IF NOT EXISTS idx_courses_dept ON courses(department);
CREATE INDEX IF NOT EXISTS idx_groups_code ON course_groups(course_code);
CREATE INDEX IF NOT EXISTS idx_calendar_year ON academic_calendar(academic_year);
