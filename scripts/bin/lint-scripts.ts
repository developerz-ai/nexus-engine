#!/usr/bin/env bun
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/bin/lint-scripts.ts — lint scripts/ — biome on TS, manifest
// consistency, drift check, secret-echo grep. The bash + python legacy linters
// (shellcheck, ruff) are gone with the bash/.bats files.
//
// Performance Contract:
//   cold_start  < 300 ms
//   wall_time   < 10 s   (biome + manifest walk)
//   mem_peak    < 128 MB

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { hasTool, run } from '../lib/bun';
import { nxThrow } from '../lib/errors';
import { defineScript } from '../lib/skeleton';

export const meta = {
  name: 'lint-scripts',
  version: '0.1.0',
  description: 'Lint scripts/ — biome on TS, manifest consistency, drift check, secret-echo grep.',
  flags: {
    security: 'switch',
    env: 'string',
  },
  exitCodes: [
    { code: 0, meaning: 'clean' },
    { code: 5, meaning: 'lint errors found' },
  ],
} as const;

interface LintError {
  code: number;
  message: string;
  location?: string;
}

function listFiles(root: string, maxDepth: number): string[] {
  const out: string[] = [];
  const stack: { p: string; d: number }[] = [{ p: root, d: 0 }];
  while (stack.length > 0) {
    const it = stack.pop();
    if (!it) continue;
    let entries: string[];
    try {
      entries = readdirSync(it.p);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = join(it.p, name);
      let s: ReturnType<typeof statSync>;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        if (it.d < maxDepth) stack.push({ p: full, d: it.d + 1 });
      } else if (s.isFile()) {
        out.push(full);
      }
    }
  }
  return out;
}

// Tiny manifest reader: extracts script path + test_file pairs.
function readManifestEntries(manifestPath: string): { path: string; test_file: string }[] {
  if (!existsSync(manifestPath)) return [];
  const text = readFileSync(manifestPath, 'utf8');
  const entries: { path: string; test_file: string }[] = [];
  let cur: { path?: string; test_file?: string } | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '[[script]]') {
      if (cur && (cur.path || cur.test_file)) {
        entries.push({ path: cur.path ?? '', test_file: cur.test_file ?? '' });
      }
      cur = {};
      continue;
    }
    if (!cur) continue;
    const m = line.match(/^(path|test_file)\s*=\s*"([^"]*)"\s*$/);
    if (m?.[1] && m[2] !== undefined) {
      cur[m[1] as 'path' | 'test_file'] = m[2];
    }
  }
  if (cur && (cur.path || cur.test_file)) {
    entries.push({ path: cur.path ?? '', test_file: cur.test_file ?? '' });
  }
  return entries;
}

await defineScript(meta, async (args) => {
  const root = process.env.NEXUS_ROOT ?? process.cwd();
  const errors: LintError[] = [];

  if (args['dry-run']) {
    return {
      exitCode: 0,
      summary: {
        checks: ['biome', 'manifest', 'index-drift', 'secret-grep'],
      },
    };
  }

  // 1. biome on TS files (if available).
  if (await hasTool('bun')) {
    const r = await run(['bun', 'x', 'biome', 'check', `${root}/scripts`]);
    if (r.exitCode !== 0) {
      errors.push({ code: 5, message: 'biome: scripts/', location: `${root}/scripts` });
    }
  }

  // 2. Manifest consistency.
  const manifest = `${root}/scripts/manifest.toml`;
  for (const entry of readManifestEntries(manifest)) {
    if (entry.path && !existsSync(`${root}/${entry.path}`)) {
      errors.push({
        code: 5,
        message: `manifest references missing script: ${entry.path}`,
        location: entry.path,
      });
    }
    if (entry.test_file && !existsSync(`${root}/${entry.test_file}`)) {
      errors.push({
        code: 5,
        message: `manifest references missing test_file: ${entry.test_file}`,
        location: entry.test_file,
      });
    }
  }

  // 3. Index drift.
  const indexBin = `${root}/scripts/index-scripts`;
  if (existsSync(indexBin)) {
    const r = await run([indexBin, '--check', '--json']);
    if (r.exitCode !== 0) {
      errors.push({ code: 5, message: 'scripts/index.json drift — run scripts/index-scripts' });
    }
  }

  // 4. Security grep: no secret echo.
  const secretRe =
    /(?:echo|console\.log|process\.stdout\.write)\s*\(?\s*["'`]?\$?\{?[A-Z_]*(?:KEY|TOKEN|SECRET|PASS|PRIVATE)[A-Z_]*/;
  for (const f of listFiles(`${root}/scripts`, 2)) {
    if (f.endsWith('.json') || f.endsWith('.md')) continue;
    let txt: string;
    try {
      txt = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    if (secretRe.test(txt)) {
      errors.push({ code: 5, message: `potential secret echo: ${f}`, location: f });
    }
  }

  if (errors.length > 0) {
    nxThrow({
      tag: 'GateFailed',
      gate: 'lint-scripts',
      exitCode: 5,
      message: `${errors.length} lint errors`,
    });
  }
  return { exitCode: 0, summary: { checked: 'scripts/', errors: 0 } };
});
