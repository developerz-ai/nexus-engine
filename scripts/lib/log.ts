// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/lib/log.ts — structured JSON logger. One object per line, stderr only.
// Levels gated by NEXUS_LOG_LEVEL (default "info").
// Format gated by NEXUS_LOG_FORMAT ("json" | "text"). Defaults to "json" when
// stderr is not a TTY, "text" otherwise.

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function currentLevel(): LogLevel {
  const raw = (process.env.NEXUS_LOG_LEVEL ?? 'info').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}

function format(): 'json' | 'text' {
  const f = process.env.NEXUS_LOG_FORMAT;
  if (f === 'json' || f === 'text') return f;
  return Bun.stderr instanceof Object && process.stderr.isTTY ? 'text' : 'json';
}

function scriptName(): string {
  return process.env.NX_SCRIPT_NAME ?? 'script';
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function emit(level: LogLevel, msg: string, kv: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel()]) return;
  if (format() === 'json') {
    const rec = {
      ts: nowIso(),
      level,
      script: scriptName(),
      msg,
      kv,
    };
    process.stderr.write(`${JSON.stringify(rec)}\n`);
  } else {
    const kvStr =
      Object.keys(kv).length === 0
        ? ''
        : ` ${Object.entries(kv)
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(' ')}`;
    const hms = new Date().toISOString().slice(11, 19);
    process.stderr.write(`${hms}  ${level.padEnd(5)}  ${scriptName()}  ${msg}${kvStr}\n`);
  }
}

export function logDebug(msg: string, kv: Record<string, unknown> = {}): void {
  emit('debug', msg, kv);
}
export function logInfo(msg: string, kv: Record<string, unknown> = {}): void {
  emit('info', msg, kv);
}
export function logWarn(msg: string, kv: Record<string, unknown> = {}): void {
  emit('warn', msg, kv);
}
export function logError(msg: string, kv: Record<string, unknown> = {}): void {
  emit('error', msg, kv);
}
