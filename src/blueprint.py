def generate_exam_blueprint(total_questions: int, easy_pct: int, med_pct: int, hard_pct: int, topic: str):
    """
    Algorithm to filter and select exactly the right mix of questions from the database.
    
    TODO (Member 4):
    - Connect to the database using src/database.py
    - Calculate how many questions of each difficulty are needed based on the percentages.
    - Run SQL queries to fetch random questions matching those difficulties and the specific topic.
    - Return the final list of compiled questions.
    """
    
    # Example logic skeleton:
    num_easy = int(total_questions * (easy_pct / 100))
    num_med = int(total_questions * (med_pct / 100))
    num_hard = total_questions - (num_easy + num_med)
    
    final_paper = []
    
    # Your query logic here
    
    return final_paper
