// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors

import { describe, expect, it } from 'bun:test';
import { assertEnvelopeShape, parseEnvelope, runShim } from './helpers';

describe('replay', () => {
  it('--help exits 0', async () => {
    const r = await runShim('replay', ['--help']);
    expect(r.exitCode).toBe(0);
  });

  it('--version exits 0', async () => {
    const r = await runShim('replay', ['--version']);
    expect(r.exitCode).toBe(0);
  });

  it('missing required --snapshot exits 2', async () => {
    const r = await runShim('replay', ['--json']);
    expect(r.exitCode).toBe(2);
  });

  it('--dry-run --snapshot foo emits envelope', async () => {
    const r = await runShim('replay', ['--dry-run', '--json', '--snapshot', 'foo.bin']);
    expect(r.exitCode).toBe(0);
    const env = parseEnvelope(r.stdout);
    assertEnvelopeShape(env);
    expect(env.data.snapshot).toBe('foo.bin');
  });

  it('unknown flag exits 2', async () => {
    const r = await runShim('replay', ['--xxx']);
    expect(r.exitCode).toBe(2);
  });
});
