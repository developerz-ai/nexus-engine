// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors

import { describe, expect, it } from 'bun:test';
import { assertEnvelopeShape, parseEnvelope, runShim } from './helpers';

describe('test', () => {
  it('--help exits 0', async () => {
    const r = await runShim('test', ['--help']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('test');
  });

  it('--version exits 0', async () => {
    const r = await runShim('test', ['--version']);
    expect(r.exitCode).toBe(0);
  });

  it('unknown flag exits 2', async () => {
    const r = await runShim('test', ['--zzz']);
    expect(r.exitCode).toBe(2);
  });

  it('--dry-run --json marks all suites skipped', async () => {
    const r = await runShim('test', ['--dry-run', '--json']);
    expect(r.exitCode).toBe(0);
    const env = parseEnvelope(r.stdout);
    assertEnvelopeShape(env);
    const suites = env.data.suites as { skipped?: boolean }[];
    expect(suites.length).toBeGreaterThan(0);
    for (const s of suites) expect(s.skipped).toBe(true);
  });
});
