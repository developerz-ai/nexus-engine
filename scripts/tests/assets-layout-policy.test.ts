// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Glob, TOML, YAML } from 'bun';

const root = fileURLToPath(new URL('../../', import.meta.url));
const text = (path: string) => readFileSync(resolve(root, path), 'utf8');
const assets = 'packages/nexus-assets';
const protectedCrates =
  'crates/nexus-{core,renderer,physics,audio,networking,scripting,agent,editor}/src/**';
const protectedAssets = `${assets}/src/**`;
const adr = '0011-amend-law-15.md';

type Coverage = { flags: Record<string, { paths: string[] }> };
type Review = { reviews: { path_instructions: { path: string; instructions: string }[] } };
type Profiles = Record<string, { 'exclude-files': string[]; 'fail-under': number }>;
type Workflow = { jobs: Record<string, { steps: { name: string; run?: string }[] }> };

function checkCoverage(config: Coverage) {
  expect(config.flags.systems?.paths).toEqual([
    'crates/nexus-renderer/',
    'crates/nexus-physics/',
    'crates/nexus-audio/',
    'crates/nexus-net/',
    `${assets}/`,
    'crates/nexus-script/',
  ]);
  expect(config.flags.genres_styles?.paths).toEqual(['crates/genres/', 'packages/styles/']);
}

function checkExclusions(profiles: Profiles) {
  for (const name of ['default', 'ci']) {
    const profile = profiles[name];
    expect(profile?.['fail-under']).toBe(70);
    const exclusions = profile?.['exclude-files'] ?? [];
    expect(exclusions).toHaveLength(14);
    for (const suffix of ['examples/*', 'benches/*', 'tests/integration/*', 'fuzz/*', 'build.rs']) {
      expect(exclusions).toContain(`crates/*/${suffix}`);
      expect(exclusions).toContain(`${assets}/${suffix}`);
    }
    for (const original of ['tools/*/examples/*', 'games/*/examples/*', 'target/*', '**/*.gen.rs']) {
      expect(exclusions).toContain(original);
    }
    expect(exclusions.some((glob) => new Glob(glob).match(`${assets}/src/lib.rs`))).toBe(false);
  }
}

function checkReviews(config: Review) {
  const rules = config.reviews.path_instructions;
  for (const suffix of ['src/**/*.rs', 'benches/**', 'examples/**']) {
    const old = rules.filter((rule) => rule.path === `crates/**/${suffix}`);
    const moved = rules.filter((rule) => rule.path === `${assets}/${suffix}`);
    expect(old).toHaveLength(1);
    expect(moved).toHaveLength(1);
    expect(old[0]?.instructions.trim()).not.toBe('');
    expect(moved[0]?.instructions).toBe(old[0]?.instructions);
  }
}

function spdxScript(config: Workflow): string {
  const step = config.jobs['docs-spdx']?.steps.find(
    (entry) => entry.name === 'Verify SPDX headers on tracked files',
  );
  expect(step?.run).toBeDefined();
  return step?.run ?? '';
}

function checkSpdx(script: string) {
  const selector = script.match(/git ls-files -z -- ([^\n]+)/)?.[1];
  expect(selector).toBe("'crates/**' 'packages/nexus-assets/**' 'scripts/**' 'docs/**' '.github/**')");
  const exemptions = script
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('*') && line.endsWith(')'));
  expect(exemptions).toEqual([
    '*.lock|*.png|*.jpg|*.jpeg|*.webp|*.ico|*.gif|*.svg|*.wasm|*.bin)',
    '*.json|*/bun.lock|*/Cargo.lock|*/package-lock.json)',
    '*/node_modules/*|*/target/*|*/.git/*)',
    '*.snap|*/snapshots/*)',
    '*/.placeholder|*/.bun-version|*/.keep|*/.nvmrc)',
  ]);
  expect(script).toContain('head -n 15 "$f"');
  expect(script).toContain("grep -q -m1 'SPDX-License-Identifier:'");
  expect(script).toContain('exit 1');
}

function section(document: string, heading: string): string {
  const start = document.indexOf(`${heading}\n`);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = document.slice(start + heading.length + 1);
  return rest.split(/^## /m)[0] ?? '';
}

function checkProtection(rule: string) {
  expect(rule).toContain(`\`${protectedCrates}\``);
  expect(rule).toContain(`\`${protectedAssets}\``);
  expect(rule).not.toContain('scripting,assets,agent');
  expect(rule).not.toContain('crates/nexus-assets');
  const globs = [...rule.matchAll(/`([^`]+\/src\/\*\*)`/g)].map((match) => match[1] ?? '');
  expect(globs.some((glob) => new Glob(glob).match(`${assets}/src/lib.rs`))).toBe(true);
  expect(globs.some((glob) => new Glob(glob).match('crates/nexus-core/src/lib.rs'))).toBe(true);
  expect(
    globs.some((glob) => new Glob(glob).match('packages/styles/nexus-style-pbr/src/lib.rs')),
  ).toBe(false);
}

describe('assets layout preserves path-sensitive policy', () => {
  it('keeps assets in the systems coverage flag, not a later unrelated flag', () => {
    const config = YAML.parse(text('codecov.yml')) as Coverage;
    checkCoverage(config);
    const wrong = structuredClone(config);
    const systems = wrong.flags.systems;
    const agent = wrong.flags.agent;
    expect(systems).toBeDefined();
    expect(agent).toBeDefined();
    if (systems && agent) {
      systems.paths = systems.paths.filter((path) => path !== `${assets}/`);
      agent.paths.push(`${assets}/`);
    }
    expect(() => checkCoverage(wrong)).toThrow();
  });

  it('preserves all five exclusion classes in each tarpaulin profile', () => {
    const profiles = TOML.parse(text('tarpaulin.toml')) as Profiles;
    checkExclusions(profiles);
    for (const name of ['default', 'ci']) {
      for (const suffix of ['examples/*', 'benches/*', 'tests/integration/*', 'fuzz/*', 'build.rs']) {
        const wrong = structuredClone(profiles);
        const profile = wrong[name];
        if (profile) {
          profile['exclude-files'] = profile['exclude-files'].filter(
            (path) => path !== `${assets}/${suffix}`,
          );
        }
        expect(() => checkExclusions(wrong)).toThrow();
      }
    }
  });

  it('copies source, bench and example review rules without changing original rules', () => {
    const config = YAML.parse(text('.coderabbit.yaml')) as Review;
    checkReviews(config);
    for (const suffix of ['src/**/*.rs', 'benches/**', 'examples/**']) {
      const wrong = structuredClone(config);
      wrong.reviews.path_instructions = wrong.reviews.path_instructions.filter(
        (rule) => rule.path !== `${assets}/${suffix}`,
      );
      expect(() => checkReviews(wrong)).toThrow();
    }
  });

  it('extends only the SPDX selector and preserves exemptions and header checks', () => {
    const script = spdxScript(YAML.parse(text('.github/workflows/ci.yml')) as Workflow);
    checkSpdx(script);
    expect(() => checkSpdx(script.replace("'packages/nexus-assets/**' ", ''))).toThrow();
    expect(() => checkSpdx(script.replace('*.json|', '*.rs|*.json|'))).toThrow();
    for (const file of ['Cargo.toml', 'README.md', 'src/lib.rs', 'tests/smoke.rs']) {
      expect(text(`${assets}/${file}`).split('\n').slice(0, 2).join('\n')).toContain(
        'SPDX-License-Identifier: MIT',
      );
    }
  });

  it('keeps assets protected in each operative policy section', () => {
    const sources = [
      ['docs/architecture/01-principles.md', "## Law 15 — Extend, Don't Fork"],
      ['docs/architecture/07-extend-dont-fork.md', '## Merge-bot enforcement'],
      ['docs/architecture/proposed-law-14.md', "## Law 14 — Extend, Don't Fork"],
      ['docs/specs/merge-policy/no-engine-source-mod-without-rationale.md', '## The rule'],
    ] as const;
    for (const [path, heading] of sources) {
      const document = text(path);
      const rule = section(document, heading);
      checkProtection(rule);
      expect(document).toContain(adr);
      expect(() =>
        checkProtection(rule.replaceAll(protectedAssets, 'packages/other/src/**')),
      ).toThrow();
    }
    const policy = text('docs/specs/merge-policy/no-engine-source-mod-without-rationale.md');
    const triggers = section(policy, '## File-path globs (the trigger)');
    const paths = [...triggers.matchAll(/^\| `([^`]+)` \|/gm)].map((match) => match[1]);
    expect(paths).toEqual([
      'crates/nexus-core/src/**',
      'crates/nexus-renderer/src/**',
      'crates/nexus-physics/src/**',
      'crates/nexus-audio/src/**',
      'crates/nexus-networking/src/**',
      'crates/nexus-scripting/src/**',
      protectedAssets,
      'crates/nexus-agent/src/**',
      'crates/nexus-editor/src/**',
    ]);
    const exceptions = section(policy, '## Whitelist exceptions');
    expect([...exceptions.matchAll(/^\| ([^|]+) \|/gm)].map((match) => match[1]?.trim())).toEqual([
      'Exception',
      'Bug fix',
      'Performance fix',
      'Docstring / comment update',
      'Dependency bump',
      'Test-only change',
      'Spec-prep refactor',
      'Compat-shim update',
    ]);
    const proposal = text('docs/architecture/proposed-law-14.md');
    checkProtection(section(proposal, '## Conformance test detail'));
    expect(proposal).toContain('Ratified as Law #15');
  });

  it('keeps ADR 0011 Proposed and requires human and integration approval before merge', () => {
    const document = text(`docs/architecture/05-adr/${adr}`);
    const status = section(document, '## Status');
    expect(status).toMatch(/^\s*Status: Proposed\s*$/m);
    expect(status).not.toMatch(/^\s*Status: Accepted\s*$/m);
    expect(status).toContain('Human and integration approval is required before merge.');
    expect(status).toContain('does not\ngrant approval');
    for (const file of ['Cargo.toml', 'README.md', 'src/lib.rs', 'tests/smoke.rs']) {
      expect(document).toContain(`| \`crates/nexus-assets/${file}\` | \`${assets}/${file}\` |`);
    }
    expect(text('CLAUDE.md')).toContain('require human + ADR, no auto-merge');
    expect(
      section(text('docs/architecture/01-principles.md'), "## Law 15 — Extend, Don't Fork"),
    ).toContain('human and integration approval is required before merge');
  });
});
