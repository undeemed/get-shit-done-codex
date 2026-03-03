# Model Profiles

Model profiles control the reasoning effort level for each GSD agent. All agents use `gpt-5.3-codex` (Codex-optimized for agentic coding); what varies is the **thinking level** — how much reasoning budget each agent gets based on its role.

## Profile Definitions

| Agent                    | `quality` | `balanced` | `budget`  |
| ------------------------ | --------- | ---------- | --------- |
| gsd-planner              | 🟢 high   | 🟢 high    | 🟡 medium |
| gsd-roadmapper           | 🟢 high   | 🟡 medium  | 🔵 low    |
| gsd-executor             | 🟢 high   | 🟡 medium  | 🔵 low    |
| gsd-phase-researcher     | 🟡 medium | 🔵 low     | 🔵 low    |
| gsd-project-researcher   | 🟡 medium | 🔵 low     | 🔵 low    |
| gsd-research-synthesizer | 🟡 medium | 🔵 low     | 🔵 low    |
| gsd-debugger             | 🟢 high   | 🟢 high    | 🟡 medium |
| gsd-codebase-mapper      | 🔵 low    | 🔵 low     | 🔵 low    |
| gsd-verifier             | 🟡 medium | 🟡 medium  | 🔵 low    |
| gsd-plan-checker         | 🟡 medium | 🔵 low     | 🔵 low    |
| gsd-integration-checker  | 🟡 medium | 🔵 low     | 🔵 low    |

All entries resolve to `model: "inherit"` (uses the session's gpt-5.3-codex). The `thinking` field controls reasoning effort.

## Profile Philosophy

**quality** - Maximum reasoning for every role

- 🟢 **high** for decision-makers: planner, roadmapper, executor, debugger
- 🟡 **medium** for analysis: researchers, verifiers, checkers
- 🔵 **low** for read-only mapping
- Use when: critical architecture work, complex debugging

**balanced** (default) - Smart thinking allocation

- 🟢 **high** only for planner and debugger (highest-impact decisions)
- 🟡 **medium** for executor and verifier (needs reasoning but follows plans)
- 🔵 **low** for everything else (structured output, scanning)
- Use when: normal development

**budget** - Minimal reasoning budget

- 🟡 **medium** for planner and debugger (always need some reasoning)
- 🔵 **low** for everything else
- Use when: high-volume work, less critical phases

## Role-Based Thinking Rationale

**Why high thinking for gsd-planner?**
Planning involves architecture decisions, goal decomposition, and task design. These decisions cascade through the entire phase — worth the extra reasoning budget.

**Why high thinking for gsd-debugger even in balanced?**
Root cause analysis requires deep reasoning. A debugger that misdiagnoses wastes more tokens in re-runs than the reasoning cost.

**Why low thinking for gsd-codebase-mapper?**
Read-only file scanning and pattern extraction. No decisions to make — just structured output from file contents.

**Why medium thinking for gsd-verifier in balanced?**
Verification requires goal-backward reasoning — checking if code _delivers_ what the phase promised. Low thinking may miss subtle gaps.

**Why low thinking for researchers in balanced?**
Research agents scan and collect information. The synthesis happens elsewhere. They don't need deep reasoning for reading files.

## Resolution Logic

Orchestrators resolve model and thinking before spawning:

```
1. Read .planning/config.json
2. Check model_overrides for agent-specific override
3. If no override, look up agent in profile table
4. Pass model + thinking to Task call
```

Returns: `{ model: "inherit", thinking: "high"|"medium"|"low" }`

## Per-Agent Overrides

Override thinking level for specific agents:

```json
{
  "model_profile": "balanced",
  "model_overrides": {
    "gsd-executor": "high",
    "gsd-codebase-mapper": "medium"
  }
}
```

Valid override values: `"high"`, `"medium"`, `"low"`.

## Switching Profiles

Runtime: `$gsd-set-profile <profile>`

Per-project default in `.planning/config.json`:

```json
{
  "model_profile": "balanced"
}
```
