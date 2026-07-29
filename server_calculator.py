from typing import List, Optional
import time
import random
from fastapi import FastAPI, HTTPException
import numpy as np
from pydantic import BaseModel
import requests
from sklearn.metrics.pairwise import cosine_similarity
import uvicorn

from topics_config import TOPIC_NAME_TO_INDEX

app = FastAPI(title="LeetCode Recommendation Engine")

# Scaling multipliers for topic vector adjustments
BOOST_PRIMARY_MULTIPLIER = 1.45  # The requested topic gets the highest boost
BOOST_PEER_MULTIPLIER = 1.25     # Co-occurring peer topics get a secondary boost
SUPPRESS_MULTIPLIER = 0.55

# Extra priority boost per "found difficult" mark
DIFFICULT_BOOST_PER_MARK = 0.08
DIFFICULT_BOOST_MAX = 0.40

# Map of main topics to their top 4 co-occurring peer topics
import json
import os

# 1. Get the absolute path to topic_co_occurrence.json (in the same directory)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JSON_PATH = os.path.join(BASE_DIR, "topics.json")

# 2. Load the JSON data dynamically on startup
TOPIC_CO_OCCURRENCE = {}

if os.path.exists(JSON_PATH):
    try:
        with open(JSON_PATH, "r", encoding="utf-8") as f:
            TOPIC_CO_OCCURRENCE = json.load(f)
        print(f"✅ Loaded {len(TOPIC_CO_OCCURRENCE)} topics from topics.json")
    except json.JSONDecodeError as e:
        print(f"❌ Error reading JSON format in {JSON_PATH}: {e}")
else:
    print(f"⚠️ Warning: {JSON_PATH} not found. TOPIC_CO_OCCURRENCE is empty!")


def expand_topics_with_co_occurrence(boost_topics: List[str]) -> List[tuple]:
    """
    Expands each requested boost topic to include its top 4 co-occurring peer topics.
    Returns a list of (topic_index, multiplier) tuples.
    """
    adjustments = []
    
    for main_topic in boost_topics:
        # 1. Boost the main selected topic
        idx = TOPIC_NAME_TO_INDEX.get(main_topic)
        if idx is not None:
            adjustments.append((idx, BOOST_PRIMARY_MULTIPLIER))
        
        # 2. Boost top 4 co-occurring peer topics
        peers = TOPIC_CO_OCCURRENCE.get(main_topic, [])
        for peer in peers:
            peer_idx = TOPIC_NAME_TO_INDEX.get(peer)
            if peer_idx is not None:
                adjustments.append((peer_idx, BOOST_PEER_MULTIPLIER))
                
    return adjustments


# =====================================================================
# Pydantic Schemas
# =====================================================================
class SyncRequest(BaseModel):
    cookie: str  # Full cookie string: "LEETCODE_SESSION=...; csrftoken=..."
    csrf_token: Optional[str] = None


class Candidate(BaseModel):
    id: int
    vector: List[float]


class DifficultQuestion(BaseModel):
    id: int
    times_marked: int


class SimilarityRequest(BaseModel):
    user_vector: List[float]
    candidates: List[Candidate]
    difficulty: Optional[str] = None  # Difficulty filter / search radius mode passed from server.js
    boost_topics: List[str] = []      # Topics to weight UP
    suppress_topics: List[str] = []   # Topics to weight DOWN
    difficult_questions: List[DifficultQuestion] = []  # Previously struggled questions


# =====================================================================
# GraphQL Query
# =====================================================================
QUERY_USER_PROGRESS = """
query userProgressQuestionList($filters: UserProgressQuestionListInput) {
  userProgressQuestionList(filters: $filters) {
    totalNum
    questions {
      frontendId
      title
      difficulty
      questionStatus
    }
  }
}
"""


# =====================================================================
# API 1: Fetch Solved Question IDs from LeetCode
# =====================================================================
@app.post("/engine/fetch-ids")
def fetch_solved_ids(data: SyncRequest):
    raw_cookie = data.cookie.strip()
    csrf_token = data.csrf_token or ""

    if not csrf_token and "csrftoken=" in raw_cookie:
        for part in raw_cookie.split(";"):
            if "csrftoken=" in part:
                csrf_token = part.split("csrftoken=")[1].strip()
                break

    headers = {
        "Content-Type": "application/json",
        "Cookie": raw_cookie,
        "x-csrftoken": csrf_token,
        "Referer": "https://leetcode.com",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            " (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
    }

    url = "https://leetcode.com/graphql"
    all_solved_ids = []
    skip = 0
    limit = 100

    try:
        while True:
            variables = {
                "filters": {
                    "skip": skip,
                    "limit": limit,
                    "questionStatus": "SOLVED",
                }
            }

            response = requests.post(
                url,
                json={"query": QUERY_USER_PROGRESS, "variables": variables},
                headers=headers,
                timeout=10,
            )

            if response.status_code == 401:
                raise HTTPException(
                    status_code=401,
                    detail="LeetCode session or CSRF token expired.",
                )

            response.raise_for_status()
            res_data = response.json()

            if "errors" in res_data:
                raise HTTPException(
                    status_code=400, detail=res_data["errors"][0]["message"]
                )

            progress_data = res_data.get("data", {}).get(
                "userProgressQuestionList", {}
            )
            total_num = progress_data.get("totalNum", 0)
            questions = progress_data.get("questions", [])

            if not questions:
                break

            for q in questions:
                if q.get("frontendId"):
                    all_solved_ids.append(int(q["frontendId"]))

            skip += limit

            if len(all_solved_ids) >= total_num:
                break

            time.sleep(0.3)

        return {
            "solved_ids": list(set(all_solved_ids)),
            "total_count": len(all_solved_ids),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch solved problems: {str(e)}"
        )


# =====================================================================
# API 2: Vector Proximity Matrix Matcher
# =====================================================================
@app.post("/engine/calculate-similarity")
def calculate_similarity(data: SimilarityRequest):
    user_vector = data.user_vector
    candidates = data.candidates

    if not user_vector or not candidates:
        raise HTTPException(
            status_code=400, detail="Missing vector data parameters"
        )

    # 1. Expand requested boost topics into 5-way directional adjustments
    adjustments = expand_topics_with_co_occurrence(data.boost_topics)

    # 2. Add suppress topic adjustments
    for name in data.suppress_topics:
        idx = TOPIC_NAME_TO_INDEX.get(name)
        if idx is not None:
            adjustments.append((idx, SUPPRESS_MULTIPLIER))

    # 3. Map "Found Difficult" priority boosts
    difficult_boost_by_id = {
        dq.id: min(dq.times_marked * DIFFICULT_BOOST_PER_MARK, DIFFICULT_BOOST_MAX)
        for dq in data.difficult_questions
    }

    u_matrix = np.array(user_vector).reshape(1, -1)
    scored_candidates = []
    diff = (data.difficulty or "").strip().capitalize()

    # 4. Score every candidate
    for cand in candidates:
        if not cand.vector:
            continue

        cand_values = list(cand.vector)
        for idx, multiplier in adjustments:
            if idx < len(cand_values):
                cand_values[idx] *= multiplier

        cand_matrix = np.array(cand_values).reshape(1, -1)
        raw_sim = float(cosine_similarity(u_matrix, cand_matrix)[0][0])

        # Apply search circle strategy based on difficulty
        if diff == "Hard":
            # Large Circle: Target lower/further similarity boundary across vector space
            target_score = 1.0 - raw_sim
        elif diff == "Medium":
            # Medium Circle: Target moderate distance around 0.5
            target_score = 1.0 - abs(raw_sim - 0.5)
        else:
            # Easy: Small Circle / highest similarity match
            target_score = raw_sim

        # Priority boost for previously marked difficult questions
        target_score += difficult_boost_by_id.get(cand.id, 0.0)

        scored_candidates.append({
            "id": cand.id,
            "raw_similarity": raw_sim,
            "target_score": target_score
        })

    if not scored_candidates:
        return {"recommended_id": None, "score": 0.0}

    # 5. Rank candidates descending by target_score
    scored_candidates.sort(key=lambda x: x["target_score"], reverse=True)

    # 6. Extract Top 5 matching candidates
    top_5 = scored_candidates[:5]

    # 7. Pick 1 randomly from the Top 5
    chosen = random.choice(top_5)

    return {
        "recommended_id": chosen["id"],
        "score": chosen["raw_similarity"],
        "target_score": chosen["target_score"]
    }


# =====================================================================
# Server Startup
# =====================================================================
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)