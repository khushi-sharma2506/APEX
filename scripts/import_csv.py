import csv
import sqlite3
import os
import sys

# Add src to path so we can import the database engine
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(__file__)), "src"))
from database import get_db_connection, init_db

CSV_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "db", "questions_bank.csv")

def import_data():
    if not os.path.exists(CSV_PATH):
        print(f"Error: {CSV_PATH} not found. Please create it first!")
        return

    conn = get_db_connection()
    cursor = conn.cursor()
    
    with open(CSV_PATH, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        count = 0
        
        for row in reader:
            # 1. Handle Subject
            cursor.execute("SELECT subject_id FROM subjects WHERE subject_name = ?", (row['subject_name'],))
            res = cursor.fetchone()
            if res:
                sub_id = res['subject_id']
            else:
                cursor.execute("INSERT INTO subjects (subject_name) VALUES (?)", (row['subject_name'],))
                sub_id = cursor.lastrowid
                
            # 2. Handle Topic & Unit
            cursor.execute("SELECT topic_id FROM topics WHERE topic_name = ? AND subject_id = ? AND unit_number = ?", 
                           (row['topic_name'], sub_id, row['unit_number']))
            res = cursor.fetchone()
            if res:
                top_id = res['topic_id']
            else:
                cursor.execute("INSERT INTO topics (subject_id, unit_number, topic_name) VALUES (?, ?, ?)", 
                               (sub_id, row['unit_number'], row['topic_name']))
                top_id = cursor.lastrowid
                
            # 3. Handle Question
            cursor.execute("""
                INSERT INTO questions (topic_id, question_text, question_type, marks, diff_level, is_pyq)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (top_id, row['question_text'], row['question_type'], row['marks'], row['diff_level'], row['is_pyq']))
            q_id = cursor.lastrowid
            
            # 4. Handle MCQ Options
            if row['question_type'].strip().upper() == 'MCQ':
                cursor.execute("""
                    INSERT INTO mcq_options (q_id, opt_a, opt_b, opt_c, opt_d, correct_opt)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (q_id, row['opt_a'], row['opt_b'], row['opt_c'], row['opt_d'], row['correct_opt']))
            
            count += 1
                
    conn.commit()
    conn.close()
    print(f"SUCCESS! {count} questions have been injected into the SQLite database.")

if __name__ == "__main__":
    print("Re-initializing fresh database...")
    init_db()
    print("Importing CSV...")
    import_data()
