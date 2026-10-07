import os
import sqlite3

DB_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "db", "apex.db")

def get_question_by_marks(cursor, marks, topic_id, require_pyq=False):
    """Fetches a random question matching the exact marks and topic."""
    query = "SELECT * FROM questions WHERE marks = ? AND topic_id = ?"
    params = [marks, topic_id]
    
    if require_pyq:
        query += " AND is_pyq = 1"
        
    query += " ORDER BY RANDOM() LIMIT 1"
    cursor.execute(query, params)
    row = cursor.fetchone()
    
    if not row and require_pyq:
        cursor.execute("SELECT * FROM questions WHERE marks = ? AND topic_id = ? ORDER BY RANDOM() LIMIT 1", [marks, topic_id])
        row = cursor.fetchone()
        
    return dict(row) if row else {"question_text": f"Error: No {marks}-mark question found.", "marks": marks}

def generate_university_paper(num_main_questions=3):
    """
    Generates a traditional university paper.
    Each main question is exactly 10 marks, split into:
    (a) 2 marks (Easy)
    (b) 3 marks (Medium)
    (c) 5 marks (Hard / PYQ)
    """
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM topics")
    topics = [dict(t) for t in cursor.fetchall()]
    
    if not topics:
        return {"error": "Database is empty. Please run database.py to initialize data."}
    
    paper = []
    
    for i in range(num_main_questions):
        topic = topics[i % len(topics)]
        
        part_a = get_question_by_marks(cursor, 2, topic["topic_id"])
        part_b = get_question_by_marks(cursor, 3, topic["topic_id"])
        part_c = get_question_by_marks(cursor, 5, topic["topic_id"], require_pyq=True)
        
        main_question = {
            "question_number": i + 1,
            "topic": topic["topic_name"],
            "total_marks": 10,
            "parts": {
                "a": part_a,
                "b": part_b,
                "c": part_c
            }
        }
        paper.append(main_question)
        
    conn.close()
    return paper