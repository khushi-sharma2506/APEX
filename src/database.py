import sqlite3
import os

DB_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "db", "apex.db")

def init_db():
    """Initialize the SQLite database and create the questions table."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Create the core Questions table with the metadata we discussed
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question_text TEXT NOT NULL,
            difficulty TEXT NOT NULL,
            topic TEXT NOT NULL,
            question_type TEXT NOT NULL,
            source_book TEXT
        )
    """)
    
    conn.commit()
    conn.close()
    print(f"Database initialized successfully at {DB_FILE}")

def get_db_connection():
    """Helper function to get a database connection."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row # This lets us access columns by name
    return conn

if __name__ == "__main__":
    init_db()
