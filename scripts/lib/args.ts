// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/lib/args.ts — hand-rolled CLI arg parser. Zero deps. Mirrors the
// bash `lib/args.sh` exactly so existing manifest entries port 1:1.
//
// Supported flag spec types:
//   "switch"            -> boolean
//   "string"            -> single string value
//   "string[]"          -> repeatable string → string[]
//   "int"               -> parsed integer (returns InvalidArg on bad parse)
//   "path"              -> string (semantic only)
//   "enum:a|b|c"        -> validated against the pipe-separated set
//
// Base flags auto-seeded: help, version, json, quiet, verbose, dry-run,
// no-color (booleans, all default false).
//
// Long flags accept `--key value` or `--key=value`. Short aliases:
//   -h help · -q quiet · -v verbose · -n dry-run
// `--` ends option parsing; remaining tokens collected as positional.

import { type NxError, nxThrow } from './errors';

export type FlagType =
  | 'switch'
  | 'string'
  | 'string[]'
  | 'int'
  | 'path'
  | `enum:${string}`;

export interface FlagDef {
  type: FlagType;
  required?: boolean;
  default?: string | number | boolean | string[];
}

export type FlagSpec = Record<string, FlagType | FlagDef>;

export type FlagValue<T extends FlagType> = T extends 'switch'
  ? boolean
  : T extends 'string[]'
    ? string[]
    : T extends 'int'
      ? number
      : string;

export type ParsedArgs<S extends FlagSpec> = {
  [K in keyof S]: S[K] extends FlagType
    ? FlagValue<S[K]>
    : S[K] extends FlagDef
      ? FlagValue<S[K]['type']>
      : never;
} & {
  help: boolean;
  version: boolean;
  json: boolean;
  quiet: boolean;
  verbose: boolean;
  'dry-run': boolean;
  'no-color': boolean;
  _: string[];
};

const BASE_FLAGS: Record<string, FlagDef> = {
  help: { type: 'switch', default: false },
  version: { type: 'switch', default: false },
  json: { type: 'switch', default: false },
  quiet: { type: 'switch', default: false },
  verbose: { type: 'switch', default: false },
  'dry-run': { type: 'switch', default: false },
  'no-color': { type: 'switch', default: false },
};

const SHORT_ALIASES: Record<string, string> = {
  h: 'help',
  q: 'quiet',
  v: 'verbose',
  n: 'dry-run',
};

function normalizeDef(t: FlagType | FlagDef): FlagDef {
  return typeof t === 'string' ? { type: t } : t;
}

function defaultFor(def: FlagDef): string | number | boolean | string[] {
  if (def.default !== undefined) return def.default;
  switch (def.type) {
    case 'switch':
      return false;
    case 'string[]':
      return [];
    case 'int':
      return 0;
    default:
      return '';
  }
}

function parseInt10(raw: string, name: string): number {
  if (!/^-?\d+$/.test(raw)) {
    nxThrow({ tag: 'InvalidArg', arg: name, reason: `expected integer, got "${raw}"` });
  }
  return Number.parseInt(raw, 10);
}

function validateEnum(value: string, def: FlagType, name: string): string {
  const choices = String(def).slice('enum:'.length).split('|');
  if (!choices.includes(value)) {
    nxThrow({
      tag: 'InvalidArg',
      arg: name,
      reason: `expected one of ${choices.join('|')}, got "${value}"`,
    });
  }
  return value;
}

function coerce(
  rawValue: string,
  def: FlagDef,
  name: string,
): string | number | boolean | string[] {
  const t = def.type;
  if (t === 'switch') return true;
  if (t === 'int') return parseInt10(rawValue, name);
  if (t === 'string' || t === 'path') return rawValue;
  if (t === 'string[]') return [rawValue]; // appended elsewhere
  if (t.startsWith('enum:')) return validateEnum(rawValue, t, name);
  return rawValue;
}

/**
 * Parse argv into a typed `ParsedArgs<S>`. Throws `NxThrown` with
 * `{ tag: 'InvalidArg' | 'Usage' }` on any parse error.
 *
 * Pass `argv` without the leading `node`/`bun script.ts` entries — i.e.
 * `Bun.argv.slice(2)`.
 */
export function parseArgs<S extends FlagSpec>(spec: S, argv: readonly string[]): ParsedArgs<S> {
  const merged: Record<string, FlagDef> = { ...BASE_FLAGS };
  for (const [k, v] of Object.entries(spec)) {
    merged[k] = normalizeDef(v);
  }

  const out: Record<string, unknown> = { _: [] };
  for (const [k, def] of Object.entries(merged)) {
    out[k] = defaultFor(def);
  }

  const positional: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const tok = argv[i] as string;

    if (tok === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }

    if (tok.startsWith('--')) {
      const body = tok.slice(2);
      let key: string;
      let inlineVal: string | undefined;
      const eq = body.indexOf('=');
      if (eq >= 0) {
        key = body.slice(0, eq);
        inlineVal = body.slice(eq + 1);
      } else {
        key = body;
      }
      const def = merged[key];
      if (!def) {
        nxThrow({ tag: 'InvalidArg', arg: key, reason: `unknown flag --${key}` });
      }
      if (def.type === 'switch') {
        if (inlineVal !== undefined) {
          nxThrow({
            tag: 'InvalidArg',
            arg: key,
            reason: `switch --${key} does not take a value`,
          });
        }
        out[key] = true;
        i += 1;
        continue;
      }
      let raw: string;
      if (inlineVal !== undefined) {
        raw = inlineVal;
        i += 1;
      } else {
        const next = argv[i + 1];
        if (next === undefined) {
          nxThrow({ tag: 'InvalidArg', arg: key, reason: `--${key} requires a value` });
        }
        raw = next;
        i += 2;
      }
      if (def.type === 'string[]') {
        (out[key] as string[]).push(raw);
      } else {
        out[key] = coerce(raw, def, key);
      }
      continue;
    }

    if (tok.startsWith('-') && tok.length > 1) {
      const short = tok.slice(1);
      const longName = SHORT_ALIASES[short];
      if (!longName) {
        nxThrow({ tag: 'InvalidArg', arg: short, reason: `unknown short flag -${short}` });
      }
      out[longName] = true;
      i += 1;
      continue;
    }

    positional.push(tok);
    i += 1;
  }

  out._ = positional;

  // NEXUS_DRY_RUN env override (parity with bash).
  if (process.env.NEXUS_DRY_RUN && process.env.NEXUS_DRY_RUN !== '') {
    out['dry-run'] = true;
  }

  // Skip required validation when --help or --version short-circuits.
  if (out.help === true || out.version === true) {
    return out as ParsedArgs<S>;
  }

  for (const [k, def] of Object.entries(merged)) {
    if (!def.required) continue;
    const v = out[k];
    if (
      v === undefined ||
      v === '' ||
      v === null ||
      (Array.isArray(v) && v.length === 0)
    ) {
      const err: NxError = { tag: 'InvalidArg', arg: k, reason: `missing required flag --${k}` };
      nxThrow(err);
    }
  }

  return out as ParsedArgs<S>;
}
