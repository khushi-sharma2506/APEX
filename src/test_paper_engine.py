"""
Tests for paper_engine.py — run with: pytest src/test_paper_engine.py -v
"""
import pytest
import sqlite3
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from database import migrate_db, DB_FILE
from paper_engine import validate_blueprint, generate_paper



@pytest.fixture
def conn():
    """In-memory SQLite DB with minimal schema + sample data."""
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")

    db.executescript("""
        CREATE TABLE subjects (subject_id INTEGER PRIMARY KEY AUTOINCREMENT, subject_name TEXT UNIQUE);
        CREATE TABLE topics (topic_id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER, unit_number INTEGER, topic_name TEXT);
        CREATE TABLE questions (
            q_id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic_id INTEGER, question_text TEXT, question_type TEXT,
            marks INTEGER, diff_level TEXT, is_pyq INTEGER DEFAULT 0
        );
        CREATE TABLE mcq_options (q_id INTEGER PRIMARY KEY, opt_a TEXT, opt_b TEXT, opt_c TEXT, opt_d TEXT, correct_opt TEXT);

        INSERT INTO subjects VALUES (1, 'Operating Systems');
        INSERT INTO topics VALUES (1, 1, 1, 'OS Concepts');
        INSERT INTO topics VALUES (2, 1, 1, 'Scheduling');
        INSERT INTO topics VALUES (3, 1, 2, 'Memory Mgmt');
        INSERT INTO topics VALUES (4, 1, 2, 'Virtual Memory');
    """)

    q_id = 1
    for unit in [1, 2]:
        for diff in ['Easy', 'Medium', 'Hard']:
            topic_id = 1 if unit == 1 else 3
            for i in range(10):
                db.execute(
                    "INSERT INTO questions VALUES (?,?,?,?,?,?,?)",
                    (q_id, topic_id, f"Unit{unit} {diff} Q{i+1}", 'SUBJECTIVE', 5, diff, 0)
                )
                q_id += 1
    db.commit()
    yield db
    db.close()


def make_bp(questions, target_marks=None):
    return {
        "title": "Test Paper",
        "subject_id": 1,
        "target_marks": target_marks,
        "questions": questions,
    }


def make_q(q_no, unit, offered_n, attempt_k, marks_per_part, parts):
    return {
        "q_no": q_no,
        "unit_number": unit,
        "offered_n": offered_n,
        "attempt_k": attempt_k,
        "marks_per_part": marks_per_part,
        "parts": parts,
    }


def make_part(label, difficulty, topic_id=None):
    return {"part_label": label, "difficulty": difficulty, "topic_id": topic_id}



def test_attempt_exceeds_offered(conn):
    q = make_q(1, 1, 2, 3, 5, [  # attempt_k=3 > offered_n=2
        make_part("a", "Easy"),
        make_part("b", "Medium"),
    ])
    issues = validate_blueprint(make_bp([q]), conn)
    errors = [i for i in issues if i["level"] == "error" and "Attempt count" in i["message"]]
    assert errors, f"Expected attempt>offered error, got: {issues}"



def test_marks_arithmetic_pass(conn):
    questions = [
        make_q(1, 1, 2, 2, 5, [make_part("a", "Easy"), make_part("b", "Medium")]),
        make_q(2, 2, 2, 2, 5, [make_part("a", "Easy"), make_part("b", "Medium")]),
    ]
    issues = validate_blueprint(make_bp(questions, target_marks=20), conn)
    marks_errors = [i for i in issues if i["level"] == "error" and "target" in i["message"]]
    assert not marks_errors, f"Should pass marks check: {marks_errors}"


def test_marks_arithmetic_fail(conn):
    q = make_q(1, 1, 2, 2, 5, [make_part("a", "Easy"), make_part("b", "Medium")])
    issues = validate_blueprint(make_bp([q], target_marks=40), conn)
    errors = [i for i in issues if i["level"] == "error" and "target" in i["message"]]
    assert errors, f"Expected marks mismatch error: {issues}"



def test_shortage_detected(conn):
    parts = [make_part(chr(ord('a') + i), "Easy") for i in range(50)]
    q = make_q(1, 1, 50, 1, 5, parts)
    issues = validate_blueprint(make_bp([q]), conn)
    shortage = [i for i in issues if i["level"] == "error" and "Unit 1" in i["location"]]
    assert shortage, f"Expected shortage error, got: {issues}"
    assert "10" in shortage[0]["message"] or "0" in shortage[0]["message"]



def test_no_repeats_across_seeds(conn):
    questions = [
        make_q(1, 1, 2, 1, 5, [make_part("a", "Easy"), make_part("b", "Medium")]),
        make_q(2, 2, 2, 1, 5, [make_part("a", "Easy"), make_part("b", "Hard")]),
    ]
    bp = make_bp(questions)
    for seed in range(100):  # 100 is practical; 1000 would be slow in CI
        result = generate_paper(bp, seed, conn)
        all_ids = [p["q_id"] for q in result["paper"] for p in q["parts"]]
        assert len(all_ids) == len(set(all_ids)), f"Duplicate at seed {seed}: {all_ids}"



def test_same_seed_reproducible(conn):
    questions = [
        make_q(1, 1, 3, 2, 5, [
            make_part("a", "Easy"), make_part("b", "Medium"), make_part("c", "Hard")
        ]),
    ]
    bp = make_bp(questions)
    r1 = generate_paper(bp, 42, conn)
    r2 = generate_paper(bp, 42, conn)
    ids1 = [p["q_id"] for q in r1["paper"] for p in q["parts"]]
    ids2 = [p["q_id"] for q in r2["paper"] for p in q["parts"]]
    assert ids1 == ids2, f"Different results for same seed: {ids1} vs {ids2}"
