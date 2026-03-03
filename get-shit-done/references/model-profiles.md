# Model Profiles

Model profiles control which Codex model each GSD agent uses. This allows balancing quality vs token spend.

## Profile Definitions

| Agent                    | `quality` | `balanced`   | `budget`     |
| ------------------------ | --------- | ------------ | ------------ |
| gsd-planner              | o3        | o3           | o4-mini      |
| gsd-roadmapper           | o3        | o4-mini      | o4-mini      |
| gsd-executor             | o3        | o4-mini      | o4-mini      |
| gsd-phase-researcher     | o3        | o4-mini      | gpt-4.1-nano |
| gsd-project-researcher   | o3        | o4-mini      | gpt-4.1-nano |
| gsd-research-synthesizer | o4-mini   | o4-mini      | gpt-4.1-nano |
| gsd-debugger             | o3        | o4-mini      | o4-mini      |
| gsd-codebase-mapper      | o4-mini   | gpt-4.1-nano | gpt-4.1-nano |
| gsd-verifier             | o4-mini   | o4-mini      | gpt-4.1-nano |
| gsd-plan-checker         | o4-mini   | o4-mini      | gpt-4.1-nano |
| gsd-integration-checker  | o4-mini   | o4-mini      | gpt-4.1-nano |

## Profile Philosophy

**quality** - Maximum reasoning power

- o3 for all decision-making agents
- o4-mini for read-only verification
- Use when: quota available, critical architecture work

**balanced** (default) - Smart allocation

- o3 only for planning (where architecture decisions happen)
- o4-mini for execution and research (follows explicit instructions)
- o4-mini for verification (needs reasoning, not just pattern matching)
- Use when: normal development, good balance of quality and cost

**budget** - Minimal o3 usage

- o4-mini for anything that writes code
- gpt-4.1-nano for research and verification
- Use when: conserving quota, high-volume work, less critical phases

## Resolution Logic

Orchestrators resolve model before spawning:

```
1. Read .planning/config.json
2. Check model_overrides for agent-specific override
3. If no override, look up agent in profile table
4. Pass model parameter to Task call
```

## Per-Agent Overrides

Override specific agents without changing the entire profile:

```json
{
  "model_profile": "balanced",
  "model_overrides": {
    "gsd-executor": "o3",
    "gsd-planner": "gpt-4.1-nano"
  }
}
```

Overrides take precedence over the profile. Valid values: `o3`, `o4-mini`, `gpt-4.1-nano`.

## Switching Profiles

Runtime: `$gsd-set-profile <profile>`

Per-project default: Set in `.planning/config.json`:

```json
{
  "model_profile": "balanced"
}
```

## Design Rationale

**Why o3 for gsd-planner?**
Planning involves architecture decisions, goal decomposition, and task design. This is where model quality has the highest impact.

**Why o4-mini for gsd-executor?**
Executors follow explicit PLAN.md instructions. The plan already contains the reasoning; execution is implementation.

**Why o4-mini (not gpt-4.1-nano) for verifiers in balanced?**
Verification requires goal-backward reasoning - checking if code _delivers_ what the phase promised, not just pattern matching. o4-mini handles this well; gpt-4.1-nano may miss subtle gaps.

**Why gpt-4.1-nano for gsd-codebase-mapper?**
Read-only exploration and pattern extraction. No reasoning required, just structured output from file contents.

**Why `inherit` instead of passing `o3` directly?**
Codex CLI's `"o3"` alias maps to a specific model version. Organizations may block older versions while allowing newer ones. GSD returns `"inherit"` for o3-tier agents, causing them to use whatever model the user has configured in their session. This avoids version conflicts and silent fallbacks.
