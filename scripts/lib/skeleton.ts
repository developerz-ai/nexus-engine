// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/lib/skeleton.ts — canonical entry-point glue.
//
// `defineScript({ name, version, description, flags, exitCodes }, handler)`:
//   1. Set NX_SCRIPT_NAME / NX_SCRIPT_VERSION env vars (read by log + telemetry).
//   2. Load `.env` files (via lib/env.ts).
//   3. Start telemetry frame.
//   4. Parse argv (Bun.argv minus runner + script).
//   5. Handle --help / --version short-circuits.
//   6. Invoke `handler(args)`; expect `{ exitCode, summary }` or it throws.
//   7. On `NxThrown`, emit the structured error envelope and exit with the
//      mapped code. On any other throw, emit a Generic envelope (exit 1).
//   8. Always emit telemetry footer + JSON envelope (if --json) to stdout.
//   9. process.exit(exitCode).
//
// The handler returns the data envelope; this module owns:
//   - argv parsing
//   - help/version
//   - structured logging
//   - tagged-error catch
//   - telemetry + envelope emission

import { type FlagSpec, type ParsedArgs, parseArgs } from './args';
import { loadDotEnv } from './env';
import {
  type ExitCodeValue,
  type NxError,
  NxThrown,
  errorEnvelope,
  errorToExitCode,
  errorToMessage,
} from './errors';
import { logError } from './log';
import { type TelemetryFrame, telemetryEnd, telemetryStart } from './telemetry';

export interface ScriptExitCode {
  code: number;
  meaning: string;
}

export interface ScriptMeta<S extends FlagSpec> {
  name: string;
  version: string;
  description: string;
  flags: S;
  exitCodes?: readonly ScriptExitCode[];
}

export interface HandlerResult {
  exitCode: number;
  summary?: Record<string, unknown>;
  warnings?: readonly string[];
}

export type Handler<S extends FlagSpec> = (
  args: ParsedArgs<S>,
  meta: ScriptMeta<S>,
) => Promise<HandlerResult> | HandlerResult;

function printHelp<S extends FlagSpec>(meta: ScriptMeta<S>): void {
  const lines: string[] = [];
  lines.push(`${meta.name} — ${meta.description}`);
  lines.push('');
  lines.push(`Usage: scripts/${meta.name} [FLAGS]`);
  lines.push('');
  lines.push('Base flags:');
  lines.push('  -h, --help        print this help and exit');
  lines.push('      --version     print version and exit');
  lines.push('      --json        structured JSON output on stdout');
  lines.push('  -q, --quiet       suppress stdout');
  lines.push('  -v, --verbose     debug logs on stderr');
  lines.push('  -n, --dry-run     plan without side effects');
  lines.push('      --no-color    strip ANSI');
  lines.push('');
  const keys = Object.keys(meta.flags);
  if (keys.length > 0) {
    lines.push('Script flags:');
    for (const k of keys) {
      const def = meta.flags[k];
      const t = typeof def === 'string' ? def : def.type;
      lines.push(`      --${k.padEnd(14)} (${t})`);
    }
    lines.push('');
  }
  lines.push('See: docs/specs/scripts/cli-contract.md');
  process.stdout.write(`${lines.join('\n')}\n`);
}

function envelope<S extends FlagSpec>(
  meta: ScriptMeta<S>,
  args: ParsedArgs<S> | null,
  frame: TelemetryFrame,
  ok: boolean,
  exitCode: number,
  data: Record<string, unknown>,
  errors: ReturnType<typeof errorEnvelope>[],
  warnings: readonly string[],
): Record<string, unknown> {
  const dryRun = args ? args['dry-run'] === true : false;
  const env = process.env.NEXUS_ENV ?? '';
  const agent = process.env.NEXUS_AGENT_ID ?? 'human';
  return {
    schema: '1',
    script: meta.name,
    version: meta.version,
    ok,
    exit_code: exitCode,
    started_at: frame.startedAtIso,
    ended_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    dry_run: dryRun,
    env,
    data,
    errors,
    warnings,
    telemetry: { agent_id: agent },
  };
}

function emitEnvelope(env: Record<string, unknown>): void {
  // JSON envelope goes to stdout (consumers parse stdout). Telemetry frame
  // and structured logs already went to stderr.
  process.stdout.write(`${JSON.stringify(env)}\n`);
}

/**
 * The canonical entry point every `bin/*.ts` calls. Top-level await this:
 *
 *   await defineScript(meta, async (args) => {
 *     return { exitCode: 0, summary: { ... } };
 *   });
 */
export async function defineScript<S extends FlagSpec>(
  meta: ScriptMeta<S>,
  handler: Handler<S>,
): Promise<void> {
  process.env.NX_SCRIPT_NAME = meta.name;
  process.env.NX_SCRIPT_VERSION = meta.version;

  // Bun.argv: [bun, script.ts, ...userArgs]
  const argv = Bun.argv.slice(2);
  const frame = telemetryStart();
  loadDotEnv();

  let args: ParsedArgs<S> | null = null;
  let finalExit = 0;
  try {
    args = parseArgs(meta.flags, argv);

    if (args.version) {
      process.stdout.write(`${meta.name} ${meta.version}\n`);
      finalExit = 0;
      return;
    }
    if (args.help) {
      printHelp(meta);
      finalExit = 0;
      return;
    }

    const result = await handler(args, meta);
    finalExit = result.exitCode;
    const warnings = result.warnings ?? [];
    const ok = finalExit === 0;
    if (args.json) {
      emitEnvelope(envelope(meta, args, frame, ok, finalExit, result.summary ?? {}, [], warnings));
    }
  } catch (raw) {
    let err: NxError;
    if (raw instanceof NxThrown) {
      err = raw.nx;
    } else if (raw instanceof Error) {
      err = { tag: 'Generic', message: raw.message };
    } else {
      err = { tag: 'Generic', message: String(raw) };
    }
    finalExit = errorToExitCode(err) as ExitCodeValue;
    if (args?.json) {
      emitEnvelope(envelope(meta, args, frame, false, finalExit, {}, [errorEnvelope(err)], []));
    } else {
      logError(errorToMessage(err), { code: finalExit, tag: err.tag });
    }
  } finally {
    telemetryEnd(frame, meta.name, finalExit);
    process.exit(finalExit);
  }
}
