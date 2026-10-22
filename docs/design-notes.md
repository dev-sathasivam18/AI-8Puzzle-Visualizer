# Design notes

## Architecture

```
puzzle.js  ──►  ucs.js  ──►  trace  ──►  solver.js (Replay + rendering)
(model)        (search)     (recorded)   board.js (animation)
heap.js ───────┘
```

* **`puzzle.js`** – states are 9-element arrays; inside the search a state is packed into one integer
  (`[2,8,3,1,6,4,7,0,5]` → `283164705`) so it can be used as a `Map` / `Set` key.
* **`ucs.js`** – runs the full search, storing per-node arrays (key, parent, g, depth, move) and, per expansion step,
  the node popped plus the list of generated successors with a status
  (`NEW`, `IMPROVED`, `DUP_EXPLORED`, `DUP_FRONTIER`).
* **`solver.js`** – `Replay` applies / undoes those steps on a live frontier `Set` and an explored array, which makes
  *Previous Step* exact and cheap (O(branching factor) per step) without storing a frontier snapshot per step.

## Why record a trace instead of animating the live search?

Running first and replaying later keeps the UI responsive (even the hardest 31-move puzzle needs only ~180 k expansions
and finishes in well under a second), allows stepping **backwards**, lets the speed range from 1 to 3000 expansions per
second, and guarantees the animation shows what the algorithm really did.

## UCS details worth knowing

* Frontier ordering: `(g, creation order)` → equal-cost nodes are expanded first-in-first-out.
* A cheaper path to a state already in the frontier creates a **new** node; the old heap entry becomes stale and is skipped
  when popped (lazy deletion). The UI shows this as "Cheaper path found – replaced".
* The goal test is on **pop**. Testing at generation time would be faster but loses optimality when step costs differ.
* With unit costs every node at depth *k* is expanded before any at depth *k+1* — UCS ≡ BFS (except for the goal-test time).
  The *tile-weighted* cost model (cost = number on the moved tile) makes UCS behave differently.

## Memory estimate

`peak(frontier + explored) × 64 bytes`. It is a model of the data the algorithm must keep, not a measurement of the
JavaScript heap (the trace recorded for the animation is deliberately **not** counted).
