# Demo video script (target 4 minutes, limit 3–5)

Record your screen with the live GitHub Pages site open. Use the **assignment example** first (it is short and easy to follow), then a harder random puzzle.

| Time | Screen | What to say |
|---|---|---|
| 0:00–0:20 | **Home** page | "I'm *<name>*, *<reg no>*. This is my 8-Puzzle visualiser for the AI course. My assigned algorithm is Uniform Cost Search, algorithm number 5. The project is built with HTML, CSS, JavaScript and Bootstrap, and deployed on GitHub Pages." |
| 0:20–0:50 | Home → intro text | "The 8-puzzle is a state-space search problem: states are tile arrangements, actions move the blank up/down/left/right, and every move costs one." |
| 0:50–1:20 | **Algorithms** page → UCS | "UCS always expands the frontier node with the lowest path cost g(n). It's Dijkstra on a state space. It is complete and optimal; its goal test happens when a node is *popped*, which guarantees optimality. Time and space are O(b^(1+C*/ε))." |
| 1:20–1:50 | **Solver** → input | "I can type an initial and goal state, or press *Generate Random Puzzle*. Here I'll load the assignment example: 2 8 3 / 1 6 4 / 7 _ 5 to 1 2 3 / 8 _ 4 / 7 6 5. The app also checks solvability using inversion parity." |
| 1:50–2:50 | Press **Run** (speed ≈ 2–3) | Point at: current node being expanded, parent, generated successors and their labels (new / already explored), the frontier ordered by g(n), the explored list, and the counters (generated, expanded, depth). Use **Pause / Next / Previous** to show one expansion carefully. |
| 2:50–3:10 | Solution path | "When the goal is popped, the board animates the blank moving along the solution: 5 moves, cost 5. The summary shows nodes generated, expanded, max depth, time, path cost and approximate memory." |
| 3:10–3:40 | Switch **cost model** to *Tile-weighted*, run again | "With unit costs UCS behaves like BFS. If moving tile *n* costs *n*, UCS finds the *cheapest* path, which may use more moves — this is where UCS differs from BFS." |
| 3:40–4:10 | **Comparison** page | "All algorithms on the same puzzle. BFS, IDDLS, A\* and UCS find the optimal path; DFS finds a very long one; DLS fails if the limit is too small. A\* and GBFS expand far fewer nodes because they use a heuristic — Manhattan distance or misplaced tiles." |
| 4:10–4:30 | GitHub repo | "Source code is organised into css, js, docs; the README has setup and deployment instructions. Thank you." |

## Checklist before recording

- [ ] `js/config.js` contains your real name and registration number
- [ ] README links and screenshots updated
- [ ] Site opens from the GitHub Pages URL (not just locally)
- [ ] Tried: example puzzle, random puzzle, unsolvable puzzle, tile-weighted costs
