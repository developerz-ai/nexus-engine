// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/tests/bin-scripts.test.ts — the repo gate entry points (bin/setup,
// bin/check, bin/dev) as black boxes. A fake $HOME holds stub cargo, bun,
// rustup, curl and git binaries that record their argv, and the PATH
// handed to the scripts omits every real tool: the only way a script can find
// one is the $HOME/.cargo/bin and $HOME/.bun/bin it puts on PATH itself. No
// network, no Rust toolchain, no node_modules.
//
// The git stub is the exception: it does not log, it answers
// `git ls-files -z -- ...` with a controlled NUL-separated file list, so
// the SPDX sweep in bin/check sees exactly the files a test declares and never
// depends on the real checkout's SPDX state.

import { describe, expect, it } from 'bun:test';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { REPO_ROOT } from './helpers';

const BIN_DIR = join(REPO_ROOT, 'bin');

// A PATH without cargo, bun or rustup in it. The scripts under test have to
// find those tools in the fake $HOME on their own.
const BARE_PATH = '/usr/bin:/bin';

// The JSON crates/nexus-cli prints (crates/nexus-cli/src/main.rs).
const NEXUS_CLI_JSON =
  '{"tool":"nexus","version":"0.1.0","status":"stub","spec":"docs/game-template/cli.md"}';

// stub cargo — records its argv, then behaves like cargo: a subcommand goes to
// the matching cargo-<sub> binary, and the one command bin/dev runs prints
// the nexus CLI stub.
const STUB_CARGO = `#!/bin/sh
if [ -n "$STUB_CARGO_FAIL" ] && [ "$*" = "$STUB_CARGO_FAIL" ]; then
  printf 'cargo %s\\n' "$*" >> "$STUB_LOG"
  exit 1
fi
case "$1" in
  nextest | deny | audit)
    sub="$1"
    shift
    exec "$HOME/.cargo/bin/cargo-$sub" "$@"
    ;;
esac
printf 'cargo %s\\n' "$*" >> "$STUB_LOG"
if [ "$*" = "run -p nexus-cli --" ]; then
  printf '%s\\n' '${NEXUS_CLI_JSON}'
fi
exit 0
`;

const STUB_NEXTTEST = `#!/bin/sh
printf 'cargo-nextest %s\\n' "$*" >> "$STUB_LOG"
printf 'cargo-nextest 0.9.85\\n'
exit 0
`;

const STUB_DENY = `#!/bin/sh
printf 'cargo-deny %s\\n' "$*" >> "$STUB_LOG"
printf 'cargo-deny 0.16.2\\n'
exit 0
`;

const STUB_BUN = `#!/bin/sh
printf 'bun %s\\n' "$*" >> "$STUB_LOG"
case "$1" in
  --version) printf '1.4.4\\n' ;;
esac
exit 0
`;

// stub rustup — reports the pinned toolchain with both components installed,
// so bin/setup never reaches for the network.
const STUB_RUSTUP = `#!/bin/sh
printf 'rustup %s\\n' "$*" >> "$STUB_LOG"
case "$1" in
  toolchain)
    if [ "$2" = "list" ]; then
      printf '1.95-x86_64-unknown-linux-gnu (default)\\n'
    fi
    ;;
  component)
    if [ "$2" = "list" ]; then
      printf 'rustfmt-x86_64-unknown-linux-gnu (installed)\\n'
      printf 'clippy-x86_64-unknown-linux-gnu (installed)\\n'
    fi
    ;;
esac
exit 0
`;

// stub git — answers `git ls-files -z -- ...` with the controlled file
// list in $STUB_GIT_FILES (NUL-separated), and nothing else. It never logs:
// the sweep is asserted by what it reports, not by a call record.
const STUB_GIT = `#!/bin/sh
case "$1" in
  ls-files)
    if [ -n "\${STUB_GIT_FILES:-}" ] && [ -f "$STUB_GIT_FILES" ]; then
      cat "$STUB_GIT_FILES"
    fi
    ;;
esac
exit 0
`;

// stub git — the SCM is present but `git ls-files` fails, so the sweep cannot
// build the tracked-file list and must not report a false 'SPDX headers OK'.
const STUB_GIT_FAILING = `#!/bin/sh
echo 'git: fatal: not a git repository' >&2
exit 128
`;

// stub cargo-audit — the advisory RustSec audit. $STUB_AUDIT_FAIL makes it
// report findings (non-zero exit) so bin/check can prove the advisory gate
// never fails the run.
const STUB_AUDIT = `#!/bin/sh
printf 'cargo-audit %s\\n' "$*" >> "$STUB_LOG"
if [ -n "\${STUB_AUDIT_FAIL:-}" ]; then
  echo 'cargo-audit: 1 advisory found' >&2
  exit 1
fi
exit 0
`;

// stub curl — every download fails, so bin/setup cannot reach the network.
const STUB_CURL = `#!/bin/sh
printf 'curl %s\\n' "$*" >> "$STUB_LOG"
exit 1
`;

// stub curl — serves a real tar.gz holding an executable named after the gate
// tool in the requested URL, so the prebuilt path runs end to end offline.
// Checksum probes fail, like a release without a published .sha256.
const OK_CURL = `#!/bin/sh
printf 'curl %s\\n' "$*" >> "$STUB_LOG"
case "$*" in
  *sha256*) exit 1 ;;
esac
out=""
prev=""
for a in "$@"; do
  if [ "$prev" = "-o" ]; then out="$a"; fi
  prev="$a"
done
if [ -z "$out" ]; then exit 1; fi
name="\${out##*/}"
name="\${name%.tar.gz}"
name="\${name%%-[0-9]*}"
dir="\$(dirname "$out")"
mkdir -p "$dir/pkg"
printf '#!/bin/sh\\nexit 0\\n' > "$dir/pkg/$name"
chmod 755 "$dir/pkg/$name"
tar czf "$out" -C "$dir" "pkg/$name"
rm -rf "$dir/pkg"
exit 0
`;

// stub install — always fails, the stand-in for a full disk or a read-only
// target directory. bin/setup must report the failure, never swallow it.
const FAIL_INSTALL = `#!/bin/sh
printf 'install %s\\n' "$*" >> "$STUB_LOG"
echo 'install: stub: no space left on device' >&2
exit 1
`;

interface Sandbox {
  root: string;
  home: string;
  log: string;
  env: Record<string, string>;
}

interface FixtureOptions {
  /** stub names to leave out of the fake $HOME ('cargo-nextest', 'bun', ...) */
  omit?: readonly string[];
  /** exact argv the cargo stub fails on, e.g. 'fmt --version' */
  cargoFail?: string;
  /** install a curl stub whose downloads always fail */
  failCurl?: boolean;
  /** install a curl stub that serves a real archive for the requested tool */
  okCurl?: boolean;
  /** install an `install` stub that always fails — a full disk */
  failInstall?: boolean;
  /**
   * The files the git stub reports as tracked, in the order the sweep should
   * see them. Each entry is a path relative to the repo root; the fixture
   * materialises it under the sandbox so the sweep reads a file it controls.
   * Omit for an empty tracked-file set.
   */
  trackedFiles?: readonly { path: string; spdx: boolean }[];
  /** make the cargo-audit stub report findings (non-zero exit) */
  auditFail?: boolean;
  /**
   * Install a git stub whose `git ls-files` fails — the SCM is there, but the
   * tracked-file list cannot be built.
   */
  failGit?: boolean;
  /**
   * Put a PATH in front of the script that contains every system tool from
   * BARE_PATH except git, so `command -v git` fails even though the machine
   * has a real git. Without this, omitting the git stub is not enough: the
   * system git in /usr/bin would answer instead.
   */
  noGitOnPath?: boolean;
}

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function writeStub(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

/** A fake $HOME plus a PATH without any tool in it — the shared fixture. */
function sharedContext(options: FixtureOptions = {}): Sandbox {
  const root = mkdtempSync(join(tmpdir(), 'nexus-bin-'));
  const home = join(root, 'home');
  const cargoBin = join(home, '.cargo', 'bin');
  const bunBin = join(home, '.bun', 'bin');
  mkdirSync(cargoBin, { recursive: true });
  mkdirSync(bunBin, { recursive: true });
  const log = join(root, 'stub.log');
  writeFileSync(log, '');

  const omit = options.omit ?? [];
  if (!omit.includes('cargo')) writeStub(join(cargoBin, 'cargo'), STUB_CARGO);
  if (!omit.includes('rustup')) writeStub(join(cargoBin, 'rustup'), STUB_RUSTUP);
  if (!omit.includes('cargo-nextest')) {
    writeStub(join(cargoBin, 'cargo-nextest'), STUB_NEXTTEST);
  }
  if (!omit.includes('cargo-deny')) writeStub(join(cargoBin, 'cargo-deny'), STUB_DENY);
  if (!omit.includes('bun')) writeStub(join(bunBin, 'bun'), STUB_BUN);
  if (options.failCurl) writeStub(join(cargoBin, 'curl'), STUB_CURL);
  if (options.okCurl) writeStub(join(cargoBin, 'curl'), OK_CURL);
  if (options.failInstall) writeStub(join(cargoBin, 'install'), FAIL_INSTALL);
  // The SCM stub shadows the real one: bin/check puts $HOME/.cargo/bin first
  // on PATH, so the sweep sees only the files this fixture declares.
  if (!omit.includes('git')) {
    writeStub(join(cargoBin, 'git'), options.failGit ? STUB_GIT_FAILING : STUB_GIT);
  }
  // cargo-audit is advisory: installed by default so the gate exercises it,
  // and omit-able so a test can prove bin/check says so when it is absent.
  if (!omit.includes('cargo-audit')) writeStub(join(cargoBin, 'cargo-audit'), STUB_AUDIT);

  // The tracked-file list the git stub reports. Paths are absolute: the sweep
  // reads them from the repo root, so an absolute path keeps the fixture out
  // of the checkout entirely.
  const trackedList = join(root, 'tracked-files');
  const tracked = options.trackedFiles ?? [];
  writeFileSync(trackedList, tracked.map((f) => `${join(root, 'tracked', f.path)}\0`).join(''));
  for (const f of tracked) {
    const abs = join(root, 'tracked', f.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.spdx ? '// SPDX-License-Identifier: MIT\n' : 'no header here\n');
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    HOME: home,
    PATH: BARE_PATH,
    STUB_LOG: log,
    STUB_GIT_FILES: trackedList,
  };
  if (options.noGitOnPath) env.PATH = pathWithoutGit(root);
  if (options.cargoFail) env.STUB_CARGO_FAIL = options.cargoFail;
  if (options.auditFail) env.STUB_AUDIT_FAIL = '1';
  return { root, home, log, env };
}

/**
 * A PATH directory holding every tool BARE_PATH offers except git.
 *
 * The script under test must find `bash` (its own shebang is `#!/usr/bin/env
 * bash`) and the coreutils the sweep uses, but `command -v git` has to fail.
 * Symlinking the real tools keeps the rest of the sandbox honest: nothing is
 * stubbed but git.
 */
function pathWithoutGit(root: string): string {
  const farm = join(root, 'path-no-git');
  mkdirSync(farm, { recursive: true });
  for (const dir of BARE_PATH.split(':')) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry === 'git') continue;
      const target = join(dir, entry);
      const link = join(farm, entry);
      try {
        symlinkSync(target, link);
      } catch {
        // A duplicate name across the PATH dirs, or a dangling link: the
        // first one on PATH wins anyway.
      }
    }
  }
  return farm;
}

/** Run one of the repo's bin/ scripts against the sandbox. */
async function runScript(name: string, sandbox: Sandbox): Promise<RunResult> {
  const proc = Bun.spawn({
    cmd: [join(BIN_DIR, name)],
    cwd: REPO_ROOT,
    env: sandbox.env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

/** Every stubbed call, in the order the script made them. */
function calls(sandbox: Sandbox): string[] {
  return readFileSync(sandbox.log, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

describe('bin scripts', () => {
  it('bin/check finds the gate tools in $HOME and runs the whole gate list', async () => {
    const sandbox = sharedContext({
      trackedFiles: [{ path: 'crates/nexus-core/src/lib.rs', spdx: true }],
    });
    try {
      const r = await runScript('check', sandbox);
      expect(r.exitCode).toBe(0);
      const probes = ['cargo fmt --version', 'cargo clippy --version'];
      expect(calls(sandbox).filter((call) => !probes.includes(call))).toEqual([
        'cargo fmt --all -- --check',
        'cargo clippy --workspace --all-targets -- -D warnings',
        'cargo check --workspace --all-targets',
        'cargo-nextest run --workspace --profile ci',
        'cargo-deny check',
        'bun test',
        'bun x biome check .',
        'cargo-audit',
      ]);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/check runs the SPDX sweep before the cargo chain', async () => {
    const sandbox = sharedContext({
      trackedFiles: [{ path: 'crates/nexus-core/src/lib.rs', spdx: true }],
    });
    try {
      const r = await runScript('check', sandbox);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('SPDX headers OK');
      // The sweep ran and passed; the cargo chain followed it.
      const probes = ['cargo fmt --version', 'cargo clippy --version'];
      const seen = calls(sandbox).filter((call) => !probes.includes(call));
      expect(seen[0]).toBe('cargo fmt --all -- --check');
      expect(seen).toContain('cargo-audit');
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/check fails the gate when a tracked file has no SPDX header', async () => {
    const sandbox = sharedContext({
      trackedFiles: [
        { path: 'crates/nexus-core/src/lib.rs', spdx: true },
        { path: 'crates/nexus-core/src/no_header.rs', spdx: false },
      ],
    });
    try {
      const r = await runScript('check', sandbox);
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain('crates/nexus-core/src/no_header.rs');
      // The cargo chain never started: the sweep is the cheapest gate.
      const probes = ['cargo fmt --version', 'cargo clippy --version'];
      expect(calls(sandbox).filter((call) => !probes.includes(call))).toEqual([]);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/check fails with a non-69 code when git is missing for the SPDX sweep', async () => {
    // No git stub, and no system git on PATH either: the sweep cannot build
    // the tracked-file list at all.
    const sandbox = sharedContext({ omit: ['git'], noGitOnPath: true });
    try {
      const r = await runScript('check', sandbox);
      // The git-not-found branch, not the ls-files branch: the sweep reports
      // that git itself is missing.
      expect(r.stderr).toContain('git not found');
      expect(r.stderr).not.toContain('git ls-files failed');
      // NOT 69: in bin/check, 69 means EX_UNAVAILABLE, "run ./bin/setup
      // first" — and bin/setup never installs git, so 69 would point the
      // caller at a remedy that cannot fix a missing git. 70 = EX_SOFTWARE.
      expect(r.exitCode).toBe(70);
      // The sweep is the cheapest gate: it fails before the cargo chain.
      const probes = ['cargo fmt --version', 'cargo clippy --version'];
      expect(calls(sandbox).filter((call) => !probes.includes(call))).toEqual([]);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/check fails the gate when git ls-files cannot list the tracked files', async () => {
    // git is present, but `git ls-files` fails: the sweep must report the
    // failure, not a false 'SPDX headers OK'.
    const sandbox = sharedContext({ failGit: true });
    try {
      const r = await runScript('check', sandbox);
      // exit 1: the sweep could not build the tracked-file list.
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toContain('git ls-files failed');
      // A false 'SPDX headers OK' would pass the gate on an empty list.
      expect(r.stderr).not.toContain('SPDX headers OK');
      // The cargo chain never started: the sweep is the cheapest gate.
      const probes = ['cargo fmt --version', 'cargo clippy --version'];
      expect(calls(sandbox).filter((call) => !probes.includes(call))).toEqual([]);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/check fails the gate when a blocking gate command fails', async () => {
    // Regression for the swallowed && chain failure.
    //
    // `set -e` does NOT abort the script when a command in a non-final
    // position of an && list fails (POSIX: errexit is ignored for every
    // command of an && list except the last one). The blocking chain in
    // bin/check therefore used to lose its failure, the advisory audit block
    // ran anyway and its exit 0 became the script's exit status: a red gate
    // was reported as a green one.
    //
    // The gate must capture the chain's status and propagate it BEFORE the
    // advisory audit runs: a failed gate exits non-zero, says so, and never
    // reaches the advisory block.
    const gate = 'fmt --all -- --check';
    const sandbox = sharedContext({ cargoFail: gate });
    try {
      const r = await runScript('check', sandbox);
      // The failing gate reaches the exit status.
      expect(r.exitCode).not.toBe(0);
      // The failure is reported, not swallowed.
      expect(r.stderr).toContain('the gate failed');
      // The chain stops at the failing gate and the advisory audit never runs.
      expect(calls(sandbox)).toEqual([
        'cargo fmt --version',
        'cargo clippy --version',
        'cargo fmt --all -- --check',
      ]);
      expect(calls(sandbox)).not.toContain('cargo-audit');
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/check treats a failing cargo audit as advisory and still passes', async () => {
    const sandbox = sharedContext({ auditFail: true });
    try {
      const r = await runScript('check', sandbox);
      expect(r.exitCode).toBe(0);
      expect(calls(sandbox)).toContain('cargo-audit');
      expect(r.stderr).toContain('cargo audit');
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/check names cargo audit when it is not installed', async () => {
    const sandbox = sharedContext({ omit: ['cargo-audit'] });
    try {
      const r = await runScript('check', sandbox);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('cargo audit');
      expect(r.stderr).toContain('cargo install cargo-audit');
      // The advisory audit never ran, and nothing else changed.
      expect(calls(sandbox)).not.toContain('cargo-audit');
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/check exits 69 with a setup hint when a gate tool is missing', async () => {
    const sandbox = sharedContext({ omit: ['cargo-nextest'] });
    try {
      const r = await runScript('check', sandbox);
      expect(r.exitCode).toBe(69);
      expect(r.stderr).toContain('cargo-nextest');
      expect(r.stderr).toContain('run ./bin/setup');
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/check exits 69 when the rustfmt component is missing', async () => {
    const sandbox = sharedContext({ cargoFail: 'fmt --version' });
    try {
      const r = await runScript('check', sandbox);
      expect(r.exitCode).toBe(69);
      expect(r.stderr).toContain('rustfmt');
      expect(r.stderr).toContain('run ./bin/setup');
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/check exits 69 when the clippy component is missing', async () => {
    const sandbox = sharedContext({ cargoFail: 'clippy --version' });
    try {
      const r = await runScript('check', sandbox);
      expect(r.exitCode).toBe(69);
      expect(r.stderr).toContain('clippy');
      expect(r.stderr).toContain('run ./bin/setup');
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/dev finds cargo in $HOME/.cargo/bin and prints the nexus CLI stub', async () => {
    const sandbox = sharedContext();
    try {
      const r = await runScript('dev', sandbox);
      expect(r.exitCode).toBe(0);
      expect(calls(sandbox)).toContain('cargo run -p nexus-cli --');
      const cli = JSON.parse(r.stdout.trim()) as { tool?: string; status?: string };
      expect(cli.tool).toBe('nexus');
      expect(cli.status).toBe('stub');
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/setup skips gate tools that are already installed and exits 0', async () => {
    const sandbox = sharedContext();
    try {
      const first = await runScript('setup', sandbox);
      expect(first.exitCode).toBe(0);
      expect(first.stderr).toContain('cargo-nextest already installed');
      expect(first.stderr).toContain('cargo-deny already installed');
      const second = await runScript('setup', sandbox);
      expect(second.exitCode).toBe(0);
      expect(second.stderr).toContain('cargo-nextest already installed');
      expect(second.stderr).toContain('cargo-deny already installed');
      const seen = calls(sandbox);
      expect(seen.some((call) => call.startsWith('cargo install'))).toBe(false);
      expect(seen.some((call) => call.startsWith('curl '))).toBe(false);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/setup exits 69 when a prebuilt gate tool cannot be downloaded', async () => {
    const sandbox = sharedContext({
      omit: ['cargo-nextest', 'cargo-deny'],
      failCurl: true,
    });
    try {
      const r = await runScript('setup', sandbox);
      expect(r.exitCode).toBe(69);
      expect(r.stderr).toContain('cargo-nextest');
      expect(r.stderr).toContain('0.9.85');
      expect(r.stderr).toContain('github.com/nextest-rs/nextest');
      expect(calls(sandbox).some((call) => call.startsWith('cargo install'))).toBe(false);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/setup exits 69 when writing a downloaded gate tool fails', async () => {
    const sandbox = sharedContext({
      omit: ['cargo-nextest', 'cargo-deny'],
      okCurl: true,
      failInstall: true,
    });
    try {
      const r = await runScript('setup', sandbox);
      expect(r.exitCode).toBe(69);
      expect(r.stderr).toContain('could not write');
      expect(r.stderr).toContain('could not install cargo-nextest');
      expect(r.stderr).not.toContain('installed cargo-nextest');
      expect(calls(sandbox).some((call) => call.startsWith('install '))).toBe(true);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/setup exits 69 when copying a PATH tool next to the cargo shims fails', async () => {
    const sandbox = sharedContext({ omit: ['cargo-nextest'], failInstall: true });
    try {
      // A plain (non-symlink) cargo-nextest elsewhere on PATH sends
      // ensure_gate_tool down its copy branch — with the failing install
      // stub as the disk that cannot take the copy.
      writeStub(join(sandbox.home, '.bun', 'bin', 'cargo-nextest'), STUB_NEXTTEST);
      const r = await runScript('setup', sandbox);
      expect(r.exitCode).toBe(69);
      expect(r.stderr).toContain('already on PATH');
      expect(r.stderr).toContain('could not write');
      expect(r.stderr).not.toContain('installed cargo-nextest');
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/setup never builds a gate tool from source and never calls mise', () => {
    const source = readFileSync(join(BIN_DIR, 'setup'), 'utf8');
    expect(source).not.toMatch(/cargo install/);
    expect(source).not.toMatch(/\bmise\b/);
    expect(source).not.toMatch(/naga/);
  });
});
