// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/tests/workspace-layout.test.ts — house-layout guards for the
// member-group moves this branch carries together (Law 3, Law 7, Law 14):
//
//   1. crates/nexus-hal/    → packages/nexus-hal/    (this branch)
//   2. crates/genres/       → packages/genres/       (main)
//   3. the assets crate     → packages/nexus-assets/ (this branch)
//   4. the audio crate      → packages/nexus-audio/  (this branch)
//   5. the CLI crate        → packages/nexus-cli/    (this branch)
//   6. the editor crate     → packages/nexus-editor/ (this branch)
//   7. the engine facade    → packages/nexus-engine/ (this branch)
//   8. the script crate     → packages/nexus-script/ (this branch)
//   9. the renderer crate   → packages/nexus-renderer/ (this branch)
//
// A half-done move is silent. Drop "packages/genres/*" from the root
// Cargo.toml members and `cargo check --workspace` / `cargo nextest` stay
// green while 16 crates fall out of the workspace; leave the SPDX sweep on
// crates/** only and the moved crates are never header-checked; forget the
// bun workspace entry and `bun install --frozen-lockfile` fails only at
// `bin/setup`. The same holds for HAL: leave a path dep pointing at
// crates/nexus-hal and the workspace stops resolving — and for assets:
// a path dep left pointing at the crate's old home resolves to nothing.
// The audio crate moved the same way: it sits one level deeper now, so
// every one of its path deps has to be re-anchored to the new depth.
// The CLI crate moved the same way but it is Rust-only with no path deps
// at all, so nothing had to be re-anchored — yet a stale member path or
// a stale mention in a doc still points at a crate that is gone.
// The editor crate moved the same way, re-anchoring its four path deps
// (nexus-core stays in crates/, HAL, agent and the renderer are siblings).
// The engine facade moved the same way: its nine path deps split at the new
// depth — nexus-core alone stays under crates/ one level deeper,
// the eight crates under packages/ become siblings. The script crate moved
// the same way after them: its single outbound path dep (nexus-core)
// re-anchors one level deeper, and its inbound consumers — the engine
// facade, the agent crate and the 16 genre crates — re-anchor to sibling
// depth under packages/.
// The renderer crate moved the same way: it now sits beside HAL, assets and
// the engine facade under packages/, so its own three path deps split at the
// new depth (nexus-core stays under crates/ one level deeper, HAL and assets
// are siblings) — and every consumer (the editor, the engine facade and the
// five style crates) has to point at the new root instead of the old one.
//
// Every invariant below is asserted statically — no cargo, no network — so
// the guard runs in the bun-test pass of `bin/check`.

import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { REPO_ROOT } from './helpers';

/** HAL — moved by this branch. */
const HAL = 'packages/nexus-hal';
const OLD_HAL = 'crates/nexus-hal';

/** The agent API crate — moved by this branch, alongside HAL. */
const AGENT = 'packages/nexus-agent';

/** The assets crate — moved out of crates/ by this branch. */
const ASSETS = 'packages/nexus-assets';
/** Its pre-move location, derived so this guard never spells it literally —
 *  a literal here would put the legacy path back into the tree. */
const OLD_ASSETS = ASSETS.replace('packages/', 'crates/');

/** The audio crate — moved out of crates/ by this branch. */
const AUDIO = 'packages/nexus-audio';
/** Its pre-move location, derived so this guard never spells it literally —
 *  a literal here would put the legacy path back into the tree. */
const OLD_AUDIO = AUDIO.replace('packages/', 'crates/');

/** The CLI crate — moved out of crates/ by this branch. */
const CLI = 'packages/nexus-cli';
/** Its pre-move location, derived so this guard never spells it literally —
 *  a literal here would put the legacy path back into the tree. */
const OLD_CLI = CLI.replace('packages/', 'crates/');

/** The editor crate — moved out of crates/ by this branch. */
const EDITOR = 'packages/nexus-editor';
/** Its pre-move location, derived so this guard never spells it literally —
 *  a literal here would put the legacy path back into the tree. */
const OLD_EDITOR = EDITOR.replace('packages/', 'crates/');

/** The engine facade crate — moved out of crates/ by this branch. */
const ENGINE = 'packages/nexus-engine';
/** Its pre-move location, derived so this guard never spells it literally —
 *  a literal here would put the legacy path back into the tree. */
const OLD_ENGINE = ENGINE.replace('packages/', 'crates/');

/** The script crate — moved out of crates/ by this branch. */
const SCRIPT = 'packages/nexus-script';
/** Its pre-move location, derived so this guard never spells it literally —
 *  a literal here would put the legacy path back into the tree. */
const OLD_SCRIPT = SCRIPT.replace('packages/', 'crates/');

/** The renderer crate — moved out of crates/ by this branch. */
const RENDERER = 'packages/nexus-renderer';
/** Its pre-move location, derived so this guard never spells it literally —
 *  a literal here would put the legacy path back into the tree. */
const OLD_RENDERER = RENDERER.replace('packages/', 'crates/');

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
  'nexus-script': '../../../packages/nexus-script',
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

/** Other subtrees stay at their merged locations — HAL, styles, net, physics and
 * the agent crate moved independently of the genre move, so the genre guard must
 * not disturb them. The assets, audio and CLI crates left crates/ with this
 * branch, so their new homes are asserted here too. The editor, engine
 * facade, script and renderer crates left crates/ with this branch as well. */
const UNMOVED_PATHS = [
  'crates/nexus-core',
  'packages/nexus-hal',
  'packages/nexus-assets',
  RENDERER,
  'packages/nexus-audio',
  SCRIPT,
  'packages/nexus-agent',
  'packages/nexus-editor',
  'packages/nexus-cli',
  'crates/nexus-merge',
  ENGINE,
  'packages/nexus-net',
  'packages/nexus-physics',
  'packages/styles',
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
const read = (path: string): string => readText(path);

interface Manifest {
  package: { name: string };
  dependencies: Record<string, { path: string; version: string }>;
}

const toml = (path: string): Manifest => Bun.TOML.parse(read(path)) as unknown as Manifest;
const json = <T>(path: string): T => JSON.parse(read(path)) as T;

/** Assert a `[dependencies]` entry points at the crate that owns `name`. */
function dependency(manifest: string, name: string, destination: string): void {
  const dep = toml(manifest).dependencies[name];
  expect(dep.version).toBe('0.1.0');
  const target = resolve(REPO_ROOT, dirname(manifest), dep.path, 'Cargo.toml');
  expect(target).toBe(resolve(REPO_ROOT, destination, 'Cargo.toml'));
  expect(existsSync(target)).toBe(true);
  expect((Bun.TOML.parse(readFileSync(target, 'utf8')) as Manifest).package.name).toBe(name);
}

/** These configs use literal paths; scope each assertion to its owning block. */
function block(text: string, start: string, end: string): string {
  expect(text).toContain(start);
  expect(text).toContain(end);
  return text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));
}

/** Parse the `[workspace] members` array out of a Cargo.toml. */
function cargoMembers(text: string): string[] {
  const members = /members\s*=\s*\[([\s\S]*?)\]/.exec(text)?.[1] ?? '';
  return members
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/,$/, '').replace(/^"|"$/g, ''));
}

/** Parse bun's text lockfile — JSON with trailing commas, not executable code. */
function parseBunLock(): {
  workspaces?: Record<string, { name?: string; version?: string }>;
  packages?: Record<string, string[]>;
} {
  return JSON.parse(readText('bun.lock').replace(/,\s*([}\]])/g, '$1'));
}

/** Read only this flag's path list, never comments or sibling coverage flags. */
function genresStylesPaths(text: string): unknown[] {
  const codecov = Bun.YAML.parse(text) as {
    flags?: { genres_styles?: { paths?: unknown } };
  } | null;
  const paths = codecov?.flags?.genres_styles?.paths;
  return Array.isArray(paths) ? paths : [];
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

/** The pre-move location a file's text still names, if any. */
function staleRootIn(text: string): string | undefined {
  if (text.includes(OLD_ROOT)) return OLD_ROOT;
  if (text.includes(OLD_ASSETS)) return OLD_ASSETS;
  if (text.includes(OLD_AUDIO)) return OLD_AUDIO;
  if (text.includes(OLD_CLI)) return OLD_CLI;
  if (text.includes(OLD_EDITOR)) return OLD_EDITOR;
  if (text.includes(OLD_ENGINE)) return OLD_ENGINE;
  if (text.includes(OLD_SCRIPT)) return OLD_SCRIPT;
  if (text.includes(OLD_RENDERER)) return OLD_RENDERER;
  return undefined;
}

/** Repo-relative paths whose text still mentions a pre-move location. */
function staleLocationRefs(): { file: string; stale: string }[] {
  const hits: { file: string; stale: string }[] = [];
  for (const file of walkFiles(REPO_ROOT)) {
    if (SKIP_EXT.has(extname(file).toLowerCase())) continue;
    if (statSync(file).size > 512_000) continue;
    const text = readFileSync(file, 'utf8');
    if (text.includes('\0')) continue;
    // `relative()` yields backslash separators on Windows; normalize so the
    // SELF comparison and every reported hit are forward-slash repo-relative.
    const rel = relative(REPO_ROOT, file).replaceAll('\\', '/');
    if (rel === SELF) continue;
    const stale = staleRootIn(text);
    if (stale !== undefined) hits.push({ file: rel, stale });
  }
  return hits;
}

describe('HAL workspace relocation', () => {
  it('keeps the four Rust crate files only at the new root', () => {
    for (const file of ['Cargo.toml', 'README.md', 'src/lib.rs', 'tests/smoke.rs']) {
      expect(exists(HAL, file)).toBe(true);
    }
    expect(exists(OLD_HAL)).toBe(false);
    expect(toml(`${HAL}/Cargo.toml`).package.name).toBe('nexus-hal');
  });

  it('registers HAL exactly once in both explicit workspace lists', () => {
    const cargoMembersList = cargoMembers(readText('Cargo.toml'));
    const bunMembers = json<{ workspaces: string[] }>('package.json').workspaces;
    for (const members of [cargoMembersList, bunMembers]) {
      expect(members.filter((member: string) => member === HAL)).toHaveLength(1);
      expect(members).not.toContain(OLD_HAL);
    }
    expect(bunMembers).toContain('scripts');
    // Both member groups this branch merges must stay in the Bun workspace.
    expect(bunMembers).toContain(NEW_ROOT);
  });

  it('resolves every inbound dependency and the outbound core dependency', () => {
    // assets left crates/ for packages/, so its manifest no longer sits beside
    // the other consumers — the manifest paths are listed, not derived.
    const consumers: Record<string, string> = {
      assets: `${ASSETS}/Cargo.toml`,
      audio: `${AUDIO}/Cargo.toml`,
      editor: `${EDITOR}/Cargo.toml`,
      engine: `${ENGINE}/Cargo.toml`,
      renderer: `${RENDERER}/Cargo.toml`,
    };
    for (const manifest of Object.values(consumers)) {
      dependency(manifest, 'nexus-hal', HAL);
    }
    dependency(`${HAL}/Cargo.toml`, 'nexus-core', 'crates/nexus-core');
  });

  it('keeps the private Bun adapter and frozen lock metadata consistent', () => {
    const adapter = json<{ name: string; version: string; private: boolean; license: string }>(
      `${HAL}/package.json`,
    );
    expect(adapter).toEqual({
      name: '@nexus-engine/nexus-hal',
      version: '0.1.0',
      private: true,
      license: 'MIT',
    });
    const lock = parseBunLock();
    expect(lock.workspaces?.[HAL]?.name).toBe(adapter.name);
    expect(lock.packages?.[adapter.name]).toEqual([`${adapter.name}@workspace:${HAL}`]);
  });

  it('retains area/core labeling and core coverage membership', () => {
    const labels = block(read('.github/labeler.yml'), 'area/core:', 'area/renderer:');
    const coverage = block(read('codecov.yml'), '  core:', '  systems:');
    expect(labels).toContain(`- ${HAL}/**`);
    expect(coverage).toContain(`- ${HAL}/`);
    expect(labels).not.toContain(OLD_HAL);
    expect(coverage).not.toContain(OLD_HAL);
  });

  it('retains tracked-file SPDX enforcement and covers both trees from one Rust rule', () => {
    const ci = read('.github/workflows/ci.yml');
    const sweep = ci.split('\n').find((line) => line.includes('done < <(git ls-files'));
    // One sweep over packages/** covers HAL, the genres and the styles at once.
    expect(sweep).toContain("'packages/**'");
    expect(ci).toContain('*.json|*/bun.lock|*/Cargo.lock|*/package-lock.json)');

    // A duplicate HAL-only Rust review block would drift from the shared one;
    // the single {crates,packages} glob must be the only Rust-source rule.
    const review = read('.coderabbit.yaml');
    expect(review).toContain('    - path: "{crates,packages}/**/src/**/*.rs"\n');
    expect(review.split('/src/**/*.rs"').length - 1).toBe(1);
  });
});

describe('assets workspace relocation', () => {
  it('keeps the four Rust crate files only at the new root', () => {
    for (const file of CRATE_FILES) {
      expect(exists(ASSETS, file)).toBe(true);
    }
    expect(exists(OLD_ASSETS)).toBe(false);
    expect(toml(`${ASSETS}/Cargo.toml`).package.name).toBe('nexus-assets');
  });

  it('registers assets exactly once in the root Cargo workspace', () => {
    const members = cargoMembers(readText('Cargo.toml'));
    expect(members.filter((member) => member === ASSETS)).toHaveLength(1);
    expect(members).not.toContain(OLD_ASSETS);
  });

  it('resolves the outbound path deps from the new depth', () => {
    dependency(`${ASSETS}/Cargo.toml`, 'nexus-core', 'crates/nexus-core');
    dependency(`${ASSETS}/Cargo.toml`, 'nexus-hal', HAL);
  });

  it('derives the legacy assets path instead of spelling it, and flags it', () => {
    // Spelling the legacy path here would put it straight back into the tree
    // and break the tree-wide rule this guard exists to hold.
    expect(read(SELF)).not.toContain(OLD_ASSETS);
    // The guard must still catch a file that holds the old path…
    expect(staleRootIn(`path = "${OLD_ASSETS}"`)).toBe(OLD_ASSETS);
    expect(staleRootIn(`path = "${ASSETS}"`)).toBeUndefined();
    // …and no file outside this guard may hold it.
    expect(staleLocationRefs().filter((hit) => hit.stale === OLD_ASSETS)).toEqual([]);
  });
});

describe('audio workspace relocation', () => {
  it('keeps the four Rust crate files only at the new root', () => {
    for (const file of CRATE_FILES) {
      expect(exists(AUDIO, file)).toBe(true);
    }
    expect(exists(OLD_AUDIO)).toBe(false);
    expect(toml(`${AUDIO}/Cargo.toml`).package.name).toBe('nexus-audio');
  });

  it('registers audio exactly once in the root Cargo workspace', () => {
    const members = cargoMembers(readText('Cargo.toml'));
    expect(members.filter((member) => member === AUDIO)).toHaveLength(1);
    expect(members).not.toContain(OLD_AUDIO);
  });

  it('resolves the outbound path deps from the new depth', () => {
    dependency(`${AUDIO}/Cargo.toml`, 'nexus-core', 'crates/nexus-core');
    dependency(`${AUDIO}/Cargo.toml`, 'nexus-hal', HAL);
    dependency(`${AUDIO}/Cargo.toml`, 'nexus-assets', ASSETS);
  });

  it('resolves the inbound engine dependency at the new root', () => {
    dependency(`${ENGINE}/Cargo.toml`, 'nexus-audio', AUDIO);
  });

  it('derives the legacy audio path instead of spelling it, and flags it', () => {
    // Spelling the legacy path here would put it straight back into the tree
    // and break the tree-wide rule this guard exists to hold.
    expect(read(SELF)).not.toContain(OLD_AUDIO);
    // The guard must still catch a file that holds the old path…
    expect(staleRootIn(`path = "${OLD_AUDIO}"`)).toBe(OLD_AUDIO);
    expect(staleRootIn(`path = "${AUDIO}"`)).toBeUndefined();
    // …and no file outside this guard may hold it.
    expect(staleLocationRefs().filter((hit) => hit.stale === OLD_AUDIO)).toEqual([]);
  });
});

describe('cli workspace relocation', () => {
  /** The CLI crate is a binary crate — it owns src/main.rs, not src/lib.rs. */
  const CLI_FILES = ['Cargo.toml', 'README.md', 'src/main.rs', 'tests/smoke.rs'] as const;

  it('keeps the four Rust crate files only at the new root', () => {
    for (const file of CLI_FILES) {
      expect(exists(CLI, file)).toBe(true);
    }
    expect(exists(OLD_CLI)).toBe(false);
    expect(toml(`${CLI}/Cargo.toml`).package.name).toBe('nexus-cli');
  });

  it('registers the CLI exactly once in the root Cargo workspace', () => {
    const members = cargoMembers(readText('Cargo.toml'));
    expect(members.filter((member) => member === CLI)).toHaveLength(1);
    expect(members).not.toContain(OLD_CLI);
  });

  it('derives the legacy CLI path instead of spelling it, and flags it', () => {
    // Spelling the legacy path here would put it straight back into the tree
    // and break the tree-wide rule this guard exists to hold.
    expect(read(SELF)).not.toContain(OLD_CLI);
    // The guard must still catch a file that holds the old path…
    expect(staleRootIn(`path = "${OLD_CLI}"`)).toBe(OLD_CLI);
    expect(staleRootIn(`path = "${CLI}"`)).toBeUndefined();
    // …and no file outside this guard may hold it.
    expect(staleLocationRefs().filter((hit) => hit.stale === OLD_CLI)).toEqual([]);
  });

  it('keeps the area/cli label and the editor_cli coverage flag on the new root', () => {
    const labels = block(read('.github/labeler.yml'), 'area/cli:', 'area/scripts:');
    const coverage = block(read('codecov.yml'), '  editor_cli:', '  genres_styles:');
    expect(labels).toContain(`- ${CLI}/**`);
    expect(coverage).toContain(`- ${CLI}/`);
    expect(labels).not.toContain(OLD_CLI);
    expect(coverage).not.toContain(OLD_CLI);
  });
});

describe('editor workspace relocation', () => {
  it('keeps the four Rust crate files only at the new root', () => {
    for (const file of CRATE_FILES) {
      expect(exists(EDITOR, file)).toBe(true);
    }
    expect(exists(OLD_EDITOR)).toBe(false);
    expect(toml(`${EDITOR}/Cargo.toml`).package.name).toBe('nexus-editor');
  });

  it('registers the editor exactly once in the root Cargo workspace', () => {
    const members = cargoMembers(readText('Cargo.toml'));
    expect(members.filter((member) => member === EDITOR)).toHaveLength(1);
    expect(members).not.toContain(OLD_EDITOR);
  });

  it('resolves the outbound path deps from the new depth', () => {
    dependency(`${EDITOR}/Cargo.toml`, 'nexus-core', 'crates/nexus-core');
    dependency(`${EDITOR}/Cargo.toml`, 'nexus-renderer', RENDERER);
    dependency(`${EDITOR}/Cargo.toml`, 'nexus-hal', HAL);
    dependency(`${EDITOR}/Cargo.toml`, 'nexus-agent', AGENT);
  });

  it('derives the legacy editor path instead of spelling it, and flags it', () => {
    // Spelling the legacy path here would put it straight back into the tree
    // and break the tree-wide rule this guard exists to hold.
    expect(read(SELF)).not.toContain(OLD_EDITOR);
    // The guard must still catch a file that holds the old path…
    expect(staleRootIn(`path = "${OLD_EDITOR}"`)).toBe(OLD_EDITOR);
    expect(staleRootIn(`path = "${EDITOR}"`)).toBeUndefined();
    // …and no file outside this guard may hold it.
    expect(staleLocationRefs().filter((hit) => hit.stale === OLD_EDITOR)).toEqual([]);
  });

  it('keeps the area/editor label and the editor_cli coverage flag on the new root', () => {
    const labels = block(read('.github/labeler.yml'), 'area/editor:', 'area/cli:');
    const coverage = block(read('codecov.yml'), '  editor_cli:', '  genres_styles:');
    expect(labels).toContain(`- ${EDITOR}/**`);
    expect(coverage).toContain(`- ${EDITOR}/`);
    expect(labels).not.toContain(OLD_EDITOR);
    expect(coverage).not.toContain(OLD_EDITOR);
  });
});

describe('engine workspace relocation', () => {
  it('keeps the four Rust crate files only at the new root', () => {
    for (const file of CRATE_FILES) {
      expect(exists(ENGINE, file)).toBe(true);
    }
    expect(exists(OLD_ENGINE)).toBe(false);
    expect(toml(`${ENGINE}/Cargo.toml`).package.name).toBe('nexus-engine');
  });

  it('registers the engine exactly once in the root Cargo workspace', () => {
    const members = cargoMembers(readText('Cargo.toml'));
    expect(members.filter((member) => member === ENGINE)).toHaveLength(1);
    expect(members).not.toContain(OLD_ENGINE);
  });

  it('resolves the outbound path deps from the new depth', () => {
    // Core alone stays under crates/ one level deeper; the eight crates
    // under packages/ are siblings of the facade.
    dependency(`${ENGINE}/Cargo.toml`, 'nexus-core', 'crates/nexus-core');
    dependency(`${ENGINE}/Cargo.toml`, 'nexus-renderer', RENDERER);
    dependency(`${ENGINE}/Cargo.toml`, 'nexus-script', SCRIPT);
    dependency(`${ENGINE}/Cargo.toml`, 'nexus-hal', HAL);
    dependency(`${ENGINE}/Cargo.toml`, 'nexus-assets', ASSETS);
    dependency(`${ENGINE}/Cargo.toml`, 'nexus-physics', 'packages/nexus-physics');
    dependency(`${ENGINE}/Cargo.toml`, 'nexus-audio', AUDIO);
    dependency(`${ENGINE}/Cargo.toml`, 'nexus-net', 'packages/nexus-net');
    dependency(`${ENGINE}/Cargo.toml`, 'nexus-agent', AGENT);
  });

  it('derives the legacy engine path instead of spelling it, and flags it', () => {
    // Spelling the legacy path here would put it straight back into the tree
    // and break the tree-wide rule this guard exists to hold.
    expect(read(SELF)).not.toContain(OLD_ENGINE);
    // The guard must still catch a file that holds the old path…
    expect(staleRootIn(`path = "${OLD_ENGINE}"`)).toBe(OLD_ENGINE);
    expect(staleRootIn(`path = "${ENGINE}"`)).toBeUndefined();
    // …and no file outside this guard may hold it.
    expect(staleLocationRefs().filter((hit) => hit.stale === OLD_ENGINE)).toEqual([]);
  });
});

describe('script workspace relocation', () => {
  it('keeps the four Rust crate files only at the new root', () => {
    for (const file of CRATE_FILES) {
      expect(exists(SCRIPT, file)).toBe(true);
    }
    expect(exists(OLD_SCRIPT)).toBe(false);
    expect(toml(`${SCRIPT}/Cargo.toml`).package.name).toBe('nexus-script');
  });

  it('registers the script crate exactly once in the root Cargo workspace', () => {
    const members = cargoMembers(readText('Cargo.toml'));
    expect(members.filter((member) => member === SCRIPT)).toHaveLength(1);
    expect(members).not.toContain(OLD_SCRIPT);
  });

  it('resolves the outbound path dep from the new depth', () => {
    // nexus-core stays under crates/ and is now one level deeper.
    dependency(`${SCRIPT}/Cargo.toml`, 'nexus-core', 'crates/nexus-core');
  });

  it('resolves the inbound engine and agent dependencies at the new root', () => {
    dependency(`${ENGINE}/Cargo.toml`, 'nexus-script', SCRIPT);
    dependency(`${AGENT}/Cargo.toml`, 'nexus-script', SCRIPT);
  });

  it('derives the legacy script path instead of spelling it, and flags it', () => {
    // Spelling the legacy path here would put it straight back into the tree
    // and break the tree-wide rule this guard exists to hold.
    expect(read(SELF)).not.toContain(OLD_SCRIPT);
    // The guard must still catch a file that holds the old path…
    expect(staleRootIn(`path = "${OLD_SCRIPT}"`)).toBe(OLD_SCRIPT);
    expect(staleRootIn(`path = "${SCRIPT}"`)).toBeUndefined();
    // …and no file outside this guard may hold it.
    expect(staleLocationRefs().filter((hit) => hit.stale === OLD_SCRIPT)).toEqual([]);
  });

  it('keeps the area/scripting label and the systems coverage flag on the new root', () => {
    const labels = block(read('.github/labeler.yml'), 'area/scripting:', 'area/agent:');
    const coverage = block(read('codecov.yml'), '  systems:', '  agent:');
    expect(labels).toContain(`- ${SCRIPT}/**`);
    expect(coverage).toContain(`- ${SCRIPT}/`);
    expect(labels).not.toContain(OLD_SCRIPT);
    expect(coverage).not.toContain(OLD_SCRIPT);
  });
});

describe('renderer workspace relocation', () => {
  /** The renderer crate owns a shaders placeholder on top of the four crate files. */
  const RENDERER_FILES = [
    'Cargo.toml',
    'README.md',
    'shaders/.keep',
    'src/lib.rs',
    'tests/smoke.rs',
  ] as const;

  /** The style crates that depend on the renderer. */
  const STYLE_CRATES = ['2d', 'mixed', 'npr', 'pbr', 'pixel'] as const;

  it('keeps the five renderer crate files only at the new root', () => {
    for (const file of RENDERER_FILES) {
      expect(exists(RENDERER, file)).toBe(true);
      const header = readText(RENDERER, file).split('\n').slice(0, 15).join('\n');
      expect(header).toContain('SPDX-License-Identifier: MIT');
    }
    expect(exists(OLD_RENDERER)).toBe(false);
    expect(toml(`${RENDERER}/Cargo.toml`).package.name).toBe('nexus-renderer');
  });

  it('registers the renderer exactly once in the root Cargo workspace', () => {
    const members = cargoMembers(readText('Cargo.toml'));
    expect(members.filter((member) => member === RENDERER)).toHaveLength(1);
    expect(members).not.toContain(OLD_RENDERER);
  });

  it('keeps the renderer Rust-only without a Bun adapter or lock entry', () => {
    expect(exists(RENDERER, 'package.json')).toBe(false);
    const members = json<{ workspaces: string[] }>('package.json').workspaces;
    expect(members).not.toContain(RENDERER);
    expect(parseBunLock().workspaces?.[RENDERER]).toBeUndefined();
  });

  it('resolves the outbound path deps from the new depth', () => {
    // nexus-core stays under crates/ one level deeper; HAL and assets are
    // siblings of the renderer crate.
    dependency(`${RENDERER}/Cargo.toml`, 'nexus-core', 'crates/nexus-core');
    dependency(`${RENDERER}/Cargo.toml`, 'nexus-hal', HAL);
    dependency(`${RENDERER}/Cargo.toml`, 'nexus-assets', ASSETS);
  });

  it('resolves every inbound dependency on the new root', () => {
    dependency(`${EDITOR}/Cargo.toml`, 'nexus-renderer', RENDERER);
    dependency(`${ENGINE}/Cargo.toml`, 'nexus-renderer', RENDERER);
    for (const style of STYLE_CRATES) {
      dependency(`packages/styles/nexus-style-${style}/Cargo.toml`, 'nexus-renderer', RENDERER);
    }
  });

  it('derives the legacy renderer path instead of spelling it, and flags it', () => {
    // Spelling the legacy path here would put it straight back into the tree
    // and break the tree-wide rule this guard exists to hold.
    expect(read(SELF)).not.toContain(OLD_RENDERER);
    // The guard must still catch a file that holds the old path…
    expect(staleRootIn(`path = "${OLD_RENDERER}"`)).toBe(OLD_RENDERER);
    expect(staleRootIn(`path = "${RENDERER}"`)).toBeUndefined();
    // …and no file outside this guard may hold it.
    expect(staleLocationRefs().filter((hit) => hit.stale === OLD_RENDERER)).toEqual([]);
  });

  it('keeps the area/renderer label and the systems coverage flag on the new root', () => {
    const labels = block(read('.github/labeler.yml'), 'area/renderer:', 'area/physics:');
    const coverage = block(read('codecov.yml'), '  systems:', '  agent:');
    expect(labels).toContain(`- ${RENDERER}/**`);
    expect(coverage).toContain(`- ${RENDERER}/`);
    expect(labels).not.toContain(OLD_RENDERER);
    expect(coverage).not.toContain(OLD_RENDERER);
  });
});

describe('workspace layout', () => {
  it.each([
    [
      'later sibling flag',
      'flags:\n  genres_styles:\n    paths: [packages/styles/]\n  later_flag:\n    paths: [packages/genres/]',
    ],
    ['comment', 'flags:\n  genres_styles:\n    paths: [packages/styles/] # packages/genres/'],
    ['path prefix', 'flags:\n  genres_styles:\n    paths: [packages/genres/unrelated/]'],
    ['scalar instead of a path list', 'flags:\n  genres_styles:\n    paths: packages/genres/'],
    ['missing flag', 'flags:\n  other:\n    paths: [packages/genres/]'],
  ])('does not count packages/genres/ in a %s as genre coverage', (_name, yaml) => {
    expect(genresStylesPaths(yaml)).not.toContain(`${NEW_ROOT}/`);
  });

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
    // Preserve main's independent style relocation alongside the genre move.
    if (!members.includes('packages/styles/*')) {
      fail('root Cargo.toml members does not list "packages/styles/*"');
    }
    // …and this branch's HAL relocation alongside it.
    if (!members.includes(HAL)) {
      fail(`root Cargo.toml members does not list "${HAL}"`);
    }
    // …and this branch's agent-crate relocation: a member missing from either
    // list leaves crates out of the build or fails `bun install --frozen-lockfile`
    // at bin/setup, which is how the two moves broke when they were merged.
    if (!members.includes(AGENT)) {
      fail(`root Cargo.toml members does not list "${AGENT}"`);
    }

    // --- The old subtree is gone ----------------------------------------
    if (exists(OLD_ROOT)) fail(`${OLD_ROOT}/ still exists`);

    // --- The 16 genre crates landed, with their 4 files each -------------
    const expectedCrates = GENRES.map((genre) => `nexus-genre-${genre}`);
    const actualCrates = exists(NEW_ROOT)
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
    if (!rootPkg.workspaces?.includes(AGENT)) {
      fail(`root package.json workspaces does not list "${AGENT}"`);
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
    const areaGenres = /area\/genres:([\s\S]*?)(?=\narea\/|$)/.exec(labeler)?.[1] ?? '';
    if (!areaGenres.includes(`${NEW_ROOT}/**`)) {
      fail('.github/labeler.yml area/genres does not glob packages/genres/**');
    }
    if (!genresStylesPaths(readText('codecov.yml')).includes(`${NEW_ROOT}/`)) {
      fail('codecov.yml flags.genres_styles.paths does not contain packages/genres/');
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
    for (const { file, stale } of staleLocationRefs()) {
      fail(`${file} still references ${stale}`);
    }

    expect(violations).toEqual([]);
  });
});
