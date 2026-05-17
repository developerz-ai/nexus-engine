// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/lib/gh.ts — thin `gh` CLI wrapper. Throws MissingPrerequisite if
// the `gh` binary is not on PATH.

import { type RunResult, hasTool, run } from './bun';
import { nxThrow } from './errors';

async function requireGh(): Promise<void> {
  if (!(await hasTool('gh'))) {
    nxThrow({
      tag: 'MissingPrerequisite',
      tool: 'gh',
      suggestedFix: 'scripts/bootstrap',
    });
  }
}

export async function ghApi(
  method: string,
  path: string,
  extra: string[] = [],
): Promise<RunResult> {
  await requireGh();
  return run(['gh', 'api', '-X', method, path, ...extra]);
}

export async function ghGraphql(query: string, fields: string[] = []): Promise<RunResult> {
  await requireGh();
  return run(['gh', 'api', 'graphql', '-f', `query=${query}`, ...fields]);
}

export interface GhReleaseCreateOpts {
  prerelease?: boolean;
}

export async function ghReleaseCreate(
  tag: string,
  title: string,
  notesFile: string,
  opts: GhReleaseCreateOpts = {},
): Promise<RunResult> {
  await requireGh();
  const args = ['release', 'create', tag, '--title', title, '--notes-file', notesFile];
  if (opts.prerelease) args.push('--prerelease');
  return run(['gh', ...args]);
}

export async function ghReleaseUpload(tag: string, files: readonly string[]): Promise<RunResult> {
  await requireGh();
  return run(['gh', 'release', 'upload', tag, ...files, '--clobber']);
}

export interface GhIssueListOpts {
  label?: string;
  state?: 'open' | 'closed' | 'all';
  limit?: number;
}

export async function ghIssuesList(opts: GhIssueListOpts = {}): Promise<RunResult> {
  await requireGh();
  const args = ['issue', 'list', '--json', 'number,title,labels,createdAt,updatedAt,state,body'];
  if (opts.label) args.push('--label', opts.label);
  if (opts.state) args.push('--state', opts.state);
  if (opts.limit) args.push('--limit', String(opts.limit));
  return run(['gh', ...args]);
}
