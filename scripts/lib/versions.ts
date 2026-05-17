// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/lib/versions.ts — load pinned tool versions from versions.toml.
//
// Uses a hand-rolled minimal TOML reader (key = "value" and [section] only,
// matching the actual shape of `versions.toml`). Avoids a runtime dep; if
// the file evolves to use arrays/tables it should switch to a real parser
// behind an ADR.

import { readFileSync } from 'node:fs';

export type VersionsTable = Record<string, Record<string, string>>;

export function parseSimpleToml(text: string): VersionsTable {
  const out: VersionsTable = {};
  let current = '';
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch && sectionMatch[1]) {
      current = sectionMatch[1].trim();
      if (!out[current]) out[current] = {};
      continue;
    }

    const kvMatch = line.match(/^([A-Za-z0-9._-]+)\s*=\s*"([^"]*)"\s*$/);
    if (kvMatch && kvMatch[1] !== undefined && kvMatch[2] !== undefined) {
      const key = kvMatch[1];
      const value = kvMatch[2];
      const bucket = current === '' ? '__root__' : current;
      if (!out[bucket]) out[bucket] = {};
      out[bucket][key] = value;
    }
  }
  return out;
}

export function loadVersions(path?: string): VersionsTable {
  const root = process.env.NEXUS_ROOT ?? process.cwd();
  const file = path ?? `${root}/scripts/lib/versions.toml`;
  const text = readFileSync(file, 'utf8');
  return parseSimpleToml(text);
}
