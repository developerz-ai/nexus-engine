#!/usr/bin/env bun
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/bin/test.ts — run unit, integration, scenario, and script tests.
//
// Performance Contract:
//   cold_start  < 300 ms
//   wall_time   < 300 s  (full suites; CI matrix scales horizontally)
//   mem_peak    < 256 MB

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { run } from '../lib/bun';
import { nxThrow } from '../lib/errors';
import { logInfo } from '../lib/log';
import { defineScript } from '../lib/skeleton';

export const meta = {
  name: 'test',
  version: '0.1.0',
  description: 'Run unit, integration, scenario, and script tests.',
  flags: {
    unit: 'switch',
    integration: 'switch',
    scenario: 'switch',
    scripts: 'switch',
    workspace: 'switch',
    filter: 'string',
    env: 'string',
  },
  exitCodes: [
    { code: 0, meaning: 'all tests pass' },
    { code: 5, meaning: 'one or more suites failed' },
  ],
} as const;

interface SuiteResult {
  suite: string;
  ok: boolean;
  exit?: number;
  skipped?: boolean;
}

await defineScript(meta, async (args) => {
  // Default: run all suites unless a specific selector was passed.
  const explicit = args.unit || args.integration || args.scenario || args.scripts;
  const runUnit = explicit ? args.unit : true;
  const runIntegration = explicit ? args.integration : true;
  const runScenario = explicit ? args.scenario : true;
  const runScripts = explicit ? args.scripts : true;

  const filter = args.filter ?? '';
  const wsArg = args.workspace ? ['--workspace'] : [];
  const results: SuiteResult[] = [];
  let overall = 0;

  const runSuite = async (name: string, cmd: readonly string[]): Promise<void> => {
    if (args['dry-run']) {
      results.push({ suite: name, ok: true, skipped: true });
      return;
    }
    logInfo('running', { suite: name });
    const r = await run(cmd);
    if (r.exitCode === 0) {
      results.push({ suite: name, ok: true });
    } else {
      results.push({ suite: name, ok: false, exit: r.exitCode });
      overall = 5;
    }
  };

  if (runUnit) {
    const cmd = ['cargo', 'nextest', 'run', '--lib', ...wsArg];
    if (filter) cmd.push('--filter', filter);
    await runSuite('unit', cmd);
  }
  if (runIntegration) {
    const cmd = ['cargo', 'nextest', 'run', '--tests', ...wsArg];
    if (filter) cmd.push('--filter', filter);
    await runSuite('integration', cmd);
  }
  if (runScenario) {
    await runSuite('scenario', ['scripts/scenario', '--batch', '--json']);
  }
  if (runScripts) {
    const here = dirname(fileURLToPath(import.meta.url));
    const testsDir = resolve(here, '..', 'tests');
    await runSuite('scripts', ['bun', 'test', testsDir]);
  }

  const summary = { suites: results, filter };
  if (overall !== 0) {
    nxThrow({ tag: 'GateFailed', gate: 'test', exitCode: 5, message: 'one or more test suites failed' });
  }
  return { exitCode: 0, summary };
});
