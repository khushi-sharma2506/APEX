from fastapi import FastAPI
from database import init_db, get_db_connection

# Initialize the FastAPI app
app = FastAPI(
    title="A.P.E.X. API",
    description="Adaptive Paper Engine for eXaminations API",
    version="1.0.0"
)

# Run this when the server starts
@app.on_event("startup")
def startup_event():
    init_db()

@app.get("/")
def read_root():
    return {"message": "Welcome to the A.P.E.X Assessment Engine API!"}

@app.get("/questions/count")
def get_question_count():
    """Returns the total number of questions currently in the database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM questions")
    count = cursor.fetchone()[0]
    conn.close()
    return {"total_questions": count}

# Note to team: To run this server, use the command:
# uvicorn main:app --reload
