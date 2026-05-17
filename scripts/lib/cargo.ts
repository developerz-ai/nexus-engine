// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/lib/cargo.ts — `cargo` wrapper. Single source of truth for sccache
// activation and target-dir resolution.

import { type RunResult, hasTool, run } from './bun';

export function cargoTargetDir(): string {
  const fromEnv = process.env.CARGO_TARGET_DIR;
  if (fromEnv) return fromEnv;
  const root = process.env.NEXUS_ROOT ?? process.cwd();
  return `${root}/target`;
}

/**
 * Run `cargo <args>` with sccache enabled if available. Returns the captured
 * `RunResult`. Caller maps exit codes to `NxError` variants.
 */
export async function cargo(
  args: readonly string[],
  opts: { cwd?: string } = {},
): Promise<RunResult> {
  const env: Record<string, string> = {};
  if (await hasTool('sccache')) {
    env.RUSTC_WRAPPER = 'sccache';
  }
  const cwdOpt = opts.cwd ?? process.cwd();
  return run(['cargo', ...args], { cwd: cwdOpt, env });
}

/** `cargo metadata --no-deps --format-version 1` → workspace member list. */
export async function cargoMembers(): Promise<string[]> {
  const r = await cargo(['metadata', '--no-deps', '--format-version', '1']);
  if (r.exitCode !== 0) return [];
  try {
    const meta = JSON.parse(r.stdout) as { workspace_members?: string[] };
    return meta.workspace_members ?? [];
  } catch {
    return [];
  }
}
