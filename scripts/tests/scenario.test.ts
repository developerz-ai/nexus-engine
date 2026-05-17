// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors

import { describe, expect, it } from 'bun:test';
import { assertEnvelopeShape, parseEnvelope, runShim } from './helpers';

describe('scenario', () => {
  it('--help exits 0', async () => {
    const r = await runShim('scenario', ['--help']);
    expect(r.exitCode).toBe(0);
  });

  it('--version exits 0', async () => {
    const r = await runShim('scenario', ['--version']);
    expect(r.exitCode).toBe(0);
  });

  it('unknown flag exits 2', async () => {
    const r = await runShim('scenario', ['--xxx']);
    expect(r.exitCode).toBe(2);
  });

  it('neither --file nor --batch fails with usage', async () => {
    const r = await runShim('scenario', ['--json']);
    expect(r.exitCode).toBe(2);
  });

  it('--dry-run --file foo.toml emits envelope', async () => {
    const r = await runShim('scenario', ['--dry-run', '--json', '--file', 'foo.toml']);
    expect(r.exitCode).toBe(0);
    const env = parseEnvelope(r.stdout);
    assertEnvelopeShape(env);
    expect((env.data.files as string[])[0]).toBe('foo.toml');
  });
});
