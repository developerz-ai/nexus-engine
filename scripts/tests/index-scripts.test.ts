// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors

import { describe, expect, it } from 'bun:test';
import { assertEnvelopeShape, parseEnvelope, runShim } from './helpers';

describe('index-scripts', () => {
  it('--help exits 0', async () => {
    const r = await runShim('index-scripts', ['--help']);
    expect(r.exitCode).toBe(0);
  });

  it('--version exits 0', async () => {
    const r = await runShim('index-scripts', ['--version']);
    expect(r.exitCode).toBe(0);
  });

  it('unknown flag exits 2', async () => {
    const r = await runShim('index-scripts', ['--xxx']);
    expect(r.exitCode).toBe(2);
  });

  it('--dry-run --json emits envelope', async () => {
    const r = await runShim('index-scripts', ['--dry-run', '--json']);
    expect(r.exitCode).toBe(0);
    const env = parseEnvelope(r.stdout);
    assertEnvelopeShape(env);
    expect(typeof env.data.would_write).toBe('string');
  });

  it('--check --json reports current drift state', async () => {
    const r = await runShim('index-scripts', ['--check', '--json']);
    // exit 0 (no drift) or 8 (drift) — both are valid envelope-emitting outcomes.
    expect([0, 8]).toContain(r.exitCode);
    const env = parseEnvelope(r.stdout);
    assertEnvelopeShape(env);
  });
});
