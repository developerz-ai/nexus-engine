#!/usr/bin/env bun
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/bin/symbols-upload.ts — upload PDB/dSYM/source-maps to a symbol store.
//
// Performance Contract:
//   cold_start  < 300 ms
//   wall_time   < 300 s  (network upload bound)
//   mem_peak    < 128 MB

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { run } from '../lib/bun';
import { nxThrow } from '../lib/errors';
import { defineScript } from '../lib/skeleton';

export const meta = {
  name: 'symbols-upload',
  version: '0.1.0',
  description: 'Upload PDB/dSYM/source-maps to a symbol store.',
  flags: {
    target: { type: 'string', required: true },
    release: { type: 'string', required: true },
    store: { type: 'enum:sentry|glitchtip|self', default: 'sentry' },
    env: 'string',
  },
  exitCodes: [
    { code: 0, meaning: 'uploaded' },
    { code: 2, meaning: 'missing/invalid flag' },
    { code: 4, meaning: 'symbols dir missing' },
    { code: 6, meaning: 'upload failed' },
  ],
} as const;

function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur) continue;
    let entries: string[];
    try {
      entries = readdirSync(cur);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = join(cur, name);
      let s: ReturnType<typeof statSync>;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) stack.push(full);
      else if (s.isFile()) count += 1;
    }
  }
  return count;
}

await defineScript(meta, async (args) => {
  const target = args.target;
  const release = args.release;
  const store = (args.store || 'sentry') as 'sentry' | 'glitchtip' | 'self';

  const root = process.env.NEXUS_ROOT ?? process.cwd();
  const symDir = `${root}/target/${target}/symbols`;

  if (args['dry-run']) {
    return {
      exitCode: 0,
      summary: {
        target,
        release,
        store,
        sym_dir: symDir,
        files: countFiles(symDir),
      },
    };
  }

  if (!existsSync(symDir)) {
    nxThrow({
      tag: 'MissingPrerequisite',
      tool: `symbols-dir:${symDir}`,
      message: `symbols dir missing: ${symDir}`,
      suggestedFix: `scripts/build --target ${target} --profile release`,
    });
  }

  let cmd: string[];
  switch (store) {
    case 'sentry':
      cmd = [
        'sentry-cli',
        'debug-files',
        'upload',
        '--include-sources',
        '--org',
        process.env.SENTRY_ORG ?? '',
        '--project',
        process.env.SENTRY_PROJECT ?? '',
        symDir,
      ];
      break;
    case 'glitchtip':
      cmd = [
        'curl',
        '-sf',
        '-F',
        `release=${release}`,
        '-F',
        `file=@${symDir}`,
        `${process.env.GLITCHTIP_URL ?? ''}/api/0/projects/symbols/`,
      ];
      break;
    case 'self':
      cmd = [
        'rsync',
        '-av',
        `${symDir}/`,
        `${process.env.SYMBOLS_HOST ?? ''}:/var/lib/symbols/${release}/`,
      ];
      break;
  }

  const r = await run(cmd);
  if (r.exitCode !== 0) {
    nxThrow({
      tag: 'ToolFailed',
      tool: store,
      exitCode: r.exitCode,
      stderr: r.stderr,
      message: 'symbols upload failed',
    });
  }
  return {
    exitCode: 0,
    summary: { target, release, store, uploaded: true },
  };
});
