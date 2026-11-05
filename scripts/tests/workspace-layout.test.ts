// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors

import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSONC, TOML } from 'bun';

const root = fileURLToPath(new URL('../../', import.meta.url));
const assets = 'packages/nexus-assets';
const text = (path: string) => readFileSync(resolve(root, path), 'utf8');

type Manifest = {
  package: { name: string };
  dependencies: Record<string, { path: string; version: string }>;
};
const manifest = (path: string) => TOML.parse(text(path)) as Manifest;
const header = '// SPDX-License-Identifier: MIT\n// Copyright (c) 2026 Nexus Engine contributors\n';

const members = [
  'crates/nexus-core',
  'crates/nexus-hal',
  assets,
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
  'packages/styles/*',
  'crates/genres/*',
  'crates/sdks/nexus-agent-sdk-rs',
  'games/*',
  'tools/*',
];
const consumers = [
  'crates/nexus-audio',
  'crates/nexus-engine',
  'crates/nexus-renderer',
  ...['2d', 'mixed', 'npr', 'pbr', 'pixel'].map((style) => `packages/styles/nexus-style-${style}`),
];

function checkEdge(from: string, name: string, destination: string, relative: string) {
  const edge = manifest(`${from}/Cargo.toml`).dependencies[name];
  expect(edge).toEqual({ path: relative, version: '0.1.0' });
  expect(resolve(root, from, edge?.path ?? '')).toBe(resolve(root, destination));
  expect(manifest(`${destination}/Cargo.toml`).package.name).toBe(name);
}

describe('assets-only workspace relocation', () => {
  it('removes the old directory and preserves all three scaffold files byte-for-byte', () => {
    expect(existsSync(resolve(root, 'crates/nexus-assets'))).toBe(false);
    for (const file of ['Cargo.toml', 'README.md', 'src/lib.rs', 'tests/smoke.rs']) {
      expect(existsSync(resolve(root, assets, file))).toBe(true);
    }
    expect(text(`${assets}/src/lib.rs`)).toBe(
      `${header}//\n` +
        '// nexus-assets — registry, import, streaming, compression, LOD, AI gen bridge.\n' +
        '//\n// Spec: docs/specs/assets/overview.md\n' +
        '// Status: stub (Phase 0 scaffold). No public API yet.\n\n' +
        '#![forbid(unsafe_code)]\n',
    );
    expect(text(`${assets}/tests/smoke.rs`)).toBe(
      `${header}//\n` +
        '// Smoke test: ensures the crate is buildable and the `tests/` dir is wired.\n' +
        '// Real tests land alongside real impl.\n\n' +
        '#[test]\nfn crate_links() {\n' +
        '    // link-check only: success = compile + run\n}\n',
    );
    expect(text(`${assets}/README.md`)).toBe(
      '<!-- SPDX-License-Identifier: MIT -->\n' +
        '<!-- Copyright (c) 2026 Nexus Engine contributors -->\n\n' +
        '# nexus-assets\n\n' +
        'Asset registry, import, streaming, compression, LOD, AI generation bridge.\n\n' +
        'Spec: [`docs/specs/assets/overview.md`](../../docs/specs/assets/overview.md)\n\n' +
        'Status: stub (Phase 0 scaffold).\n',
    );
    expect(existsSync(resolve(root, assets, '../../docs/specs/assets/overview.md'))).toBe(true);
  });

  it('changes only the assets Cargo member and preserves the manifest metadata', () => {
    const workspace = TOML.parse(text('Cargo.toml')) as { workspace: { members: string[] } };
    expect(workspace.workspace.members).toEqual(members);
    const actual = TOML.parse(text(`${assets}/Cargo.toml`));
    const inherited = { workspace: true };
    expect(actual).toEqual({
      package: {
        name: 'nexus-assets',
        version: inherited,
        edition: inherited,
        license: inherited,
        authors: inherited,
        repository: inherited,
        'rust-version': inherited,
        description: 'Asset registry, import, streaming, compression, LOD, AI generation bridge.',
        readme: 'README.md',
        metadata: {
          nexus: {
            spec: 'docs/specs/assets/overview.md',
            laws: ['1', '2', '3', '7', '10', '11', '12'],
          },
        },
      },
      lints: inherited,
      dependencies: {
        'nexus-core': { path: '../../crates/nexus-core', version: '0.1.0' },
        'nexus-hal': { path: '../../crates/nexus-hal', version: '0.1.0' },
      },
    });
  });

  it('resolves all eight incoming and both outgoing edges to unchanged package identities', () => {
    expect(consumers).toHaveLength(8);
    for (const consumer of consumers) {
      const relative = consumer.startsWith('crates/')
        ? '../../packages/nexus-assets'
        : '../../nexus-assets';
      checkEdge(consumer, 'nexus-assets', assets, relative);
    }
    for (const name of ['nexus-core', 'nexus-hal']) {
      checkEdge(assets, name, `crates/${name}`, `../../crates/${name}`);
    }
    // Discover incoming edges too, so an unlisted ninth consumer cannot stay stale.
    const incoming: string[] = [];
    for (const path of new Bun.Glob('{crates,packages,games,tools}/**/Cargo.toml').scanSync(root)) {
      const candidate = manifest(path);
      if (candidate.dependencies?.['nexus-assets']) incoming.push(dirname(path));
    }
    expect(incoming.sort()).toEqual([...consumers].sort());
  });

  it('agrees on explicit Bun membership, private package identity and lock linkage', () => {
    const pkg = JSON.parse(text(`${assets}/package.json`));
    expect(pkg).toEqual({
      name: '@nexus-engine/nexus-assets',
      version: '0.1.0',
      private: true,
      license: 'MIT',
    });
    expect(JSON.parse(text('package.json')).workspaces).toEqual([
      'scripts',
      'packages/styles/*',
      assets,
    ]);
    const lock = JSONC.parse(text('bun.lock')) as {
      workspaces: Record<string, { name: string; version: string }>;
      packages: Record<string, string[]>;
    };
    expect(lock.workspaces[assets]).toEqual({ name: pkg.name, version: pkg.version });
    expect(lock.packages[pkg.name]).toEqual([`${pkg.name}@workspace:${assets}`]);
  });

  it('updates direct documentation paths without claiming the parser exists', () => {
    const expected = [
      ['docs/contracts/renderer-assets.md', `${assets}/src/lib.rs`],
      ['docs/guides/testing/integration.md', `${assets}/tests/import_*.rs`],
      ['docs/guides/testing/fuzz.md', `${assets}/src/gltf/parse.rs`],
      ['docs/architecture/04-workspace-layout.md', `"${assets}"`],
      ['CLAUDE.md', assets],
    ] as const;
    for (const [path, reference] of expected) {
      expect(text(path)).toContain(reference);
      expect(text(path)).not.toContain('crates/nexus-assets');
    }
    expect(text('docs/contracts/renderer-assets.md')).not.toContain('crates/assets/src/lib.rs');
    expect(text('docs/guides/testing/fuzz.md')).toContain('assets crate is still a scaffold');
    for (const path of new Bun.Glob('docs/**/*.md').scanSync(root)) {
      if (path === 'docs/architecture/05-adr/0011-amend-law-15.md') continue;
      expect(text(path)).not.toContain('crates/nexus-assets');
    }
  });
});
