"""
assistant.py — Clean Google Gemini-powered Assistant for APEX.
"""

import os
import urllib.request
import json
import time
from typing import Optional, Dict, Any
from pathlib import Path
from dotenv import load_dotenv

# Ensure .env is loaded from project root
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

SYSTEM_INSTRUCTION = (
    "You are APEX Assistant, an intelligent, helpful academic AI for an institutional examination platform (APEX).\n"
    "Your purpose:\n"
    "1. For Students: Answer academic doubts regarding Operating Systems (OS) and Database Management Systems (DBMS). "
    "Provide crisp, accurate explanations, real-world examples, and step-by-step algorithms.\n"
    "2. For Teachers: Assist in drafting balanced examination questions (MCQ with 4 options and answer keys, or 5/10-mark Subjective questions).\n"
    "Keep answers well-structured with clear bullet points."
)


def process_chat(message: str, user_role: str = "student", context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return {
            "reply": "⚠️ **Gemini API Key missing.**\nPlease add your `GEMINI_API_KEY` in `.env` to start chatting with Gemini AI!",
            "action": "key_required"
        }

    prompt_text = f"{SYSTEM_INSTRUCTION}\n\n[User Role: {user_role.upper()}]\nUser: {message}\nAssistant:"
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt_text}]}]
    }).encode("utf-8")

    # Ultra-fast, high-quota lightweight models first
    models_to_try = [
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-3.5-flash"
    ]

    for model_name in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=12) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                text = res["candidates"][0]["content"]["parts"][0]["text"].strip()
                return {
                    "reply": text,
                    "action": "gemini_response",
                    "model": model_name
                }
        except urllib.error.HTTPError as e:
            if e.code in (429, 404, 503):
                continue
        except Exception:
            continue

    return {
        "reply": "⚠️ Daily API quota reached for this key on Google's Free Tier. Please generate a fresh free Gemini key at https://aistudio.google.com/ and paste it in `.env`.",
        "action": "quota_exceeded"
    }
