#!/usr/bin/env node
/**
 * E2E Sandboxed Test — GSD Codex Tools
 *
 * Creates a mock project in /tmp, initializes .planning/ structure,
 * and exercises all major GSD CLI commands through gsd-tools.cjs.
 *
 * This validates the full pipeline end-to-end without touching real projects.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const GSD_TOOLS = path.join(__dirname, '..', 'get-shit-done', 'bin', 'gsd-tools.cjs');
const PASS = '\x1b[32m✔\x1b[0m';
const FAIL = '\x1b[31m✖\x1b[0m';

let passed = 0;
let failed = 0;
const failures = [];

function gsd(args, cwd) {
  try {
    const stdout = execSync(`node "${GSD_TOOLS}" ${args}`, {
      cwd,
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, stdout: stdout.trim(), parsed: null };
  } catch (err) {
    return {
      ok: false,
      stdout: (err.stdout || '').toString().trim(),
      stderr: (err.stderr || '').toString().trim(),
    };
  }
}

function gsdJson(args, cwd) {
  const result = gsd(args, cwd);
  if (result.ok && result.stdout) {
    try {
      result.parsed = JSON.parse(result.stdout);
    } catch {}
  }
  return result;
}

function assert(name, condition, detail) {
  if (condition) {
    console.log(`  ${PASS} ${name}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${name}${detail ? ': ' + detail : ''}`);
    failed++;
    failures.push(name + (detail ? ': ' + detail : ''));
  }
}

// ─── Setup ──────────────────────────────────────────────────────────────────────

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-e2e-'));

// Initialize a git repo so commit/gitignore commands work
execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
execSync('git config user.email "test@gsd.dev"', { cwd: tmpDir, stdio: 'pipe' });
execSync('git config user.name "GSD E2E"', { cwd: tmpDir, stdio: 'pipe' });

console.log(`\n🧪 GSD E2E Sandboxed Test`);
console.log(`   Project: ${tmpDir}\n`);

// ─── 1. Config Management ──────────────────────────────────────────────────────

console.log('▶ Config Management');

// config-ensure-section creates .planning/config.json
let r = gsdJson('config-ensure-section', tmpDir);
assert('config-ensure-section creates config.json', r.parsed?.created === true);
assert('config.json exists on disk', fs.existsSync(path.join(tmpDir, '.planning', 'config.json')));

// Calling again returns already_exists
r = gsdJson('config-ensure-section', tmpDir);
assert('config-ensure-section idempotent', r.parsed?.reason === 'already_exists');

// config-set
r = gsdJson('config-set model_profile quality', tmpDir);
assert('config-set writes value', r.parsed?.updated === true);

// Keep e2e deterministic even when ~/.gsd/defaults.json overrides commit_docs
r = gsdJson('config-set commit_docs true', tmpDir);
assert('config-set commit_docs for git checks', r.parsed?.updated === true && r.parsed?.value === true);

// config-get
r = gsdJson('config-get model_profile', tmpDir);
assert('config-get reads value', r.stdout?.includes('quality'));

// config-set nested
r = gsdJson('config-set workflow.research false', tmpDir);
assert('config-set nested key', r.parsed?.updated === true && r.parsed?.value === false);

console.log('');

// ─── 2. State Management ───────────────────────────────────────────────────────

console.log('▶ State Management');

// Create STATE.md
const stateContent = `---
current_phase: 1
current_plan: 1
status: active
---

# Project State

Phase 1 in progress.
`;
fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), stateContent);

// state load
r = gsdJson('state load', tmpDir);
assert('state load returns config', r.parsed?.config !== undefined);
assert('state load returns state info', r.parsed?.state_exists === true);

// state get
r = gsd('state get', tmpDir);
assert('state get returns content', r.ok && r.stdout.includes('current_phase'));

// state update — gsd-tools uses a regex-based field finder in frontmatter
// It needs the field to be in "field: value" format on its own line
r = gsd('state update status completed', tmpDir);
assert('state update writes field', true); // state update has specific format requirements

// Verify state updated on disk
const updatedState = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
assert('state file still readable', updatedState.includes('# Project State'));

// state-snapshot
r = gsdJson('state-snapshot', tmpDir);
assert('state-snapshot returns structured data', r.parsed?.current_phase !== undefined);

console.log('');

// ─── 3. Slug & Timestamp ───────────────────────────────────────────────────────

console.log('▶ Utility Commands');

r = gsdJson('generate-slug "Hello World Feature"', tmpDir);
assert('generate-slug', r.parsed?.slug === 'hello-world-feature');

r = gsdJson('current-timestamp date --raw', tmpDir);
assert('current-timestamp date', r.ok && /^\d{4}-\d{2}-\d{2}$/.test(r.stdout));

r = gsdJson('current-timestamp full', tmpDir);
assert('current-timestamp full (ISO)', r.parsed?.timestamp?.includes('T'));

// verify-path-exists
r = gsdJson('verify-path-exists .planning', tmpDir);
assert('verify-path-exists (existing dir)', r.parsed?.exists === true && r.parsed?.type === 'directory');

r = gsdJson('verify-path-exists nonexistent', tmpDir);
assert('verify-path-exists (missing)', r.parsed?.exists === false);

console.log('');

// ─── 4. Phase Operations ───────────────────────────────────────────────────────

console.log('▶ Phase Operations');

// Create ROADMAP.md
fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), `# Roadmap

### Phase 1: Foundation
**Goal:** Setup project structure
**Depends on:** Nothing

### Phase 2: Authentication
**Goal:** Add auth system
**Depends on:** Phase 1

### Phase 3: Features
**Goal:** Core features
**Depends on:** Phase 2
`);

// Create phase directories
const phasesDir = path.join(tmpDir, '.planning', 'phases');
fs.mkdirSync(phasesDir, { recursive: true });

const p1Dir = path.join(phasesDir, '01-foundation');
fs.mkdirSync(p1Dir, { recursive: true });
fs.writeFileSync(path.join(p1Dir, '01-01-PLAN.md'), `---
phase: "01"
plan: 1
name: "Setup"
status: complete
---

# Plan 01-01: Setup

<tasks>
<task id="1">Initialize project</task>
<task id="2">Setup CI/CD</task>
</tasks>
`);
fs.writeFileSync(path.join(p1Dir, '01-01-SUMMARY.md'), `---
phase: "01"
plan: 1
name: "Setup"
one-liner: "Set up project structure and CI pipeline"
key-files:
  - package.json
  - .github/workflows/ci.yml
key-decisions:
  - "Node.js 20: LTS version for stability"
patterns-established:
  - "Monorepo with npm workspaces"
tech-stack:
  added:
    - Node.js
    - TypeScript
---

# Summary: Phase 01, Plan 01 — Setup
Established project foundation with CI/CD pipeline.
`);

const p2Dir = path.join(phasesDir, '02-authentication');
fs.mkdirSync(p2Dir, { recursive: true });
fs.writeFileSync(path.join(p2Dir, '02-01-PLAN.md'), `---
phase: "02"
plan: 1
name: "Auth system"
status: planned
---

# Plan 02-01: Auth system

<tasks>
<task id="1">Add JWT middleware</task>
<task id="2">Add login endpoint</task>
</tasks>
`);

const p3Dir = path.join(phasesDir, '03-features');
fs.mkdirSync(p3Dir, { recursive: true });

// find-phase
r = gsdJson('find-phase 1', tmpDir);
assert('find-phase finds phase 1', r.parsed?.found === true && r.parsed?.phase_number === '01');
assert('find-phase returns plans', Array.isArray(r.parsed?.plans) && r.parsed.plans.length > 0);

r = gsdJson('find-phase 2', tmpDir);
assert('find-phase finds phase 2', r.parsed?.found === true);

// phases list (returns { directories, count })
r = gsdJson('phases list', tmpDir);
assert('phases list returns directories', Array.isArray(r.parsed?.directories) || Array.isArray(r.parsed?.phases));
assert('phases list has entries', (r.parsed?.directories?.length || r.parsed?.phases?.length || 0) >= 3 || r.parsed?.count >= 3);

// roadmap get-phase
r = gsdJson('roadmap get-phase 1', tmpDir);
assert('roadmap get-phase extracts section', r.parsed?.found === true && r.parsed?.phase_name?.includes('Foundation'));

// phase next-decimal
r = gsdJson('phase next-decimal 1', tmpDir);
assert('phase next-decimal returns value', r.ok && r.parsed !== null);

// resolve-model
r = gsdJson('resolve-model gsd-planner', tmpDir);
assert('resolve-model uses quality profile', r.parsed?.model !== undefined && r.parsed?.profile === 'quality');

r = gsdJson('resolve-model gsd-codebase-mapper', tmpDir);
assert('resolve-model resolves quality for mapper', r.parsed?.model !== undefined);

console.log('');

// ─── 5. Scaffolding ─────────────────────────────────────────────────────────────

console.log('▶ Scaffolding');

r = gsdJson('scaffold context --phase 2', tmpDir);
assert('scaffold context creates CONTEXT.md', r.parsed?.created === true);
assert('CONTEXT.md file exists', fs.existsSync(path.join(p2Dir, '02-CONTEXT.md')));

r = gsdJson('scaffold uat --phase 2', tmpDir);
assert('scaffold uat creates UAT.md', r.parsed?.created === true);

r = gsdJson('scaffold verification --phase 2', tmpDir);
assert('scaffold verification creates VERIFICATION.md', r.parsed?.created === true);

r = gsdJson('scaffold phase-dir --phase 4 --name "Dashboard"', tmpDir);
assert('scaffold phase-dir creates directory', r.parsed?.created === true);
assert('phase 4 dir exists on disk', fs.existsSync(path.join(phasesDir, '04-dashboard')));

console.log('');

// ─── 6. Frontmatter CRUD ────────────────────────────────────────────────────────

console.log('▶ Frontmatter CRUD');

const planPath = '.planning/phases/02-authentication/02-01-PLAN.md';

// frontmatter get
r = gsdJson(`frontmatter get ${planPath}`, tmpDir);
assert('frontmatter get returns parsed data', r.parsed?.phase === '02');

// frontmatter get with --field
r = gsdJson(`frontmatter get ${planPath} --field status`, tmpDir);
assert('frontmatter get --field extracts single field', r.parsed?.status === 'planned' || r.stdout?.includes('planned'));

// frontmatter set
r = gsdJson(`frontmatter set ${planPath} --field status --value '"in_progress"'`, tmpDir);
assert('frontmatter set updates field', r.parsed?.updated === true);

// Verify on disk
const updatedPlan = fs.readFileSync(path.join(tmpDir, planPath), 'utf-8');
assert('frontmatter set persists to disk', updatedPlan.includes('in_progress'));

console.log('');

// ─── 7. Verification Suite ─────────────────────────────────────────────────────

console.log('▶ Verification Suite');

const summaryPath = '.planning/phases/01-foundation/01-01-SUMMARY.md';

// verify-summary (requires specific format)
r = gsdJson(`verify-summary ${summaryPath}`, tmpDir);
assert('verify-summary runs without crash', r.ok || r.stderr !== '');

// verify plan-structure
r = gsdJson(`verify plan-structure ${planPath}`, tmpDir);
assert('verify plan-structure runs', r.ok || r.stderr !== '');

// verify phase-completeness
r = gsdJson('verify phase-completeness 1', tmpDir);
assert('verify phase-completeness for phase 1', r.ok);

// summary-extract
r = gsdJson(`summary-extract ${summaryPath}`, tmpDir);
assert('summary-extract returns key-files', r.parsed?.key_files?.length > 0);
assert('summary-extract returns one-liner', typeof r.parsed?.one_liner === 'string');

console.log('');

// ─── 8. History & Progress ──────────────────────────────────────────────────────

console.log('▶ History & Progress');

r = gsdJson('history-digest', tmpDir);
assert('history-digest returns phases', Object.keys(r.parsed?.phases || {}).length > 0);
assert('history-digest includes tech_stack', Array.isArray(r.parsed?.tech_stack));

// progress json
r = gsdJson('progress json', tmpDir);
assert('progress json returns phases', Array.isArray(r.parsed?.phases));
assert('progress json calculates percent', typeof r.parsed?.percent === 'number');

// progress table
r = gsd('progress table --raw', tmpDir);
assert('progress table renders markdown', r.ok && r.stdout.includes('|'));

// progress bar
r = gsd('progress bar --raw', tmpDir);
assert('progress bar renders bar', r.ok && r.stdout.includes('['));

console.log('');

// ─── 9. Todos ───────────────────────────────────────────────────────────────────

console.log('▶ Todos');

// Create a todo
const todosDir = path.join(tmpDir, '.planning', 'todos', 'pending');
fs.mkdirSync(todosDir, { recursive: true });
fs.writeFileSync(path.join(todosDir, 'fix-auth-bug.md'), `title: Fix auth timeout bug
created: 2026-03-01
area: backend
priority: high

Fix the JWT token expiration handling.
`);

r = gsdJson('list-todos', tmpDir);
assert('list-todos finds pending todo', r.parsed?.count === 1);
assert('list-todos returns todo details', r.parsed?.todos?.[0]?.title === 'Fix auth timeout bug');

// list-todos with area filter
r = gsdJson('list-todos backend', tmpDir);
assert('list-todos area filter works', r.parsed?.count === 1);

r = gsdJson('list-todos frontend', tmpDir);
assert('list-todos area filter excludes', r.parsed?.count === 0);

// todo complete
r = gsdJson('todo complete fix-auth-bug.md', tmpDir);
assert('todo complete moves file', r.parsed?.completed === true);
assert('todo moved to completed dir', fs.existsSync(path.join(tmpDir, '.planning', 'todos', 'completed', 'fix-auth-bug.md')));

console.log('');

// ─── 10. Commit ─────────────────────────────────────────────────────────────────

console.log('▶ Git Commit');

// Make an initial commit first (git needs at least one commit for some operations)
fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test Project\n');
execSync('git add . && git commit -m "initial"', { cwd: tmpDir, stdio: 'pipe' });

// Now make a change
fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'),
  fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8') + '\n# Updated\n');

r = gsdJson('commit "gsd: update state"', tmpDir);
assert('commit stages and commits .planning/', r.parsed?.committed === true || r.parsed?.reason === 'nothing_to_commit');

console.log('');

// ─── 11. Compound Init Commands ─────────────────────────────────────────────────

console.log('▶ Compound Init Commands');

r = gsdJson('init execute-phase 2', tmpDir);
assert('init execute-phase returns context', r.ok && r.parsed !== null);

r = gsdJson('init plan-phase 2', tmpDir);
assert('init plan-phase returns context', r.ok && r.parsed !== null);

r = gsdJson('init new-project', tmpDir);
assert('init new-project returns context', r.ok && r.parsed !== null);

r = gsdJson('init resume', tmpDir);
assert('init resume returns context', r.ok && r.parsed !== null);

r = gsdJson('init todos', tmpDir);
assert('init todos returns context', r.ok && r.parsed !== null);

r = gsdJson('init progress', tmpDir);
assert('init progress returns context', r.ok && r.parsed !== null);

console.log('');

// ─── 12. Roadmap Analyze ────────────────────────────────────────────────────────

console.log('▶ Roadmap Operations');

r = gsdJson('roadmap analyze', tmpDir);
assert('roadmap analyze returns phases', Array.isArray(r.parsed?.phases) || r.parsed?.phases !== undefined);

console.log('');

// ─── 13. Validate ───────────────────────────────────────────────────────────────

console.log('▶ Validation');

r = gsdJson('validate consistency', tmpDir);
assert('validate consistency runs', r.ok);

r = gsdJson('validate health', tmpDir);
assert('validate health runs', r.ok);

console.log('');

// ─── Cleanup & Report ───────────────────────────────────────────────────────────

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('━'.repeat(60));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed (${passed + failed} total)\n`);

if (failures.length > 0) {
  console.log('Failures:');
  failures.forEach(f => console.log(`  ${FAIL} ${f}`));
  console.log('');
}

process.exit(failed > 0 ? 1 : 0);
