# Get Shit Done (Codex CLI Fork)

A spec-driven development system for [OpenAI Codex CLI](https://github.com/openai/codex). Fork of the original [get-shit-done](https://github.com/taches/get-shit-done) by TÂCHES.

[![npm version](https://img.shields.io/npm/v/get-shit-done-codex?style=flat-square)](https://www.npmjs.com/package/get-shit-done-codex)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

## What This Does

GSD is a context engineering layer for AI coding assistants. It structures your project through specs and plans so the AI has what it needs to build reliably.

**The problem:** AI assistants lose quality as conversations grow. Context gets polluted, requirements get forgotten, work becomes inconsistent.

**The solution:** Hierarchical planning with fresh context windows. Each task runs in isolation with exactly the context it needs—no degradation from accumulated garbage.

```
┌─────────────────────────────────────────────────────────────┐
│  PROJECT.md     →   What you're building                    │
│  ROADMAP.md     →   Phases from start to finish             │
│  PLAN.md        →   2-3 atomic tasks with verification      │
│  SUMMARY.md     →   What happened, committed to history     │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

You need [Codex CLI](https://github.com/openai/codex) installed and configured:

```bash
# Install Codex CLI
npm install -g @openai/codex

# Set your OpenAI API key
export OPENAI_API_KEY="your-key-here"
```

## Installation

```bash
npx get-shit-done-codex
```

You'll be prompted to install globally (`~/.codex/`) or locally (`./`).

For non-interactive installs:

```bash
npx get-shit-done-codex --global   # Install to ~/.codex/
npx get-shit-done-codex --local    # Install to current directory
```

## Quick Start

After installation, run `codex` to start Codex CLI, then:

```bash
# 1. Initialize project with deep questioning
/prompts:gsd-new-project

# 2. Create roadmap and phases
/prompts:gsd-create-roadmap

# 3. Plan the first phase
/prompts:gsd-plan-phase 1

# 4. Execute the plan
/prompts:gsd-execute-plan .planning/phases/01-foundation/01-01-PLAN.md
```

Verify installation with `/prompts:gsd-help` to see all commands.

## For Existing Codebases

Have existing code? Map it first:

```bash
/prompts:gsd-map-codebase
```

Creates `.planning/codebase/` with docs on your stack, architecture, conventions, etc. Then continue with `/prompts:gsd-new-project`—the system knows your patterns.

## Commands

Custom prompts are invoked with `/prompts:<name>`. After installation, these are available:

| Command                                   | Description                                   |
|-------------------------------------------|-----------------------------------------------|
| `/prompts:gsd-new-project`                | Define project through Q&A, create PROJECT.md |
| `/prompts:gsd-create-roadmap`             | Create roadmap and state tracking             |
| `/prompts:gsd-map-codebase`               | Analyze existing codebase (brownfield)        |
| `/prompts:gsd-plan-phase [N]`             | Generate task plans for phase                 |
| `/prompts:gsd-execute-plan [path]`        | Run plan via subagent                         |
| `/prompts:gsd-progress`                   | Show current status and route to next action  |
| `/prompts:gsd-verify-work [N]`            | User acceptance testing                       |
| `/prompts:gsd-plan-fix [plan]`            | Plan fixes for UAT issues                     |
| `/prompts:gsd-complete-milestone`         | Archive milestone, prep next                  |
| `/prompts:gsd-discuss-milestone`          | Gather context for next milestone             |
| `/prompts:gsd-new-milestone [name]`       | Create new milestone                          |
| `/prompts:gsd-add-phase`                  | Append phase to roadmap                       |
| `/prompts:gsd-insert-phase [N]`           | Insert phase at position                      |
| `/prompts:gsd-remove-phase [N]`           | Remove phase, renumber rest                   |
| `/prompts:gsd-discuss-phase [N]`          | Gather context before planning                |
| `/prompts:gsd-research-phase [N]`         | Deep research for niche domains               |
| `/prompts:gsd-list-phase-assumptions [N]` | See AI's assumptions                          |
| `/prompts:gsd-pause-work`                 | Create handoff for stopping mid-phase         |
| `/prompts:gsd-resume-work`                | Restore from last session                     |
| `/prompts:gsd-consider-issues`            | Review deferred issues                        |
| `/prompts:gsd-help`                       | Show all commands                             |

## How It Works

### Context Files

```
.planning/
├── PROJECT.md       # Project vision, always loaded
├── ROADMAP.md       # Phases and progress
├── STATE.md         # Decisions, blockers, memory across sessions
├── ISSUES.md        # Deferred enhancements
├── config.json      # Workflow mode & settings
├── codebase/        # (brownfield) Codebase analysis
│   ├── STACK.md
│   ├── ARCHITECTURE.md
│   ├── CONVENTIONS.md
│   └── ...
└── phases/
    └── 01-foundation/
        ├── 01-01-PLAN.md
        └── 01-01-SUMMARY.md
```

### Task Isolation

Each plan is max 3 tasks, each runs in fresh context. No degradation from accumulated garbage.

### Atomic Commits

Each task gets its own commit. Clean history, easy to bisect or revert.

```
feat(01-01): implement user authentication
feat(01-01): add password hashing
docs(01-01): complete auth-setup plan
```

### Workflow Modes

Set during `/prompts:gsd-new-project`:

- **Interactive** — Confirms at each step, more guidance
- **YOLO** — Auto-approves, executes without stopping

Change anytime by editing `.planning/config.json`.

## Common Workflows

**Resuming after a break:**

```bash
/prompts:gsd-progress  # Shows where you left off, routes to next action
```

**Adding urgent mid-milestone work:**

```bash
/prompts:gsd-insert-phase 5 "Critical security fix"
/prompts:gsd-plan-phase 5.1
/prompts:gsd-execute-plan .planning/phases/05.1-critical-security-fix/05.1-01-PLAN.md
```

**Completing a milestone:**

```bash
/prompts:gsd-verify-work       # Optional UAT
/prompts:gsd-complete-milestone 1.0.0
```

## Troubleshooting

### Commands not found?

1. Restart Codex CLI to reload prompts
2. Check the install location:
   - Global: `~/.codex/prompts/gsd-*.md` should exist
   - Local: `./prompts/gsd-*.md` should exist
3. Verify AGENTS.md exists at `~/.codex/AGENTS.md` (global) or `./AGENTS.md` (local)

### Update to latest

```bash
npx get-shit-done-codex@latest
```

### Using with Cursor IDE

GSD works with Cursor's built-in AI as well. When installing locally:

```bash
npx get-shit-done-codex --local
```

Cursor will pick up the AGENTS.md file in your project root and provide GSD context to the AI. Slash commands (`/prompts:*`) are specific to Codex CLI—in Cursor, reference the workflows directly or ask the AI to follow GSD methodology.

### Command format note

The source files use `/gsd:name` format (Claude Code style). The installer converts these to `/prompts:gsd-name` format for Codex CLI compatibility.

## How GSD Differs from Vibe Coding

| Vibe Coding               | GSD                                             |
|---------------------------|-------------------------------------------------|
| "Build me a todo app"     | Deep questioning → PROJECT.md with requirements |
| One long conversation     | Fresh context per task                          |
| Hope it remembers context | STATE.md tracks decisions                       |
| Unclear what's done       | ROADMAP.md with progress tracking               |
| Random commits            | Atomic commits per task                         |

## Credits

Original project by [TÂCHES](https://github.com/taches). This fork adapts it for Codex CLI.

## License

MIT
