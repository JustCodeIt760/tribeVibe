export type SessionStatus = 'active' | 'completed' | 'abandoned';

export interface SessionNote {
  id: string;
  author: string;
  project: string;
  started_at: string;
  ended_at: string | null;
  description: string;
  status: SessionStatus;
  body: string;
  filename: string;
}

export function sessionTemplate(
  id: string,
  author: string,
  project: string,
  description: string,
  startedAt: string
): string {
  return `---
id: ${id}
author: ${author}
project: ${project}
started_at: ${startedAt}
ended_at: null
description: ${description}
status: active
---

## What I'm Working On

${description}

## Key Decisions

<!-- Document decisions made during this session -->

## Context for Teammates

<!-- What do teammates need to know to pick up where you left off? -->

## Next Steps

<!-- What remains to be done? -->
`;
}
