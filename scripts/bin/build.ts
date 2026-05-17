#!/usr/bin/env bun
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/bin/build.ts — `cargo build` wrapper with sccache + features.
//
// Performance Contract:
//   cold_start  < 300 ms
//   wall_time   < 120 s  (full workspace, sccache warm)
//   mem_peak    < 128 MB

import { cargo, cargoTargetDir } from '../lib/cargo';
import { nxThrow } from '../lib/errors';
import { defineScript } from '../lib/skeleton';

export const meta = {
  name: 'build',
  version: '0.1.0',
  description: 'Compile workspace with sccache + features.',
  flags: {
    profile: { type: 'enum:dev|release|dist', default: 'dev' },
    target: 'string',
    feature: 'string[]',
    workspace: 'switch',
    env: 'string',
  },
  exitCodes: [
    { code: 0, meaning: 'success' },
    { code: 4, meaning: 'missing toolchain — run scripts/bootstrap' },
    { code: 5, meaning: 'compile error' },
  ],
} as const;

await defineScript(meta, async (args) => {
  const profile = (args.profile || 'dev') as 'dev' | 'release' | 'dist';
  const target = args.target;
  const features = args.feature ?? [];

  const buildArgs: string[] = ['build'];
  if (profile === 'release' || profile === 'dist') buildArgs.push('--release');
  if (target) buildArgs.push('--target', target);
  if (args.workspace) buildArgs.push('--workspace');
  if (features.length > 0) buildArgs.push('--features', features.join(','));

  const targetDir = cargoTargetDir();

  if (args['dry-run']) {
    return {
      exitCode: 0,
      summary: {
        profile,
        target: target ?? '',
        features,
        target_dir: targetDir,
        plan: `cargo ${buildArgs.join(' ')}`,
      },
    };
  }

  const r = await cargo(buildArgs);
  if (r.exitCode !== 0) {
    nxThrow({
      tag: 'GateFailed',
      gate: 'cargo-build',
      exitCode: 5,
      message: 'cargo build failed',
    });
  }

  return {
    exitCode: 0,
    summary: { profile, target: target ?? '', target_dir: targetDir },
  };
});
