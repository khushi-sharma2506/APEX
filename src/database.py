import sqlite3
import os

DB_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "db", "apex.db")

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS topics (
            topic_id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic_name TEXT NOT NULL
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS questions (
            q_id INTEGER PRIMARY KEY AUTOINCREMENT,
            question_text TEXT NOT NULL,
            diff_level TEXT NOT NULL,
            topic_id INTEGER,
            FOREIGN KEY (topic_id) REFERENCES topics (topic_id)
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS student_sessions (
            session_id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT NOT NULL,
            current_score INTEGER DEFAULT 0,
            questions_seen TEXT DEFAULT ''
        )
    """)
    
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_diff_topic ON questions(diff_level, topic_id)")
    
    conn.commit()
    conn.close()

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

if __name__ == "__main__":
    init_db()
