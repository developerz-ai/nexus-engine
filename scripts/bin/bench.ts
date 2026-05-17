#!/usr/bin/env bun
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/bin/bench.ts — criterion benches with baseline compare.
//
// Performance Contract:
//   cold_start  < 300 ms
//   wall_time   < 600 s  (criterion sampling is the dominant cost)
//   mem_peak    < 256 MB

import { writeFileSync } from 'node:fs';

import { cargo } from '../lib/cargo';
import { nxThrow } from '../lib/errors';
import { defineScript } from '../lib/skeleton';

export const meta = {
  name: 'bench',
  version: '0.1.0',
  description: 'Run criterion benches with baseline compare.',
  flags: {
    baseline: 'string',
    save: 'string',
    package: 'string',
    env: 'string',
  },
  exitCodes: [
    { code: 0, meaning: 'success' },
    { code: 5, meaning: 'bench failed' },
  ],
} as const;

await defineScript(meta, async (args) => {
  const baseline = args.baseline ?? '';
  const save = args.save ?? '';
  const pkg = args.package ?? '';

  const cargoArgs: string[] = ['bench'];
  if (pkg) cargoArgs.push('--package', pkg);
  // Criterion takes baseline/save after `--`.
  if (baseline) cargoArgs.push('--', '--baseline', baseline);
  if (save) cargoArgs.push('--', '--save-baseline', save);

  if (args['dry-run']) {
    return {
      exitCode: 0,
      summary: {
        baseline,
        save,
        package: pkg,
        plan: `cargo ${cargoArgs.join(' ')}`,
      },
    };
  }

  const r = await cargo(cargoArgs);
  const logPath = '/tmp/bench.out';
  try {
    writeFileSync(logPath, `${r.stdout}\n${r.stderr}`);
  } catch {
    // best-effort log dump
  }
  if (r.exitCode !== 0) {
    nxThrow({
      tag: 'GateFailed',
      gate: 'bench',
      exitCode: 5,
      message: `bench failed; see ${logPath}`,
    });
  }
  return {
    exitCode: 0,
    summary: { baseline, save, package: pkg, log: logPath },
  };
});
