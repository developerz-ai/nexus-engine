// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/lib/bun.ts — process-spawn helper that captures stdout/stderr and
// returns a structured result. Built on `Bun.spawn`. No shell, no bash.
//
// `run(["cargo", "build"])` is the canonical form. To pass env extensions use
// `{ env: { FOO: "1" } }` which is merged with `process.env`.

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string>;
  /** Inherit stdin from parent. Default false (closed). */
  inheritStdin?: boolean;
  /** Inherit stdout to parent terminal. Default false (captured). */
  inheritStdout?: boolean;
  /** Inherit stderr to parent terminal. Default false (captured). */
  inheritStderr?: boolean;
  /** Timeout in milliseconds; kills the process if exceeded. */
  timeoutMs?: number;
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * Spawn a child process and wait for it to exit. Returns captured output.
 *
 * Does NOT throw on non-zero exit — caller decides how to map exit codes to
 * `NxError` variants.
 */
export async function run(cmd: readonly string[], opts: RunOptions = {}): Promise<RunResult> {
  if (cmd.length === 0) {
    return { exitCode: 1, stdout: '', stderr: 'empty command', timedOut: false };
  }
  const mergedEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...(opts.env ?? {}),
  };
  const proc = Bun.spawn({
    cmd: [...cmd],
    cwd: opts.cwd ?? process.cwd(),
    env: mergedEnv,
    stdin: opts.inheritStdin ? 'inherit' : 'ignore',
    stdout: opts.inheritStdout ? 'inherit' : 'pipe',
    stderr: opts.inheritStderr ? 'inherit' : 'pipe',
  });

  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (opts.timeoutMs && opts.timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill('SIGKILL');
      } catch {
        /* already dead */
      }
    }, opts.timeoutMs);
  }

  const [stdoutText, stderrText, exitCode] = await Promise.all([
    opts.inheritStdout ? Promise.resolve('') : new Response(proc.stdout).text(),
    opts.inheritStderr ? Promise.resolve('') : new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (timer) clearTimeout(timer);

  return {
    exitCode,
    stdout: stdoutText,
    stderr: stderrText,
    timedOut,
  };
}

/** Returns true iff `tool` exists on PATH. */
export async function hasTool(tool: string): Promise<boolean> {
  const r = await run(['sh', '-c', `command -v ${tool}`]).catch(
    () => ({ exitCode: 1 }) as RunResult,
  );
  return r.exitCode === 0;
}
