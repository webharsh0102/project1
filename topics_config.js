// =====================================================================
// topics_config.js
// Single source of truth for the topic names, IN VECTOR ORDER.
// This MUST match the column order used in filler_db.py when the
// question_vector was built, otherwise boost/suppress will hit the
// wrong index and silently corrupt the similarity score.
//
// Vector layout reminder (see filler_db.py):
//   index 0        -> Acceptance Rate (%)
//   index 1        -> Likes
//   index 2        -> Dislikes
//   index 3 .....N -> one entry per topic below, in this exact order
// =====================================================================

const NON_TOPIC_FEATURE_COUNT = 3; // Acceptance Rate, Likes, Dislikes

const TOPIC_NAMES = [
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
  "Union Find"
];

module.exports = { NON_TOPIC_FEATURE_COUNT, TOPIC_NAMES };
