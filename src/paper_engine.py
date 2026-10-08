"""
paper_engine.py — Written paper generation and validation for APEX.

Blueprint structure (dict):
{
  "title": "OS Mid-sem",
  "subject_id": 1,
  "target_marks": 50,           # None = no enforcement
  "questions": [
    {
      "q_no": 1,
      "unit_number": 2,
      "offered_n": 3,
      "attempt_k": 2,
      "marks_per_part": 5,
      "parts": [
        {"part_label": "a", "topic_id": None, "difficulty": "Easy"},
        {"part_label": "b", "topic_id": 7,    "difficulty": "Medium"},
        {"part_label": "c", "topic_id": None,  "difficulty": "Hard"},
      ]
    }
  ]
}
"""

import json
import random
from typing import Optional



def _pool_count(cursor, subject_id: int, unit_number: int,
                topic_id: Optional[int], difficulty: str,
                exclude_q_ids: list[int]) -> int:
    """Count SUBJECTIVE questions available for a given slot."""
    excl = ",".join(str(i) for i in exclude_q_ids) if exclude_q_ids else "0"
    if topic_id is not None:
        cursor.execute(
            """SELECT COUNT(*) FROM questions q
               JOIN topics t ON q.topic_id = t.topic_id
               WHERE t.subject_id = ? AND t.unit_number = ?
                 AND q.topic_id = ? AND q.diff_level = ?
                 AND q.question_type = 'SUBJECTIVE'
                 AND q.q_id NOT IN ({})""".format(excl),
            (subject_id, unit_number, topic_id, difficulty),
        )
    else:
        cursor.execute(
            """SELECT COUNT(*) FROM questions q
               JOIN topics t ON q.topic_id = t.topic_id
               WHERE t.subject_id = ? AND t.unit_number = ?
                 AND q.diff_level = ?
                 AND q.question_type = 'SUBJECTIVE'
                 AND q.q_id NOT IN ({})""".format(excl),
            (subject_id, unit_number, difficulty),
        )
    return cursor.fetchone()[0]


def _pick_question(cursor, rng: random.Random, subject_id: int,
                   unit_number: int, topic_id: Optional[int],
                   difficulty: str, exclude_q_ids: list[int]) -> Optional[dict]:
    """Pick one SUBJECTIVE question matching the slot constraints."""
    excl = ",".join(str(i) for i in exclude_q_ids) if exclude_q_ids else "0"
    if topic_id is not None:
        cursor.execute(
            """SELECT q.q_id, q.question_text, t.topic_name, t.unit_number
               FROM questions q JOIN topics t ON q.topic_id = t.topic_id
               WHERE t.subject_id = ? AND t.unit_number = ?
                 AND q.topic_id = ? AND q.diff_level = ?
                 AND q.question_type = 'SUBJECTIVE'
                 AND q.q_id NOT IN ({})""".format(excl),
            (subject_id, unit_number, topic_id, difficulty),
        )
    else:
        cursor.execute(
            """SELECT q.q_id, q.question_text, t.topic_name, t.unit_number
               FROM questions q JOIN topics t ON q.topic_id = t.topic_id
               WHERE t.subject_id = ? AND t.unit_number = ?
                 AND q.diff_level = ?
                 AND q.question_type = 'SUBJECTIVE'
                 AND q.q_id NOT IN ({})""".format(excl),
            (subject_id, unit_number, difficulty),
        )
    rows = cursor.fetchall()
    if not rows:
        return None
    row = rng.choice(rows)
    return dict(row)



def validate_blueprint(blueprint: dict, conn) -> list[dict]:
    """
    Returns list of {level: 'error'|'warning', message: str, location: str}.

    Checks:
    1. attempt_k <= offered_n for every question.
    2. len(parts) == offered_n for every question.
    3. Marks arithmetic vs target_marks (if set).
    4. Availability: count pool sizes and report exact shortages.
    5. Warning when parts of the same question differ in difficulty.
    """
    issues = []
    cursor = conn.cursor()
    subject_id = blueprint.get("subject_id")
    target_marks = blueprint.get("target_marks")
    questions = blueprint.get("questions", [])

    pool_demand: dict[tuple, int] = {}

    total_marks = 0

    for q in questions:
        q_no = q["q_no"]
        loc = f"Q{q_no}"
        offered_n = q.get("offered_n", 1)
        attempt_k = q.get("attempt_k", 1)
        marks_per_part = q.get("marks_per_part", 1)
        parts = q.get("parts", [])
        unit = q.get("unit_number")

        if attempt_k > offered_n:
            issues.append({"level": "error",
                           "message": f"Attempt count ({attempt_k}) cannot exceed offered parts ({offered_n}).",
                           "location": loc})

        if len(parts) != offered_n:
            issues.append({"level": "error",
                           "message": f"Has {len(parts)} part(s) but offered_n is {offered_n}. They must match.",
                           "location": loc})

        total_marks += attempt_k * marks_per_part

        for part in parts:
            key = (unit, part.get("topic_id"), part["difficulty"])
            pool_demand[key] = pool_demand.get(key, 0) + 1

        diffs = {p["difficulty"] for p in parts}
        if len(diffs) > 1:
            issues.append({"level": "warning",
                           "message": f"Parts have mixed difficulties ({', '.join(sorted(diffs))}). This is allowed but may affect balance.",
                           "location": loc})

    if target_marks is not None and target_marks != total_marks:
        issues.append({"level": "error",
                       "message": f"Blueprint total marks ({total_marks}) does not match target ({target_marks}).",
                       "location": "Paper"})

    for (unit, topic_id, difficulty), needed in pool_demand.items():
        avail = _pool_count(cursor, subject_id, unit, topic_id, difficulty, [])
        if avail < needed:
            topic_label = "any topic" if topic_id is None else f"topic #{topic_id}"
            issues.append({"level": "error",
                           "message": (f"Unit {unit}, {topic_label}, {difficulty}: need {needed} question(s) "
                                       f"but only {avail} available in the bank."),
                           "location": f"Unit {unit}"})

    return issues



def generate_paper(blueprint: dict, seed: int, conn) -> dict:
    """
    Fill the most-constrained parts first.
    Reproducible: uses random.Random(seed).
    Retries with new sub-seeds (up to 10).
    Supports swapping one part if stuck.
    No question used twice.

    Returns:
      {paper: [{q_no, unit, parts: [{part_label, q_id, question_text, topic_name, difficulty, marks}]}],
       seed, total_marks, warnings: [str]}
    Raises ValueError on impossible blueprint.
    """
    cursor = conn.cursor()
    subject_id = blueprint["subject_id"]
    questions = blueprint["questions"]

    warnings = []

    for attempt in range(10):
        sub_seed = seed + attempt * 997
        rng = random.Random(sub_seed)
        used_ids: list[int] = []
        paper_questions = []
        failed = False

        all_slots = []
        for q in questions:
            for part in q["parts"]:
                pool = _pool_count(cursor, subject_id,
                                   q["unit_number"], part.get("topic_id"),
                                   part["difficulty"], [])
                all_slots.append((pool, q, part))
        all_slots.sort(key=lambda x: x[0])  # ascending = most constrained first

        filled: dict[tuple[int, str], dict] = {}  # (q_no, part_label) -> row

        for _, q, part in all_slots:
            q_no = q["q_no"]
            part_label = part["part_label"]
            row = _pick_question(cursor, rng, subject_id,
                                 q["unit_number"], part.get("topic_id"),
                                 part["difficulty"], used_ids)
            if row is None:
                swapped = False
                for (fq, fl), frow in list(filled.items()):
                    if fq == q_no and fl != part_label:
                        temp = used_ids.copy()
                        temp.remove(frow["q_id"])
                        row2 = _pick_question(cursor, rng, subject_id,
                                              q["unit_number"], part.get("topic_id"),
                                              part["difficulty"], temp)
                        if row2 and row2["q_id"] != frow["q_id"]:
                            used_ids.remove(frow["q_id"])
                            filled.pop((fq, fl))
                            used_ids.append(row2["q_id"])
                            filled[(q_no, part_label)] = {**row2, "part": part}
                            row_back = _pick_question(cursor, rng, subject_id,
                                                      q["unit_number"], filled.get((fq, fl), {}).get("topic_id") or part.get("topic_id"),
                                                      part["difficulty"], used_ids)
                            if row_back:
                                used_ids.append(row_back["q_id"])
                                filled[(fq, fl)] = {**row_back, "part": {"part_label": fl, "difficulty": part["difficulty"]}}
                            swapped = True
                            break
                if not swapped:
                    failed = True
                    break
            else:
                used_ids.append(row["q_id"])
                filled[(q_no, part_label)] = {**row, "part": part}

        if failed:
            if attempt == 9:
                raise ValueError(
                    "Could not generate a valid paper after 10 attempts. "
                    "The question bank may not have enough questions for this blueprint. "
                    "Run validation for details."
                )
            warnings.append(f"Attempt {attempt + 1} failed; retrying with new seed.")
            continue

        q_map: dict[int, list] = {}
        for (q_no, part_label), row in filled.items():
            q_map.setdefault(q_no, []).append({
                "part_label": part_label,
                "q_id": row["q_id"],
                "question_text": row["question_text"],
                "topic_name": row.get("topic_name", ""),
                "difficulty": row["part"]["difficulty"],
                "marks": next(q["marks_per_part"] for q in questions if q["q_no"] == q_no),
            })

        paper = []
        for q in sorted(questions, key=lambda x: x["q_no"]):
            parts_out = sorted(q_map.get(q["q_no"], []), key=lambda p: p["part_label"])
            paper.append({
                "q_no": q["q_no"],
                "unit_number": q["unit_number"],
                "offered_n": q["offered_n"],
                "attempt_k": q["attempt_k"],
                "marks_per_part": q["marks_per_part"],
                "question_marks": q["attempt_k"] * q["marks_per_part"],
                "parts": parts_out,
            })

        total_marks = sum(q["attempt_k"] * q["marks_per_part"] for q in questions)

        if attempt > 0:
            warnings.insert(0, f"Generated successfully on attempt {attempt + 1} (seed offset: {attempt * 997}).")

        return {
            "paper": paper,
            "seed": sub_seed,
            "total_marks": total_marks,
            "warnings": warnings,
        }
