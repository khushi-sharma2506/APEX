import csv
import sqlite3
import os

DB_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "db", "apex.db")
CSV_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "mock_questions.csv")

def import_questions_from_csv():
    """
    Reads a CSV file full of mock questions and inserts them into the SQLite database.
    
    TODO (Member 2):
    - Open the CSV_FILE using Python's csv module.
    - Loop through each row.
    - Write an SQL INSERT statement to put the row data into the 'questions' table.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Your CSV reading and SQL INSERT logic here
    
    conn.commit()
    conn.close()
    print("CSV import complete!")

if __name__ == "__main__":
    import_questions_from_csv()
