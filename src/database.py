import sqlite3
import os
#this is made by rohit sharma
# Define database file path relative to the script directory
DB_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "db", "apex.db")

# Supported difficulty progression levels for adaptive assessments
DIFFICULTY_LEVELS = ["Easy", "Medium", "Hard"]


def get_db_connection():
    """
    Establishes and returns a configured SQLite database connection.
    Applies performance optimizations (WAL mode, busy timeouts, and foreign key enforcement).
    """
    conn = sqlite3.connect(DB_FILE, timeout=10.0)
    conn.row_factory = sqlite3.Row  # Enables column access by name
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")  # Write-Ahead Logging for concurrency
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def migrate_db():
    """
    Non-destructive migration — adds new tables and columns only.
    Safe to call on every startup; existing question data is preserved.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # User management table for role-based authentication (student, teacher, admin)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('student', 'teacher', 'admin'))
        )
    """)

    # Seed default demonstration users if not present (password: pass123)
    cursor.execute("""
        INSERT OR IGNORE INTO users (username, password_hash, role)
        VALUES 
            ('student', '$2b$12$OF4uVgpuKJPGrI3euynInOpqGsfgmM8pMSDP009j9YaTHNvkadEoi', 'student'),
            ('teacher', '$2b$12$OF4uVgpuKJPGrI3euynInOpqGsfgmM8pMSDP009j9YaTHNvkadEoi', 'teacher'),
            ('admin',   '$2b$12$OF4uVgpuKJPGrI3euynInOpqGsfgmM8pMSDP009j9YaTHNvkadEoi', 'admin')
    """)
    
    # Session tokens for authenticated users
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS auth_sessions (
            token TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            role TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL
        )
    """)

    # Academic subjects catalog
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS subjects (
            subject_id   INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_name TEXT NOT NULL UNIQUE
        )
    """)
    
    # Topics mapped to subjects and course units
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS topics (
            topic_id    INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_id  INTEGER NOT NULL,
            unit_number INTEGER NOT NULL,
            topic_name  TEXT NOT NULL,
            FOREIGN KEY (subject_id) REFERENCES subjects (subject_id)
        )
    """)
    
    # Core question bank repository
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS questions (
            q_id          INTEGER PRIMARY KEY AUTOINCREMENT,
            topic_id      INTEGER NOT NULL,
            question_text TEXT NOT NULL,
            question_type TEXT NOT NULL,
            marks         INTEGER NOT NULL,
            diff_level    TEXT NOT NULL,
            is_pyq        BOOLEAN DEFAULT 0,
            FOREIGN KEY (topic_id) REFERENCES topics (topic_id)
        )
    """)
    
    # Multiple choice question options and correct answers
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mcq_options (
            q_id        INTEGER PRIMARY KEY,
            opt_a       TEXT,
            opt_b       TEXT,
            opt_c       TEXT,
            opt_d       TEXT,
            correct_opt TEXT,          -- never returned to student client
            FOREIGN KEY (q_id) REFERENCES questions (q_id)
        )
    """)
    
    # Performance index for adaptive filtering
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_diff_topic ON questions(diff_level, topic_id)"
    )

    # Exam configuration parameters
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS exams (
            exam_id            INTEGER PRIMARY KEY AUTOINCREMENT,
            title              TEXT NOT NULL,
            created_by         TEXT NOT NULL DEFAULT 'teacher',
            num_questions      INTEGER NOT NULL DEFAULT 20,
            duration_secs      INTEGER NOT NULL DEFAULT 1800,
            mode               TEXT NOT NULL DEFAULT 'adaptive',
            start_difficulty   TEXT NOT NULL DEFAULT 'Medium',
            results_released   INTEGER NOT NULL DEFAULT 0,
            review_level       TEXT DEFAULT 'score_and_correctness',
            results_released_at DATETIME,
            created_at         TEXT DEFAULT (datetime('now'))
        )
    """)
    
    # Safe column additions for existing exams table schemas
    try: cursor.execute("ALTER TABLE exams ADD COLUMN review_level TEXT DEFAULT 'score_and_correctness'")
    except sqlite3.OperationalError: pass
    try: cursor.execute("ALTER TABLE exams ADD COLUMN results_released_at DATETIME")
    except sqlite3.OperationalError: pass

    # Exam-to-topic mapping relations
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS exam_topics (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id  INTEGER NOT NULL,
            topic_id INTEGER NOT NULL,
            UNIQUE (exam_id, topic_id),
            FOREIGN KEY (exam_id)  REFERENCES exams (exam_id),
            FOREIGN KEY (topic_id) REFERENCES topics (topic_id)
        )
    """)

    # Active student testing sessions tracking progress and adaptive levels
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS student_sessions (
            session_id          INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id          TEXT NOT NULL,
            current_score       INTEGER DEFAULT 0,
            questions_seen      TEXT DEFAULT '',
            exam_id             INTEGER,
            current_difficulty  TEXT DEFAULT 'Medium',
            submitted_at        TEXT,
            FOREIGN KEY (exam_id) REFERENCES exams (exam_id)
        )
    """)

    # Ensure schema updates for student sessions
    for col_def in [
        ("exam_id",            "INTEGER"),
        ("current_difficulty", "TEXT DEFAULT 'Medium'"),
        ("submitted_at",       "TEXT"),
    ]:
        try:
            cursor.execute(
                f"ALTER TABLE student_sessions ADD COLUMN {col_def[0]} {col_def[1]}"
            )
        except Exception:
            pass  # column already exists — skip

    # Recording student responses per question during an assessment
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS session_responses (
            response_id   INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id    INTEGER NOT NULL,
            q_id          INTEGER NOT NULL,
            chosen_opt    TEXT NOT NULL,
            is_correct    INTEGER NOT NULL,
            marks_awarded INTEGER NOT NULL,
            answered_at   TEXT DEFAULT (datetime('now')),
            UNIQUE (session_id, q_id),          -- prevent double-submit
            FOREIGN KEY (session_id) REFERENCES student_sessions (session_id),
            FOREIGN KEY (q_id)       REFERENCES questions (q_id)
        )
    """)

    # Additional scheduling and batch constraints for exams
    try: cursor.execute("ALTER TABLE exams ADD COLUMN window_open TEXT")
    except sqlite3.OperationalError: pass
    try: cursor.execute("ALTER TABLE exams ADD COLUMN window_close TEXT")
    except sqlite3.OperationalError: pass
    try: cursor.execute("ALTER TABLE exams ADD COLUMN target_batch TEXT DEFAULT 'All'")
    except sqlite3.OperationalError: pass
    try: cursor.execute("ALTER TABLE exams ADD COLUMN late_entry_mins INTEGER DEFAULT 15")
    except sqlite3.OperationalError: pass
    try: cursor.execute("ALTER TABLE student_sessions ADD COLUMN started_at TEXT")
    except sqlite3.OperationalError: pass

    # Question paper blueprints structure
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS blueprints (
          blueprint_id  INTEGER PRIMARY KEY AUTOINCREMENT,
          title         TEXT NOT NULL,
          subject_id    INTEGER NOT NULL,
          target_marks  INTEGER,          -- NULL = no enforcement
          created_by    TEXT NOT NULL,
          created_at    TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (subject_id) REFERENCES subjects(subject_id)
        )
    """)

    # Blueprint breakdown questions definition
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS blueprint_questions (
          bq_id         INTEGER PRIMARY KEY AUTOINCREMENT,
          blueprint_id  INTEGER NOT NULL,
          q_no          INTEGER NOT NULL,  -- 1-based question number
          unit_number   INTEGER NOT NULL,
          offered_n     INTEGER NOT NULL CHECK(offered_n >= 1),
          attempt_k     INTEGER NOT NULL CHECK(attempt_k >= 1),
          marks_per_part INTEGER NOT NULL CHECK(marks_per_part >= 1),
          UNIQUE(blueprint_id, q_no),
          FOREIGN KEY (blueprint_id) REFERENCES blueprints(blueprint_id),
          CHECK(attempt_k <= offered_n)
        )
    """)

    # Blueprint sub-parts configuration
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS blueprint_parts (
          bp_id         INTEGER PRIMARY KEY AUTOINCREMENT,
          bq_id         INTEGER NOT NULL,
          part_label    TEXT NOT NULL,    -- 'a', 'b', 'c', ...
          topic_id      INTEGER,          -- NULL = any topic in the unit
          difficulty    TEXT NOT NULL CHECK(difficulty IN ('Easy','Medium','Hard')),
          FOREIGN KEY (bq_id) REFERENCES blueprint_questions(bq_id),
          FOREIGN KEY (topic_id) REFERENCES topics(topic_id)
        )
    """)

    # Generated final question papers repository
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS generated_papers (
          paper_id      INTEGER PRIMARY KEY AUTOINCREMENT,
          blueprint_id  INTEGER NOT NULL,
          seed          INTEGER NOT NULL,
          blueprint_snap TEXT NOT NULL,   -- JSON snapshot of blueprint at generation time
          generated_at  TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (blueprint_id) REFERENCES blueprints(blueprint_id)
        )
    """)

    # Mapping of generated paper parts to actual bank questions
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS paper_parts (
          pp_id           INTEGER PRIMARY KEY AUTOINCREMENT,
          paper_id        INTEGER NOT NULL,
          q_no            INTEGER NOT NULL,
          part_label      TEXT NOT NULL,
          bank_question_id INTEGER NOT NULL,
          marks           INTEGER NOT NULL,
          UNIQUE(paper_id, bank_question_id),
          FOREIGN KEY (paper_id)          REFERENCES generated_papers(paper_id),
          FOREIGN KEY (bank_question_id)  REFERENCES questions(q_id)
        )
    """)

    conn.commit()
    conn.close()
    print("APEX DB migration complete.")


def advance_difficulty(current: str, is_correct: bool) -> str:
    """Move one level harder on correct, one easier on wrong; clamp to Easy-Hard limits."""
    idx = DIFFICULTY_LEVELS.index(current) if current in DIFFICULTY_LEVELS else 1
    idx = min(2, idx + 1) if is_correct else max(0, idx - 1)
    return DIFFICULTY_LEVELS[idx]


def init_db():
    """Full database reset — development only. Wipes all existing tables and data."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    for tbl in ["session_responses", "mcq_options", "student_sessions",
                "exam_topics", "exams", "questions", "topics", "subjects"]:
        cursor.execute(f"DROP TABLE IF EXISTS {tbl}")
    conn.commit()
    conn.close()
    migrate_db()
    print("Full DB reset complete.")


if __name__ == "__main__":
    migrate_db()