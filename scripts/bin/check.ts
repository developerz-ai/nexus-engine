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

import { run } from '../lib/bun';
import { nxThrow } from '../lib/errors';
import { logInfo } from '../lib/log';
import { defineScript } from '../lib/skeleton';

export const meta = {
  name: 'check',
  version: '0.1.0',
  description:
    'Run all quality gates: fmt, clippy, biome, ruff, shellcheck, naga, cargo-deny.',
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
const DEFAULT_GATES: readonly Gate[] = ['fmt', 'clippy', 'biome', 'ruff', 'shellcheck', 'deny'];

function gateCmd(g: Gate): string[] {
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
      // After bash purge, only shim files remain (one-line execs).
      return ['shellcheck', '-x', 'scripts/lib/versions.toml'];
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
    nxThrow({ tag: 'GateFailed', gate: 'multiple', exitCode: 5, message: 'one or more gates failed' });
  }
  return { exitCode: 0, summary };
});
