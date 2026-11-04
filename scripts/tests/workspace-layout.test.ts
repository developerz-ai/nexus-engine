// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/tests/workspace-layout.test.ts — house-layout guard for the
// crates/genres/ → packages/genres/ move (Law 3, Law 7, Law 14).
//
// A half-done move is silent. Drop "packages/genres/*" from the root
// Cargo.toml members and `cargo check --workspace` / `cargo nextest` stay
// green while 16 crates fall out of the workspace; leave the SPDX sweep on
// crates/** only and the moved crates are never header-checked; forget the
// bun workspace entry and `bun install` no longer sees the genres package.
// Every invariant below is asserted statically — no cargo, no network — so
// the guard runs in the bun-test pass of `bin/check`.

import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { REPO_ROOT } from './helpers';

/** The 16 genre crates that moved out of crates/genres/ into packages/genres/. */
const GENRES = [
  'battleroyal',
  'fighting',
  'fps',
  'horror',
  'mmorpg',
  'moba',
  'openworld',
  'platformer',
  'puzzle',
  'racing',
  'roguelike',
  'rpg',
  'rts',
  'survival',
  'towdef',
  'visualnovel',
] as const;

/** The 4 files every genre crate owns — 64 files moved by the house-layout change. */
const CRATE_FILES = ['Cargo.toml', 'README.md', 'src/lib.rs', 'tests/smoke.rs'] as const;

const OLD_ROOT = 'crates/genres';
const NEW_ROOT = 'packages/genres';

/** Path deps every genre crate must resolve from its new depth. */
const PATH_DEPS = {
  'nexus-core': '../../../crates/nexus-core',
  'nexus-script': '../../../crates/nexus-script',
} as const;

/** Files that must name the new packages/genres location. */
const NAMING_FILES = [
  'CLAUDE.md',
  'docs/architecture/04-workspace-layout.md',
  'docs/architecture/feature-flag-matrix.md',
  'docs/guides/crates/curated-list.md',
  'docs/specs/crates/categories.md',
  'docs/specs/merge-policy/no-engine-source-mod-without-rationale.md',
  '.claude/commands/feature.md',
  '.claude/skills/fix-from-coderabbit/SKILL.md',
] as const;

/** Engine subtrees that must NOT move with the genres group. */
const UNMOVED_PATHS = [
  'crates/nexus-core',
  'crates/nexus-hal',
  'crates/nexus-assets',
  'crates/nexus-renderer',
  'crates/nexus-physics',
  'crates/nexus-audio',
  'crates/nexus-net',
  'crates/nexus-script',
  'crates/nexus-agent',
  'crates/nexus-editor',
  'crates/nexus-cli',
  'crates/nexus-merge',
  'crates/nexus-engine',
  'crates/styles',
  'crates/sdks',
  'games',
  'tools',
  'docs',
] as const;

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

/** Binary extensions — never scanned for textual path references. */
const SKIP_EXT = new Set([
  '.bin',
  '.dll',
  '.dylib',
  '.exe',
  '.gif',
  '.gz',
  '.ico',
  '.jpeg',
  '.jpg',
  '.pdf',
  '.png',
  '.so',
  '.svg',
  '.tar',
  '.wasm',
  '.webp',
  '.xz',
  '.zip',
]);

const abs = (...parts: string[]): string => join(REPO_ROOT, ...parts);
const exists = (...parts: string[]): boolean => existsSync(abs(...parts));
const readText = (...parts: string[]): string => readFileSync(abs(...parts), 'utf8');

/** Parse the `[workspace] members` array out of a Cargo.toml. */
function cargoMembers(text: string): string[] {
  const block = /members\s*=\s*\[([\s\S]*?)\]/.exec(text)?.[1] ?? '';
  return block
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/,$/, '').replace(/^"|"$/g, ''));
}

/** This guard file — it has to name the pre-move location in order to detect it. */
const SELF = 'scripts/tests/workspace-layout.test.ts';

/** Every file under `dir`, skipping non-repo directories. */
function* walkFiles(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walkFiles(path);
    } else if (entry.isFile()) {
      yield path;
    }
  }
}

/** Repo-relative paths whose text still mentions the pre-move location. */
function staleLocationRefs(): string[] {
  const hits: string[] = [];
  for (const file of walkFiles(REPO_ROOT)) {
    if (SKIP_EXT.has(extname(file).toLowerCase())) continue;
    if (statSync(file).size > 512_000) continue;
    const text = readFileSync(file, 'utf8');
    if (text.includes('\0')) continue;
    // `relative()` yields backslash separators on Windows; normalize so the
    // SELF comparison and every reported hit are forward-slash repo-relative.
    const rel = relative(REPO_ROOT, file).replaceAll('\\', '/');
    if (rel === SELF) continue;
    if (text.includes(OLD_ROOT)) hits.push(rel);
  }
  return hits;
}

describe('workspace layout', () => {
  it('keeps the crates/genres → packages/genres house-layout move complete', () => {
    const violations: string[] = [];
    const fail = (message: string): void => {
      violations.push(message);
    };

    // --- Cargo workspace membership -------------------------------------
    // Dropping "packages/genres/*" here silently removes 16 crates from the
    // workspace while every cargo gate stays green.
    const members = cargoMembers(readText('Cargo.toml'));
    if (!members.includes(`${NEW_ROOT}/*`)) {
      fail(`root Cargo.toml members does not list "${NEW_ROOT}/*"`);
    }
    if (members.includes(`${OLD_ROOT}/*`)) {
      fail(`root Cargo.toml members still lists "${OLD_ROOT}/*"`);
    }

    // --- The old subtree is gone ----------------------------------------
    if (exists(OLD_ROOT)) fail(`${OLD_ROOT}/ still exists`);

    // --- The 16 genre crates landed, with their 4 files each -------------
    const expectedCrates = GENRES.map((genre) => `nexus-genre-${genre}`);
    const actualCrates = existsSync(abs(NEW_ROOT))
      ? readdirSync(abs(NEW_ROOT), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort()
      : [];
    for (const missing of expectedCrates.filter((name) => !actualCrates.includes(name))) {
      fail(`${NEW_ROOT}/${missing}/ is missing`);
    }
    for (const extra of actualCrates.filter((name) => !expectedCrates.includes(name))) {
      fail(`${NEW_ROOT}/${extra}/ is not one of the 16 genre crates`);
    }

    for (const genre of GENRES) {
      const crateDir = `${NEW_ROOT}/nexus-genre-${genre}`;

      for (const file of CRATE_FILES) {
        if (!exists(crateDir, file)) fail(`${crateDir}/${file} is missing`);
      }
      if (!exists(crateDir)) continue;

      // Law 7 — CI sweeps packages/**, so every moved file carries a header.
      for (const file of CRATE_FILES) {
        if (!exists(crateDir, file)) continue;
        const head = readText(crateDir, file).split('\n').slice(0, 15).join('\n');
        if (!head.includes('SPDX-License-Identifier:')) {
          fail(`${crateDir}/${file} has no SPDX header in its first 15 lines`);
        }
      }

      const cargoToml = readText(crateDir, 'Cargo.toml');
      if (!new RegExp(`^name\\s*=\\s*"nexus-genre-${genre}"`, 'm').test(cargoToml)) {
        fail(`${crateDir}/Cargo.toml does not declare name = "nexus-genre-${genre}"`);
      }
      const spec = `docs/specs/genres/${genre}.md`;
      if (!cargoToml.includes(spec)) fail(`${crateDir}/Cargo.toml does not point at ${spec}`);
      if (!exists(spec)) fail(`${spec} does not exist`);

      // The moved crates sit one level deeper: every path dep must be
      // ../../../crates/<dep> and must resolve to a real crate.
      for (const [dep, expectedPath] of Object.entries(PATH_DEPS)) {
        const declared = new RegExp(`${dep}\\s*=\\s*\\{\\s*path\\s*=\\s*"([^"]+)"`).exec(
          cargoToml,
        )?.[1];
        if (declared === undefined) {
          fail(`${crateDir}/Cargo.toml has no path dependency on ${dep}`);
        } else if (declared !== expectedPath) {
          fail(`${crateDir}/Cargo.toml resolves ${dep} as "${declared}", not "${expectedPath}"`);
        }
        const resolved = resolve(abs(crateDir), declared ?? expectedPath);
        if (!existsSync(join(resolved, 'Cargo.toml'))) {
          fail(`${crateDir}/Cargo.toml path dep on ${dep} does not resolve to a crate`);
        }
      }

      // The README spec link keeps its old depth — the new tree is just as deep.
      const readme = readText(crateDir, 'README.md');
      if (!readme.includes(`../../../${spec}`)) {
        fail(`${crateDir}/README.md does not link ../../../${spec}`);
      }
    }

    // --- The bun workspace knows the genres package ---------------------
    const rootPkg = JSON.parse(readText('package.json')) as { workspaces?: string[] };
    if (!rootPkg.workspaces?.includes(NEW_ROOT)) {
      fail(`root package.json workspaces does not list "${NEW_ROOT}"`);
    }
    if (!exists(NEW_ROOT, 'package.json')) {
      fail(`${NEW_ROOT}/package.json is missing (bun needs a manifest per workspace)`);
    }
    const bunLock = readText('bun.lock');
    if (!bunLock.includes(`"${NEW_ROOT}"`)) {
      fail(`bun.lock does not record the "${NEW_ROOT}" workspace member`);
    }
    if (!bunLock.includes(`workspace:${NEW_ROOT}`)) {
      fail(`bun.lock does not link the genres package to workspace:${NEW_ROOT}`);
    }
    if (exists(NEW_ROOT, 'package.json')) {
      const genresPkg = JSON.parse(readText(NEW_ROOT, 'package.json')) as { name?: string };
      if (genresPkg.name === undefined) {
        fail(`${NEW_ROOT}/package.json has no name`);
      } else if (!bunLock.includes(`"${genresPkg.name}@workspace:${NEW_ROOT}"`)) {
        fail(`bun.lock does not lock ${genresPkg.name} as workspace:${NEW_ROOT}`);
      }
    }

    // --- CI + coverage wiring follow the move ---------------------------
    const spdxSweep = readText('.github/workflows/ci.yml')
      .split('\n')
      .find((line) => line.includes('git ls-files'));
    if (spdxSweep === undefined || !spdxSweep.includes("'packages/**'")) {
      fail('.github/workflows/ci.yml SPDX sweep does not cover packages/**');
    }
    const labeler = readText('.github/labeler.yml');
    const areaGenres = /area\/genres:([\s\S]*?)(?=\narea\/|\Z)/.exec(labeler)?.[1] ?? '';
    if (!areaGenres.includes(`${NEW_ROOT}/**`)) {
      fail('.github/labeler.yml area/genres does not glob packages/genres/**');
    }
    const codecov = readText('codecov.yml');
    const genresStyles = /genres_styles:([\s\S]*?)(?=\n\w[\w-]*:|\Z)/.exec(codecov)?.[1] ?? '';
    if (!genresStyles.includes(`${NEW_ROOT}/`)) {
      fail('codecov.yml genres_styles does not point at packages/genres/');
    }

    // --- Docs, charters and the test policy name the new location --------
    for (const file of NAMING_FILES) {
      if (!exists(file)) {
        fail(`${file} is missing`);
      } else if (!readText(file).includes(NEW_ROOT)) {
        fail(`${file} does not name ${NEW_ROOT}`);
      }
    }
    for (const genre of GENRES) {
      const charter = `.claude/agents/${genre}-genre.md`;
      if (!exists(charter)) {
        fail(`${charter} is missing`);
      } else if (!readText(charter).includes(NEW_ROOT)) {
        fail(`${charter} does not name ${NEW_ROOT}`);
      }
    }
    const policy = readText('scripts/lib/test-policy.toml');
    for (const genre of GENRES) {
      if (!policy.includes(`[per_crate."nexus-genre-${genre}"]`)) {
        fail(`scripts/lib/test-policy.toml has no per_crate entry for nexus-genre-${genre}`);
      }
    }

    // --- Nothing outside the group moved ---------------------------------
    for (const path of UNMOVED_PATHS) {
      if (!exists(path)) fail(`${path} is missing — it must not move with the genres group`);
    }
    const cargoLock = readText('Cargo.lock');
    for (const genre of GENRES) {
      if (!cargoLock.includes(`name = "nexus-genre-${genre}"`)) {
        fail(`Cargo.lock does not record nexus-genre-${genre}`);
      }
    }
    if (/^path\s*=/m.test(cargoLock)) {
      fail('Cargo.lock records a path dependency — path deps are not locked by path');
    }

    // --- No leftover reference to the pre-move location ------------------
    for (const file of staleLocationRefs()) {
      fail(`${file} still references ${OLD_ROOT}`);
    }

    expect(violations).toEqual([]);
  });
});
