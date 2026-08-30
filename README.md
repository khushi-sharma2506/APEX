# A.P.E.X. (Adaptive Paper Engine for eXaminations)

An OS-Optimized Institutional Assessment and Dynamic Question Bank Generator. This is a combined Project-Based Learning (PBL) project for Operating Systems and Database Management Systems.

## Project Structure

*   `docs/` - Documentation, Phase-I reports, presentations, and ER diagrams.
*   `src/` - C++ source code for the multithreaded server, LRU cache, and core engine.
*   `db/` - SQLite database files and CSV datasets for the question bank.

## Features (Planned)
*   **Live Adaptive Testing:** Sub-second latency utilizing a background multithreaded prefetching engine and custom LRU page-replacement cache.
*   **Offline Exam Generator:** Creates balanced test papers automatically based on constraints like difficulty curves, question types, and textbook sources.
*   **Normalized DBMS:** Highly indexed (3NF) relational schema for handling 100,000+ mock questions.
