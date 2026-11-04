// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// nexus-cli — Rails-style scaffolder: new, add, generate, build, test, deploy, agent.
//
// Spec: docs/game-template/cli.md
// Status: stub (Phase 0 scaffold). No public API yet.

#![forbid(unsafe_code)]

fn main() {
    // Structured JSON only — Law 1.
    println!(
        r#"{{"tool":"nexus","version":"0.1.0","status":"stub","spec":"docs/game-template/cli.md"}}"#
    );
}
