# Adaptive Paper Engine for eXaminations (APEX)

An OS-Optimized Institutional Assessment and Dynamic Question Bank Generator. This is a combined Project-Based Learning (PBL) project for Operating Systems and Database Management Systems.

## 📖 Project Overview
Current institutional examination systems rely on static question papers that fail to adapt to individual student learning curves during live assessments. For offline exams, teachers face significant manual overhead maintaining balanced difficulty distributions and filtering questions by specific textbook sources.

**APEX** solves this by providing a dual-layer architecture:
1. **Live Adaptive Testing Engine:** A highly concurrent server that uses OS-level predictive prefetching and LRU memory caching to deliver dynamic questions with sub-second latency.
2. **Offline Exam Paper Generator:** A constraint-aware matching algorithm that queries a normalized (3NF) relational database to instantly generate perfectly balanced exam papers based on teacher-defined blueprints.

## 📂 Project Architecture

```text
APEX/
├── db/                   # Contains the SQLite apex.db file
├── data/                 # Raw mock_questions.csv datasets
├── docs/                 # Project reports, diagrams, and presentations
├── scripts/
│   └── import_csv.py     # Data Ingestion & SQL Transaction scripts
├── src/
│   ├── main.py           # Core FastAPI Server & OS Concurrency
│   ├── database.py       # DB Connection & Schema Setup
│   ├── cache.py          # LRU Memory Cache implementation
│   └── blueprint.py      # Exam Blueprint Algorithm (Constraint Matching)
└── requirements.txt      # Dependencies (fastapi, uvicorn)
```

## 👥 Team Assignments

| Team Member | Role / Focus Area | Key Responsibilities (OS & DBMS) | Assigned File |
| :--- | :--- | :--- | :--- |
| **Khushi Sharma (Lead)** | Server Architecture & Concurrency | **OS:** FastAPI Thread Pool Executor.<br>**DBMS:** Database Schema & Connection. | `src/main.py`<br>`src/database.py` |
| **Roma Yadav** | Database & Data Engineering | **OS:** Mutexes for concurrent data loading.<br>**DBMS:** SQLite CSV Ingestion & basic SQL. | `scripts/import_csv.py` |
| **Rohit Sharma** | OS Memory Management | **OS:** LRU Page Replacement simulation.<br>**DBMS:** Indexing concepts for cache misses. | `src/cache.py` |
| **Alok Goyal** | Algorithm & Logic Engineering | **OS:** Background processing.<br>**DBMS:** Complex constraint matching queries. | `src/blueprint.py` |
