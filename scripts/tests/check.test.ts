// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors

import { describe, expect, it } from 'bun:test';
import { assertEnvelopeShape, parseEnvelope, runShim } from './helpers';

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

  it('--dry-run --json marks all gates skipped', async () => {
    const r = await runShim('check', ['--dry-run', '--json']);
    expect(r.exitCode).toBe(0);
    const env = parseEnvelope(r.stdout);
    assertEnvelopeShape(env);
    const gates = env.data.gates as { skipped?: boolean }[];
    expect(gates.length).toBeGreaterThan(0);
    for (const g of gates) expect(g.skipped).toBe(true);
  });

  it('rejects --only with invalid value', async () => {
    const r = await runShim('check', ['--only', 'banana']);
    expect(r.exitCode).toBe(2);
  });
});
