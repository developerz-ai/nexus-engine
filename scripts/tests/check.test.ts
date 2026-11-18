// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors

import { describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { gateCmd, shellSources } from '../bin/check';
import { assertEnvelopeShape, parseEnvelope, REPO_ROOT, runShim } from './helpers';

describe('check', () => {
  it('--help exits 0', async () => {
    const r = await runShim('check', ['--help']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('quality gates');
  });

  it('--version exits 0', async () => {
    const r = await runShim('check', ['--version']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toMatch(/^check \d/);
  });

  it('unknown flag exits 2', async () => {
    const r = await runShim('check', ['--nope']);
    expect(r.exitCode).toBe(2);
  });

  it('--dry-run --json selects exactly the five default gates, all skipped', async () => {
    const r = await runShim('check', ['--dry-run', '--json']);
    expect(r.exitCode).toBe(0);
    const env = parseEnvelope(r.stdout);
    assertEnvelopeShape(env);
    const gates = env.data.gates as { gate: string; skipped?: boolean }[];
    expect(gates.map((g) => g.gate)).toEqual(['fmt', 'clippy', 'biome', 'shellcheck', 'deny']);
    for (const g of gates) expect(g.skipped).toBe(true);
  });

  it('--only naga --dry-run --json selects only naga, skipped', async () => {
    const r = await runShim('check', ['--only', 'naga', '--dry-run', '--json']);
    expect(r.exitCode).toBe(0);
    const env = parseEnvelope(r.stdout);
    assertEnvelopeShape(env);
    expect(env.data.gates).toEqual([{ gate: 'naga', ok: true, skipped: true }]);
  });

  it('--only ruff --dry-run --json selects only ruff, skipped', async () => {
    const r = await runShim('check', ['--only', 'ruff', '--dry-run', '--json']);
    expect(r.exitCode).toBe(0);
    const env = parseEnvelope(r.stdout);
    assertEnvelopeShape(env);
    expect(env.data.gates).toEqual([{ gate: 'ruff', ok: true, skipped: true }]);
  });

  it('rejects --only with invalid value', async () => {
    const r = await runShim('check', ['--only', 'banana']);
    expect(r.exitCode).toBe(2);
  });

  it('shellcheck gate names only existing shim files, never a TOML', () => {
    const argv = gateCmd('shellcheck');
    expect(argv[0]).toBe('shellcheck');
    expect(argv[1]).toBe('-x');
    const operands = argv.slice(2);
    expect(operands.length).toBeGreaterThan(0);
    for (const operand of operands) {
      expect(operand.endsWith('.toml')).toBe(false);
      expect(existsSync(operand)).toBe(true);
      const shebang = readFileSync(operand, 'utf8').split('\n', 1)[0] ?? '';
      expect(shebang).toMatch(/^#!\s*\/(?:usr\/)?bin\/(?:env\s+)?(?:ba|da)?sh\b/);
    }
  });

  it('shellSources enumerates the runtime shims deterministically', () => {
    const sources = shellSources();
    expect([...sources].sort()).toEqual(sources);
    expect(sources.map((source) => basename(source))).toEqual([
      'bench',
      'bootstrap',
      'build',
      'check',
      'index-scripts',
      'lint-scripts',
      'new-script',
      'release-engine',
      'replay',
      'scenario',
      'symbols-upload',
      'sync-docs-index',
      'test',
      'triage-issues',
    ]);
    for (const p of sources) expect(p.endsWith('.toml')).toBe(false);
  });

  it('reports a missing NEXUS_ROOT scripts directory as a structured gate failure', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nexus-missing-scripts-'));
    try {
      const proc = Bun.spawn({
        cmd: ['bun', 'scripts/bin/check.ts', '--only', 'shellcheck', '--json'],
        cwd: REPO_ROOT,
        env: {
          ...(process.env as Record<string, string>),
          NEXUS_ROOT: root,
          NEXUS_ENV: 'dev',
          NEXUS_AGENT_ID: 'bun-test',
          NEXUS_LOG_LEVEL: 'error',
          NEXUS_NO_TELEMETRY: '1',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
      expect(exitCode).toBe(5);
      const env = parseEnvelope(stdout);
      assertEnvelopeShape(env);
      expect(env.errors).toEqual([
        expect.objectContaining({
          code: 5,
          tag: 'GateFailed',
          message: `could not enumerate shellcheck inputs in ${join(root, 'scripts')}`,
        }),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
