"""
blueprint.py
Builds a balanced exam paper by selecting questions from the APEX SQLite
database, matching a teacher-requested difficulty split (and optionally a
topic filter), while avoiding questions used too recently in other papers.

Owned by: Alok Goyal
Depends on: db/apex.db already containing a `questions` table
            (created by src/database.py, populated by scripts/import_csv.py)
"""

import sqlite3
import random
import uuid
from datetime import datetime, timedelta

DB_PATH = "db/apex.db"
RECENCY_WINDOW_DAYS = 30
MAX_ATTEMPTS = 3


def get_connection():
    """Open a connection to the real APEX database."""
    return sqlite3.connect(DB_PATH)


def ensure_usage_table(conn):
    """
    question_usage isn't created anywhere else, so this file owns it.
    Safe to call every time -- CREATE TABLE IF NOT EXISTS is a no-op
    once the table already exists.
    """
    conn.execute("""
        CREATE TABLE IF NOT EXISTS question_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question_id INTEGER NOT NULL,
            paper_id TEXT NOT NULL,
            used_at TEXT NOT NULL
        )
    """)
    conn.commit()


def compute_quotas(total_questions, hard_pct, med_pct, easy_pct):
    """
    Turn percentages into exact integer counts.
    Total question count is a hard requirement -- if rounding leaves the
    numbers slightly off, the drift is absorbed into the medium bucket,
    since it's the "middle ground" difficulty.
    """
    hard = round(total_questions * hard_pct / 100)
    easy = round(total_questions * easy_pct / 100)
    medium = total_questions - hard - easy  # absorbs rounding drift
    return {"hard": hard, "medium": medium, "easy": easy}


def get_recently_used_ids(conn):
    """Question ids used in any paper within the last RECENCY_WINDOW_DAYS."""
    cutoff = (datetime.now() - timedelta(days=RECENCY_WINDOW_DAYS)).isoformat()
    rows = conn.execute(
        "SELECT DISTINCT question_id FROM question_usage WHERE used_at > ?",
        (cutoff,)
    ).fetchall()
    return {r[0] for r in rows}


def fetch_eligible(conn, difficulty, topic, excluded_ids):
    """
    All questions matching a difficulty (and optional topic), minus
    anything recently used. Returned as a list of dicts.
    """
    query = "SELECT id, question, difficulty, topic FROM questions WHERE difficulty = ?"
    params = [difficulty]
    if topic:
        query += " AND topic = ?"
        params.append(topic)

    rows = conn.execute(query, params).fetchall()
    return [
        {"id": r[0], "question": r[1], "difficulty": r[2], "topic": r[3]}
        for r in rows if r[0] not in excluded_ids
    ]


def pick_with_fallback(conn, quotas, topic, excluded_ids):
    """
    Fill each difficulty bucket from the eligible pool. If a bucket comes
    up short, borrow the shortfall from the closest neighbouring
    difficulty (hard <-> medium <-> easy) instead of failing outright.
    Picks are randomized, so ties on difficulty+topic don't always return
    the same question.
    """
    fallback_order = {
        "hard": ["medium", "easy"],
        "medium": ["hard", "easy"],
        "easy": ["medium", "hard"],
    }

    pools = {
        level: fetch_eligible(conn, level, topic, excluded_ids)
        for level in ("hard", "medium", "easy")
    }

    selected = []
    used_ids_this_paper = set()

    for level, needed in quotas.items():
        pool = [q for q in pools[level] if q["id"] not in used_ids_this_paper]
        random.shuffle(pool)
        take = pool[:needed]
        selected.extend(take)
        used_ids_this_paper.update(q["id"] for q in take)

        shortfall = needed - len(take)
        if shortfall > 0:
            for fallback_level in fallback_order[level]:
                if shortfall <= 0:
                    break
                extra_pool = [
                    q for q in pools[fallback_level]
                    if q["id"] not in used_ids_this_paper
                ]
                random.shuffle(extra_pool)
                extra = extra_pool[:shortfall]
                selected.extend(extra)
                used_ids_this_paper.update(q["id"] for q in extra)
                shortfall -= len(extra)

    return selected


def score_paper(paper, quotas):
    """
    Combines two simple signals into one score between 0 and 1:

    difficulty_match -- how close the actual difficulty counts came to
                         the requested quotas (1.0 = exact match)
    topic_coverage    -- how many distinct topics made it into the paper,
                         relative to the paper size (rewards spread, not
                         the same topic repeating)

    Weighted 50/50 so neither objective dominates the other.
    """
    if not paper:
        return 0.0

    actual_counts = {"hard": 0, "medium": 0, "easy": 0}
    for q in paper:
        actual_counts[q["difficulty"]] = actual_counts.get(q["difficulty"], 0) + 1

    total_requested = sum(quotas.values())
    diff_error = sum(abs(actual_counts.get(k, 0) - v) for k, v in quotas.items())
    difficulty_match = 1 - (diff_error / (2 * total_requested)) if total_requested else 0

    distinct_topics = len({q["topic"] for q in paper})
    topic_coverage = distinct_topics / len(paper)

    return round(0.5 * difficulty_match + 0.5 * topic_coverage, 4)


def record_usage(conn, paper, paper_id):
    """Log every question used in this paper so future calls exclude it."""
    now = datetime.now().isoformat()
    conn.executemany(
        "INSERT INTO question_usage (question_id, paper_id, used_at) VALUES (?, ?, ?)",
        [(q["id"], paper_id, now) for q in paper]
    )
    conn.commit()


def generate_paper(total_questions, hard_pct, med_pct, easy_pct, topic=None):
    """
    Builds up to MAX_ATTEMPTS candidate papers, scores each one, and
    returns the best-scoring attempt along with its score.
    """
    conn = get_connection()
    ensure_usage_table(conn)

    quotas = compute_quotas(total_questions, hard_pct, med_pct, easy_pct)
    excluded_ids = get_recently_used_ids(conn)

    best_paper, best_score = None, -1

    for _ in range(MAX_ATTEMPTS):
        candidate = pick_with_fallback(conn, quotas, topic, excluded_ids)
        score = score_paper(candidate, quotas)
        if score > best_score:
            best_paper, best_score = candidate, score
        if best_score >= 0.95:  # good enough, stop early
            break

    paper_id = None
    if best_paper:
        paper_id = str(uuid.uuid4())[:8]
        record_usage(conn, best_paper, paper_id)

    conn.close()
    return {"paper_id": paper_id, "questions": best_paper or [], "score": best_score}


if __name__ == "__main__":
    result = generate_paper(total_questions=10, hard_pct=40, med_pct=40, easy_pct=20)
    print(f"Paper ID: {result['paper_id']}")
    print(f"Score: {result['score']}")
    for q in result["questions"]:
        print(f"  [{q['difficulty']:6}] ({q['topic']}) {q['question']}")