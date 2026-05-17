<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# tmp/

Ephemeral scratch space. Subagents write debug artifacts, intermediate snapshots, and one-off cache files here.

| Subdir | Purpose |
|---|---|
| `cache/` | reusable computation cache (safe to evict) |
| `snapshots/` | mid-run world snapshots for diff/debug |

Gitignored except `.keep` markers and this README. Safe to `rm -rf tmp/` at any time — nothing here is canonical.
