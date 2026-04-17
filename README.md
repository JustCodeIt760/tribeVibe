# tribeVibe

> Collaborative vibe coding for the age of AI.

tribeVibe has two complementary modes:

1. **Live collab mode** (`tribevibe host` / `tribevibe join`) — real-time terminal app where a host and up to 4 peers build software together. Each person works with their own Claude Code agent on an assigned role. A PM agent on the host's machine coordinates alignment across the group. All traffic E2E encrypted through a public tunnel. No accounts, no cloud, no signups.

2. **Async memory-sync mode** (`tribevibe push` / `pull`) — use a shared git repo as a team backbone for Claude Code's memory files. Your agent learns something today → teammate's agent knows it tomorrow.

The two modes integrate: a live session's handoffs become async memories at session end, so the team's accumulated knowledge compounds across sessions.

---

## Quickstart (live collab, 2 min)

```bash
git clone https://github.com/JustCodeIt760/tribeVibe.git
cd tribeVibe && npm install && npm run build && npm link
```

Then **either** just run `tribevibe` (interactive launcher pops up with Host / Join / Resume options) **or** go direct:

```bash
# Host (you)
tribevibe host --name alice

# Peer (teammate) — paste the invite code you send them
tribevibe join 'VIBE-CORAL-7X.eyJ...' --name bob
```

No API key needed — the agents use your existing Claude Code login. No signup needed — localtunnel handles the public URL. One-machine testing? Add `--local` to skip the tunnel entirely.

### Slash commands in chat

| Command | Who | What |
|---|---|---|
| `/yes` `/no` `/abstain` | peers | vote on an active proposal |
| `/pm <question>` | anyone | manually ask the PM to respond |
| `/scaffold` | host | manually trigger scaffold generation (bypasses PM) |
| `/start` | host | transition from planning → work phase |
| `/ask <role> <request>` | peers (in work) | send a cross-role request |
| `/quit` | anyone | leave the session |

---

## The problem (async memory-sync mode)

Claude Code builds up valuable project knowledge over time — architectural decisions, gotchas, team conventions, bug fixes, rationale behind weird code. But all of that memory is **trapped on the laptop of whoever was driving the session**.

When a teammate opens the same project on their machine, their Claude starts from zero. They don't know about the Postgres migration that failed last week. They don't know that the auth middleware has a race condition under concurrent writes. They don't know you already tried fixing X three different ways.

So they re-learn it. Or worse, re-break it.

**tribeVibe fixes that** by treating Claude's memory files as a shared team resource — synced through a git repo the same way you'd sync code.

---

## How it works

```
     YOUR LAPTOP                              TEAMMATE'S LAPTOP
┌──────────────────────┐                    ┌──────────────────────┐
│ ~/Desktop/myproject  │                    │ ~/code/myproject     │
│   (code, git repo)   │                    │   (code, git repo)   │
└──────────┬───────────┘                    └──────────┬───────────┘
           │                                           │
           │ Claude Code writes memory here            │
           ▼                                           ▼
┌──────────────────────┐                    ┌──────────────────────┐
│ ~/.claude/projects/  │                    │ ~/.claude/projects/  │
│  -Users-...-myproj/  │                    │  -Users-...-myproj/  │
│  memory/*.md         │                    │  memory/*.md         │
└──────────┬───────────┘                    └──────▲───────────────┘
           │                                       │
           │ tribevibe push                        │ tribevibe pull
           ▼                                       │
          ┌─────────────────────────────────────────┐
          │   github.com/team/shared-memory.git    │
          │   (plain git repo used as a file sync  │
          │    backbone — no server required)      │
          └─────────────────────────────────────────┘
```

1. Claude Code stores project memory in `~/.claude/projects/<hashed-path>/memory/` — outside your project folder.
2. `tribevibe push` copies your shareable memory files into a **shared git repo** under your personal namespace (`members/<you>/memory/`).
3. Your teammate runs `tribevibe pull`, which fetches the repo and writes your files into their Claude memory directory.
4. Next time their Claude Code reads memory, it sees what yours learned.

### Privacy by type

Claude Code tags each memory file with a `type` in its frontmatter. tribeVibe **only syncs files tagged `project` or `reference`**. Personal memories — `user` (your role, preferences) and `feedback` (corrections you've given Claude) — **never leave your machine**.

| Type | Synced? | Example |
|---|---|---|
| `project` | ✅ | "Auth middleware uses the repository pattern" |
| `reference` | ✅ | "Bugs are tracked in Linear project INGEST" |
| `user` | ❌ | "I'm a senior Go developer, new to React" |
| `feedback` | ❌ | "Don't add comments for obvious code" |

### No merge conflicts by design

Each teammate writes only to their own namespace (`members/<username@host>/`). That means two people pushing at the same time never conflict — they're writing to different directories. Git handles the merge automatically.

---

## Installation

### Prerequisites

- **Node.js** 20+ and **npm**
- **git** installed and configured
- **Claude Code** already installed and used on your project at least once (so Claude has started building up memory files)

### Install from source

```bash
git clone https://github.com/JustCodeIt760/tribeVibe.git
cd tribeVibe
npm install
npm run build
npm link   # makes `tribevibe` available globally
```

Verify:

```bash
tribevibe --version
```

---

## Setup

tribeVibe needs **two** git repos:

1. **Your project repo** — whatever codebase you're actually working on. Nothing changes here.
2. **A shared memory repo** — a separate empty git repo that acts as a file sync backbone. Both teammates point tribeVibe at this one.

### Step 1 — Create the shared memory repo

Anywhere that speaks git works: GitHub, GitLab, self-hosted, even a bare repo on a shared drive.

```bash
# On GitHub (via gh CLI)
gh repo create myteam/tribevibe-shared --private --description "Shared Claude memory for my team"
```

It starts empty. tribeVibe populates it on first push.

### Step 2 — Initialize your project

From inside the project folder you want to share context for:

```bash
cd ~/path/to/your/project
tribevibe init git@github.com:myteam/tribevibe-shared.git
```

This:
- Creates a `.tribevibe.json` config file in your project root (commit this — teammates will reuse it).
- Clones the shared memory repo to `~/.tribevibe/repos/<project-slug>/`.
- Pushes any existing shareable memory files under your personal namespace.

### Step 3 — Teammate setup

Your teammate clones the **project repo** (not the memory repo) and runs:

```bash
cd ~/path/to/your/project
tribevibe init   # no URL needed — it reads from .tribevibe.json
tribevibe pull
```

They now have your memory files in their local Claude memory dir. Next time they run Claude Code on this project, it'll see what your Claude learned.

---

## Usage

### Daily workflow

```bash
# Announce you're starting a work session (optional but helpful)
tribevibe session start "fixing the auth race condition"

# ...do your work with Claude Code as normal...

# Push what Claude learned back to the shared repo
tribevibe push

# Pull anything teammates have contributed since
tribevibe pull

# Wrap up your session — opens an editor to write handoff notes
tribevibe session end
```

### Commands

| Command | Description |
|---|---|
| `tribevibe init [git-url]` | Link this project to a shared memory repo. On first run, pass the repo URL. After `.tribevibe.json` exists, no URL needed. |
| `tribevibe push` | Push local Claude memory files to the shared repo. |
| `tribevibe pull` | Pull teammates' memory files into your local Claude memory dir. |
| `tribevibe sync` | Push then pull in one command. |
| `tribevibe status` | Show local changes waiting to push, teammate updates waiting to pull, and active teammate sessions. |
| `tribevibe session start <description>` | Announce you're starting a session on something. Creates a session note and pushes it so teammates can see what you're working on. |
| `tribevibe session end` | Close your active session. Opens an editor so you can write handoff notes for teammates. |

### Checking team activity

```bash
tribevibe status
```

Shows:
- Memory files you've changed locally that haven't been pushed yet
- Teammate files in the shared repo that haven't been pulled yet
- Any teammate sessions currently active (so you don't step on toes)

---

## Repository layout

### Source code (`src/`)

```
src/
├── cli.ts              # Entry point. Wires up commander to the command functions.
├── commands/           # One file per CLI command. Orchestration + user-facing output.
│   ├── init.ts
│   ├── push.ts
│   ├── pull.ts
│   ├── sync.ts
│   ├── status.ts
│   └── session.ts
├── core/               # Reusable business logic. No CLI concerns here.
│   ├── identity.ts         # who am I? (username@hostname)
│   ├── config.ts           # read/write .tribevibe.json and state file
│   ├── claude-memory.ts    # find + parse Claude Code memory files
│   └── shared-repo.ts      # git operations on the shared repo clone
└── models/             # TypeScript interfaces. Data shapes, no logic.
    ├── tribevibe-config.ts
    ├── memory-file.ts
    └── session-note.ts
```

**Dependency rule:** `cli.ts → commands/* → core/* → models/*`. Arrows point one way — lower layers never import from higher ones.

### Shared memory repo layout

When you init a project, the shared repo ends up structured like this:

```
tribevibe-shared/
└── projects/
    └── <project-slug>/
        ├── members/
        │   ├── alice@macbook/         # each teammate owns their own namespace
        │   │   ├── memory/
        │   │   │   ├── MEMORY.md      # copy of Claude's index
        │   │   │   └── <uuid>.md      # individual memory files
        │   │   └── sessions/
        │   │       └── 2026-04-11-auth-fix.md
        │   └── bob@workstation/
        │       └── ...
        └── shared/
            └── context.md             # living team context doc (append-only)
```

### Local config files

| File | Location | Committed? |
|---|---|---|
| `.tribevibe.json` | your project root | ✅ yes — teammates reuse the repo URL |
| `.tribevibe-state.json` | your project root | ❌ gitignored — tracks content hashes for change detection |
| Shared repo clone | `~/.tribevibe/repos/<slug>/` | n/a — local cache |

---

## Limitations (and what's not built yet)

tribeVibe is early. Here's what it **doesn't** do today:

- **No raw session sync.** We sync memory files, not the actual Claude Code conversations. Memory files capture maybe 30–50% of what happens in a session — rich context like dead-ends tried and specific error traces lives in the raw session and doesn't make it across.
- **No `CLAUDE.md` propagation.** If you add a team rule to your project's `CLAUDE.md`, teammates don't automatically get it. Planned.
- **No session summarization.** Ending a session still requires you to type handoff notes manually. Auto-summarization via the Claude API is planned as an opt-in feature.
- **No watch mode.** You have to manually run `push`/`pull`/`sync`. A `--watch` mode that auto-syncs on memory file changes is planned.
- **No merge-conflict UI for `shared/context.md`.** Individual memory files can't conflict (namespaced by member), but the shared context file can. Right now we just leave git conflict markers and tell you to fix it.
- **No web UI / dashboard.** Everything is CLI + filesystem.

---

## Roadmap

### Phase 2 (near-term)

- `CLAUDE.md` propagation — detect changes to the project's `CLAUDE.md` at session end, sync through the shared repo, let teammates opt in to adopting.
- Watch mode (`tribevibe sync --watch`) — auto-sync on memory file changes using `chokidar`.
- `tribevibe log` — browsable history of team contributions (who pushed what, when).
- AI-assisted merge for `shared/context.md` conflicts via the Anthropic API.

### Phase 3 (exploratory)

- **Session summarization** — read raw `.jsonl` session files, filter noise, summarize with Claude, store as structured session notes. Toggleable based on usage/budget.
- **Auto-tuned summarization** — scale summarization aggressiveness based on how much quota you have left in the current billing window.
- **Decision records** — lightweight ADRs (`tribevibe decision add`) stored in the shared repo.

---

## FAQ

**Q: Does tribeVibe send my data to any third party?**
A: No. Everything flows through a git repo you control. tribeVibe never talks to any server we run.

**Q: What if I have memory files I don't want shared, even though they're type `project`?**
A: Not supported yet. For now, either change the type to `user` or move the file out of the memory dir. Planned: explicit `tv_visibility: private` frontmatter flag.

**Q: What happens if two teammates push at the same time?**
A: Memory files can't conflict — each teammate writes only to their own `members/<handle>/` namespace. The only file that can conflict is `shared/context.md`, and that's rare.

**Q: Can I use this without GitHub?**
A: Yes. Any git remote works — GitLab, self-hosted Gitea, or even a bare repo on a shared network drive. tribeVibe just runs `git clone`, `git pull`, and `git push` under the hood.

**Q: Does my teammate need to install Claude Code?**
A: Yes. tribeVibe syncs Claude Code memory files — if they're not using Claude Code, there's nothing to sync into.

**Q: How is this different from committing memory files into the project repo directly?**
A: Three things:
1. Memory files live *outside* the project folder (in `~/.claude/projects/`), so they can't be committed to the project repo without manual copying.
2. tribeVibe filters out personal memories (`user`/`feedback` types) automatically — no risk of leaking your personal preferences into the project repo.
3. Memory files are versioned by teammate (`members/alice/` vs `members/bob/`), not by file path, which avoids the merge-conflict hell of everyone editing the same files.

---

## Contributing

This is an early-stage project. The architecture is simple on purpose — four core modules and six commands. If you want to add a feature:

1. New CLI commands go in `src/commands/`.
2. Shared logic goes in `src/core/`.
3. Data types go in `src/models/`.
4. Nothing in `core/` imports from `commands/`. Keep the layering clean.

---

## License

MIT
