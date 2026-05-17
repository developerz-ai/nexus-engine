// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors

import { describe, expect, it } from 'bun:test';
import { assertEnvelopeShape, parseEnvelope, runShim } from './helpers';

describe('triage-issues', () => {
  it('--help exits 0', async () => {
    const r = await runShim('triage-issues', ['--help']);
    expect(r.exitCode).toBe(0);
  });

  it('--version exits 0', async () => {
    const r = await runShim('triage-issues', ['--version']);
    expect(r.exitCode).toBe(0);
  });

  it('unknown flag exits 2', async () => {
    const r = await runShim('triage-issues', ['--xxx']);
    expect(r.exitCode).toBe(2);
  });

  it('--dry-run --json emits envelope', async () => {
    const r = await runShim('triage-issues', ['--dry-run', '--json']);
    expect(r.exitCode).toBe(0);
    const env = parseEnvelope(r.stdout);
    assertEnvelopeShape(env);
    expect(env.data.state).toBe('open');
    expect(env.data.limit).toBe(100);
  });

  it('bad --state exits 2', async () => {
    const r = await runShim('triage-issues', ['--state', 'banana']);
    expect(r.exitCode).toBe(2);
  });
});
