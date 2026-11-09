// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/tests/bin-scripts.test.ts — the repo gate entry points (bin/setup,
// bin/check, bin/dev) as black boxes. A fake $HOME holds stub cargo, bun,
// rustup and curl binaries that record their argv, and the PATH handed to the
// scripts omits every real tool: the only way a script can find one is the
// $HOME/.cargo/bin and $HOME/.bun/bin it puts on PATH itself. No network, no
// Rust toolchain, no node_modules.
//
// bin/check also runs the Law 7 SPDX header sweep — the CI job `docs / spdx`.
// The sweep shells out to git and to nothing else, so it adds no cargo/bun
// call: the cases below pin its three outcomes (clean tree, a tracked file
// without a header, no git on PATH) and nothing else in the gate moves.

import { describe, expect, it } from 'bun:test';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from './helpers';

const BIN_DIR = join(REPO_ROOT, 'bin');

// A PATH without cargo, bun or rustup in it. The scripts under test have to
// find those tools in the fake $HOME on their own.
const BARE_PATH = '/usr/bin:/bin';

// The sweep in bin/check needs git, so git has to be reachable from the
// sandbox PATH: the bare PATH above may not carry it (some images keep git in
// /usr/local/bin), so the directory holding the git this process can find is
// appended. It is found with the real PATH, never with the bare one.
const GIT_DIR = ((): string | undefined => {
  for (const dir of (process.env.PATH ?? '').split(':')) {
    if (dir.length === 0) continue;
    try {
      if (statSync(join(dir, 'git')).isFile()) return dir;
    } catch {
      continue;
    }
  }
  return undefined;
})();

// The sweep's success line — the same one CI's `docs / spdx` job prints.
const SPDX_OK_MESSAGE =
  'SPDX headers OK on all tracked files under crates/, packages/, scripts/, docs/, .github/';

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
  nextest | deny)
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

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    HOME: home,
    PATH: GIT_DIR ? `${BARE_PATH}:${GIT_DIR}` : BARE_PATH,
    STUB_LOG: log,
  };
  if (options.cargoFail) env.STUB_CARGO_FAIL = options.cargoFail;
  return { root, home, log, env };
}

/** Run one script against a sandbox and capture its streams. */
async function spawnScript(
  scriptPath: string,
  cwd: string,
  env: Record<string, string>,
  args: string[] = [],
): Promise<RunResult> {
  const proc = Bun.spawn({
    cmd: [scriptPath, ...args],
    cwd,
    env,
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

/** Run one of the repo's bin/ scripts against the sandbox. */
async function runScript(name: string, sandbox: Sandbox): Promise<RunResult> {
  return spawnScript(join(BIN_DIR, name), REPO_ROOT, sandbox.env);
}

/**
 * A PATH directory holding every tool on the real PATH except git.
 *
 * The sweep has to skip itself when git is unreachable, but the rest of the
 * gate still needs bash (the shebang), dirname, mktemp and whatever else the
 * sweep may shell out to — so the farm mirrors the real PATH and drops git
 * only. The first directory on PATH wins for a given name, as PATH itself
 * does.
 */
function pathWithoutGit(farm: string): string {
  mkdirSync(farm, { recursive: true });
  for (const dir of (process.env.PATH ?? '').split(':')) {
    if (dir.length === 0) continue;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry === 'git') continue;
      const source = join(dir, entry);
      try {
        const st = statSync(source);
        if (!st.isFile() || (st.mode & 0o111) === 0) continue;
        symlinkSync(source, join(farm, entry));
      } catch {
        // Already linked (an earlier PATH entry won) or not linkable.
        continue;
      }
    }
  }
  return farm;
}

/** Run git in the test process' own environment — the sandbox stubs none of it. */
async function runGit(args: string[], cwd: string): Promise<RunResult> {
  return spawnScript('git', cwd, process.env as Record<string, string>, args);
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
    const sandbox = sharedContext();
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
      ]);
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

  it('bin/check passes the SPDX header sweep on a clean tree', async () => {
    const sandbox = sharedContext();
    try {
      const r = await runScript('check', sandbox);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain(SPDX_OK_MESSAGE);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/check fails the SPDX header sweep on a tracked file without a header', async () => {
    const sandbox = sharedContext();
    try {
      // A repo of its own: bin/check sweeps the tree it sits in, so the copy
      // below is the tree the sweep sees.
      const repo = join(sandbox.root, 'spdx-repo');
      const headerless = 'crates/nexus-core/headerless.rs';
      mkdirSync(join(repo, 'bin'), { recursive: true });
      mkdirSync(join(repo, 'crates', 'nexus-core'), { recursive: true });
      // the last step of the gate is `cd scripts` — the directory has to exist
      mkdirSync(join(repo, 'scripts'), { recursive: true });
      const script = join(repo, 'bin', 'check');
      writeFileSync(script, readFileSync(join(BIN_DIR, 'check')));
      chmodSync(script, 0o755);
      writeFileSync(join(repo, headerless), 'pub fn no_spdx_header() {}\n');
      const init = await runGit(['init', '--quiet'], repo);
      expect(init.exitCode).toBe(0);
      const add = await runGit(['add', '-f', headerless], repo);
      expect(add.exitCode).toBe(0);
      const r = await spawnScript(script, repo, sandbox.env);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toContain('Missing SPDX header in 1 file(s)');
      expect(r.stderr).toContain(headerless);
      expect(r.stdout).not.toContain(SPDX_OK_MESSAGE);
      // set -e stops the script at spdx_sweep's exit 1, so the cargo chain
      // (bin/check:149) must never run: nothing besides the two component
      // probes may reach the stub log.
      const probes = ['cargo fmt --version', 'cargo clippy --version'];
      expect(calls(sandbox).filter((call) => !probes.includes(call))).toEqual([]);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/check enforces the exact 15-line SPDX header window and exempts .json files', async () => {
    const sandbox = sharedContext();
    try {
      // A repo of its own, same as the headerless case above.
      const repo = join(sandbox.root, 'spdx-window-repo');
      const atLine15 = 'crates/nexus-core/header-at-line-15.rs';
      const atLine16 = 'crates/nexus-core/header-at-line-16.rs';
      const exemptJson = 'crates/nexus-core/exempt.json';
      mkdirSync(join(repo, 'bin'), { recursive: true });
      mkdirSync(join(repo, 'crates', 'nexus-core'), { recursive: true });
      mkdirSync(join(repo, 'scripts'), { recursive: true });
      const script = join(repo, 'bin', 'check');
      writeFileSync(script, readFileSync(join(BIN_DIR, 'check')));
      chmodSync(script, 0o755);

      // The sweep checks lines 1..15 inclusive (bin/check:124-132): a header
      // on line 15 is the last line still inside the window (passes); one
      // line later, on line 16, is just outside it (fails). A tracked
      // `.json` file with no header at all is exempt regardless (bin/check:110).
      const filler14 = Array.from({ length: 14 }, (_, i) => `// filler ${i + 1}`).join('\n');
      writeFileSync(
        join(repo, atLine15),
        `${filler14}\n// SPDX-License-Identifier: MIT\npub fn at_line_15() {}\n`,
      );
      const filler15 = Array.from({ length: 15 }, (_, i) => `// filler ${i + 1}`).join('\n');
      writeFileSync(
        join(repo, atLine16),
        `${filler15}\n// SPDX-License-Identifier: MIT\npub fn at_line_16() {}\n`,
      );
      writeFileSync(join(repo, exemptJson), '{"no":"header"}\n');

      const init = await runGit(['init', '--quiet'], repo);
      expect(init.exitCode).toBe(0);
      const add = await runGit(['add', '-f', atLine15, atLine16, exemptJson], repo);
      expect(add.exitCode).toBe(0);
      const r = await spawnScript(script, repo, sandbox.env);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toContain('Missing SPDX header in 1 file(s)');
      expect(r.stderr).toContain(atLine16);
      expect(r.stderr).not.toContain(atLine15);
      expect(r.stderr).not.toContain(exemptJson);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/check reports a failed `git ls-files` and skips the sweep without reddening the gate', async () => {
    const sandbox = sharedContext();
    try {
      // A fake git ahead of the real one on PATH always exits 1, as `git
      // ls-files` would against a corrupt or unreadable index. The sweep
      // must read this from git's own exit status (bin/check:99-104), not
      // from `$!`, and still leave the gate green.
      const fakeGitDir = join(sandbox.root, 'fake-git');
      mkdirSync(fakeGitDir, { recursive: true });
      writeStub(join(fakeGitDir, 'git'), '#!/bin/sh\nexit 1\n');
      sandbox.env.PATH = `${fakeGitDir}:${sandbox.env.PATH}`;
      const r = await runScript('check', sandbox);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('git ls-files failed (exit 1)');
      expect(r.stderr).toContain('skipping the SPDX header sweep');
      expect(r.stdout).not.toContain(SPDX_OK_MESSAGE);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/check skips the SPDX header sweep when git is not on PATH', async () => {
    const sandbox = sharedContext();
    try {
      // Without git the sweep cannot run; it has to skip itself and leave the
      // gate green rather than redden a build over an unusable environment.
      sandbox.env.PATH = pathWithoutGit(join(sandbox.root, 'path-no-git'));
      const r = await runScript('check', sandbox);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('skipping the SPDX header sweep');
      expect(r.stdout).not.toContain(SPDX_OK_MESSAGE);
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
