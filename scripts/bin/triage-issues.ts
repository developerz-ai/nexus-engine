#!/usr/bin/env bun
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//
// scripts/bin/triage-issues.ts — fetch GitHub issues, cluster by label, emit
// JSON for the crash-triager subagent.
//
// Performance Contract:
//   cold_start  < 300 ms
//   wall_time   < 30 s   (gh issue list dominates)
//   mem_peak    < 64 MB

import { nxThrow } from '../lib/errors';
import { ghIssuesList } from '../lib/gh';
import { defineScript } from '../lib/skeleton';

export const meta = {
  name: 'triage-issues',
  version: '0.1.0',
  description: 'Fetch GitHub issues, cluster by label, emit JSON for the crash-triager subagent.',
  flags: {
    state: { type: 'enum:open|closed|all', default: 'open' },
    limit: { type: 'int', default: 100 },
    env: 'string',
  },
  exitCodes: [
    { code: 0, meaning: 'fetched and clustered' },
    { code: 4, meaning: 'gh/jq missing' },
    { code: 10, meaning: 'network / API error' },
  ],
} as const;

interface GhIssue {
  number: number;
  title: string;
  labels?: { name: string }[];
  updatedAt: string;
  createdAt: string;
  state: string;
  body?: string;
}

interface Cluster {
  label: string;
  count: number;
  issues: { number: number; title: string; updatedAt: string }[];
}

await defineScript(meta, async (args) => {
  const state = (args.state || 'open') as 'open' | 'closed' | 'all';
  const limit = typeof args.limit === 'number' ? args.limit : 100;

  if (args['dry-run']) {
    return {
      exitCode: 0,
      summary: { state, limit, plan: 'gh issue list' },
    };
  }

  const r = await ghIssuesList({ state, limit });
  if (r.exitCode !== 0) {
    nxThrow({
      tag: 'NetworkError',
      message: 'gh issue list failed',
      url: 'https://api.github.com',
    });
  }

  let issues: GhIssue[];
  try {
    issues = JSON.parse(r.stdout || '[]') as GhIssue[];
  } catch {
    issues = [];
  }

  const byLabel = new Map<string, GhIssue[]>();
  for (const iss of issues) {
    const labelName = iss.labels?.[0]?.name ?? 'untagged';
    const bucket = byLabel.get(labelName);
    if (bucket) bucket.push(iss);
    else byLabel.set(labelName, [iss]);
  }

  const clusters: Cluster[] = [];
  for (const [label, list] of byLabel) {
    clusters.push({
      label,
      count: list.length,
      issues: list.map((i) => ({ number: i.number, title: i.title, updatedAt: i.updatedAt })),
    });
  }

  const total = clusters.reduce((acc, c) => acc + c.count, 0);
  return {
    exitCode: 0,
    summary: { state, clusters, total },
  };
});
