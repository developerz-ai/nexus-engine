#!/usr/bin/env bun
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/bin/release-engine.ts — tag, build artifacts, sign, upload to GitHub release.
//
// Performance Contract:
//   cold_start  < 300 ms
//   wall_time   < 1800 s (full dist build + upload; CI-only)
//   mem_peak    < 256 MB

import { existsSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { run } from '../lib/bun';
import { nxThrow } from '../lib/errors';
import { ghReleaseCreate, ghReleaseUpload } from '../lib/gh';
import { logInfo, logWarn } from '../lib/log';
import { defineScript } from '../lib/skeleton';

export const meta = {
  name: 'release-engine',
  version: '0.1.0',
  description: 'Tag, build artifacts, sign, upload to GitHub release.',
  flags: {
    'release-version': { type: 'string', required: true },
    channel: { type: 'enum:stable|beta|nightly', required: true },
    env: 'string',
  },
  exitCodes: [
    { code: 0, meaning: 'release published' },
    { code: 2, meaning: 'invalid version/channel' },
    { code: 5, meaning: 'build failed' },
    { code: 6, meaning: 'GitHub API error' },
  ],
} as const;

function listDistFiles(root: string): string[] {
  const dir = `${root}/target/dist`;
  if (!existsSync(dir)) return [];
  const out: string[] = [];
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
      else if (s.isFile()) out.push(full);
    }
  }
  return out;
}

await defineScript(meta, async (args) => {
  let ver = args['release-version'];
  const ch = args.channel as 'stable' | 'beta' | 'nightly';

  if (!/^v?[0-9]+\.[0-9]+\.[0-9]+(-.+)?$/.test(ver)) {
    nxThrow({ tag: 'InvalidArg', arg: 'release-version', reason: 'not semver' });
  }
  if (!ver.startsWith('v')) ver = `v${ver}`;

  if (args['dry-run']) {
    return {
      exitCode: 0,
      summary: {
        version: ver,
        channel: ch,
        steps: ['tag', 'build', 'sign', 'upload', 'gh-release-create'],
      },
    };
  }

  logInfo('tagging', { version: ver });
  // git tag failures are tolerated (tag may already exist) — parity with bash.
  await run(['git', 'tag', '-s', ver, '-m', `Nexus Engine ${ver} (${ch})`]);

  logInfo('building dist artifacts');
  const buildRes = await run(['scripts/build', '--profile', 'dist', '--workspace', '--json']);
  if (buildRes.exitCode !== 0) {
    nxThrow({
      tag: 'GateFailed',
      gate: 'build',
      exitCode: 5,
      message: 'dist build failed',
    });
  }

  logInfo('creating GitHub release');
  const root = process.env.NEXUS_ROOT ?? process.cwd();
  let notesFile = `${root}/CHANGELOG.md`;
  if (!existsSync(notesFile)) {
    const tmp = mkdtempSync(join(tmpdir(), 'nx-rel-'));
    notesFile = join(tmp, 'NOTES.md');
    writeFileSync(notesFile, `Release ${ver}\n`);
  }
  const prerelease = ch !== 'stable';
  const created = await ghReleaseCreate(ver, `Nexus Engine ${ver}`, notesFile, { prerelease });
  if (created.exitCode !== 0) {
    nxThrow({
      tag: 'ToolFailed',
      tool: 'gh',
      exitCode: created.exitCode,
      stderr: created.stderr,
      message: 'gh release create failed',
    });
  }

  const files = listDistFiles(root);
  const uploaded: string[] = [];
  for (const f of files) {
    const up = await ghReleaseUpload(ver, [f]);
    if (up.exitCode === 0) {
      uploaded.push(f);
    } else {
      logWarn('upload failed', { file: f });
    }
  }

  return {
    exitCode: 0,
    summary: { version: ver, channel: ch, uploaded },
  };
});
