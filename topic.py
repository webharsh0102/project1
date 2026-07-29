

import ast
import json
import pandas as pd
import numpy as np

# 1. Load your dataset (Replace 'leetcode_questions.csv' with your file path)
df = pd.read_csv('leetcode_transformed_data2.csv')

df.head(

)

df.columns

topics = ['Array', 'Backtracking', 'Biconnected Component',
       'Binary Indexed Tree', 'Binary Search', 'Binary Search Tree',
       'Binary Tree', 'Bit Manipulation', 'Bitmask', 'Brainteaser',
       'Breadth-First Search', 'Bucket Sort', 'Combinatorics', 'Counting',
       'Counting Sort', 'Data Stream', 'Depth-First Search', 'Design',
       'Divide and Conquer', 'Doubly-Linked List', 'Dynamic Programming',
       'Enumeration', 'Eulerian Circuit', 'Game Theory', 'Geometry', 'Graph',
       'Greedy', 'Hash Function', 'Hash Table', 'Heap (Priority Queue)',
       'Interactive', 'Iterator', 'Line Sweep', 'Linked List', 'Math',
       'Matrix', 'Memoization', 'Merge Sort', 'Minimum Spanning Tree',
       'Monotonic Queue', 'Monotonic Stack', 'Number Theory', 'Ordered Set',
       'Prefix Sum', 'Probability and Statistics', 'Queue', 'Quickselect',
       'Radix Sort', 'Randomized', 'Recursion', 'Rejection Sampling',
       'Reservoir Sampling', 'Rolling Hash', 'Segment Tree', 'Shortest Path',
       'Simulation', 'Sliding Window', 'Sort', 'Sorting', 'Stack', 'String',
       'String Matching', 'Strongly Connected Component', 'Suffix Array',
       'Topological Sort', 'Tree', 'Trie', 'Two Pointers', 'Union Find']

df = df [topics]

n = len(topics)



matrix = np.zeros((n, n), dtype=float)

def update_co_occurrence(matrix, row_values):
    tl = []

    # 1. Collect column indices where the topic value is non-zero
    for i in range(len(row_values)):
        if row_values[i] != 0:
            tl.append(i)

    # 2. Traverse the list of active topic indices
    # (Since j >= i handles the upper triangle, we increment both symmetric cells)
    for i in range(len(tl)):
        for j in range(len(tl)):

                idx1 = tl[i]
                idx2 = tl[j]

                # Increment the cell
                matrix[idx1][idx2] += 1

                # Mirror across diagonal so matrix is symmetric (if idx1 != idx2)


# --- Example Usage with DataFrame Row ---
# Assuming `co_matrix` is your N x N zero matrix and `df` is your Pandas DataFrame:
# for _, row in df.iterrows():
#     update_co_occurrence(co_matrix, row.values)

for _, row in df.iterrows():
    update_co_occurrence(matrix, row.values)

matrix

TOPIC_CO_OCCURRENCE = {}
for i in range(n):
    main_topic = topics[i]
    row = matrix[i]

    # Sort indices in descending order based on co-occurrence counts
    sorted_indices = np.argsort(row)[::-1]

    # Take top 4 indices where co-occurrence count is strictly greater than 0
    top_4_indices = [idx for idx in sorted_indices[:4] if row[idx] > 0]

    # Map column indices back to actual topic names
    peer_topics = [topics[idx] for idx in top_4_indices]

    TOPIC_CO_OCCURRENCE[main_topic] = peer_topics

# 3. Print ready-to-copy Python dictionary formatted for server_calculator.py
print("=" * 60)
print("GENERATED TOPIC_CO_OCCURRENCE DICTIONARY")
print("=" * 60 + "\n")
print("TOPIC_CO_OCCURRENCE = " + json.dumps(TOPIC_CO_OCCURRENCE, indent=4))
