// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/tests/audit-policy.test.ts — guards the cargo-audit policy file
// (Law 4, Law 7, Law 12).
//
// cargo-audit resolves its config from `./.cargo/audit.toml` (relative to the
// working directory) and then `$CARGO_HOME/audit.toml`, and from nowhere else.
// Both callers — `bin/check` and the `rust-audit` CI job — run a bare
// `cargo audit` from the repo root, so `.cargo/audit.toml` is the only path
// they read. Two failure modes are silent and this guard exists for both:
//
//   1. A policy file at the repo root is never opened. It looks like policy,
//      it is not policy, and it drifts from the copy that is.
//   2. cargo-audit exits 2 on a config parse error, and `bin/check` treats a
//      non-zero audit as "advisory, nonblocking" — so a policy that no longer
//      parses (`[bans]` is an unknown field under `deny_unknown_fields`;
//      `"notice"` is not a `DenyOption` variant) disables the gate quietly.
//
// Every invariant below is asserted statically — no cargo, no network — so the
// guard runs in the bun-test pass of `bin/check`.

import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './helpers';

/** The one path cargo-audit reads on a bare run from the repo root. */
const POLICY = '.cargo/audit.toml';

/** The inert location this guard keeps empty. */
const ROOT_POLICY = 'audit.toml';

/** Directories that hold no repo content (gitignored / generated / vendored). */
const SKIP_DIRS = new Set([
  '.git',
  '.cache',
  '.codegraph',
  '.dz',
  'build',
  'coverage',
  'dist',
  'logs',
  'node_modules',
  'target',
  'tmp',
]);

const abs = (...parts: string[]): string => join(REPO_ROOT, ...parts);
const exists = (...parts: string[]): boolean => existsSync(abs(...parts));
const read = (path: string): string => readFileSync(abs(path), 'utf8');

interface AuditConfig {
  advisories?: {
    ignore?: string[];
    informational_warnings?: string[];
    severity_threshold?: string;
  };
  output?: {
    deny?: string[];
    format?: string;
    quiet?: boolean;
    show_tree?: boolean;
  };
  database?: { fetch?: boolean; stale?: boolean };
  bans?: unknown;
}

const policy = (): AuditConfig => Bun.TOML.parse(read(POLICY)) as unknown as AuditConfig;

/** Every `audit.toml` in the tree, skipping non-repo directories. */
function* auditPolicyFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* auditPolicyFiles(join(dir, entry.name));
    } else if (entry.isFile() && entry.name === 'audit.toml') {
      yield join(dir, entry.name);
    }
  }
}

describe('cargo-audit policy location', () => {
  it('keeps the policy at the path cargo-audit actually reads', () => {
    expect(exists(POLICY)).toBe(true);
  });

  it('keeps no policy at the repo root, where cargo-audit never looks', () => {
    expect(exists(ROOT_POLICY)).toBe(false);
  });

  it('ships exactly one policy file in the whole tree', () => {
    const found = [...auditPolicyFiles(REPO_ROOT)].map((path) =>
      path.slice(REPO_ROOT.length + 1).replaceAll('\\', '/'),
    );
    expect(found).toEqual([POLICY]);
  });

  it('carries the SPDX header on its first two lines', () => {
    const [first, second] = read(POLICY).split('\n');
    expect(first).toBe('# SPDX-License-Identifier: MIT');
    expect(second).toBe('# Copyright (c) 2026 Nexus Engine contributors');
  });
});

describe('cargo-audit policy content', () => {
  it('keeps the advisory policy', () => {
    const { advisories } = policy();
    expect(advisories?.ignore).toEqual([]);
    expect(advisories?.severity_threshold).toBe('low');
    expect(advisories?.informational_warnings).toEqual(
      expect.arrayContaining(['unmaintained', 'unsound', 'notice']),
    );
  });

  it('keeps the output policy', () => {
    const { output } = policy();
    expect(output?.deny).toEqual(
      expect.arrayContaining(['warnings', 'unmaintained', 'unsound', 'yanked']),
    );
    expect(output?.format).toBe('json');
    expect(output?.quiet).toBe(false);
    expect(output?.show_tree).toBe(true);
  });

  it('keeps the database policy', () => {
    const { database } = policy();
    expect(database?.fetch).toBe(true);
    expect(database?.stale).toBe(false);
  });

  it('parses under AuditConfig: no unknown [bans] table', () => {
    // `AuditConfig` is `#[serde(deny_unknown_fields)]` and declares only
    // advisories / database / output / target / yanked. A `[bans]` table makes
    // cargo-audit exit 2, which `bin/check` swallows as advisory.
    expect(policy().bans).toBeUndefined();
    expect(read(POLICY)).not.toContain('[bans]');
  });

  it('parses under DenyOption: no "notice" token in deny', () => {
    // `DenyOption` accepts only warnings / unmaintained / unsound / yanked.
    // `warnings` already expands to the unmaintained + unsound + yanked kinds,
    // so dropping the token drops no rule.
    expect(policy().output?.deny).not.toContain('notice');
  });
});
