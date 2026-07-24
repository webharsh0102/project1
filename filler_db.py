import json
import re
import mysql.connector
import pandas as pd

# ---------------------------------------------------------
# 1. CONFIGURATION
# ---------------------------------------------------------
CSV_FILE_PATH = "leetcode_transformed_data2.csv"  # <-- Make sure this matches your CSV filename in VS Code

DB_CONFIG = {
    "host": "127.0.0.1",  # <-- Explicitly use 127.0.0.1 instead of "localhost"
    "user": "root",
    "password": "Harshnew@gmail123",
    "database": "db_leetcode",
}

# Difficulty mapping for numeric float values (0.0, 0.5, 1.0)
DIFFICULTY_MAP = {0.0: "Easy", 0.5: "Medium", 1.0: "Hard"}


def get_difficulty_label(val):
    try:
        f_val = float(val)
        return DIFFICULTY_MAP.get(f_val, "Easy")
    except ValueError:
        return str(val)


# ---------------------------------------------------------
# 2. READ CSV AND PREPARE DATA
# ---------------------------------------------------------
print(f"Reading {CSV_FILE_PATH}...")
df = pd.read_csv(CSV_FILE_PATH)

# Identify feature columns for the vector:
# Continuous features + All 70+ topic weight columns (from 'Array' onwards)
topic_columns = list(df.columns[df.columns.get_loc("Array") :])
vector_columns = ["Acceptance Rate (%)", "Likes", "Dislikes"] + topic_columns

print(f"Detected {len(vector_columns)} features for question_vector.")

records_to_insert = []

for _, row in df.iterrows():
    q_num = int(row["ID"])
    title = str(row["Title"]).strip()

    # Generate title_slug (e.g., "earliest-finish-time-for-land-and-water-rides-i")
    title_slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")

    link = str(row["Link"]).strip()
    difficulty = get_difficulty_label(row["Difficulty"])

    # Extract vector features and round for clean storage
    raw_vector = [float(row[col]) for col in vector_columns]
    vector_json = json.dumps([round(val, 6) for val in raw_vector])

    records_to_insert.append(
        (q_num, title, title_slug, link, difficulty, vector_json)
    )

# ---------------------------------------------------------
# 3. BULK INSERT INTO MYSQL
# ---------------------------------------------------------
print(f"Connecting to MySQL database...")
db = mysql.connector.connect(**DB_CONFIG)
cursor = db.cursor()

sql_query = """
INSERT INTO questions (question_number, title, title_slug, problem_link, difficulty, question_vector)
VALUES (%s, %s, %s, %s, %s, %s)
ON DUPLICATE KEY UPDATE
    title=VALUES(title),
    title_slug=VALUES(title_slug),
    problem_link=VALUES(problem_link),
    difficulty=VALUES(difficulty),
    question_vector=VALUES(question_vector);
"""

print(f"Inserting {len(records_to_insert)} questions...")
cursor.executemany(sql_query, records_to_insert)
db.commit()

print(
    f"Successfully stored {cursor.rowcount} problem vectors in 'questions' table!"
)

cursor.close()
db.close()