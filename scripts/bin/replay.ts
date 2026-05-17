#!/usr/bin/env bun
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/bin/replay.ts — deterministic snapshot replay via `nexus replay`.
//
// Performance Contract:
//   cold_start  < 300 ms
//   wall_time   < 60 s   (single snapshot, headless)
//   mem_peak    < 256 MB

import { writeFileSync } from 'node:fs';

import { hasTool, run } from '../lib/bun';
import { nxThrow } from '../lib/errors';
import { defineScript } from '../lib/skeleton';

export const meta = {
  name: 'replay',
  version: '0.1.0',
  description: 'Replay a deterministic snapshot via `nexus replay`.',
  flags: {
    snapshot: { type: 'path', required: true },
    'from-frame': { type: 'int', default: 0 },
    patch: 'string',
    bisect: 'switch',
    env: 'string',
  },
  exitCodes: [
    { code: 0, meaning: 'replay completed' },
    { code: 2, meaning: 'missing --snapshot' },
    { code: 4, meaning: 'nexus CLI missing' },
    { code: 5, meaning: 'replay failed' },
  ],
} as const;

await defineScript(meta, async (args) => {
  const snap = args.snapshot;
  const fromFrame = typeof args['from-frame'] === 'number' ? args['from-frame'] : 0;
  const patch = args.patch ?? '';

  const cmd: string[] = ['nexus', 'replay', snap, '--from-frame', String(fromFrame)];
  if (patch) cmd.push('--patch', patch);
  if (args.bisect) cmd.push('--bisect');

  if (args['dry-run']) {
    return {
      exitCode: 0,
      summary: {
        snapshot: snap,
        from_frame: fromFrame,
        patch,
        bisect: args.bisect === true,
      },
    };
  }

  if (!(await hasTool('nexus'))) {
    nxThrow({
      tag: 'MissingPrerequisite',
      tool: 'nexus',
      suggestedFix: 'scripts/bootstrap',
    });
  }

  const r = await run(cmd);
  const logPath = '/tmp/replay.out';
  try {
    writeFileSync(logPath, `${r.stdout}\n${r.stderr}`);
  } catch {
    /* best-effort */
  }
  if (r.exitCode !== 0) {
    nxThrow({ tag: 'GateFailed', gate: 'replay', exitCode: 5, message: 'replay failed' });
  }
  return {
    exitCode: 0,
    summary: { snapshot: snap, log: logPath },
  };
});
