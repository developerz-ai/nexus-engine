#!/usr/bin/env bun
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/bin/check.ts — run all quality gates.
//
// Performance Contract:
//   cold_start  < 300 ms
//   wall_time   < 60 s   (full gate set on a green tree)
//   mem_peak    < 128 MB

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { run } from '../lib/bun';
import { nxThrow } from '../lib/errors';
import { logInfo } from '../lib/log';
import { defineScript } from '../lib/skeleton';

export const meta = {
  name: 'check',
  version: '0.1.0',
  description:
    'Run the default quality gates: fmt, clippy, biome, shellcheck, deny. ruff and naga are opt-in via --only.',
  flags: {
    fix: 'switch',
    only: 'enum:fmt|clippy|biome|ruff|shellcheck|deny|naga',
    env: 'string',
  },
  exitCodes: [
    { code: 0, meaning: 'all gates pass' },
    { code: 5, meaning: 'one or more gates failed' },
  ],
} as const;

type Gate = 'fmt' | 'clippy' | 'biome' | 'ruff' | 'shellcheck' | 'deny' | 'naga';

// ruff is deliberately absent: the checkout contains no Python sources (ruff.toml
// is kept for the future scripts/sdks-py), so the gate could only ever fail. It
// stays reachable via `--only ruff`, like naga.
const DEFAULT_GATES: readonly Gate[] = ['fmt', 'clippy', 'biome', 'shellcheck', 'deny'];

// Anchored on NEXUS_ROOT when set, else on this file's own location: the gate
// runs from the repo root, from scripts/ (`bun run scripts/check`) and from
// tests, and a cwd-relative base makes every path dangle.
const SCRIPTS_DIR = process.env.NEXUS_ROOT
  ? resolve(process.env.NEXUS_ROOT, 'scripts')
  : resolve(import.meta.dir, '..');

// Deterministic list of the real bash inputs: the top-level `scripts/*` shims,
// identified by shebang. Enumerating at runtime auto-covers every future shim —
// a hand-maintained list rots (this gate once named a TOML file).
const SHEBANG = /^#!\s*\/(?:usr\/)?bin\/(?:env\s+)?(?:ba|da)?sh\b/;
export function shellSources(): string[] {
  return readdirSync(SCRIPTS_DIR)
    .filter((name) => {
      try {
        return SHEBANG.test(
          readFileSync(resolve(SCRIPTS_DIR, name), 'utf8').split('\n', 1)[0] ?? '',
        );
      } catch {
        return false; // directories and unreadable entries carry no shebang
      }
    })
    .sort()
    .map((name) => resolve(SCRIPTS_DIR, name));
}

export function gateCmd(g: Gate): string[] {
  switch (g) {
    case 'fmt':
      return ['cargo', 'fmt', '--all', '--', '--check'];
    case 'clippy':
      return ['cargo', 'clippy', '--workspace', '--all-targets', '--', '-D', 'warnings'];
    case 'biome':
      return ['bun', 'x', 'biome', 'check', '.'];
    case 'ruff':
      return ['ruff', 'check', '.'];
    case 'shellcheck':
      // After bash purge, only shim files remain (one-line execs); argv only,
      // never a shell-built glob. An empty list means no shell input exists.
      return ['shellcheck', '-x', ...shellSources()];
    case 'deny':
      return ['cargo', 'deny', 'check'];
    case 'naga':
      return ['naga', 'validate'];
  }
}

interface GateResult {
  gate: Gate;
  ok: boolean;
  exit?: number;
  skipped?: boolean;
}

// Only the entry point runs the gates; importing this module (the test does)
// must not execute them — `defineScript` ends in process.exit().
if (import.meta.main)
  await defineScript(meta, async (args) => {
    const gates: readonly Gate[] = args.only ? [args.only as Gate] : DEFAULT_GATES;
    const results: GateResult[] = [];
    let overallOk = true;

    for (const g of gates) {
      if (args['dry-run']) {
        logInfo('would run', { gate: g });
        results.push({ gate: g, ok: true, skipped: true });
        continue;
      }
      logInfo('running', { gate: g });
      const r = await run(gateCmd(g));
      if (r.exitCode === 0) {
        results.push({ gate: g, ok: true });
      } else {
        results.push({ gate: g, ok: false, exit: r.exitCode });
        overallOk = false;
      }
    }

    const summary = { gates: results, fix: args.fix === true };
    if (!overallOk) {
      nxThrow({
        tag: 'GateFailed',
        gate: 'multiple',
        exitCode: 5,
        message: 'one or more gates failed',
      });
    }
    return { exitCode: 0, summary };
  });
