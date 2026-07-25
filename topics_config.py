# =====================================================================
# topics_config.py
# Python twin of topics_config.js — keep these two files in sync.
# Order MUST match the vector column order used in filler_db.py.
# =====================================================================

NON_TOPIC_FEATURE_COUNT = 3  # Acceptance Rate, Likes, Dislikes

TOPIC_NAMES = [
    "Array", "Backtracking", "Biconnected Component", "Binary Indexed Tree",
    "Binary Search", "Binary Search Tree", "Binary Tree", "Bit Manipulation",
    "Bitmask", "Brainteaser", "Breadth-First Search", "Bucket Sort",
    "Combinatorics", "Counting", "Counting Sort", "Data Stream",
    "Depth-First Search", "Design", "Divide and Conquer", "Doubly-Linked List",
    "Dynamic Programming", "Enumeration", "Eulerian Circuit", "Game Theory",
    "Geometry", "Graph", "Greedy", "Hash Function", "Hash Table",
    "Heap (Priority Queue)", "Interactive", "Iterator", "Line Sweep",
    "Linked List", "Math", "Matrix", "Memoization", "Merge Sort",
    "Minimum Spanning Tree", "Monotonic Queue", "Monotonic Stack",
    "Number Theory", "Ordered Set", "Prefix Sum", "Probability and Statistics",
    "Queue", "Quickselect", "Radix Sort", "Randomized", "Recursion",
    "Rejection Sampling", "Reservoir Sampling", "Rolling Hash", "Segment Tree",
    "Shortest Path", "Simulation", "Sliding Window", "Sort", "Sorting",
    "Stack", "String", "String Matching", "Strongly Connected Component",
    "Suffix Array", "Topological Sort", "Tree", "Trie", "Two Pointers",
    "Union Find",
]

# Map topic name -> index in the full question_vector, built once.
TOPIC_NAME_TO_INDEX = {
    name: NON_TOPIC_FEATURE_COUNT + i for i, name in enumerate(TOPIC_NAMES)
}
