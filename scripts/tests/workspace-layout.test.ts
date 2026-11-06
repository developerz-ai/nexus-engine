// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors

import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HAL = 'packages/nexus-hal';
const OLD_HAL = 'crates/nexus-hal';
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');
const toml = (path: string) => Bun.TOML.parse(read(path));
const json = (path: string) => JSON.parse(read(path));

function dependency(manifest: string, name: string, destination: string) {
  const dep = toml(manifest).dependencies[name];
  expect(dep.version).toBe('0.1.0');
  const target = resolve(ROOT, dirname(manifest), dep.path, 'Cargo.toml');
  expect(target).toBe(resolve(ROOT, destination, 'Cargo.toml'));
  expect(existsSync(target)).toBe(true);
  expect(Bun.TOML.parse(readFileSync(target, 'utf8')).package.name).toBe(name);
}

// These configs use literal paths; scope each assertion to its owning block.
function block(text: string, start: string, end: string) {
  expect(text).toContain(start);
  expect(text).toContain(end);
  return text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));
}

describe('HAL workspace relocation', () => {
  it('keeps the four Rust crate files only at the new root', () => {
    for (const file of ['Cargo.toml', 'README.md', 'src/lib.rs', 'tests/smoke.rs']) {
      expect(existsSync(resolve(ROOT, HAL, file))).toBe(true);
    }
    expect(existsSync(resolve(ROOT, OLD_HAL))).toBe(false);
    expect(toml(`${HAL}/Cargo.toml`).package.name).toBe('nexus-hal');
  });

  it('registers HAL exactly once in both explicit workspace lists', () => {
    const cargoMembers = toml('Cargo.toml').workspace.members;
    const bunMembers = json('package.json').workspaces;
    for (const members of [cargoMembers, bunMembers]) {
      expect(members.filter((member: string) => member === HAL)).toHaveLength(1);
      expect(members).not.toContain(OLD_HAL);
    }
    expect(bunMembers).toContain('scripts');
  });

  it('resolves every inbound dependency and the outbound core dependency', () => {
    for (const consumer of ['assets', 'audio', 'editor', 'engine', 'renderer']) {
      dependency(`crates/nexus-${consumer}/Cargo.toml`, 'nexus-hal', HAL);
    }
    dependency(`${HAL}/Cargo.toml`, 'nexus-core', 'crates/nexus-core');
  });

  it('keeps the private Bun adapter and frozen lock metadata consistent', () => {
    const adapter = json(`${HAL}/package.json`);
    expect(adapter).toEqual({
      name: '@nexus-engine/nexus-hal',
      version: '0.1.0',
      private: true,
      license: 'MIT',
    });
    // Bun's text lockfile is JSON with trailing commas, not executable code.
    const lock = JSON.parse(read('bun.lock').replace(/,\s*([}\]])/g, '$1'));
    expect(lock.workspaces[HAL]).toEqual({ name: adapter.name, version: adapter.version });
    expect(lock.packages[adapter.name]).toEqual([`${adapter.name}@workspace:${HAL}`]);
  });

  it('retains area/core labeling and core coverage membership', () => {
    const labels = block(read('.github/labeler.yml'), 'area/core:', 'area/renderer:');
    const coverage = block(read('codecov.yml'), '  core:', '  systems:');
    expect(labels).toContain(`- ${HAL}/**`);
    expect(coverage).toContain(`- ${HAL}/`);
    expect(labels).not.toContain(OLD_HAL);
    expect(coverage).not.toContain(OLD_HAL);
  });

  it('retains tracked-file SPDX enforcement and identical Rust review instructions', () => {
    const ci = read('.github/workflows/ci.yml');
    const sweep = ci.split('\n').find((line) => line.includes('done < <(git ls-files'));
    expect(sweep).toContain(`'${HAL}/**'`);
    expect(ci).toContain('*.json|*/bun.lock|*/Cargo.lock|*/package-lock.json)');
    const review = read('.coderabbit.yaml');
    const instructions = (glob: string) => {
      const start = `    - path: "${glob}"\n`;
      expect(review).toContain(start);
      return review.split(start)[1]?.split('\n    - path:')[0]?.trim();
    };
    expect(instructions(`${HAL}/src/**/*.rs`)).toBe(instructions('crates/**/src/**/*.rs'));
  });
});
