"""
assistant.py — Clean Google Gemini-powered Assistant for APEX.
"""

import os
import urllib.request
import json
from typing import Optional, Dict, Any
from pathlib import Path
from dotenv import load_dotenv

# Ensure .env is loaded from project root
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

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

    # Available models in your key tier: gemini-3.5-flash
    models_to_try = ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-flash-latest"]

    prompt_text = f"{SYSTEM_INSTRUCTION}\n\n[User Role: {user_role.upper()}]\nUser: {message}\nAssistant:"
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt_text}]}]
    }).encode("utf-8")

    last_error = ""
    for model_name in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                text = res["candidates"][0]["content"]["parts"][0]["text"].strip()
                return {
                    "reply": text,
                    "action": "gemini_response",
                    "model": model_name
                }
        except Exception as e:
            last_error = str(e)

    return {
        "reply": f"⚠️ Gemini AI service unavailable right now: {last_error}",
        "action": "error"
    }
