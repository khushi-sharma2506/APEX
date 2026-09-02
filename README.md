# A.P.E.X. (Adaptive Paper Engine for eXaminations)

An OS-Optimized Institutional Assessment and Dynamic Question Bank Generator. This is a combined Project-Based Learning (PBL) project for Operating Systems and Database Management Systems.

## 📂 Project Architecture
This architecture was fully set up and scaffolded by Khushi (Team Lead). All starter files and stubs are ready for development.

```text
APEX/
├── db/                   # Contains the SQLite apex.db file
├── data/                 # Place your mock_questions.csv here
├── docs/                 # Phase-I reports and diagrams
├── scripts/
│   └── import_csv.py     # Data Ingestion Script (Member 2)
├── src/
│   ├── main.py           # Core FastAPI Server & Concurrency (Khushi)
│   ├── database.py       # DB Connection Logic (Khushi)
│   ├── cache.py          # LRU Memory Cache (Member 3)
│   └── blueprint.py      # Exam Blueprint Algorithm (Member 4)
└── requirements.txt      # Dependencies (fastapi, uvicorn)
```

## 🚀 Team Assignments (Phase 2 - MVP)
**Khushi (Lead):** `src/main.py` & `src/database.py` (FastAPI Server, OS Threading, DB Schema)
**Member 2:** `scripts/import_csv.py` (SQLite insertion, CSV parsing, basic SQL queries)
**Member 3:** `src/cache.py` (LRU Cache logic, OS page replacement simulation)
**Member 4:** `src/blueprint.py` (Constraint matching, algorithmic filtering, quota math)

*Note: Work completely independently in your assigned files. Test your code using dummy variables before pushing to the main branch.*
