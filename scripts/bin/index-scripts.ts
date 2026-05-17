#!/usr/bin/env bun
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/bin/index-scripts.ts — regenerate scripts/index.json from
// scripts/manifest.toml. Hand-rolled minimal TOML reader handles the actual
// shape of the manifest (top-level scalars, [meta] table, [[script]] array
// of tables with inline table arrays for flags + exit_codes).
//
// Performance Contract:
//   cold_start  < 300 ms
//   wall_time   < 1 s
//   mem_peak    < 64 MB

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { nxThrow } from '../lib/errors';
import { logInfo } from '../lib/log';
import { defineScript } from '../lib/skeleton';

export const meta = {
  name: 'index-scripts',
  version: '0.1.0',
  description: 'Regenerate scripts/index.json from manifest.toml.',
  flags: {
    check: 'switch',
    env: 'string',
  },
  exitCodes: [
    { code: 0, meaning: 'index up to date or written' },
    { code: 3, meaning: 'manifest missing or invalid' },
    { code: 4, meaning: 'parser failed' },
    { code: 8, meaning: 'drift detected (--check mode)' },
  ],
} as const;

interface ScriptEntry {
  name: string;
  path: string;
  lang: string;
  category: string;
  description: string;
  since: string;
  idempotent: boolean;
  flags: Record<string, unknown>[];
  exit_codes: Record<string, unknown>[];
  required_env: string[];
  test_file: string;
}

interface IndexFile {
  schema_version: string;
  generated_at: string;
  repo_kind: string;
  scripts: ScriptEntry[];
}

const BASE_FLAGS: Record<string, unknown>[] = [
  { name: 'help', type: 'switch', default: false, source: 'base' },
  { name: 'json', type: 'switch', default: false, source: 'base' },
  { name: 'quiet', type: 'switch', default: false, source: 'base' },
  { name: 'verbose', type: 'switch', default: false, source: 'base' },
  { name: 'dry-run', type: 'switch', default: false, source: 'base' },
  { name: 'no-color', type: 'switch', default: false, source: 'base' },
  { name: 'version', type: 'switch', default: false, source: 'base' },
];

// Tokenize an inline TOML value (one of: "string", number, true, false,
// inline-table { k = v, … }, or array [ … ]).
function parseValue(raw: string): unknown {
  const t = raw.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  if (t.startsWith('[') && t.endsWith(']')) return parseArrayValue(t);
  if (t.startsWith('{') && t.endsWith('}')) return parseInlineTable(t);
  return t;
}

function parseInlineTable(raw: string): Record<string, unknown> {
  const inner = raw.slice(1, -1).trim();
  const out: Record<string, unknown> = {};
  const parts = splitTopLevel(inner, ',');
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    const key = p.slice(0, eq).trim();
    const val = p.slice(eq + 1).trim();
    out[key] = parseValue(val);
  }
  return out;
}

function parseArrayValue(raw: string): unknown[] {
  const inner = raw.slice(1, -1).trim();
  if (inner === '') return [];
  const parts = splitTopLevel(inner, ',');
  return parts.map((p) => parseValue(p.trim()));
}

// Split `s` by `delim` respecting nested `{}` `[]` and `"…"`.
function splitTopLevel(s: string, delim: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inStr = false;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' && s[i - 1] !== '\\') inStr = !inStr;
    else if (!inStr && (c === '{' || c === '[')) depth += 1;
    else if (!inStr && (c === '}' || c === ']')) depth -= 1;
    else if (!inStr && depth === 0 && c === delim) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out.filter((x) => x.trim() !== '');
}

interface Manifest {
  meta: { repo_kind?: string };
  script: Record<string, unknown>[];
}

// Parse the manifest. Sections: [meta], [[script]]. Arrays-of-tables for
// `flags` and `exit_codes` are declared inline on a single (possibly
// multi-line) assignment. Real TOML covers more shapes — see ADR if the
// manifest grows nested tables.
function parseManifest(text: string): Manifest {
  const out: Manifest = { meta: {}, script: [] };
  let section: 'meta' | 'script' | 'root' = 'root';
  let curScript: Record<string, unknown> | null = null;

  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    let line = (lines[i] ?? '').trim();
    if (line === '' || line.startsWith('#')) {
      i += 1;
      continue;
    }
    if (line === '[meta]') {
      section = 'meta';
      curScript = null;
      i += 1;
      continue;
    }
    if (line === '[[script]]') {
      curScript = {};
      out.script.push(curScript);
      section = 'script';
      i += 1;
      continue;
    }
    if (line.startsWith('[') && !line.startsWith('[[')) {
      section = 'root';
      curScript = null;
      i += 1;
      continue;
    }
    // Key = value. The value may span multiple lines for arrays/inline-tables;
    // accumulate until brackets balance.
    const eq = line.indexOf('=');
    if (eq < 0) {
      i += 1;
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Multi-line balance for arrays/inline tables.
    const needsBalance =
      (value.startsWith('[') && !balanced(value, '[', ']')) ||
      (value.startsWith('{') && !balanced(value, '{', '}'));
    if (needsBalance) {
      let buf = value;
      i += 1;
      while (i < lines.length) {
        buf += `\n${lines[i] ?? ''}`;
        if (
          (buf.startsWith('[') && balanced(buf, '[', ']')) ||
          (buf.startsWith('{') && balanced(buf, '{', '}'))
        ) {
          break;
        }
        i += 1;
      }
      value = buf.trim();
    }
    const parsed = parseValue(value);
    if (section === 'meta') {
      (out.meta as Record<string, unknown>)[key] = parsed;
    } else if (section === 'script' && curScript) {
      curScript[key] = parsed;
    }
    i += 1;
  }
  return out;
}

function balanced(s: string, open: string, close: string): boolean {
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' && s[i - 1] !== '\\') inStr = !inStr;
    else if (!inStr && c === open) depth += 1;
    else if (!inStr && c === close) depth -= 1;
  }
  return depth === 0;
}

function buildEntry(raw: Record<string, unknown>): ScriptEntry {
  const flags = ((raw.flags as Record<string, unknown>[]) ?? []).map((f) => ({
    ...f,
    source: 'manifest',
  }));
  return {
    name: String(raw.name ?? ''),
    path: String(raw.path ?? ''),
    lang: String(raw.lang ?? ''),
    category: String(raw.category ?? ''),
    description: String(raw.description ?? ''),
    since: String(raw.since ?? ''),
    idempotent: raw.idempotent === true,
    flags: [...BASE_FLAGS, ...flags],
    exit_codes: (raw.exit_codes as Record<string, unknown>[]) ?? [],
    required_env: (raw.required_env as string[]) ?? [],
    test_file: String(raw.test_file ?? ''),
  };
}

// Stable JSON used for drift comparison (ignores `generated_at`).
function canonical(idx: IndexFile): string {
  const copy: Omit<IndexFile, 'generated_at'> = { ...idx };
  const obj = { ...copy } as Record<string, unknown>;
  delete obj.generated_at;
  return JSON.stringify(obj, Object.keys(obj).sort());
}

await defineScript(meta, async (args) => {
  const root = process.env.NEXUS_ROOT ?? process.cwd();
  const manifestPath = `${root}/scripts/manifest.toml`;
  const indexPath = `${root}/scripts/index.json`;

  if (!existsSync(manifestPath)) {
    nxThrow({
      tag: 'Config',
      message: 'scripts/manifest.toml missing',
      location: manifestPath,
      suggestedFix: 'create it',
    });
  }

  if (args['dry-run']) {
    return { exitCode: 0, summary: { would_write: indexPath } };
  }

  let parsed: Manifest;
  try {
    parsed = parseManifest(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    nxThrow({
      tag: 'Config',
      message: `manifest parse failed: ${(e as Error).message}`,
      location: manifestPath,
    });
  }

  const entries = parsed.script.map(buildEntry);
  const newIndex: IndexFile = {
    schema_version: '1',
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    repo_kind: String(parsed.meta.repo_kind ?? 'engine'),
    scripts: entries,
  };

  if (args.check) {
    if (!existsSync(indexPath)) {
      nxThrow({
        tag: 'Partial',
        message: 'scripts/index.json missing',
        location: indexPath,
        suggestedFix: 'scripts/index-scripts',
      });
    }
    let current: IndexFile;
    try {
      current = JSON.parse(readFileSync(indexPath, 'utf8')) as IndexFile;
    } catch {
      nxThrow({
        tag: 'Partial',
        message: 'scripts/index.json is not valid JSON',
        location: indexPath,
        suggestedFix: 'scripts/index-scripts',
      });
    }
    if (canonical(current) === canonical(newIndex)) {
      return { exitCode: 0, summary: { drift: false, count: entries.length } };
    }
    nxThrow({
      tag: 'Partial',
      message: 'scripts/index.json drifted from manifest',
      location: indexPath,
      suggestedFix: 'scripts/index-scripts',
    });
  }

  writeFileSync(indexPath, `${JSON.stringify(newIndex, null, 2)}\n`);
  logInfo('wrote', { path: indexPath, count: entries.length });
  return { exitCode: 0, summary: { written: indexPath, count: entries.length } };
});
