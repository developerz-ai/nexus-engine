// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/tests/bin-scripts.test.ts — the repo gate entry points (bin/setup,
// bin/check, bin/dev) as black boxes. A fake $HOME holds stub cargo, bun,
// rustup and curl binaries that record their argv, and the PATH handed to the
// scripts omits every real tool: the only way a script can find one is the
// $HOME/.cargo/bin and $HOME/.bun/bin it puts on PATH itself. No network, no
// Rust toolchain, no node_modules.

import { describe, expect, it } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { REPO_ROOT } from './helpers';

const BIN_DIR = join(REPO_ROOT, 'bin');

// A PATH without cargo, bun or rustup in it. The scripts under test have to
// find those tools in the fake $HOME on their own.
const BARE_PATH = '/usr/bin:/bin';

// The JSON packages/nexus-cli prints (packages/nexus-cli/src/main.rs).
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
if [ -n "$STUB_REPO" ] && [ "$PWD" != "$STUB_REPO" ]; then exit 90; fi
case "$1" in
  audit)
    printf 'cargo %s\\n' "$*" >> "$STUB_LOG"
    if [ ! -x "$HOME/.cargo/bin/cargo-audit" ]; then
      echo 'error: no such command: audit' >&2
      exit 101
    fi
    exec "$HOME/.cargo/bin/cargo-audit" ;;
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

const STUB_AUDIT = `#!/bin/sh
printf 'audit stub diagnostic\\n' >&2
exit "\${STUB_AUDIT_STATUS:-0}"
`;

// Only fixture data is enumerated; the real repository/index is never queried.
const STUB_GIT = `#!/bin/bash
printf 'git %s\\n' "$*" >> "$STUB_LOG"
if [[ "$PWD" != "$STUB_REPO" || "$*" != 'ls-files -z -- crates/** packages/** scripts/** docs/** .github/**' ]]; then
  echo 'unexpected enumeration scope' >&2
  exit 90
fi
cat "$STUB_TRACKED"
if [[ "$STUB_GIT_STATUS" != 0 ]]; then echo 'fixture enumeration failed' >&2; fi
exit "$STUB_GIT_STATUS"
`;

const STUB_BUN = `#!/bin/sh
printf 'bun %s\\n' "$*" >> "$STUB_LOG"
if [ -n "$STUB_REPO" ] && [ "$PWD" != "$STUB_REPO/scripts" ]; then exit 90; fi
if [ "$*" = "$STUB_BUN_FAIL" ]; then exit 1; fi
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
  bunFail?: string;
  auditStatus?: number;
  gitStatus?: number;
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
  writeFileSync(join(root, 'tracked'), '');

  const omit = options.omit ?? [];
  if (!omit.includes('cargo')) writeStub(join(cargoBin, 'cargo'), STUB_CARGO);
  if (!omit.includes('rustup')) writeStub(join(cargoBin, 'rustup'), STUB_RUSTUP);
  if (!omit.includes('cargo-nextest')) {
    writeStub(join(cargoBin, 'cargo-nextest'), STUB_NEXTTEST);
  }
  if (!omit.includes('cargo-deny')) writeStub(join(cargoBin, 'cargo-deny'), STUB_DENY);
  if (!omit.includes('cargo-audit')) writeStub(join(cargoBin, 'cargo-audit'), STUB_AUDIT);
  writeStub(join(cargoBin, 'git'), STUB_GIT);
  if (!omit.includes('bun')) writeStub(join(bunBin, 'bun'), STUB_BUN);
  if (options.failCurl) writeStub(join(cargoBin, 'curl'), STUB_CURL);
  if (options.okCurl) writeStub(join(cargoBin, 'curl'), OK_CURL);
  if (options.failInstall) writeStub(join(cargoBin, 'install'), FAIL_INSTALL);

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    HOME: home,
    PATH: BARE_PATH,
    STUB_LOG: log,
    STUB_CARGO_FAIL: options.cargoFail ?? '',
    STUB_BUN_FAIL: options.bunFail ?? '',
    STUB_AUDIT_STATUS: String(options.auditStatus ?? 0),
    STUB_GIT_STATUS: String(options.gitStatus ?? 0),
    STUB_REPO: '',
    STUB_TRACKED: join(root, 'tracked'),
  };
  return { root, home, log, env };
}

/** Run one of the repo's bin/ scripts against the sandbox. */
async function runScript(name: string, sandbox: Sandbox): Promise<RunResult> {
  const script = name === 'check' ? join(sandbox.root, 'repo', 'bin', name) : join(BIN_DIR, name);
  if (name === 'check') {
    sandbox.env.STUB_REPO = join(sandbox.root, 'repo');
    mkdirSync(dirname(script), { recursive: true });
    mkdirSync(join(sandbox.env.STUB_REPO, 'scripts'), { recursive: true });
    writeStub(script, readFileSync(join(BIN_DIR, name), 'utf8'));
  }
  const proc = Bun.spawn({
    cmd: [script],
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

const HARD_CALLS = [
  'cargo fmt --all -- --check',
  'cargo clippy --workspace --all-targets -- -D warnings',
  'cargo check --workspace --all-targets',
  'cargo-nextest run --workspace --profile ci',
  'cargo-deny check',
  'bun test',
  'bun x biome check .',
];
const ROOTS = ['crates', 'packages', 'scripts', 'docs', '.github'];

function scanFiles(sandbox: Sandbox, files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    const path = join(sandbox.root, 'repo', name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  writeFileSync(sandbox.env.STUB_TRACKED ?? '', `${Object.keys(files).join('\0')}\0`);
}

describe('bin scripts', () => {
  it('bin/check finds the gate tools in $HOME and runs the whole gate list', async () => {
    const sandbox = sharedContext();
    try {
      const r = await runScript('check', sandbox);
      expect(r.exitCode).toBe(0);
      const probes = ['cargo fmt --version', 'cargo clippy --version'];
      expect(calls(sandbox).filter((call) => !probes.includes(call))).toEqual([
        ...HARD_CALLS,
        'git ls-files -z -- crates/** packages/** scripts/** docs/** .github/**',
        'cargo audit',
      ]);
      expect(r.stdout).toContain('SPDX headers OK');
      expect(r.stderr).toContain('audit stub diagnostic');
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/check command and scope expectations match CI', () => {
    const ci = readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
    for (const call of HARD_CALLS) {
      const command = call
        .replace('cargo-nextest ', 'cargo nextest ')
        .replace('cargo-deny ', 'cargo deny ');
      expect(ci).toContain(`run: ${command}`);
    }
    expect(ci).toContain('working-directory: scripts\n        run: bun test');
    expect(ci).toContain('working-directory: scripts\n        run: bun x biome check .');
    expect(ci).toContain('run: cargo audit');
    expect(ci).toMatch(/rust-audit:[\s\S]*?continue-on-error: true/);
    expect(ci).toContain(
      "git ls-files -z -- 'crates/**' 'packages/**' 'scripts/**' 'docs/**' '.github/**'",
    );
  });

  for (const [index, call] of HARD_CALLS.entries()) {
    it(`bin/check fails fast on ${call}, never reaching advisory success`, async () => {
      const command = call
        .replace('cargo-nextest ', 'cargo nextest ')
        .replace('cargo-deny ', 'cargo deny ');
      const sandbox = sharedContext(
        command.startsWith('cargo ')
          ? { cargoFail: command.slice(6) }
          : { bunFail: command.slice(4) },
      );
      try {
        const r = await runScript('check', sandbox);
        expect(r.exitCode).toBe(1);
        // cargo records a failing subcommand before dispatching to its stub.
        expect(calls(sandbox).slice(2)).toEqual([...HARD_CALLS.slice(0, index), command]);
      } finally {
        rmSync(sandbox.root, { recursive: true, force: true });
      }
    });
  }

  for (const unavailable of [false, true]) {
    it(`bin/check reports ${unavailable ? 'unavailable' : 'failing'} audit without blocking`, async () => {
      const sandbox = sharedContext(unavailable ? { omit: ['cargo-audit'] } : { auditStatus: 17 });
      try {
        const r = await runScript('check', sandbox);
        expect(r.exitCode).toBe(0);
        expect(calls(sandbox)).toContain('cargo audit');
        expect(r.stderr).toContain(
          unavailable ? 'no such command: audit' : 'audit stub diagnostic',
        );
        expect(r.stderr).toContain('advisory');
        expect(r.stderr).toContain(unavailable ? '101' : '17');
      } finally {
        rmSync(sandbox.root, { recursive: true, force: true });
      }
    });
  }

  for (const root of ROOTS) {
    it(`bin/check rejects missing SPDX under ${root}, including spaces`, async () => {
      const sandbox = sharedContext();
      const name = `${root}/nested/missing header.txt`;
      try {
        scanFiles(sandbox, { [name]: 'no header\n' });
        const r = await runScript('check', sandbox);
        expect(r.exitCode).toBe(1);
        expect(r.stderr).toContain(name);
        expect(calls(sandbox)).not.toContain('cargo audit');
      } finally {
        rmSync(sandbox.root, { recursive: true, force: true });
      }
    });
  }

  for (const line of [15, 16]) {
    it(`bin/check ${line === 15 ? 'accepts' : 'rejects'} SPDX on line ${line}`, async () => {
      const sandbox = sharedContext();
      try {
        scanFiles(sandbox, {
          'docs/header with spaces\nand newline.md': `${'line\n'.repeat(line - 1)}SPDX-License-Identifier: MIT\n`,
        });
        const r = await runScript('check', sandbox);
        expect(r.exitCode).toBe(line === 15 ? 0 : 1);
        expect(r.stdout.includes('SPDX headers OK')).toBe(line === 15);
      } finally {
        rmSync(sandbox.root, { recursive: true, force: true });
      }
    });
  }

  it('bin/check accepts markers without tightening CI policy, even with long lines', async () => {
    const sandbox = sharedContext();
    try {
      scanFiles(sandbox, {
        'docs/long.md': `SPDX-License-Identifier: Apache-2.0\n${'x'.repeat(100_000)}\n`,
      });
      const r = await runScript('check', sandbox);
      expect(r.exitCode).toBe(0);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it('bin/check applies all CI exemptions across all five roots', async () => {
    const sandbox = sharedContext();
    const exempt = [
      ...[
        'lock',
        'png',
        'jpg',
        'jpeg',
        'webp',
        'ico',
        'gif',
        'svg',
        'wasm',
        'bin',
        'json',
        'snap',
      ].map((ext) => `fixture.${ext}`),
      'bun.lock',
      'Cargo.lock',
      'package-lock.json',
      'node_modules/nested/file.ts',
      'target/nested/file.rs',
      '.git/nested/file',
      'snapshots/file.txt',
      '.placeholder',
      '.bun-version',
      '.keep',
      '.nvmrc',
    ];
    try {
      const files = Object.fromEntries(
        ROOTS.flatMap((root) => exempt.map((name) => [`${root}/${name}`, 'no header\n'])),
      );
      scanFiles(sandbox, files);
      const r = await runScript('check', sandbox);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('SPDX headers OK');
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  for (const partial of [false, true]) {
    it(`bin/check propagates enumeration failure (${partial ? 'partial output' : 'empty output'})`, async () => {
      const sandbox = sharedContext({ gitStatus: 42 });
      try {
        if (partial) scanFiles(sandbox, { 'docs/valid.md': 'SPDX-License-Identifier: MIT\n' });
        const r = await runScript('check', sandbox);
        expect(r.exitCode).toBe(42);
        expect(r.stderr).toContain('fixture enumeration failed');
        expect(r.stdout).not.toContain('SPDX headers OK');
        expect(calls(sandbox)).not.toContain('cargo audit');
      } finally {
        rmSync(sandbox.root, { recursive: true, force: true });
      }
    });
  }

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
