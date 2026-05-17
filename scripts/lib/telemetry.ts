// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/lib/telemetry.ts — per-script-run telemetry.
//
// `telemetryStart()` records a high-resolution start time and ISO timestamp.
// `telemetryEnd(exitCode)` appends a JSONL record to
// `<NEXUS_CACHE_DIR | $NEXUS_ROOT/.cache>/telemetry/scripts.jsonl`.
//
// Suppressed when env `NEXUS_NO_TELEMETRY` is set (tests, CI sanity).

import { existsSync, mkdirSync } from 'node:fs';
import { appendFileSync } from 'node:fs';

export interface TelemetryFrame {
  startedAtIso: string;
  startedAtNs: bigint;
}

export function telemetryStart(): TelemetryFrame {
  const startedAtIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  process.env.NX_TEL_STARTED_AT = startedAtIso;
  return {
    startedAtIso,
    startedAtNs: process.hrtime.bigint(),
  };
}

export function telemetryEnd(
  frame: TelemetryFrame,
  scriptName: string,
  exitCode: number,
): void {
  if (process.env.NEXUS_NO_TELEMETRY) return;
  const endedNs = process.hrtime.bigint();
  const durationMs = Number((endedNs - frame.startedAtNs) / 1_000_000n);
  const root = process.env.NEXUS_ROOT ?? process.cwd();
  const cacheDir = process.env.NEXUS_CACHE_DIR ?? `${root}/.cache`;
  const logDir = `${cacheDir}/telemetry`;
  try {
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  } catch {
    return;
  }
  const rec = {
    ts: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    event: 'script.end',
    script: scriptName,
    agent_id: process.env.NEXUS_AGENT_ID ?? 'human',
    env: process.env.NEXUS_ENV ?? '',
    exit_code: exitCode,
    duration_ms: durationMs,
  };
  try {
    appendFileSync(`${logDir}/scripts.jsonl`, `${JSON.stringify(rec)}\n`);
  } catch {
    // best-effort; never fail a script because telemetry can't write.
  }
}
