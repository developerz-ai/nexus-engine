#!/usr/bin/env bun
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/bin/scenario.ts — run TOML scenario(s) via `nexus run --scenario`.
//
// Performance Contract:
//   cold_start  < 300 ms
//   wall_time   < 60 s   (single scenario, headless)
//   mem_peak    < 256 MB

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { hasTool, run } from '../lib/bun';
import { nxThrow } from '../lib/errors';
import { defineScript } from '../lib/skeleton';

export const meta = {
  name: 'scenario',
  version: '0.1.0',
  description: 'Run TOML scenario(s) via `nexus run --scenario`.',
  flags: {
    file: 'path',
    batch: 'switch',
    parallel: { type: 'int', default: 1 },
    record: 'switch',
    env: 'string',
  },
  exitCodes: [
    { code: 0, meaning: 'scenarios passed' },
    { code: 2, meaning: 'neither --file nor --batch given' },
    { code: 4, meaning: 'nexus CLI missing' },
    { code: 5, meaning: 'one or more scenarios failed' },
  ],
} as const;

function findScenarioFiles(root: string): string[] {
  const out: string[] = [];
  const stack: string[] = [`${root}/docs/specs`];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = join(dir, name);
      let s: ReturnType<typeof statSync>;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (s.isFile() && full.endsWith('.toml') && full.includes('/scenarios/')) {
        out.push(full);
      }
    }
  }
  return out;
}

await defineScript(meta, async (args) => {
  const file = args.file ?? '';
  const parallel = typeof args.parallel === 'number' ? args.parallel : 1;
  const root = process.env.NEXUS_ROOT ?? process.cwd();

  let files: string[];
  if (args.batch) {
    files = findScenarioFiles(root);
  } else if (file !== '') {
    files = [file];
  } else {
    nxThrow({ tag: 'Usage', message: 'either --file or --batch required' });
  }

  if (args['dry-run']) {
    return {
      exitCode: 0,
      summary: { files, parallel, record: args.record === true },
    };
  }

  if (!(await hasTool('nexus'))) {
    nxThrow({
      tag: 'MissingPrerequisite',
      tool: 'nexus',
      suggestedFix: 'scripts/bootstrap',
    });
  }

  const results: { file: string; ok: boolean }[] = [];
  let overall = 0;
  for (const f of files) {
    const cmd = ['nexus', 'run', '--scenario', f, '--headless'];
    if (args.record) cmd.push('--record');
    const r = await run(cmd);
    if (r.exitCode === 0) {
      results.push({ file: f, ok: true });
    } else {
      results.push({ file: f, ok: false });
      overall = 5;
    }
  }

  const summary = { results, parallel };
  if (overall !== 0) {
    nxThrow({ tag: 'GateFailed', gate: 'scenario', exitCode: 5, message: 'one or more scenarios failed' });
  }
  return { exitCode: 0, summary };
});
