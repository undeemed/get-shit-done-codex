# Model Profile Resolution

Resolve model profile once at the start of orchestration, then use it for all Task spawns.

## Resolution Pattern

```bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
```

Default: `balanced` if not set or config missing.

## Lookup Table

@~/.codex/get-shit-done/references/model-profiles.md

Look up the agent in the table for the resolved profile. Each entry returns:

```json
{ "model": "inherit", "thinking": "high" }
```

All agents use `gpt-5.3-codex` (via `"inherit"`). The `thinking` field controls reasoning effort.

Pass both parameters to Task calls:

```
Task(
  prompt="...",
  subagent_type="gsd-planner",
  model="inherit",
  thinking="{resolved_thinking}"  # "high", "medium", or "low"
)
```

## Usage

1. Resolve once at orchestration start
2. Store the profile value
3. Look up each agent's `{ model, thinking }` from the table
4. Pass both model and thinking parameters to each Task call
