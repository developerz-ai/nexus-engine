// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors

import { describe, expect, it } from 'bun:test';
import { assertEnvelopeShape, parseEnvelope, runShim } from './helpers';

describe('bench', () => {
  it('--help exits 0', async () => {
    const r = await runShim('bench', ['--help']);
    expect(r.exitCode).toBe(0);
  });

  it('--version exits 0', async () => {
    const r = await runShim('bench', ['--version']);
    expect(r.exitCode).toBe(0);
  });

  it('unknown flag exits 2', async () => {
    const r = await runShim('bench', ['--xxx']);
    expect(r.exitCode).toBe(2);
  });

  it('--dry-run --json emits envelope', async () => {
    const r = await runShim('bench', ['--dry-run', '--json']);
    expect(r.exitCode).toBe(0);
    const env = parseEnvelope(r.stdout);
    assertEnvelopeShape(env);
    expect(typeof env.data.plan).toBe('string');
  });
});
