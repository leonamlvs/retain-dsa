// Provider-filter mappings, not a deeper skill taxonomy. Categories remain official.
const categories: Readonly<Record<string, readonly string[]>> = {
  'Array / String': ['array', 'string'],
  'Two Pointers': ['two-pointers'],
  'Sliding Window': ['sliding-window'],
  'Prefix Sum': ['prefix-sum'],
  'Hash Map / Set': ['hash-table'],
  Stack: ['stack'],
  Queue: ['queue'],
  'Linked List': ['linked-list'],
  'Binary Tree - DFS': ['binary-tree', 'depth-first-search'],
  'Binary Tree - BFS': ['binary-tree', 'breadth-first-search'],
  'Binary Search Tree': ['binary-search-tree'],
  'Graphs - DFS': ['graph', 'depth-first-search'],
  'Graphs - BFS': ['graph', 'breadth-first-search'],
  'Heap / Priority Queue': ['heap-priority-queue'],
  'Binary Search': ['binary-search'],
  Backtracking: ['backtracking'],
  'DP - 1D': ['dynamic-programming'],
  'DP - Multidimensional': ['dynamic-programming'],
  // No verified dedicated Intervals topic: reject discovery until its mapping policy is approved.
  'Bit Manipulation': ['bit-manipulation'],
  Trie: ['trie'],
  Intervals: [],
  'Monotonic Stack': ['monotonic-stack'],
};
export function discoveryTags(category: string): string[] {
  return [...(categories[category] ?? [])];
}
