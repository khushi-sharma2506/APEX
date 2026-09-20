import asyncio
from fastapi import FastAPI, HTTPException
from concurrent.futures import ThreadPoolExecutor
from database import init_db, get_db_connection

app = FastAPI(title="APEX API")

worker_pool = ThreadPoolExecutor(max_workers=20)

@app.on_event("startup")
def startup_event():
    init_db()

@app.get("/")
def read_root():
    return {"message": "APEX Assessment Engine API"}

def fetch_question_from_db(difficulty: str, topic_id: int, seen_ids: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if not seen_ids:
        seen_ids = "0"
        
    query = f"""
        SELECT * FROM questions 
        WHERE diff_level = ? AND topic_id = ? AND q_id NOT IN ({seen_ids})
        ORDER BY RANDOM() LIMIT 1
    """
    
    cursor.execute(query, (difficulty, topic_id))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return dict(row)
    return None

@app.get("/get_next_question")
async def get_next_question(difficulty: str, topic_id: int, seen_ids: str = ""):
    loop = asyncio.get_running_loop()
    
    question = await loop.run_in_executor(
        worker_pool, 
        fetch_question_from_db, 
        difficulty, 
        topic_id, 
        seen_ids
    )
    
    if not question:
        raise HTTPException(status_code=404, detail="No questions found")
        
    return question

@app.post("/start_session")
def start_session(student_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO student_sessions (student_id) VALUES (?)", (student_id,))
    session_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"session_id": session_id}
