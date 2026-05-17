#!/usr/bin/env bun
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/bin/bootstrap.ts — install required toolchains.
//
// Performance Contract:
//   cold_start  < 300 ms
//   wall_time   < 30 s   (full install path; "all present" path < 1 s)
//   mem_peak    < 64 MB

import { hasTool } from '../lib/bun';
import { defineScript } from '../lib/skeleton';
import { logInfo } from '../lib/log';

export const meta = {
  name: 'bootstrap',
  version: '0.1.0',
  description:
    'Install required toolchains (rustup, nextest, sccache, bun, ruff, sops, …).',
  flags: {
    minimal: 'switch',
    'with-gpu': 'switch',
    tool: 'string[]',
    env: 'string',
  },
  exitCodes: [
    { code: 0, meaning: 'success' },
    { code: 4, meaning: 'missing prerequisite' },
    { code: 10, meaning: 'download / network error' },
  ],
} as const;

const FULL_TOOLS = [
  'rustup',
  'cargo-nextest',
  'sccache',
  'bun',
  'ruff',
  'shellcheck',
  'shfmt',
  'jq',
  'yq',
  'sops',
  'naga-cli',
];
const MINIMAL_TOOLS = ['rustup', 'sccache', 'jq', 'shellcheck'];

await defineScript(meta, async (args) => {
  const want = new Set<string>(args.minimal ? MINIMAL_TOOLS : FULL_TOOLS);
  if (args['with-gpu']) want.add('naga-cli');
  for (const t of args.tool ?? []) want.add(t);

  const installed: string[] = [];
  const skipped: string[] = [];
  const planned: string[] = [];

  for (const tool of want) {
    if (await hasTool(tool)) {
      skipped.push(tool);
      continue;
    }
    planned.push(tool);
    if (!args['dry-run']) {
      // Real installer would dispatch per-tool (rustup-init, brew, apt, …).
      // For now we log intent — bash original had the same placeholder
      // behaviour. Tracking concrete per-tool installers in PR-2.
      // TODO(impl): per-tool installer dispatch — tracked in PR-2.
      logInfo('installing', { tool });
      installed.push(tool);
    }
  }

  return {
    exitCode: 0,
    summary: { installed, skipped, planned },
  };
});
