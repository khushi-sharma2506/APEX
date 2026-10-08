# APEX - Adaptive Paper Engine for eXaminations

import asyncio
import csv
import io
import time
import os
import sqlite3
from typing import Optional, List
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, UploadFile, File, Body, Cookie, Response, Request, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from concurrent.futures import ThreadPoolExecutor
import bcrypt
import uuid
import sys

# Ensure src/ folder is in sys.path so modules like database, cache, etc. are found from anywhere
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import migrate_db, get_db_connection, advance_difficulty, DIFFICULTY_LEVELS
from blueprint import generate_university_paper
from cache import ram_cache
from paper_engine import validate_blueprint, generate_paper as engine_generate_paper
import json as _json

app = FastAPI(title="APEX API - Adaptive Paper Engine for eXaminations")
worker_pool = ThreadPoolExecutor(max_workers=20)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

_cache_hits = 0
_cache_misses = 0
_latency_log: list[float] = []

@app.on_event("startup")
def startup_event():
    migrate_db()


class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/login")
def login(req: LoginRequest, response: Response):
    conn = get_db_connection()
    user = conn.execute("SELECT * FROM users WHERE username=?", (req.username,)).fetchone()
    if not user:
        conn.close()
        raise HTTPException(401, "Wrong enrollment number or password")
    
    if not bcrypt.checkpw(req.password.encode(), user["password_hash"].encode()):
        conn.close()
        raise HTTPException(401, "Wrong enrollment number or password")
    
    token = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO auth_sessions (token, username, role, expires_at) VALUES (?, ?, ?, datetime('now', '+2 hours'))",
        (token, user["username"], user["role"])
    )
    conn.commit()
    conn.close()
    
    response.set_cookie(key="apex_session", value=token, httponly=True, samesite="lax")
    return {"status": "ok", "role": user["role"], "username": user["username"]}

@app.post("/logout")
def logout(response: Response, apex_session: Optional[str] = Cookie(None)):
    if apex_session:
        conn = get_db_connection()
        conn.execute("DELETE FROM auth_sessions WHERE token=?", (apex_session,))
        conn.commit()
        conn.close()
    response.delete_cookie("apex_session")
    return {"status": "ok"}

def get_current_user(apex_session: Optional[str] = Cookie(None)):
    if not apex_session:
        raise HTTPException(401, "Not authenticated")
    conn = get_db_connection()
    session = conn.execute(
        "SELECT * FROM auth_sessions WHERE token=? AND expires_at > datetime('now')", 
        (apex_session,)
    ).fetchone()
    conn.close()
    if not session:
        raise HTTPException(401, "Session expired or invalid")
    return dict(session)

def require_role(user: dict, allowed_roles: List[str]):
    if user["role"] not in allowed_roles:
        raise HTTPException(403, "You do not have permission to perform this action.")
    return user

def require_student(user: dict = Depends(get_current_user)):
    return require_role(user, ["student"])

def require_teacher(user: dict = Depends(get_current_user)):
    return require_role(user, ["teacher", "admin"])

def require_admin(user: dict = Depends(get_current_user)):
    return require_role(user, ["admin"])

@app.get("/me")
def get_me(user: dict = Depends(get_current_user)):
    return {"username": user["username"], "role": user["role"]}

@app.get("/")
def read_root():
    return {"message": "APEX Assessment Engine API is Running!"}

@app.get("/subjects")
def get_subjects(user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM subjects WHERE is_private=0 OR owner=? ORDER BY subject_name", (user['username'],)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

class CreateSubjectReq(BaseModel):
    subject_name: str
    is_private: bool = False

@app.post("/subjects")
def create_subject(req: CreateSubjectReq, user: dict = Depends(require_teacher)):
    conn = get_db_connection()
    cursor = conn.cursor()
    existing = cursor.execute("SELECT * FROM subjects WHERE subject_name=? AND (is_private=0 OR owner=?)", (req.subject_name, user['username'])).fetchone()
    if existing:
        conn.close()
        raise HTTPException(400, "Subject already exists")
    
    is_priv = 1 if req.is_private else 0
    cursor.execute("INSERT INTO subjects (subject_name, is_private, owner) VALUES (?, ?, ?)", 
                   (req.subject_name, is_priv, user['username']))
    sub_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"subject_id": sub_id, "subject_name": req.subject_name, "is_private": is_priv, "owner": user['username']}

@app.get("/topics")
def get_topics(subject_id: Optional[int] = None):
    conn = get_db_connection()
    q = ("SELECT * FROM topics WHERE subject_id=? ORDER BY unit_number, topic_name"
         if subject_id else
         "SELECT * FROM topics ORDER BY subject_id, unit_number, topic_name")
    rows = conn.execute(q, (subject_id,) if subject_id else ()).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/questions")
def get_questions(
    subject_id: Optional[int] = None,
    unit_number: Optional[int] = None,
    topic_id: Optional[int] = None,
    diff_level: Optional[str] = None,
    question_type: Optional[str] = None,
    is_pyq: Optional[int] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
):
    conn = get_db_connection()
    filters, params = [], []
    base = """
        SELECT q.q_id, q.question_text, q.question_type, q.marks, q.diff_level,
               q.is_pyq, q.topic_id, t.topic_name, t.unit_number,
               s.subject_id, s.subject_name
        FROM questions q
        JOIN topics   t ON q.topic_id  = t.topic_id
        JOIN subjects s ON t.subject_id = s.subject_id
    """
    if subject_id:    filters.append("s.subject_id=?");       params.append(subject_id)
    if unit_number:   filters.append("t.unit_number=?");      params.append(unit_number)
    if topic_id:      filters.append("q.topic_id=?");         params.append(topic_id)
    if diff_level:    filters.append("q.diff_level=?");       params.append(diff_level)
    if question_type: filters.append("q.question_type=?");    params.append(question_type)
    if is_pyq is not None: filters.append("q.is_pyq=?");      params.append(is_pyq)
    if search:        filters.append("q.question_text LIKE ?"); params.append(f"%{search}%")

    where  = ("WHERE " + " AND ".join(filters)) if filters else ""
    join   = "JOIN topics t ON q.topic_id=t.topic_id JOIN subjects s ON t.subject_id=s.subject_id"
    total  = conn.execute(f"SELECT COUNT(*) FROM questions q {join} {where}", params).fetchone()[0]
    offset = (page - 1) * page_size
    rows   = conn.execute(f"{base} {where} ORDER BY q.q_id LIMIT ? OFFSET ?",
                          params + [page_size, offset]).fetchall()
    conn.close()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "questions": [dict(r) for r in rows]
    }

@app.get("/questions/{q_id}")
def get_question_detail(q_id: int):
    conn = get_db_connection()
    q = conn.execute("SELECT * FROM questions WHERE q_id=?", (q_id,)).fetchone()
    if not q:
        conn.close()
        raise HTTPException(404, "Question not found")
    result = dict(q)
    opts = conn.execute("SELECT * FROM mcq_options WHERE q_id=?", (q_id,)).fetchone()
    if opts:
        result.update(dict(opts))
    conn.close()
    return result

@app.delete("/questions/{q_id}")
def delete_question(q_id: int):
    conn = get_db_connection()
    conn.execute("DELETE FROM mcq_options WHERE q_id=?", (q_id,))
    conn.execute("DELETE FROM questions WHERE q_id=?", (q_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted", "q_id": q_id}

REQUIRED_COLUMNS = {
    "question_text", "marks", "diff_level", "is_pyq", "question_type",
    "opt_a", "opt_b", "opt_c", "opt_d", "correct_opt",
    "subject_name", "topic_name", "unit_number"
}

def _normalize(text):
    if not text: return ""
    import re
    return re.sub(r'\s+', ' ', text.strip().lower())

def _import_rows(rows):
    conn = get_db_connection()
    cursor = conn.cursor()
    imported, errors, skipped = 0, [], 0
    for idx, row in enumerate(rows, 2):
        try:
            row = {k.strip(): v.strip() if isinstance(v, str) else v for k, v in row.items()}
            qtext = row["question_text"]
            norm_qtext = _normalize(qtext)
            
            existing = cursor.execute("SELECT q_id, question_text FROM questions").fetchall()
            is_dup = False
            for ex in existing:
                if _normalize(ex["question_text"]) == norm_qtext:
                    is_dup = True
                    break
            if is_dup:
                skipped += 1
                continue

            r = cursor.execute("SELECT subject_id FROM subjects WHERE subject_name=?",
                               (row["subject_name"],)).fetchone()
            if r:
                sub_id = r["subject_id"]
            else:
                cursor.execute("INSERT INTO subjects(subject_name) VALUES(?)", (row["subject_name"],))
                sub_id = cursor.lastrowid

            r = cursor.execute(
                "SELECT topic_id FROM topics WHERE topic_name=? AND subject_id=? AND unit_number=?",
                (row["topic_name"], sub_id, row["unit_number"])
            ).fetchone()
            if r:
                top_id = r["topic_id"]
            else:
                cursor.execute(
                    "INSERT INTO topics(subject_id,unit_number,topic_name) VALUES(?,?,?)",
                    (sub_id, row["unit_number"], row["topic_name"])
                )
                top_id = cursor.lastrowid

            cursor.execute(
                "INSERT INTO questions(topic_id,question_text,question_type,marks,diff_level,is_pyq) VALUES(?,?,?,?,?,?)",
                (top_id, qtext, row["question_type"],
                 int(row["marks"]), row["diff_level"], int(row["is_pyq"]))
            )
            q_id = cursor.lastrowid

            if row["question_type"].strip().upper() == "MCQ":
                cursor.execute(
                    "INSERT INTO mcq_options(q_id,opt_a,opt_b,opt_c,opt_d,correct_opt) VALUES(?,?,?,?,?,?)",
                    (q_id, row.get("opt_a"), row.get("opt_b"),
                     row.get("opt_c"), row.get("opt_d"), row.get("correct_opt"))
                )
            imported += 1
        except Exception as e:
            errors.append({"row": idx, "error": str(e)})
    conn.commit()
    conn.close()
    return {"imported": imported, "skipped": skipped, "errors": errors}

@app.post("/upload_csv")
async def upload_csv(file: UploadFile = File(...), dry_run: bool = False):
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "File must be UTF-8 encoded")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(400, "CSV has no headers")
    missing = REQUIRED_COLUMNS - {f.strip() for f in reader.fieldnames}
    if missing:
        raise HTTPException(400, f"Missing columns: {missing}")
    rows = [dict(r) for r in reader]
    if dry_run:
        return {"row_count": len(rows), "preview": rows[:5], "errors": []}
    result = _import_rows(rows)
    return {"row_count": len(rows), "preview": rows[:5], **result}

@app.get("/generate_paper")
async def generate_paper(num_questions: int = 3):
    loop = asyncio.get_running_loop()
    paper = await loop.run_in_executor(worker_pool, generate_university_paper, num_questions)
    return {"status": "success", "exam_paper": paper}


class BlueprintSection(BaseModel):
    name: str
    topic: str
    diff: str
    type: str
    n: int
    k: int
    m: int

class BlueprintRequest(BaseModel):
    title: str = "Paper"
    subject: str
    adaptive: bool
    secs: list[BlueprintSection]

@app.post("/generate_blueprint")
def generate_blueprint(req: BlueprintRequest, user: dict = Depends(require_teacher)):
    conn = get_db_connection()
    paper = []
    
    for sec in req.secs:
        query = "SELECT q.*, t.topic_name, s.subject_name FROM questions q JOIN topics t ON q.topic_id = t.topic_id JOIN subjects s ON t.subject_id = s.subject_id WHERE s.subject_name = ? AND q.diff_level = ? AND q.question_type = ? AND q.marks = ?"
        params = [req.subject, sec.diff, sec.type, sec.m]
        
        if sec.topic != 'any':
            query += " AND t.topic_name = ?"
            params.append(sec.topic)
            
        query += " ORDER BY RANDOM() LIMIT ?"
        params.append(sec.n)
        
        cursor = conn.execute(query, params)
        rows = [dict(r) for r in cursor.fetchall()]
        
        for r in rows:
            if r["question_type"] == "MCQ":
                opts = conn.execute("SELECT * FROM mcq_options WHERE q_id = ?", (r["q_id"],)).fetchone()
                if opts:
                    r["opts"] = dict(opts)
        
        paper.append({
            "section_name": sec.name,
            "questions": rows,
            "offered": sec.n,
            "attempt": sec.k,
            "marks_each": sec.m
        })
        
    conn.close()
    return {"status": "success", "paper": paper}

class CreateExamRequest(BaseModel):
    title: str
    topic_ids: str          # comma-separated topic_id integers
    num_questions: int = 15
    duration_secs: int = 1800
    mode: str = "adaptive"  # "adaptive" | "fixed"
    start_difficulty: str = "Medium"
    review_level: str = "score_and_correctness"
    window_open: Optional[str] = None    # ISO datetime or None (open immediately)
    window_close: Optional[str] = None   # ISO datetime or None (never closes)
    category: str = "Formal"
    max_attempts: int = 1

@app.get("/exams")
def list_exams(user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    exams = [dict(r) for r in conn.execute("SELECT * FROM exams ORDER BY created_at DESC").fetchall()]
    for ex in exams:
        topic_rows = conn.execute(
            """SELECT t.topic_id, t.topic_name, t.unit_number, s.subject_name
               FROM exam_topics et
               JOIN topics   t ON et.topic_id  = t.topic_id
               JOIN subjects s ON t.subject_id = s.subject_id
               WHERE et.exam_id = ?""", (ex["exam_id"],)
        ).fetchall()
        ex["topics"] = [dict(r) for r in topic_rows]
        sub_count = conn.execute(
            "SELECT COUNT(*) FROM student_sessions WHERE exam_id=? AND submitted_at IS NOT NULL",
            (ex["exam_id"],)
        ).fetchone()[0]
        total_enrolled = conn.execute(
            "SELECT COUNT(*) FROM student_sessions WHERE exam_id=?",
            (ex["exam_id"],)
        ).fetchone()[0]
        ex["submissions_count"] = sub_count
        ex["enrolled_count"] = total_enrolled
        pending_mark = conn.execute(
            """SELECT COUNT(*) FROM session_responses sr
               JOIN questions q ON sr.q_id = q.q_id
               JOIN student_sessions ss ON sr.session_id = ss.session_id
               WHERE ss.exam_id=? AND q.question_type='SUBJECTIVE' AND sr.marks_awarded=0 AND sr.is_correct=0""",
            (ex["exam_id"],)
        ).fetchone()[0]
        ex["pending_marking"] = pending_mark
        if ex.get("results_released"):
            ex["computed_status"] = "released"
        elif pending_mark > 0:
            ex["computed_status"] = "marking"
        elif sub_count > 0 and sub_count >= total_enrolled and total_enrolled > 0:
            ex["computed_status"] = "ready"
        elif ex.get("window_close") and ex["window_close"] < "now":
            ex["computed_status"] = "ready"
        else:
            ex["computed_status"] = "open"
    conn.close()
    return exams

import random
import string

@app.post("/exams")
def create_exam(req: CreateExamRequest, user: dict = Depends(require_teacher)):
    ids = [int(x.strip()) for x in req.topic_ids.split(",") if x.strip().isdigit()]
    if not ids:
        raise HTTPException(400, "At least one valid topic_id is required")
    passkey = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO exams(title, created_by, num_questions, duration_secs, mode, start_difficulty, results_released, review_level, window_open, window_close, passkey, category, max_attempts)
           VALUES(?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)""",
        (req.title, user["username"], req.num_questions, req.duration_secs,
         req.mode, req.start_difficulty, req.review_level,
         req.window_open, req.window_close, passkey, req.category, req.max_attempts)
    )
    exam_id = cursor.lastrowid
    for tid in ids:
        cursor.execute("INSERT OR IGNORE INTO exam_topics(exam_id, topic_id) VALUES(?, ?)", (exam_id, tid))
    conn.commit()
    conn.close()
    return {"exam_id": exam_id, "title": req.title}

class ReleaseExamRequest(BaseModel):
    released: bool
    review_level: Optional[str] = None  # score_only | score_and_correctness | full_review | hidden

@app.patch("/exams/{exam_id}/release")
def toggle_results(exam_id: int, req: ReleaseExamRequest, user: dict = Depends(require_teacher)):
    conn = get_db_connection()
    exam = conn.execute("SELECT * FROM exams WHERE exam_id=?", (exam_id,)).fetchone()
    if not exam:
        conn.close()
        raise HTTPException(404, "Exam not found")
    level = req.review_level or exam["review_level"] or "score_and_correctness"
    if req.released:
        conn.execute(
            "UPDATE exams SET results_released=1, results_released_at=datetime('now'), review_level=? WHERE exam_id=?",
            (level, exam_id)
        )
    else:
        conn.execute(
            "UPDATE exams SET results_released=0, results_released_at=NULL, review_level=? WHERE exam_id=?",
            (level, exam_id)
        )
    conn.commit()
    conn.close()
    return {"exam_id": exam_id, "results_released": req.released, "review_level": level}

@app.delete("/exams/{exam_id}")
def delete_exam(exam_id: int, user: dict = Depends(require_teacher)):
    conn = get_db_connection()
    conn.execute("DELETE FROM exam_topics WHERE exam_id=?", (exam_id,))
    conn.execute("DELETE FROM session_responses WHERE session_id IN (SELECT session_id FROM student_sessions WHERE exam_id=?)", (exam_id,))
    conn.execute("DELETE FROM student_sessions WHERE exam_id=?", (exam_id,))
    conn.execute("DELETE FROM exams WHERE exam_id=?", (exam_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

def _get_seen_ids(cursor, session_id: int) -> list[int]:
    rows = cursor.execute(
        "SELECT q_id FROM session_responses WHERE session_id=?", (session_id,)
    ).fetchall()
    return [r["q_id"] for r in rows]

def _pick_question_safe(cursor, topic_ids: list[int], target_diff: str, seen_ids: list[int]):
    """
    Server-side question selection algorithm:
    1. Try questions matching target_diff first.
    2. If no un-seen question exists at target_diff, step towards nearest level (clamped to Easy/Medium/Hard).
    3. Never repeats a question seen in this session.
    4. NEVER returns correct_opt, marks, or diff_level to the client!
    """
    global _cache_hits, _cache_misses
    t0 = time.perf_counter()

    safe_seen = ",".join(str(i) for i in seen_ids) if seen_ids else "0"
    topic_ph = ",".join("?" * len(topic_ids))

    idx = DIFFICULTY_LEVELS.index(target_diff) if target_diff in DIFFICULTY_LEVELS else 1
    levels_to_try = [target_diff]
    for step in [1, -1, 2, -2]:
        nl = idx + step
        if 0 <= nl <= 2:
            lv = DIFFICULTY_LEVELS[nl]
            if lv not in levels_to_try:
                levels_to_try.append(lv)

    chosen_row = None
    level_used = target_diff

    for lv in levels_to_try:
        cache_key = f"{lv}_{sorted(topic_ids)}_{safe_seen}"
        cached = ram_cache.get(cache_key)
        latency = (time.perf_counter() - t0) * 1000
        if cached:
            _cache_hits += 1
            _latency_log.append(latency)
            if len(_latency_log) > 200: _latency_log.pop(0)
            return {
                "q_id": cached["q_id"],
                "question_text": cached["question_text"],
                "opt_a": cached["opt_a"],
                "opt_b": cached["opt_b"],
                "opt_c": cached["opt_c"],
                "opt_d": cached["opt_d"],
            }

        cursor.execute(
            f"""SELECT q.q_id, q.question_text, mo.opt_a, mo.opt_b, mo.opt_c, mo.opt_d, mo.correct_opt
                FROM questions q
                LEFT JOIN mcq_options mo ON q.q_id = mo.q_id
                WHERE q.diff_level=? AND q.topic_id IN ({topic_ph})
                  AND q.question_type='MCQ'
                  AND q.q_id NOT IN ({safe_seen})
                ORDER BY RANDOM() LIMIT 1""",
            [lv] + topic_ids,
        )
        row = cursor.fetchone()
        if row:
            chosen_row = dict(row)
            level_used = lv
            break

    latency = (time.perf_counter() - t0) * 1000
    _latency_log.append(latency)
    if len(_latency_log) > 200: _latency_log.pop(0)

    if not chosen_row:
        _cache_misses += 1
        return None

    _cache_misses += 1
    cache_key = f"{level_used}_{sorted(topic_ids)}_{safe_seen}"
    ram_cache.put(cache_key, chosen_row)

    return {
        "q_id": chosen_row["q_id"],
        "question_text": chosen_row["question_text"],
        "opt_a": chosen_row["opt_a"],
        "opt_b": chosen_row["opt_b"],
        "opt_c": chosen_row["opt_c"],
        "opt_d": chosen_row["opt_d"],
    }

class StartSessionRequest(BaseModel):
    exam_id: int
    student_id: str

@app.post("/start_session")
def start_session(req: StartSessionRequest):
    conn = get_db_connection()
    exam = conn.execute("SELECT * FROM exams WHERE exam_id=?", (req.exam_id,)).fetchone()
    if not exam:
        conn.close()
        raise HTTPException(404, "Exam not found")
    exam = dict(exam)

    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO student_sessions
               (student_id, exam_id, current_difficulty, current_score, questions_seen)
           VALUES (?, ?, ?, 0, '')""",
        (req.student_id, req.exam_id, exam["start_difficulty"])
    )
    session_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {
        "session_id": session_id,
        "student_id": req.student_id,
        "exam_id": req.exam_id,
        "exam_title": exam["title"],
        "num_questions": exam["num_questions"],
        "duration_secs": exam["duration_secs"],
    }

@app.get("/session/{session_id}")
def get_session(session_id: int):
    conn = get_db_connection()
    s = conn.execute("SELECT * FROM student_sessions WHERE session_id=?", (session_id,)).fetchone()
    if not s:
        conn.close()
        raise HTTPException(404, "Session not found")
    s = dict(s)
    answered = conn.execute(
        "SELECT COUNT(*) FROM session_responses WHERE session_id=?", (session_id,)
    ).fetchone()[0]
    exam = conn.execute("SELECT title, num_questions, duration_secs FROM exams WHERE exam_id=?", (s["exam_id"],)).fetchone()
    conn.close()

    return {
        "session_id": s["session_id"],
        "student_id": s["student_id"],
        "exam_id": s["exam_id"],
        "exam_title": exam["title"] if exam else "Adaptive Exam",
        "num_questions": exam["num_questions"] if exam else 20,
        "duration_secs": exam["duration_secs"] if exam else 1800,
        "answered": answered,
        "submitted_at": s["submitted_at"],
    }

@app.post("/session/{session_id}/next")
def get_session_next_question(session_id: int):
    """
    Returns the current or next question to answer.
    Safe: Never returns correct_opt, marks, or difficulty to client.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    s = cursor.execute("SELECT * FROM student_sessions WHERE session_id=?", (session_id,)).fetchone()
    if not s:
        conn.close()
        raise HTTPException(404, "Session not found")
    s = dict(s)

    if s.get("submitted_at"):
        conn.close()
        return {"finished": True}

    exam = cursor.execute("SELECT * FROM exams WHERE exam_id=?", (s["exam_id"],)).fetchone()
    if not exam:
        conn.close()
        raise HTTPException(404, "Exam not found")
    exam = dict(exam)

    answered_count = cursor.execute(
        "SELECT COUNT(*) FROM session_responses WHERE session_id=?", (session_id,)
    ).fetchone()[0]

    if answered_count >= exam["num_questions"]:
        cursor.execute("UPDATE student_sessions SET submitted_at=datetime('now') WHERE session_id=?", (session_id,))
        conn.commit()
        conn.close()
        return {"finished": True}

    topic_rows = cursor.execute(
        "SELECT topic_id FROM exam_topics WHERE exam_id=?", (s["exam_id"],)
    ).fetchall()
    topic_ids = [r["topic_id"] for r in topic_rows]
    if not topic_ids:
        conn.close()
        raise HTTPException(500, "Exam has no topics assigned")

    seen_ids = _get_seen_ids(cursor, session_id)
    target_diff = s.get("current_difficulty") or exam["start_difficulty"]

    question = _pick_question_safe(cursor, topic_ids, target_diff, seen_ids)
    conn.close()

    if question is None:
        return {"finished": True, "reason": "pool_exhausted"}

    return {
        "finished": False,
        "question_number": answered_count + 1,
        "total_questions": exam["num_questions"],
        "question": question,
    }

class SubmitAnswerRequest(BaseModel):
    q_id: int
    chosen_opt: str

@app.post("/session/{session_id}/answer")
def submit_answer_and_get_next(session_id: int, req: SubmitAnswerRequest):
    """
    1. Server-side grading (client NEVER passes correct option or score).
    2. Adaptive difficulty adjustment on server (Easy <-> Medium <-> Hard).
    3. Records response in session_responses audit table.
    4. Returns ONLY the next question (or finished).
       NEVER returns correctness, running score, or correct_opt.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    s = cursor.execute("SELECT * FROM student_sessions WHERE session_id=?", (session_id,)).fetchone()
    if not s:
        conn.close()
        raise HTTPException(404, "Session not found")
    s = dict(s)

    if s.get("submitted_at"):
        conn.close()
        return {"finished": True}

    q_row = cursor.execute("SELECT marks FROM questions WHERE q_id=?", (req.q_id,)).fetchone()
    if not q_row:
        conn.close()
        raise HTTPException(404, f"Question {req.q_id} not found")
    marks = q_row["marks"]

    opt_row = cursor.execute("SELECT correct_opt FROM mcq_options WHERE q_id=?", (req.q_id,)).fetchone()
    correct_opt = opt_row["correct_opt"].strip().upper() if opt_row and opt_row["correct_opt"] else None
    is_correct = (correct_opt is not None and req.chosen_opt.strip().upper() == correct_opt)
    marks_awarded = marks if is_correct else 0

    cursor.execute(
        """INSERT OR IGNORE INTO session_responses
               (session_id, q_id, chosen_opt, is_correct, marks_awarded)
           VALUES (?, ?, ?, ?, ?)""",
        (session_id, req.q_id, req.chosen_opt.strip().upper(), int(is_correct), marks_awarded)
    )

    current_diff = s.get("current_difficulty", "Medium")
    new_diff = advance_difficulty(current_diff, is_correct)
    cursor.execute(
        "UPDATE student_sessions SET current_difficulty=? WHERE session_id=?",
        (new_diff, session_id)
    )

    exam = cursor.execute("SELECT * FROM exams WHERE exam_id=?", (s["exam_id"],)).fetchone()
    exam = dict(exam)
    answered_count = cursor.execute(
        "SELECT COUNT(*) FROM session_responses WHERE session_id=?", (session_id,)
    ).fetchone()[0]

    if answered_count >= exam["num_questions"]:
        cursor.execute("UPDATE student_sessions SET submitted_at=datetime('now') WHERE session_id=?", (session_id,))
        conn.commit()
        conn.close()
        return {"finished": True}

    topic_rows = cursor.execute("SELECT topic_id FROM exam_topics WHERE exam_id=?", (s["exam_id"],)).fetchall()
    topic_ids = [r["topic_id"] for r in topic_rows]
    seen_ids = _get_seen_ids(cursor, session_id)

    next_q = _pick_question_safe(cursor, topic_ids, new_diff, seen_ids)
    conn.commit()
    conn.close()

    if next_q is None:
        return {"finished": True, "reason": "pool_exhausted"}

    return {
        "finished": False,
        "question_number": answered_count + 1,
        "total_questions": exam["num_questions"],
        "question": next_q,
    }

@app.post("/session/{session_id}/submit")
def force_submit(session_id: int):
    conn = get_db_connection()
    conn.execute(
        "UPDATE student_sessions SET submitted_at=datetime('now') WHERE session_id=? AND submitted_at IS NULL",
        (session_id,)
    )
    conn.commit()
    conn.close()
    return {"status": "submitted"}

@app.get("/results/{session_id}")
def get_results(session_id: int, student_id: str):
    """
    Enforces review_level logic on the server:
    hidden / not released -> status: submitted
    score_only -> total_score
    score_and_correctness -> is_correct per question
    full_review -> chosen_opt, correct_opt, explanation per question
    """
    conn = get_db_connection()
    s = conn.execute("SELECT * FROM student_sessions WHERE session_id=?", (session_id,)).fetchone()
    if not s:
        conn.close()
        raise HTTPException(404, "Session not found")
    s = dict(s)

    if str(s["student_id"]) != str(student_id):
        conn.close()
        raise HTTPException(403, "You do not have permission to view this session's results.")

    if not s.get("submitted_at"):
        conn.close()
        raise HTTPException(403, "Exam has not been submitted yet.")

    exam = conn.execute("SELECT * FROM exams WHERE exam_id=?", (s["exam_id"],)).fetchone()
    if not exam:
        conn.close()
        raise HTTPException(404, "Associated exam not found")
    exam = dict(exam)

    if not exam.get("results_released") and not exam.get("results_released_at"):
        conn.close()
        return {"status": "submitted"}

    review_level = exam.get("review_level") or "score_and_correctness"
    if review_level == "hidden":
        conn.close()
        return {"status": "submitted"}

    responses = conn.execute(
        """SELECT sr.q_id, sr.chosen_opt, sr.is_correct, sr.marks_awarded,
                  q.marks, q.question_text, q.question_type, t.topic_name,
                  mo.correct_opt
           FROM session_responses sr
           JOIN questions q ON sr.q_id = q.q_id
           JOIN topics    t ON q.topic_id = t.topic_id
           LEFT JOIN mcq_options mo ON q.q_id = mo.q_id
           WHERE sr.session_id=?""",
        (session_id,)
    ).fetchall()

    has_pending_subjective = any(r["question_type"] == "SUBJECTIVE" and r["marks_awarded"] is None for r in responses)

    if has_pending_subjective:
        conn.close()
        return {
            "status": "pending_marking",
            "message": "Subjective questions are pending marking by the instructor."
        }

    total_score = sum((r["marks_awarded"] or 0) for r in responses)
    max_score = sum((r["marks"] or 0) for r in responses)

    res = {
        "status": "released",
        "review_level": review_level,
        "session_id": session_id,
        "exam_title": exam["title"],
        "total_score": total_score,
        "max_score": max_score,
        "submitted_at": s["submitted_at"]
    }

    if review_level in ["score_and_correctness", "full_review"]:
        redacted_responses = []
        for r in responses:
            item = {
                "q_id": r["q_id"],
                "topic_name": r["topic_name"],
                "marks_awarded": r["marks_awarded"],
                "marks": r["marks"],
                "is_correct": bool(r["is_correct"])
            }
            if review_level == "full_review":
                item["question_text"] = r["question_text"]
                item["chosen_opt"] = r["chosen_opt"]
                item["correct_opt"] = r["correct_opt"]
            redacted_responses.append(item)
        res["responses"] = redacted_responses

    conn.close()
    return res

@app.get("/cache/stats")
def cache_stats():
    total = _cache_hits + _cache_misses
    hit_ratio = round(_cache_hits / total * 100, 1) if total else 0
    lats = sorted(_latency_log)
    avg_lat = round(sum(lats) / len(lats), 2) if lats else 0
    p95_lat = round(lats[int(len(lats) * 0.95)], 2) if len(lats) > 1 else 0
    with ram_cache.lock:
        contents = list(ram_cache.cache.keys())
        cache_size = len(ram_cache.cache)
    return {
        "hits": _cache_hits,
        "misses": _cache_misses,
        "hit_ratio_pct": hit_ratio,
        "avg_latency_ms": avg_lat,
        "p95_latency_ms": p95_lat,
        "cache_size": cache_size,
        "cache_capacity": ram_cache.capacity,
        "cache_contents": contents[-10:],
    }

@app.post("/cache/reset")
def reset_cache():
    global _cache_hits, _cache_misses
    _cache_hits = _cache_misses = 0
    _latency_log.clear()
    with ram_cache.lock:
        ram_cache.cache.clear()
    return {"status": "cache cleared"}


@app.get("/topics/by-unit")
def topics_by_unit(subject_id: int):
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT t.*, s.subject_name FROM topics t JOIN subjects s ON t.subject_id=s.subject_id WHERE t.subject_id=? ORDER BY t.unit_number, t.topic_name",
        (subject_id,)
    ).fetchall()
    conn.close()
    groups: dict[int, list] = {}
    for r in rows:
        d = dict(r)
        groups.setdefault(d["unit_number"], []).append(d)
    return [{"unit_number": u, "topics": ts} for u, ts in sorted(groups.items())]


@app.get("/pool-check")
def pool_check(subject_id: int, topic_ids: str = "", mode: str = "adaptive"):
    conn = get_db_connection()
    ids = [int(x) for x in topic_ids.split(",") if x.strip().isdigit()]
    q_type = "MCQ" if mode == "adaptive" else "SUBJECTIVE"
    placeholders = ",".join("?" * len(ids)) if ids else "0"
    by_diff = {}
    for diff in ["Easy", "Medium", "Hard"]:
        if ids:
            cnt = conn.execute(
                f"SELECT COUNT(*) FROM questions q JOIN topics t ON q.topic_id=t.topic_id WHERE t.subject_id=? AND q.topic_id IN ({placeholders}) AND q.diff_level=? AND q.question_type=?",
                [subject_id] + ids + [diff, q_type]
            ).fetchone()[0]
        else:
            cnt = conn.execute(
                "SELECT COUNT(*) FROM questions q JOIN topics t ON q.topic_id=t.topic_id WHERE t.subject_id=? AND q.diff_level=? AND q.question_type=?",
                [subject_id, diff, q_type]
            ).fetchone()[0]
        by_diff[diff] = cnt
    total = sum(by_diff.values())
    conn.close()
    return {"total": total, "by_difficulty": by_diff}



class BlueprintPartIn(BaseModel):
    part_label: str
    topic_id: Optional[int] = None
    difficulty: str

class BlueprintQuestionIn(BaseModel):
    q_no: int
    unit_number: int
    offered_n: int
    attempt_k: int
    marks_per_part: int
    parts: list[BlueprintPartIn]

class BlueprintIn(BaseModel):
    title: str
    subject_id: int
    target_marks: Optional[int] = None
    questions: list[BlueprintQuestionIn]

@app.post("/blueprints")
def create_blueprint(req: BlueprintIn, user: dict = Depends(require_teacher)):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO blueprints(title, subject_id, target_marks, created_by) VALUES(?,?,?,?)",
        (req.title, req.subject_id, req.target_marks, user["username"])
    )
    bp_id = cur.lastrowid
    for q in req.questions:
        cur.execute(
            "INSERT INTO blueprint_questions(blueprint_id,q_no,unit_number,offered_n,attempt_k,marks_per_part) VALUES(?,?,?,?,?,?)",
            (bp_id, q.q_no, q.unit_number, q.offered_n, q.attempt_k, q.marks_per_part)
        )
        bq_id = cur.lastrowid
        for p in q.parts:
            cur.execute(
                "INSERT INTO blueprint_parts(bq_id,part_label,topic_id,difficulty) VALUES(?,?,?,?)",
                (bq_id, p.part_label, p.topic_id, p.difficulty)
            )
    conn.commit()
    conn.close()
    return {"blueprint_id": bp_id, "title": req.title}

@app.get("/blueprints")
def list_blueprints(user: dict = Depends(require_teacher)):
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM blueprints ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/blueprints/{bp_id}")
def get_blueprint(bp_id: int, user: dict = Depends(require_teacher)):
    conn = get_db_connection()
    bp = conn.execute("SELECT * FROM blueprints WHERE blueprint_id=?", (bp_id,)).fetchone()
    if not bp:
        conn.close(); raise HTTPException(404, "Blueprint not found")
    bp = dict(bp)
    qs = conn.execute("SELECT * FROM blueprint_questions WHERE blueprint_id=? ORDER BY q_no", (bp_id,)).fetchall()
    bp["questions"] = []
    for q in qs:
        q = dict(q)
        parts = conn.execute("SELECT * FROM blueprint_parts WHERE bq_id=?", (q["bq_id"],)).fetchall()
        q["parts"] = [dict(p) for p in parts]
        bp["questions"].append(q)
    conn.close()
    return bp

@app.delete("/blueprints/{bp_id}")
def delete_blueprint(bp_id: int, user: dict = Depends(require_teacher)):
    conn = get_db_connection()
    conn.execute("DELETE FROM blueprint_parts WHERE bq_id IN (SELECT bq_id FROM blueprint_questions WHERE blueprint_id=?)", (bp_id,))
    conn.execute("DELETE FROM blueprint_questions WHERE blueprint_id=?", (bp_id,))
    conn.execute("DELETE FROM blueprints WHERE blueprint_id=?", (bp_id,))
    conn.commit(); conn.close()
    return {"status": "deleted"}

@app.post("/blueprints/{bp_id}/validate")
def validate_bp(bp_id: int, user: dict = Depends(require_teacher)):
    conn = get_db_connection()
    bp_row = conn.execute("SELECT * FROM blueprints WHERE blueprint_id=?", (bp_id,)).fetchone()
    if not bp_row:
        conn.close(); raise HTTPException(404, "Blueprint not found")
    bp = dict(bp_row)
    qs = conn.execute("SELECT * FROM blueprint_questions WHERE blueprint_id=? ORDER BY q_no", (bp_id,)).fetchall()
    bp["questions"] = []
    for q in qs:
        q = dict(q)
        parts = conn.execute("SELECT * FROM blueprint_parts WHERE bq_id=?", (q["bq_id"],)).fetchall()
        q["parts"] = [dict(p) for p in parts]
        bp["questions"].append(q)
    issues = validate_blueprint(bp, conn)
    conn.close()
    return {"issues": issues, "has_errors": any(i["level"] == "error" for i in issues)}

class GenerateRequest(BaseModel):
    seed: Optional[int] = None

@app.post("/blueprints/{bp_id}/generate")
def generate_bp_paper(bp_id: int, req: GenerateRequest = GenerateRequest(), user: dict = Depends(require_teacher)):
    import time as _time
    conn = get_db_connection()
    bp_row = conn.execute("SELECT * FROM blueprints WHERE blueprint_id=?", (bp_id,)).fetchone()
    if not bp_row:
        conn.close(); raise HTTPException(404, "Blueprint not found")
    bp = dict(bp_row)
    qs = conn.execute("SELECT * FROM blueprint_questions WHERE blueprint_id=? ORDER BY q_no", (bp_id,)).fetchall()
    bp["questions"] = []
    for q in qs:
        q = dict(q)
        parts = conn.execute("SELECT * FROM blueprint_parts WHERE bq_id=?", (q["bq_id"],)).fetchall()
        q["parts"] = [dict(p) for p in parts]
        bp["questions"].append(q)

    seed = req.seed if req.seed is not None else int(_time.time() * 1000) % (2**31)
    try:
        result = engine_generate_paper(bp, seed, conn)
    except ValueError as e:
        conn.close(); raise HTTPException(422, str(e))

    snap = _json.dumps(bp)
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO generated_papers(blueprint_id, seed, blueprint_snap) VALUES(?,?,?)",
        (bp_id, result["seed"], snap)
    )
    paper_id = cur.lastrowid
    for q in result["paper"]:
        for part in q["parts"]:
            cur.execute(
                "INSERT INTO paper_parts(paper_id, q_no, part_label, bank_question_id, marks) VALUES(?,?,?,?,?)",
                (paper_id, q["q_no"], part["part_label"], part["q_id"], part["marks"])
            )
    conn.commit()
    conn.close()
    return {"paper_id": paper_id, **result}

@app.get("/papers/{paper_id}")
def get_paper(paper_id: int, user: dict = Depends(require_teacher)):
    conn = get_db_connection()
    paper_row = conn.execute("SELECT * FROM generated_papers WHERE paper_id=?", (paper_id,)).fetchone()
    if not paper_row:
        conn.close(); raise HTTPException(404, "Paper not found")
    parts = conn.execute(
        """SELECT pp.*, q.question_text, t.topic_name, t.unit_number, q.diff_level
           FROM paper_parts pp
           JOIN questions q ON pp.bank_question_id = q.q_id
           JOIN topics t ON q.topic_id = t.topic_id
           WHERE pp.paper_id = ?
           ORDER BY pp.q_no, pp.part_label""",
        (paper_id,)
    ).fetchall()
    conn.close()
    by_q: dict[int, list] = {}
    for p in parts:
        d = dict(p)
        by_q.setdefault(d["q_no"], []).append(d)
    return {
        "paper_id": paper_id,
        "seed": paper_row["seed"],
        "generated_at": paper_row["generated_at"],
        "questions": [{"q_no": q_no, "parts": ps} for q_no, ps in sorted(by_q.items())]
    }


_frontend = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
class FixKeyReq(BaseModel):
    new_correct_opt: str

@app.post("/questions/{q_id}/fix-key")
def fix_question_key(q_id: int, req: FixKeyReq, user: dict = Depends(require_teacher)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("UPDATE mcq_options SET correct_opt=? WHERE q_id=?", (req.new_correct_opt, q_id))
    
    responses = cursor.execute("SELECT session_id, chosen_opt, marks_awarded FROM session_responses WHERE q_id=?", (q_id,)).fetchall()
    
    q_marks = cursor.execute("SELECT marks FROM questions WHERE q_id=?", (q_id,)).fetchone()
    if not q_marks:
        conn.close()
        raise HTTPException(404, "Question not found")
        
    marks = q_marks["marks"]
    
    updated_sessions = set()
    for r in responses:
        sid = r["session_id"]
        chosen = r["chosen_opt"]
        old_marks = r["marks_awarded"]
        
        new_marks = marks if chosen == req.new_correct_opt else 0
        if new_marks != old_marks:
            cursor.execute("UPDATE session_responses SET marks_awarded=? WHERE session_id=? AND q_id=?", (new_marks, sid, q_id))
            updated_sessions.add(sid)
            
    for sid in updated_sessions:
        total = cursor.execute("SELECT SUM(marks_awarded) FROM session_responses WHERE session_id=?", (sid,)).fetchone()[0] or 0
        cursor.execute("UPDATE student_sessions SET score=? WHERE session_id=?", (total, sid))
        
    conn.commit()
    conn.close()
    
    return {"status": "success", "updated_sessions": len(updated_sessions)}


if os.path.isdir(_frontend):
    app.mount("/ui", StaticFiles(directory=_frontend, html=True), name="frontend")
