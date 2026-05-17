// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors

import { describe, expect, it } from 'bun:test';
import { assertEnvelopeShape, parseEnvelope, runShim } from './helpers';

describe('release-engine', () => {
  it('--help exits 0', async () => {
    const r = await runShim('release-engine', ['--help']);
    expect(r.exitCode).toBe(0);
  });

  it('--version exits 0', async () => {
    const r = await runShim('release-engine', ['--version']);
    expect(r.exitCode).toBe(0);
  });

  it('missing required flags exits 2', async () => {
    const r = await runShim('release-engine', ['--json']);
    expect(r.exitCode).toBe(2);
  });

  it('bad channel exits 2', async () => {
    const r = await runShim('release-engine', [
      '--json',
      '--release-version',
      '0.1.0',
      '--channel',
      'banana',
    ]);
    expect(r.exitCode).toBe(2);
  });

  it('--dry-run --json emits envelope with steps', async () => {
    const r = await runShim('release-engine', [
      '--dry-run',
      '--json',
      '--release-version',
      '0.1.0',
      '--channel',
      'stable',
    ]);
    expect(r.exitCode).toBe(0);
    const env = parseEnvelope(r.stdout);
    assertEnvelopeShape(env);
    expect(Array.isArray(env.data.steps)).toBe(true);
  });
});
