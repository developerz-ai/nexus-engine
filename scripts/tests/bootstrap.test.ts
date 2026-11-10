// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadVersions } from '../lib/versions';
import { assertEnvelopeShape, parseEnvelope, runShim } from './helpers';

describe('tool pins', () => {
  it('keeps the Biome pin aligned with the manifest and lockfile', () => {
    const versions = loadVersions(fileURLToPath(new URL('../lib/versions.toml', import.meta.url)));
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      devDependencies: Record<string, string>;
    };
    const lock = JSON.parse(
      readFileSync(new URL('../../bun.lock', import.meta.url), 'utf8').replace(
        /,\s*([}\]])/g,
        '$1',
      ),
    ) as {
      workspaces: Record<string, { devDependencies: Record<string, string> }>;
      packages: Record<string, string[]>;
    };
    const biome = versions.typescript?.biome;

    expect(biome).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.devDependencies['@biomejs/biome']).toBe(biome);
    expect(lock.workspaces.scripts?.devDependencies['@biomejs/biome']).toBe(biome);
    expect(lock.packages['@biomejs/biome']?.[0]).toBe(`@biomejs/biome@${biome}`);
  });
});

describe('bootstrap', () => {
  it('--help exits 0 and prints usage', async () => {
    const r = await runShim('bootstrap', ['--help']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('Usage:');
    expect(r.stdout).toContain('bootstrap');
  });

  it('--version exits 0 and prints version', async () => {
    const r = await runShim('bootstrap', ['--version']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toMatch(/^bootstrap \d/);
  });

  it('rejects an unknown flag with exit 2', async () => {
    const r = await runShim('bootstrap', ['--xxxnope']);
    expect(r.exitCode).toBe(2);
  });

  it('--dry-run --json emits a valid envelope', async () => {
    const r = await runShim('bootstrap', ['--dry-run', '--json', '--minimal']);
    expect(r.exitCode).toBe(0);
    const env = parseEnvelope(r.stdout);
    assertEnvelopeShape(env);
    expect(env.script).toBe('bootstrap');
    expect(env.ok).toBe(true);
    expect(env.dry_run).toBe(true);
    expect(Array.isArray(env.data.planned)).toBe(true);
  });

  it('idempotent: second --dry-run run reports the same plan length', async () => {
    const a = parseEnvelope(
      (await runShim('bootstrap', ['--dry-run', '--json', '--minimal'])).stdout,
    );
    const b = parseEnvelope(
      (await runShim('bootstrap', ['--dry-run', '--json', '--minimal'])).stdout,
    );
    const lenA = (a.data.planned as unknown[]).length + (a.data.skipped as unknown[]).length;
    const lenB = (b.data.planned as unknown[]).length + (b.data.skipped as unknown[]).length;
    expect(lenA).toBe(lenB);
  });
});
