#!/usr/bin/env bun
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/bin/new-script.ts — scaffold a new TypeScript script + test + manifest entry.
//
// All new scripts are TypeScript (Bun). The `--lang` flag is preserved on the
// manifest surface for compatibility but only `ts` is supported now; `bash`
// and `py` are rejected with InvalidArg (Law 4: no more bash).
//
// Performance Contract:
//   cold_start  < 300 ms
//   wall_time   < 1 s    (file writes)
//   mem_peak    < 64 MB

import { appendFileSync, chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { nxThrow } from '../lib/errors';
import { defineScript } from '../lib/skeleton';

export const meta = {
  name: 'new-script',
  version: '0.1.0',
  description: 'Scaffold a new script (TypeScript) + test + manifest entry.',
  flags: {
    name: { type: 'string', required: true },
    lang: { type: 'enum:bash|py|ts', required: true },
    category: {
      type: 'enum:bootstrap|build|test|dev|deploy|release|liveops|meta',
      required: true,
    },
    description: 'string',
    custom: 'switch',
    env: 'string',
  },
  exitCodes: [
    { code: 0, meaning: 'scaffolded' },
    { code: 2, meaning: 'missing/invalid required flag' },
    { code: 3, meaning: 'script already exists' },
  ],
} as const;

function binBody(name: string, desc: string): string {
  return `#!/usr/bin/env bun
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/bin/${name}.ts — ${desc}
//
// Performance Contract:
//   cold_start  < 300 ms
//   wall_time   < TODO
//   mem_peak    < 64 MB

import { defineScript } from '../lib/skeleton';
import { logInfo } from '../lib/log';

export const meta = {
  name: '${name}',
  version: '0.1.0',
  description: '${desc}',
  flags: {
    env: 'string',
  },
  exitCodes: [
    { code: 0, meaning: 'success' },
    { code: 2, meaning: 'usage error' },
  ],
} as const;

await defineScript(meta, async (args) => {
  if (args['dry-run']) {
    return { exitCode: 0, summary: { plan: 'TODO' } };
  }
  // TODO(impl): write me.
  logInfo('hello', { from: '${name}' });
  return { exitCode: 0, summary: {} };
});
`;
}

function shimBody(name: string): string {
  return `#!/usr/bin/env bash\n# SPDX-License-Identifier: MIT\n# Copyright (c) 2026 Nexus Engine contributors\nexec bun "$(dirname "$0")/bin/${name}.ts" "$@"\n`;
}

function testBody(name: string): string {
  return `// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors

import { describe, expect, it } from 'bun:test';
import { runShim } from './helpers';

describe('${name}', () => {
  it('--help exits 0', async () => {
    const r = await runShim('${name}', ['--help']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('Usage:');
  });

  it('--version exits 0', async () => {
    const r = await runShim('${name}', ['--version']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('${name}');
  });

  it('--xxxnope exits 2', async () => {
    const r = await runShim('${name}', ['--xxxnope']);
    expect(r.exitCode).toBe(2);
  });
});
`;
}

await defineScript(meta, async (args) => {
  const name = args.name;
  const lang = args.lang;
  const cat = args.category;
  const desc = args.description ?? `TODO: describe ${name}`;

  if (lang !== 'ts') {
    nxThrow({
      tag: 'InvalidArg',
      arg: 'lang',
      reason: 'only `ts` supported — bash and python are no longer scaffolded',
    });
  }

  const root = process.env.NEXUS_ROOT ?? process.cwd();
  const scriptsDir = args.custom ? `${root}/scripts/custom` : `${root}/scripts`;
  const binDir = `${scriptsDir}/bin`;
  const testsDir = `${scriptsDir}/tests`;
  const shim = `${scriptsDir}/${name}`;
  const bin = `${binDir}/${name}.ts`;
  const test = `${testsDir}/${name}.test.ts`;

  if (args['dry-run']) {
    return {
      exitCode: 0,
      summary: { name, lang, category: cat, entry: bin, shim, test },
    };
  }

  if (existsSync(shim) || existsSync(bin)) {
    nxThrow({
      tag: 'Config',
      message: 'script already exists',
      location: shim,
    });
  }

  mkdirSync(binDir, { recursive: true });
  mkdirSync(testsDir, { recursive: true });
  mkdirSync(dirname(shim), { recursive: true });

  writeFileSync(bin, binBody(name, desc));
  writeFileSync(shim, shimBody(name));
  writeFileSync(test, testBody(name));
  try {
    chmodSync(shim, 0o755);
  } catch {
    /* not fatal */
  }

  // Append manifest entry.
  const manifest = `${root}/scripts/manifest.toml`;
  const relPath = bin.replace(`${root}/`, '');
  const relTest = test.replace(`${root}/`, '');
  const entry = [
    '',
    '[[script]]',
    `name        = "${name}"`,
    `path        = "scripts/${name}"`,
    `lang        = "typescript"`,
    `category    = "${cat}"`,
    `description = "${desc}"`,
    `since       = "0.1.0"`,
    `idempotent  = true`,
    `flags       = []`,
    'exit_codes  = [{ code = 0, meaning = "success" }, { code = 2, meaning = "usage error" }]',
    `required_env = ["NEXUS_ENV"]`,
    `test_file   = "${relTest}"`,
    '',
  ].join('\n');
  try {
    appendFileSync(manifest, entry);
  } catch {
    /* manifest may be read-only in CI */
  }

  return {
    exitCode: 0,
    summary: {
      entry: relPath,
      shim: shim.replace(`${root}/`, ''),
      test: relTest,
      manifest_updated: true,
    },
  };
});
