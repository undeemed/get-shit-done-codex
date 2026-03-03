# Model Profiles

Model profiles control the reasoning effort level for each GSD agent. All agents use `gpt-5.3-codex` (Codex-optimized for agentic coding); what varies is the **thinking level** — how much reasoning budget each agent gets based on its role.

## Profile Definitions

| Agent                    | `quality` | `balanced` | `budget`  |
| ------------------------ | --------- | ---------- | --------- |
| gsd-planner              | 🔴 xhigh  | 🔴 xhigh   | 🟢 high   |
| gsd-roadmapper           | 🔴 xhigh  | 🟢 high    | 🟡 medium |
| gsd-executor             | 🔴 xhigh  | 🟢 high    | 🟡 medium |
| gsd-phase-researcher     | 🟢 high   | 🟡 medium  | 🟡 medium |
| gsd-project-researcher   | 🟢 high   | 🟡 medium  | 🟡 medium |
| gsd-research-synthesizer | 🟢 high   | 🟡 medium  | 🟡 medium |
| gsd-debugger             | 🔴 xhigh  | 🔴 xhigh   | 🟢 high   |
| gsd-codebase-mapper      | 🟡 medium | 🟡 medium  | 🟡 medium |
| gsd-verifier             | 🟢 high   | 🟢 high    | 🟡 medium |
| gsd-plan-checker         | 🟢 high   | 🟡 medium  | 🟡 medium |
| gsd-integration-checker  | 🟢 high   | 🟡 medium  | 🟡 medium |

All entries resolve to `model: "inherit"` (uses the session's gpt-5.3-codex). The `thinking` field controls reasoning effort.

## Profile Philosophy

**quality** - Maximum reasoning for every role

- 🔴 **xhigh** for decision-makers: planner, roadmapper, executor, debugger
- 🟢 **high** for analysis: researchers, verifiers, checkers
- 🟡 **medium** for read-only mapping
- Use when: critical architecture work, complex debugging

**balanced** (default) - Smart thinking allocation

- 🔴 **xhigh** only for planner and debugger (highest-impact decisions)
- 🟢 **high** for executor and verifier (needs reasoning but follows plans)
- 🟡 **medium** for everything else (structured output, scanning)
- Use when: normal development

**budget** - Minimal reasoning budget

- 🟢 **high** for planner and debugger (always need some reasoning)
- 🟡 **medium** for everything else
- Use when: high-volume work, less critical phases

## Role-Based Thinking Rationale

**Why xhigh thinking for gsd-planner?**
Planning involves architecture decisions, goal decomposition, and task design. These decisions cascade through the entire phase — worth the extra reasoning budget.

**Why xhigh thinking for gsd-debugger even in balanced?**
Root cause analysis requires deep reasoning. A debugger that misdiagnoses wastes more tokens in re-runs than the reasoning cost.

**Why medium thinking for gsd-codebase-mapper?**
Read-only file scanning and pattern extraction. No decisions to make — just structured output from file contents.

**Why high thinking for gsd-verifier in balanced?**
Verification requires goal-backward reasoning — checking if code _delivers_ what the phase promised. Medium thinking may miss subtle gaps.

**Why medium thinking for researchers in balanced?**
Research agents scan and collect information. The synthesis happens elsewhere. They don't need deep reasoning for reading files.

## Resolution Logic

Orchestrators resolve model and thinking before spawning:

```
1. Read .planning/config.json
2. Check model_overrides for agent-specific override
3. If no override, look up agent in profile table
4. Pass model + thinking to Task call
```

Returns: `{ model: "inherit", thinking: "xhigh"|"high"|"medium"|"low" }`

## Per-Agent Overrides

Override thinking level for specific agents:

```json
{
  "model_profile": "balanced",
  "model_overrides": {
    "gsd-executor": "xhigh",
    "gsd-codebase-mapper": "high"
  }
}
```

Valid override values: `"xhigh"`, `"high"`, `"medium"`, `"low"`.

## Switching Profiles

Runtime: `$gsd-set-profile <profile>`

Per-project default in `.planning/config.json`:

```json
{
  "model_profile": "balanced"
}
```
