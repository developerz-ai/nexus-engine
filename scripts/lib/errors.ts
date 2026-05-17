// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/lib/errors.ts — tagged-union error envelope.
//
// Every shipped error must be one of these variants (Law 10). Never throw a
// bare `Error` from script code — throw an `NxError` or return one from a
// handler.

export type NxErrorTag =
  | 'Generic'
  | 'Usage'
  | 'Config'
  | 'MissingPrerequisite'
  | 'GateFailed'
  | 'External'
  | 'Timeout'
  | 'Partial'
  | 'NetworkError'
  | 'NotImplemented'
  | 'ToolFailed'
  | 'InvalidArg'
  | 'Invariant';

export type NxError =
  | { tag: 'Generic'; message: string; location?: string; suggestedFix?: string }
  | { tag: 'Usage'; message: string; location?: string; suggestedFix?: string }
  | { tag: 'Config'; message: string; location?: string; suggestedFix?: string }
  | {
      tag: 'MissingPrerequisite';
      tool: string;
      message?: string;
      suggestedFix?: string;
    }
  | { tag: 'GateFailed'; gate: string; exitCode: number; message?: string }
  | { tag: 'External'; message: string; location?: string; suggestedFix?: string }
  | { tag: 'Timeout'; operation: string; durationMs: number; message?: string }
  | { tag: 'Partial'; message: string; location?: string; suggestedFix?: string }
  | { tag: 'NetworkError'; url?: string; message: string }
  | { tag: 'NotImplemented'; what: string; message?: string }
  | {
      tag: 'ToolFailed';
      tool: string;
      exitCode: number;
      stderr?: string;
      message?: string;
    }
  | { tag: 'InvalidArg'; arg: string; reason: string }
  | { tag: 'Invariant'; message: string; location?: string };

// Standard exit codes — match docs/specs/scripts/cli-contract.md and the
// existing bash `lib/errors.sh`.
export const ExitCode = {
  Ok: 0,
  Generic: 1,
  Usage: 2,
  Config: 3,
  Precondition: 4,
  Gate: 5,
  External: 6,
  Timeout: 7,
  Partial: 8,
  Network: 10,
  NotImplemented: 20,
} as const;
export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export function errorToExitCode(err: NxError): ExitCodeValue {
  switch (err.tag) {
    case 'Generic':
      return ExitCode.Generic;
    case 'Usage':
    case 'InvalidArg':
      return ExitCode.Usage;
    case 'Config':
      return ExitCode.Config;
    case 'MissingPrerequisite':
      return ExitCode.Precondition;
    case 'GateFailed':
      return ExitCode.Gate;
    case 'External':
    case 'ToolFailed':
      return ExitCode.External;
    case 'Timeout':
      return ExitCode.Timeout;
    case 'Partial':
      return ExitCode.Partial;
    case 'NetworkError':
      return ExitCode.Network;
    case 'NotImplemented':
      return ExitCode.NotImplemented;
    case 'Invariant':
      return ExitCode.Generic;
  }
}

export function errorToMessage(err: NxError): string {
  switch (err.tag) {
    case 'MissingPrerequisite':
      return err.message ?? `missing prerequisite: ${err.tool}`;
    case 'GateFailed':
      return err.message ?? `gate failed: ${err.gate} (exit ${err.exitCode})`;
    case 'NetworkError':
      return err.url ? `${err.message}: ${err.url}` : err.message;
    case 'NotImplemented':
      return err.message ?? `not implemented: ${err.what}`;
    case 'ToolFailed':
      return err.message ?? `tool '${err.tool}' failed (exit ${err.exitCode})`;
    case 'InvalidArg':
      return `invalid argument --${err.arg}: ${err.reason}`;
    case 'Timeout':
      return err.message ?? `${err.operation} timed out after ${err.durationMs}ms`;
    default:
      return err.message;
  }
}

export function errorEnvelope(err: NxError): {
  code: number;
  tag: string;
  message: string;
  location?: string;
  suggested_fix?: string;
} {
  const code = errorToExitCode(err);
  const message = errorToMessage(err);
  const out: {
    code: number;
    tag: string;
    message: string;
    location?: string;
    suggested_fix?: string;
  } = { code, tag: err.tag, message };
  const anyErr = err as { location?: string; suggestedFix?: string };
  if (anyErr.location) out.location = anyErr.location;
  if (anyErr.suggestedFix) out.suggested_fix = anyErr.suggestedFix;
  return out;
}

/** Thrown internally so `defineScript` can intercept and exit cleanly. */
export class NxThrown extends Error {
  public readonly nx: NxError;
  constructor(err: NxError) {
    super(errorToMessage(err));
    this.nx = err;
    this.name = 'NxThrown';
  }
}

export function nxThrow(err: NxError): never {
  throw new NxThrown(err);
}
