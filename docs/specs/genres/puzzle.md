<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Puzzle Genre Module

> Puzzle primitives: state-machine puzzles with deterministic transitions, full undo stack, hint generator (solver-based), level validator that proves solvability.

**Plug-in.** Declared in `Nexus.toml`:
```toml
[genres.puzzle] version = "0.1"
undo_depth = 256
hint_strategy = "solver"      # "solver" | "scripted" | "off"
deterministic = true
```

## Boundaries

- Owns: puzzle state model, command/undo/redo stack, transition validation, level metadata, solver interface, hint generation.
- Does NOT own: visual presentation of state (game-side), input mapping (input HAL).
- Depends on: scripting (custom rule scripts), ECS (for entity-puzzle hybrids), telemetry.

## Architecture

```
                  ┌──────────────────────────────┐
                  │   PuzzleState (immutable)    │
                  └──────────────┬───────────────┘
                                 │ apply(Move)
                                 ▼
                          ┌────────────┐
                          │ Validator  │   (rule script: legal?)
                          └─────┬──────┘
                                │ legal
                                ▼
                  ┌───────────────────────────────┐
                  │   New PuzzleState (immutable) │ ─► pushed to UndoStack
                  └───────────────┬───────────────┘
                                  ▼
                          GoalChecker → Won?

   Solver (BFS/A*/IDA*): replays moves to find goal → returns plan
   Hint = first move of solver's plan from current state
```

## State Model

State is a **plain serializable struct** (per game). Engine doesn't impose schema, only contract: `Hash + Eq + Clone + Serialize`. Transition function: `state, move → Option<state>`.

This enables:
- Undo = pop previous state (cheap because states are small).
- Solver = graph search over state space (BFS by default).
- Hint = solver step 1.
- Validator = "is this level solvable?" = "does BFS find goal?".

## Public API

```rust
// trait the game implements per puzzle type
pub trait Puzzle: Sized + Clone + Eq + std::hash::Hash + Serialize {
    type Move: Clone + Serialize;
    fn legal_moves(&self) -> Vec<Self::Move>;
    fn apply(&self, m: &Self::Move) -> Option<Self>;
    fn is_goal(&self) -> bool;
    fn heuristic(&self) -> u32 { 0 } // for A*/IDA*
}

// engine-provided
pub struct UndoStack<P: Puzzle> { past: Vec<P>, future: Vec<P>, max: usize }
impl<P: Puzzle> UndoStack<P> {
    pub fn do_move(&mut self, current:&mut P, m: P::Move) -> Result<(), MoveErr>;
    pub fn undo(&mut self, current:&mut P) -> bool;
    pub fn redo(&mut self, current:&mut P) -> bool;
}

pub struct Solver;
impl Solver {
    pub fn bfs<P:Puzzle>(start:&P, max_states:usize) -> Option<Vec<P::Move>>;
    pub fn astar<P:Puzzle>(start:&P, max_states:usize) -> Option<Vec<P::Move>>;
    pub fn ida_star<P:Puzzle>(start:&P, max_depth:u32) -> Option<Vec<P::Move>>;
}

// events
pub enum PuzzleEvent { Moved{m_id}, Undid, Redid, Solved, StuckDetected, HintRequested, HintReturned{move} }
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Undo/Redo | O(1) state clone bound by P size | <100 µs |
| BFS solver (10⁵ states) | <300 ms | 2 s |
| A* solver (10⁵ states) | <200 ms | 1 s |
| Hint generation cache hit | <10 µs | 100 µs |
| Determinism (replay from move log) | bit-exact | required |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `PUZ_E001` | illegal move | reject, telemetry |
| `PUZ_E002` | solver budget exhausted | return Unknown, suggest higher budget |
| `PUZ_E010` | level not solvable | block release, surface in editor |

## Solver Strategy Picker

| State space size | Strategy |
|---|---|
| ≤ 10⁴ | BFS (optimal, exhaustive) |
| 10⁴–10⁷ with good heuristic | A* |
| > 10⁷ with admissible h | IDA* (memory-bounded) |
| Sokoban-like | A* + deadlock pruning hooks (game-side) |

## Integration Points

- Editor: puzzle level editor calls `Solver::bfs` before save to verify solvability → `docs/specs/editor/scene.md`.
- Agent: scenario "play 100 levels with solver auto-pilot" verifies game build → `docs/specs/agent/scenarios.md`.
- Networking: turn-based competitive puzzles use input log + replay (no rollback needed) → `docs/specs/networking/replication.md`.

## Hint System

Two modes:
1. **Solver mode**: on `HintRequested`, run A* from current state, return move[0]. Cache (state → next move) per level.
2. **Scripted mode**: designer authors `hint(state) → move` in Lua for puzzles with narrative steering (e.g., tutorial).

## Telemetry

```json
{"t":42.1,"sys":"puz","evt":"moved","m_id":"swap_3_4","seq":17,"is_undo":false,"states_explored_since":12}
```
Per-level: mean moves to solve, hint rate, undo rate (= difficulty estimate).

## Test Requirements

- Apply N random legal moves then N undos → state == initial.
- Solver BFS finds known solution length on golden levels (15-puzzle, Sokoban micro-levels).
- Level validator detects intentional unsolvable level.
- Replay from move log produces identical final state.
- Hint cache invalidation: cache empties on level reset.

## Prior Art

- The Witness solver tooling (Thekla blog, Jon Blow) ✓ inspiration for "every level provably solvable".
- Stephen's Sausage Roll undo-as-mechanic ✓ — instant deep undo.
- Baba Is You rule-rewriting state ✓ — extreme example of "state machine puzzle".
- Sokoban deadlock detection (academic) ✓ pruning hooks.
- Portal 2 puzzle creator validation ✓ pre-publish solver check.

## Open Questions

- [DECISION NEEDED] Solver as default plug-in or opt-in (BFS cost on mobile).
- [DECISION NEEDED] State persistence between sessions (autosave on every move?).
- [BENCHMARK NEEDED] IDA* depth limits for Rush Hour / Sokoban-class.
