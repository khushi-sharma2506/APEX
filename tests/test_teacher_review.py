"""
test_teacher_review.py — Unit test for teacher_session_review endpoint.
"""
import os
import sys
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from database import get_db_connection
from main import teacher_session_review


def test_teacher_session_review():
    conn = get_db_connection()
    row = conn.execute("SELECT session_id FROM student_sessions LIMIT 1").fetchone()
    conn.close()

    if row:
        sess_id = row["session_id"]
        res = teacher_session_review(sess_id, {"username": "teacher", "role": "teacher"})
        assert "session_id" in res
        assert "student_id" in res
        assert "exam_title" in res
        assert "total_marks" in res
        assert "max_marks" in res
        assert "responses" in res
