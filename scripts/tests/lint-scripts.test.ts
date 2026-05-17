// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors

import { describe, expect, it } from 'bun:test';
import { assertEnvelopeShape, parseEnvelope, runShim } from './helpers';

describe('lint-scripts', () => {
  it('--help exits 0', async () => {
    const r = await runShim('lint-scripts', ['--help']);
    expect(r.exitCode).toBe(0);
  });

  it('--version exits 0', async () => {
    const r = await runShim('lint-scripts', ['--version']);
    expect(r.exitCode).toBe(0);
  });

  it('unknown flag exits 2', async () => {
    const r = await runShim('lint-scripts', ['--xxx']);
    expect(r.exitCode).toBe(2);
  });

  it('--dry-run --json lists planned checks', async () => {
    const r = await runShim('lint-scripts', ['--dry-run', '--json']);
    expect(r.exitCode).toBe(0);
    const env = parseEnvelope(r.stdout);
    assertEnvelopeShape(env);
    expect(Array.isArray(env.data.checks)).toBe(true);
  });
});
