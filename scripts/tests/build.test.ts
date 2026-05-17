// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors

import { describe, expect, it } from 'bun:test';
import { assertEnvelopeShape, parseEnvelope, runShim } from './helpers';

describe('build', () => {
  it('--help exits 0', async () => {
    const r = await runShim('build', ['--help']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('build');
  });

  it('--version exits 0', async () => {
    const r = await runShim('build', ['--version']);
    expect(r.exitCode).toBe(0);
  });

  it('unknown flag exits 2', async () => {
    const r = await runShim('build', ['--xxx']);
    expect(r.exitCode).toBe(2);
  });

  it('bad --profile rejected', async () => {
    const r = await runShim('build', ['--profile', 'banana']);
    expect(r.exitCode).toBe(2);
  });

  it('--dry-run --json emits envelope with plan', async () => {
    const r = await runShim('build', ['--dry-run', '--json', '--profile', 'dev']);
    expect(r.exitCode).toBe(0);
    const env = parseEnvelope(r.stdout);
    assertEnvelopeShape(env);
    expect(env.data.profile).toBe('dev');
    expect(typeof env.data.plan).toBe('string');
  });
});
