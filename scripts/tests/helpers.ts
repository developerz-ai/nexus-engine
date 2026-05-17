// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/tests/helpers.ts — shared test utilities. Spawn a bin via `bun`,
// capture stdout/stderr, parse the JSON envelope or telemetry on stderr.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Tests run from anywhere; resolve everything relative to scripts/.
const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
export const SCRIPTS_DIR = resolve(TESTS_DIR, '..');
export const REPO_ROOT = resolve(SCRIPTS_DIR, '..');
export const BIN_DIR = resolve(SCRIPTS_DIR, 'bin');

const TEST_ENV: Record<string, string> = {
  NEXUS_ROOT: REPO_ROOT,
  NEXUS_ENV: 'dev',
  NEXUS_AGENT_ID: 'bun-test',
  NEXUS_NO_TELEMETRY: '1',
  NEXUS_LOG_LEVEL: 'error',
};

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Run a bin script directly via `bun bin/<name>.ts`. */
export async function runBin(name: string, args: readonly string[] = []): Promise<RunResult> {
  const path = `${BIN_DIR}/${name}.ts`;
  const proc = Bun.spawn({
    cmd: ['bun', path, ...args],
    cwd: REPO_ROOT,
    env: { ...(process.env as Record<string, string>), ...TEST_ENV },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

/** Run the public POSIX shim `scripts/<name>` — tests the user-facing path. */
export async function runShim(name: string, args: readonly string[] = []): Promise<RunResult> {
  const path = `${SCRIPTS_DIR}/${name}`;
  const proc = Bun.spawn({
    cmd: [path, ...args],
    cwd: REPO_ROOT,
    env: { ...(process.env as Record<string, string>), ...TEST_ENV },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

export interface Envelope {
  schema: string;
  script: string;
  version: string;
  ok: boolean;
  exit_code: number;
  dry_run: boolean;
  env: string;
  data: Record<string, unknown>;
  errors: { code: number; tag?: string; message: string }[];
  warnings: string[];
}

export function parseEnvelope(stdout: string): Envelope {
  const line = stdout
    .split(/\r?\n/)
    .filter((l) => l.trim().startsWith('{'))
    .pop();
  if (!line) {
    throw new Error(`no JSON envelope on stdout: ${stdout}`);
  }
  return JSON.parse(line) as Envelope;
}

export function assertEnvelopeShape(env: Envelope): void {
  for (const k of [
    'schema',
    'script',
    'version',
    'ok',
    'exit_code',
    'dry_run',
    'env',
    'data',
    'errors',
    'warnings',
  ] as const) {
    if (!(k in env)) throw new Error(`envelope missing key: ${k}`);
  }
}
