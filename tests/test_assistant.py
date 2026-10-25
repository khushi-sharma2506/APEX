"""
test_assistant.py — Unit tests for Phase 3 Gemini Assistant.
"""

import os
import sys
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from assistant import process_chat


def test_missing_api_key_prompt():
    """Verify that if no GEMINI_API_KEY is configured, it gives a clear prompt."""
    os.environ["GEMINI_API_KEY"] = ""
    res = process_chat("Hello", user_role="student")
    assert res is not None
    assert "GEMINI_API_KEY" in res["reply"]
    assert res["action"] == "key_required"
