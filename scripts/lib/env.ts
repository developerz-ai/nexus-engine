// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/lib/env.ts — env-var + .env helpers.
//   findRepoRoot()  — walk up for Nexus.toml or .git.
//   loadDotEnv()    — load .env, .env.<NEXUS_ENV>, .env.local (in that order).
//   requireEnv()    — return value or throw MissingPrerequisite.
//   envFlag()       — truthy "1"/"true"/"yes" parsing.
//   parseEnvList()  — comma- or whitespace-separated → string[].

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { nxThrow } from './errors';

export function findRepoRoot(startDir: string = process.cwd()): string {
  if (process.env.NEXUS_ROOT) return process.env.NEXUS_ROOT;
  let dir = resolve(startDir);
  while (dir !== '/' && dir.length > 0) {
    if (existsSync(`${dir}/Nexus.toml`) || existsSync(`${dir}/.git`)) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function tryLoad(path: string): void {
  if (!existsSync(path)) return;
  try {
    if (!statSync(path).isFile()) return;
  } catch {
    return;
  }
  const parsed = parseDotEnv(readFileSync(path, 'utf8'));
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] === undefined) {
      process.env[k] = v;
    }
  }
}

export function loadDotEnv(envName: string = process.env.NEXUS_ENV ?? ''): string {
  const root = findRepoRoot();
  process.env.NEXUS_ROOT = root;
  tryLoad(`${root}/.env`);
  if (envName) tryLoad(`${root}/.env.${envName}`);
  tryLoad(`${root}/.env.local`);
  return root;
}

export function requireEnv(...vars: string[]): Record<string, string> {
  const missing: string[] = [];
  const out: Record<string, string> = {};
  for (const v of vars) {
    const val = process.env[v];
    if (val === undefined || val === '') {
      missing.push(v);
    } else {
      out[v] = val;
    }
  }
  if (missing.length > 0) {
    nxThrow({
      tag: 'MissingPrerequisite',
      tool: `env:${missing.join(',')}`,
      message: `missing required env vars: ${missing.join(', ')}`,
    });
  }
  return out;
}

export function envFlag(name: string): boolean {
  const raw = (process.env[name] ?? '').toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function parseEnvList(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
