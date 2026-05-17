// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors

import { describe, expect, it } from 'bun:test';
import { assertEnvelopeShape, parseEnvelope, runShim } from './helpers';

describe('new-script', () => {
  it('--help exits 0', async () => {
    const r = await runShim('new-script', ['--help']);
    expect(r.exitCode).toBe(0);
  });

  it('--version exits 0', async () => {
    const r = await runShim('new-script', ['--version']);
    expect(r.exitCode).toBe(0);
  });

  it('missing required flags exits 2', async () => {
    const r = await runShim('new-script', ['--json']);
    expect(r.exitCode).toBe(2);
  });

  it('rejects bash and python (only ts supported now)', async () => {
    const r = await runShim('new-script', [
      '--json',
      '--name',
      'foo',
      '--lang',
      'bash',
      '--category',
      'dev',
    ]);
    expect(r.exitCode).toBe(2);
  });

  it('--dry-run --lang ts emits an envelope with plan', async () => {
    const r = await runShim('new-script', [
      '--dry-run',
      '--json',
      '--name',
      'demo-only-dry',
      '--lang',
      'ts',
      '--category',
      'dev',
    ]);
    expect(r.exitCode).toBe(0);
    const env = parseEnvelope(r.stdout);
    assertEnvelopeShape(env);
    expect(env.data.name).toBe('demo-only-dry');
  });

  it('unknown flag exits 2', async () => {
    const r = await runShim('new-script', ['--xxx']);
    expect(r.exitCode).toBe(2);
  });
});
