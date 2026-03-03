#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { execSync } = require('child_process');

const cyan = '\x1b[36m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

const pkg = require('../package.json');
const NPM_PACKAGE = pkg.name;
const NPM_PACKAGE_LATEST = `${NPM_PACKAGE}@latest`;
const UPSTREAM_PACKAGE = 'get-shit-done-cc';
const UPSTREAM_REPO = 'https://github.com/glittercowboy/get-shit-done';
const FORK_REPO = 'https://github.com/undeemed/get-shit-done-codex';

// ─── Codex Config Constants ───────────────────────────────────────────────────
const GSD_CODEX_MARKER = '# GSD Agent Configuration \u2014 managed by get-shit-done installer';

const CODEX_AGENT_SANDBOX = {
  'gsd-executor': 'workspace-write',
  'gsd-planner': 'workspace-write',
  'gsd-phase-researcher': 'workspace-write',
  'gsd-project-researcher': 'workspace-write',
  'gsd-research-synthesizer': 'workspace-write',
  'gsd-verifier': 'workspace-write',
  'gsd-codebase-mapper': 'workspace-write',
  'gsd-roadmapper': 'workspace-write',
  'gsd-debugger': 'workspace-write',
  'gsd-plan-checker': 'read-only',
  'gsd-integration-checker': 'read-only',
};

const banner = `
${green}   ██████╗ ███████╗██████╗
   ██╔════╝ ██╔════╝██╔══██╗
   ██║  ███╗███████╗██║  ██║
   ██║   ██║╚════██║██║  ██║
   ╚██████╔╝███████║██████╔╝
    ╚═════╝ ╚══════╝╚═════╝${reset}

   Get Shit Done ${dim}v${pkg.version}${reset}
   A meta-prompting, context engineering, and spec-driven
   development system for OpenAI Codex (CLI + Desktop).
`;

const args = process.argv.slice(2);
const hasGlobal = args.includes('--global') || args.includes('-g');
const hasLocal = args.includes('--local') || args.includes('-l');
const hasHelp = args.includes('--help') || args.includes('-h');
const hasVerify = args.includes('--verify');
const hasRepair = args.includes('--repair');
const hasNoVersionCheck = args.includes('--no-version-check') || process.env.GSD_SKIP_VERSION_CHECK === '1';
const hasMigrate = args.includes('--migrate');
const hasSkipMigrate = args.includes('--skip-migrate') || args.includes('--no-migrate');
const pathIdx = args.indexOf('--path');
const customPath = pathIdx !== -1 && args[pathIdx + 1] ? args[pathIdx + 1] : null;
const isInteractiveTerminal = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const codexMode = 'skills';

console.log(banner);

if (hasHelp) {
  console.log(`  ${yellow}Usage:${reset} npx ${NPM_PACKAGE} [options]

  ${yellow}Options:${reset}
    ${cyan}-g, --global${reset}              Install globally (to ~/.codex/)
    ${cyan}-l, --local${reset}               Install locally (to current directory)
    ${cyan}--path <dir>${reset}              Install into a specific directory
    ${cyan}--migrate${reset}                 Apply detected legacy surface cleanup without prompting
    ${cyan}--skip-migrate${reset}            Keep legacy surface files when migration is detected
    ${cyan}--verify${reset}                  Verify current install integrity
    ${cyan}--repair${reset}                  Repair failed verification checks
    ${cyan}--no-version-check${reset}        Skip npm version lookup
    ${cyan}-h, --help${reset}                Show this help message

  ${yellow}Examples:${reset}
    ${dim}# Install globally${reset}
    npx ${NPM_PACKAGE} --global

    ${dim}# Install to current project only${reset}
    npx ${NPM_PACKAGE} --local

    ${dim}# Install to a specific directory${reset}
    npx ${NPM_PACKAGE} --path /path/to/project

    ${dim}# Verify global installation${reset}
    npx ${NPM_PACKAGE} --verify --global

    ${dim}# Verify and auto-repair local installation${reset}
    npx ${NPM_PACKAGE} --verify --repair --local

    ${dim}# Force migration cleanup in non-interactive runs${reset}
    npx ${NPM_PACKAGE} --global --migrate

  ${yellow}Notes:${reset}
    - Installs AGENTS.md, skills/gsd-*/SKILL.md, agents/gsd-*.md, .codex/config.toml
    - All commands use $gsd-* skill notation
    - Legacy prompts/ installs are detected and cleaned up via --migrate
    - --verify + --repair will reinstall missing artifacts
    - Installs get-shit-done/ workflow files
`);
  process.exit(0);
}

function applyPathPrefixReplacements(content, pathPrefix) {
  if (pathPrefix === '~/.codex/') {
    return content
      .replace(/\.\/\.codex\//g, '~/.codex/')
      .replace(/~\/\.codex\//g, '~/.codex/');
  }

  return content
    .replace(/\.\/\.codex\//g, pathPrefix)
    .replace(/~\/\.codex\//g, pathPrefix);
}

function applyReplacements(content, pathPrefix) {
  content = applyPathPrefixReplacements(content, pathPrefix);

  content = content.replace(/Codex CLI/g, 'Codex CLI');
  content = content.replace(/Codex/g, 'Codex');

  content = content.replace(/\/gsd:([a-z0-9-]*)/gi, (_, cmd) => `$gsd-${cmd.toLowerCase()}`);

  // Keep update workflows pointed to this fork's npm package/repo.
  content = content.replace(new RegExp(UPSTREAM_PACKAGE, 'g'), NPM_PACKAGE);
  content = content.replace(new RegExp(UPSTREAM_REPO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), FORK_REPO);
  content = content.replace(/npmjs\.com\/package\/get-shit-done-cc/g, `npmjs.com/package/${encodeURIComponent(NPM_PACKAGE)}`);

  return content;
}

function convertPromptRefsToSkillRefs(content) {
  let converted = content.replace(/\/prompts:gsd-([a-z0-9-]+)/gi, (_, commandName) => `$gsd-${String(commandName).toLowerCase()}`);
  converted = converted.replace(/\/gsd:([a-z0-9-]+)/gi, (_, commandName) => `$gsd-${String(commandName).toLowerCase()}`);
  converted = converted.replace(/\/gsd-help\b/gi, '$gsd-help');
  return converted;
}



function convertCommandRefsToSkillMentions(content) {
  return convertPromptRefsToSkillRefs(content).replace(/\$ARGUMENTS\b/g, '{{GSD_ARGS}}');
}

function rewriteAgentInvocationLine(content, replacement) {
  return content
    .replace('Invoke them with `/gsd:command-name`:', replacement)
    .replace('Invoke them with `/prompts:gsd-command-name`:', replacement)
    .replace('Invoke them with `$gsd-command-name`:', replacement);
}

function adaptAgentsForCodexMode(content) {
  let adapted = convertPromptRefsToSkillRefs(content);
  adapted = rewriteAgentInvocationLine(adapted, 'Invoke them with `$gsd-command-name`:');
  return adapted;
}

function extractFrontmatterAndBody(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { frontmatter: null, body: content };
  }
  return { frontmatter: match[1], body: content.slice(match[0].length) };
}

function extractFrontmatterField(frontmatter, fieldName) {
  if (!frontmatter) return null;
  const match = frontmatter.match(new RegExp(`^${fieldName}:\\s*(.+)$`, 'mi'));
  if (!match) return null;
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

function yamlQuote(value) {
  return JSON.stringify(String(value));
}

function toSingleLine(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function getCodexSkillAdapterHeader(skillName) {
  const invocation = `$${skillName}`;
  return `<codex_skill_adapter>
## A. Skill Invocation
- This skill is invoked by mentioning \`${invocation}\`.
- Treat all user text after \`${invocation}\` as \`{{GSD_ARGS}}\`.
- If no arguments are present, treat \`{{GSD_ARGS}}\` as empty.

## B. AskUserQuestion → request_user_input Mapping
GSD workflows use \`AskUserQuestion\` (GSD workflow syntax). Translate to Codex \`request_user_input\`:

Parameter mapping:
- \`header\` → \`header\`
- \`question\` → \`question\`
- Options formatted as \`"Label" — description\` → \`{label: "Label", description: "description"}\`
- Generate \`id\` from header: lowercase, replace spaces with underscores

Batched calls:
- \`AskUserQuestion([q1, q2])\` → single \`request_user_input\` with multiple entries in \`questions[]\`

Multi-select workaround:
- Codex has no \`multiSelect\`. Use sequential single-selects, or present a numbered freeform list asking the user to enter comma-separated numbers.

Execute mode fallback:
- When \`request_user_input\` is rejected (Execute mode), present a plain-text numbered list and pick a reasonable default.

## C. Task() → spawn_agent Mapping
GSD workflows use \`Task(...)\` (GSD workflow syntax). Translate to Codex collaboration tools:

Direct mapping:
- \`Task(subagent_type="X", prompt="Y")\` → \`spawn_agent(agent_type="X", message="Y")\`
- \`Task(model="...")\` → omit (Codex uses per-role config, not inline model selection)
- \`fork_context: false\` by default — GSD agents load their own context via \`<files_to_read>\` blocks

Parallel fan-out:
- Spawn multiple agents → collect agent IDs → \`wait(ids)\` for all to complete

Result parsing:
- Look for structured markers in agent output: \`CHECKPOINT\`, \`PLAN COMPLETE\`, \`SUMMARY\`, etc.
- \`close_agent(id)\` after collecting results from each agent
</codex_skill_adapter>`;
}

function convertCommandToCodexSkill(commandContent, skillName, pathPrefix) {
  const replaced = applyReplacements(commandContent, pathPrefix);
  const converted = convertCommandRefsToSkillMentions(replaced);
  const { frontmatter, body } = extractFrontmatterAndBody(converted);
  const description = toSingleLine(
    extractFrontmatterField(frontmatter, 'description') || `Run GSD workflow ${skillName}.`
  );
  const shortDescription = description.length > 180 ? `${description.slice(0, 177)}...` : description;

  return `---
name: ${yamlQuote(skillName)}
description: ${yamlQuote(description)}
metadata:
  short-description: ${yamlQuote(shortDescription)}
---

${getCodexSkillAdapterHeader(skillName)}

${body.trimStart()}`;
}



function installCodexSkills(commandsDir, skillsDir, markdownEntries, pathPrefix) {
  fs.mkdirSync(skillsDir, { recursive: true });

  const existingSkills = fs.readdirSync(skillsDir, { withFileTypes: true });
  for (const entry of existingSkills) {
    if (entry.isDirectory() && entry.name.startsWith('gsd-')) {
      fs.rmSync(path.join(skillsDir, entry.name), { recursive: true, force: true });
    }
  }

  for (const entry of markdownEntries) {
    const commandPath = path.join(commandsDir, entry);
    const commandContent = fs.readFileSync(commandPath, 'utf8');
    const commandName = entry.replace(/\.md$/i, '');
    const skillName = `gsd-${commandName}`;
    const skillDir = path.join(skillsDir, skillName);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      convertCommandToCodexSkill(commandContent, skillName, pathPrefix),
      'utf8'
    );
  }
}

function removePromptAliases(promptsDir) {
  if (!fs.existsSync(promptsDir)) return 0;
  const entries = fs.readdirSync(promptsDir);
  let removed = 0;
  for (const entry of entries) {
    if (/^gsd-.*\.md$/i.test(entry)) {
      fs.rmSync(path.join(promptsDir, entry), { force: true });
      removed++;
    }
  }
  return removed;
}

function removeSkillAliases(skillsDir) {
  if (!fs.existsSync(skillsDir)) return 0;
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  let removed = 0;
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith('gsd-')) {
      fs.rmSync(path.join(skillsDir, entry.name), { recursive: true, force: true });
      removed++;
    }
  }
  return removed;
}

function installConfig(src, codexDir, pathPrefix) {
  const configSrc = path.join(src, '.codex', 'config.toml');
  if (!fs.existsSync(configSrc)) return false;
  const codexConfigDir = path.join(codexDir, '.codex');
  const configDest = path.join(codexConfigDir, 'config.toml');
  if (fs.existsSync(configDest)) return false;
  fs.mkdirSync(codexConfigDir, { recursive: true });
  let content = applyPathPrefixReplacements(fs.readFileSync(configSrc, 'utf8'), pathPrefix);
  if (pathPrefix === '~/.codex/') {
    content = content.replace(/agents\/gsd-/g, '~/.codex/agents/gsd-');
  }
  fs.writeFileSync(configDest, content, 'utf8');
  return true;
}

function installAgentDefs(src, codexDir, pathPrefix) {
  const agentsSrc = path.join(src, 'agents');
  if (!fs.existsSync(agentsSrc)) return 0;
  const agentsDest = path.join(codexDir, 'agents');
  fs.mkdirSync(agentsDest, { recursive: true });
  const entries = fs.readdirSync(agentsSrc).filter((e) => /^gsd-.*\.md$/i.test(e));
  for (const entry of entries) {
    let content = fs.readFileSync(path.join(agentsSrc, entry), 'utf8');
    content = applyReplacements(content, pathPrefix);
    content = convertPromptRefsToSkillRefs(content);
    fs.writeFileSync(path.join(agentsDest, entry), content, 'utf8');
  }
  return entries.length;
}

function countSourceAgentDefs(src) {
  const agentsSrc = path.join(src, 'agents');
  if (!fs.existsSync(agentsSrc)) return 0;
  return fs.readdirSync(agentsSrc).filter((e) => /^gsd-.*\.md$/i.test(e)).length;
}

function countInstalledAgentDefs(codexDir) {
  const agentsDest = path.join(codexDir, 'agents');
  if (!fs.existsSync(agentsDest)) return 0;
  return fs.readdirSync(agentsDest).filter((e) => /^gsd-.*\.md$/i.test(e)).length;
}

function detectMigrationPlan(codexDir) {
  const promptsDir = path.join(codexDir, 'prompts');
  const promptFiles = listPromptCommandFiles(promptsDir);

  return {
    promptsDir,
    promptCountToRemove: promptFiles.length,
    hasChanges: promptFiles.length > 0,
  };
}

function describeMigrationPlan(plan) {
  return `${plan.promptCountToRemove} legacy prompt alias file(s) in prompts/`;
}

function applyMigrationPlan(plan) {
  if (plan.promptCountToRemove > 0) {
    const removed = removePromptAliases(plan.promptsDir);
    if (removed > 0) {
      console.log(`  ${green}✓${reset} Migration applied: removed ${removed} legacy prompt alias file(s)`);
    }
  }
}

function copyWithPathReplacement(srcDir, destDir, pathPrefix) {
  fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyWithPathReplacement(srcPath, destPath, pathPrefix);
      continue;
    }

    if (entry.name.endsWith('.md')) {
      const content = fs.readFileSync(srcPath, 'utf8');
      fs.writeFileSync(destPath, applyReplacements(content, pathPrefix), 'utf8');
      continue;
    }

    fs.copyFileSync(srcPath, destPath);
  }
}

function writeVersionFile(destDir, isGlobal) {
  const versionFile = path.join(destDir, 'VERSION');
  const installType = isGlobal ? 'GLOBAL' : 'LOCAL';
  fs.writeFileSync(versionFile, `${pkg.version}\n${installType}\n`, 'utf8');
}

function showCachedVersionWarning() {
  try {
    const latest = execSync(`npm view ${NPM_PACKAGE} version`, {
      encoding: 'utf8',
      timeout: 4000,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (latest && latest !== pkg.version) {
      console.log(`  ${yellow}Update available:${reset} v${pkg.version} -> v${latest}`);
      console.log(`  Run ${cyan}npx ${NPM_PACKAGE_LATEST}${reset} to install the latest release.\n`);
    }
  } catch (_) {
    // Offline or npm unavailable - skip.
  }
}

function getInstallContext(isGlobal, targetPath) {
  let codexDir;
  let locationLabel;
  let pathPrefix;
  if (targetPath) {
    codexDir = path.resolve(targetPath);
    locationLabel = targetPath;
    pathPrefix = codexDir.endsWith(path.sep) ? codexDir : `${codexDir}${path.sep}`;
  } else if (isGlobal) {
    codexDir = path.join(os.homedir(), '.codex');
    locationLabel = '~/.codex';
    pathPrefix = '~/.codex/';
  } else {
    codexDir = process.cwd();
    locationLabel = '.';
    pathPrefix = './';
  }
  return { codexDir, locationLabel, pathPrefix };
}

function listPromptCommandFiles(promptsDir) {
  if (!fs.existsSync(promptsDir)) return [];
  return fs.readdirSync(promptsDir)
    .filter((name) => /^gsd-.*\.md$/i.test(name))
    .sort();
}

function listSkillNames(skillsDir) {
  if (!fs.existsSync(skillsDir)) return [];
  return fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('gsd-'))
    .filter((entry) => fs.existsSync(path.join(skillsDir, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
}

function detectInstalledMode(promptCount, skillCount) {
  if (promptCount > 0) return 'legacy-prompts';
  if (skillCount > 0) return 'skills';
  return 'none';
}

function verifyInstall(isGlobal, targetPath) {
  const src = path.join(__dirname, '..');
  const { codexDir, locationLabel } = getInstallContext(isGlobal, targetPath);
  const promptsDir = path.join(codexDir, 'prompts');
  const skillsDir = path.join(codexDir, 'skills');
  const workflowRoot = path.join(codexDir, 'get-shit-done');
  const versionFile = path.join(workflowRoot, 'VERSION');
  const expectedCount = fs.readdirSync(path.join(src, 'commands', 'gsd'))
    .filter((entry) => entry.endsWith('.md'))
    .length;

  const promptFiles = listPromptCommandFiles(promptsDir);
  const skillNames = listSkillNames(skillsDir);
  const detectedMode = detectInstalledMode(promptFiles.length, skillNames.length);

  const checks = [];
  const addCheck = (ok, label, detail) => checks.push({ ok, label, detail });

  const expectedAgentCount = countSourceAgentDefs(src);

  addCheck(fs.existsSync(codexDir), 'Config directory exists', codexDir);
  addCheck(fs.existsSync(path.join(codexDir, 'AGENTS.md')), 'AGENTS.md installed', path.join(codexDir, 'AGENTS.md'));
  addCheck(fs.existsSync(path.join(codexDir, '.codex', 'config.toml')), 'config.toml installed', path.join(codexDir, '.codex', 'config.toml'));
  if (expectedAgentCount > 0) {
    const installedAgents = countInstalledAgentDefs(codexDir);
    addCheck(installedAgents === expectedAgentCount, 'Agent definitions complete', `${installedAgents}/${expectedAgentCount}`);
  }
  addCheck(fs.existsSync(workflowRoot), 'get-shit-done assets installed', workflowRoot);
  addCheck(fs.existsSync(path.join(workflowRoot, 'workflows')), 'Workflow directory installed', path.join(workflowRoot, 'workflows'));
  addCheck(fs.existsSync(path.join(workflowRoot, 'templates')), 'Template directory installed', path.join(workflowRoot, 'templates'));
  addCheck(fs.existsSync(versionFile), 'VERSION file installed', versionFile);

  if (fs.existsSync(versionFile)) {
    const version = fs.readFileSync(versionFile, 'utf8').split(/\r?\n/)[0].trim();
    addCheck(version === pkg.version, 'VERSION matches installer package', `${version || '(empty)'} vs ${pkg.version}`);
  }

  addCheck(skillNames.length === expectedCount, 'Native skills complete', `${skillNames.length}/${expectedCount}`);
  if (promptFiles.length > 0) {
    addCheck(false, 'Legacy prompts/ detected', 'Run with --migrate to clean up');
  }

  console.log(`  Verifying ${cyan}${locationLabel}${reset} (detected mode: ${cyan}${detectedMode}${reset})`);
  for (const check of checks) {
    const icon = check.ok ? `${green}✓${reset}` : `${yellow}✗${reset}`;
    const detail = check.detail ? ` ${dim}(${check.detail})${reset}` : '';
    console.log(`  ${icon} ${check.label}${detail}`);
  }

  const ok = checks.every((check) => check.ok);
  if (ok) {
    console.log(`\n  ${green}Integrity check passed.${reset}`);
  } else {
    console.log(`\n  ${yellow}Integrity check failed.${reset}`);
  }

  return { ok, detectedMode };
}

function installCore(isGlobal, migrationPlan, applyMigration, done = () => {}, targetPath) {
  const src = path.join(__dirname, '..');
  const { codexDir, locationLabel, pathPrefix } = getInstallContext(isGlobal, targetPath);

  console.log(`  Installing to ${cyan}${locationLabel}${reset}\n`);
  fs.mkdirSync(codexDir, { recursive: true });
  if (applyMigration && migrationPlan && migrationPlan.hasChanges) {
    applyMigrationPlan(migrationPlan);
  }

  const agentsSrc = path.join(src, 'get-shit-done', 'AGENTS.md');
  const agentsDest = path.join(codexDir, 'AGENTS.md');
  const agentsExisted = fs.existsSync(agentsDest);

  const writeAgents = () => {
    let agentsContent = applyReplacements(fs.readFileSync(agentsSrc, 'utf8'), pathPrefix);
    agentsContent = adaptAgentsForCodexMode(agentsContent);
    fs.writeFileSync(agentsDest, agentsContent, 'utf8');
  };

  const continueAfterAgents = () => {
    const configInstalled = installConfig(src, codexDir, pathPrefix);
    if (configInstalled) {
      console.log(`  ${green}✓${reset} Installed .codex/config.toml`);
    } else {
      console.log(`  ${dim}-${reset} Skipped .codex/config.toml (already exists or source missing)`);
    }

    const agentCount = installAgentDefs(src, codexDir, pathPrefix);
    if (agentCount > 0) {
      console.log(`  ${green}✓${reset} Installed agents/gsd-*.md (${agentCount} agent definitions)`);
    }

    const gsdSrc = path.join(src, 'commands', 'gsd');
    const entries = fs.readdirSync(gsdSrc);
    const markdownEntries = entries.filter((entry) => entry.endsWith('.md'));

    const skillsDir = path.join(codexDir, 'skills');
    installCodexSkills(gsdSrc, skillsDir, markdownEntries, pathPrefix);
    console.log(`  ${green}✓${reset} Installed skills/gsd-*/SKILL.md (${markdownEntries.length} skills)`);

    const skillSrc = path.join(src, 'get-shit-done');
    const skillDest = path.join(codexDir, 'get-shit-done');
    copyWithPathReplacement(skillSrc, skillDest, pathPrefix);
    writeVersionFile(skillDest, isGlobal);
    console.log(`  ${green}✓${reset} Installed get-shit-done/ workflow files`);
    console.log(`  ${green}✓${reset} Wrote get-shit-done/VERSION (${pkg.version})`);

    const displayRoot = locationLabel.endsWith('/') ? locationLabel.slice(0, -1) : locationLabel;
    console.log(`
  ${green}Done!${reset}

  ${yellow}For Codex (CLI + Desktop):${reset}
  - AGENTS.md: ${cyan}${displayRoot}/AGENTS.md${reset}
  - Native skills: ${cyan}${displayRoot}/skills/gsd-*/SKILL.md${reset}
  - Config: ${cyan}${displayRoot}/.codex/config.toml${reset}
  - Agent defs: ${cyan}${displayRoot}/agents/gsd-*.md${reset}

  ${yellow}Getting Started:${reset}
  1. Run ${cyan}codex${reset} (CLI) or ${cyan}codex app${reset} (Desktop)
  2. Use ${cyan}$gsd-help${reset} to list commands
  3. Start with ${cyan}$gsd-new-project${reset}

  ${yellow}Staying Updated:${reset}
  - In Codex: ${cyan}$gsd-update${reset}
  - In terminal: ${cyan}npx ${NPM_PACKAGE_LATEST}${reset}

  ${dim}Note: Codex will prompt you to trust this project on first run
  so that the config, agents, and MCP servers take effect.${reset}
`);
    done();
  };

  if (isGlobal && agentsExisted && isInteractiveTerminal) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(`  ${yellow}⚠${reset} AGENTS.md already exists at ${dim}${agentsDest}${reset}. Overwrite? ${dim}[Y/n]${reset}: `, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      if (normalized === '' || normalized === 'y' || normalized === 'yes') {
        writeAgents();
        console.log(`  ${green}✓${reset} Overwrote AGENTS.md`);
      } else {
        console.log(`  ${yellow}⚠${reset} Kept existing AGENTS.md`);
      }
      continueAfterAgents();
    });
  } else {
    writeAgents();
    if (agentsExisted) {
      console.log(`  ${yellow}⚠${reset} Overwrote existing AGENTS.md ${dim}(non-interactive)${reset}`);
    } else {
      console.log(`  ${green}✓${reset} Installed AGENTS.md`);
    }
    continueAfterAgents();
  }
}

function install(isGlobal, done = () => {}, targetPath) {
  const { codexDir } = getInstallContext(isGlobal, targetPath);
  const migrationPlan = detectMigrationPlan(codexDir);

  if (!migrationPlan.hasChanges) {
    installCore(isGlobal, migrationPlan, false, done, targetPath);
    return;
  }

  const summary = describeMigrationPlan(migrationPlan);
  console.log(`  ${yellow}Migration detected:${reset} ${summary}`);

  if (hasMigrate) {
    console.log(`  ${green}✓${reset} Migration approved by --migrate`);
    installCore(isGlobal, migrationPlan, true, done, targetPath);
    return;
  }

  if (hasSkipMigrate) {
    console.log(`  ${yellow}Skipping migration due to --skip-migrate.${reset}`);
    installCore(isGlobal, migrationPlan, false, done, targetPath);
    return;
  }

  if (!isInteractiveTerminal) {
    console.log(`  ${yellow}Skipping migration in non-interactive mode.${reset}`);
    console.log(`  ${dim}Re-run with --migrate to apply cleanup or --skip-migrate to keep legacy files explicitly.${reset}`);
    installCore(isGlobal, migrationPlan, false, done);
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question(`  Remove legacy files now? ${dim}[Y/n]${reset}: `, (answer) => {
    rl.close();
    const normalized = answer.trim().toLowerCase();
    const applyMigration = normalized === '' || normalized === 'y' || normalized === 'yes';
    if (!applyMigration) {
      console.log(`  ${yellow}Keeping legacy files.${reset}`);
    }
    installCore(isGlobal, migrationPlan, applyMigration, done, targetPath);
  });
}



function promptLocation(done) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`  ${yellow}Where would you like to install?${reset}

  ${cyan}1${reset}) Global ${dim}(~/.codex)${reset} - available in all projects
  ${cyan}2${reset}) Local  ${dim}(.)${reset} - this project only
`);

  rl.question(`  Choice ${dim}[1]${reset}: `, (answer) => {
    rl.close();
    const choice = answer.trim() || '1';
    done(choice !== '2');
  });
}

const locationFlagCount = [hasGlobal, hasLocal, !!customPath].filter(Boolean).length;
if (locationFlagCount > 1) {
  console.error(`  ${yellow}Cannot specify more than one of --global, --local, and --path${reset}`);
  process.exit(1);
}

// ─── Upstream Codex Config Functions ──────────────────────────────────────────
// These are ported from upstream's install.js for multi-agent config.toml
// generation, merge, strip, and per-agent .toml config files.

/**
 * Convert an agent markdown file to Codex agent format.
 * Applies base markdown conversions, then adds a <codex_agent_role> header
 * and cleans up frontmatter (removes tools/color fields).
 */
function convertAgentToCodexFormat(content) {
  let converted = convertPromptRefsToSkillRefs(content);
  converted = convertCommandRefsToSkillMentions(converted);
  converted = converted.replace(/\$ARGUMENTS\b/g, '{{GSD_ARGS}}');

  const { frontmatter, body } = extractFrontmatterAndBody(converted);
  if (!frontmatter) return converted;

  const name = extractFrontmatterField(frontmatter, 'name') || 'unknown';
  const description = extractFrontmatterField(frontmatter, 'description') || '';
  const tools = extractFrontmatterField(frontmatter, 'tools') || '';

  const roleHeader = `<codex_agent_role>
role: ${name}
tools: ${tools}
purpose: ${toSingleLine(description)}
</codex_agent_role>`;

  const cleanFrontmatter = `---\nname: ${yamlQuote(name)}\ndescription: ${yamlQuote(toSingleLine(description))}\n---`;

  return `${cleanFrontmatter}\n\n${roleHeader}\n${body}`;
}

function convertCommandToCodexSkill(content, skillName) {
  let converted = convertPromptRefsToSkillRefs(content);
  converted = convertCommandRefsToSkillMentions(converted);
  converted = converted.replace(/\$ARGUMENTS\b/g, '{{GSD_ARGS}}');
  const { frontmatter, body } = extractFrontmatterAndBody(converted);
  let description = `Run GSD workflow ${skillName}.`;
  if (frontmatter) {
    const maybeDescription = extractFrontmatterField(frontmatter, 'description');
    if (maybeDescription) {
      description = maybeDescription;
    }
  }
  description = toSingleLine(description);
  const shortDescription = description.length > 180 ? `${description.slice(0, 177)}...` : description;
  const adapter = getCodexSkillAdapterHeader(skillName);

  return `---\nname: ${yamlQuote(skillName)}\ndescription: ${yamlQuote(description)}\nmetadata:\n  short-description: ${yamlQuote(shortDescription)}\n---\n\n${adapter}\n\n${body.trimStart()}`;
}

/**
 * Generate a per-agent .toml config file for Codex.
 * Sets sandbox_mode and developer_instructions from the agent markdown body.
 */
function generateCodexAgentToml(agentName, agentContent) {
  const sandboxMode = CODEX_AGENT_SANDBOX[agentName] || 'read-only';
  const { body } = extractFrontmatterAndBody(agentContent);
  const instructions = body.trim();

  const lines = [
    `sandbox_mode = "${sandboxMode}"`,
    `developer_instructions = """`,
    instructions,
    `"""`,
  ];
  return lines.join('\n') + '\n';
}

/**
 * Generate the GSD config block for Codex config.toml.
 * @param {Array<{name: string, description: string}>} agents
 */
function generateCodexConfigBlock(agents) {
  const lines = [
    GSD_CODEX_MARKER,
    '[features]',
    'multi_agent = true',
    'default_mode_request_user_input = true',
    '',
    '[agents]',
    'max_threads = 4',
    'max_depth = 2',
    '',
  ];

  for (const { name, description } of agents) {
    lines.push(`[agents.${name}]`);
    lines.push(`description = ${JSON.stringify(description)}`);
    lines.push(`config_file = "agents/${name}.toml"`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Strip GSD sections from Codex config.toml content.
 * Returns cleaned content, or null if file would be empty.
 */
function stripGsdFromCodexConfig(content) {
  const markerIndex = content.indexOf(GSD_CODEX_MARKER);

  if (markerIndex !== -1) {
    let before = content.substring(0, markerIndex).trimEnd();
    before = before.replace(/^multi_agent\s*=\s*true\s*\n?/m, '');
    before = before.replace(/^default_mode_request_user_input\s*=\s*true\s*\n?/m, '');
    before = before.replace(/^\[features\]\s*\n(?=\[|$)/m, '');
    before = before.replace(/\n{3,}/g, '\n\n').trim();
    if (!before) return null;
    return before + '\n';
  }

  let cleaned = content;
  cleaned = cleaned.replace(/^multi_agent\s*=\s*true\s*\n?/m, '');
  cleaned = cleaned.replace(/^default_mode_request_user_input\s*=\s*true\s*\n?/m, '');
  cleaned = cleaned.replace(/^\[agents\.gsd-[^\]]+\]\n(?:(?!\[)[^\n]*\n?)*/gm, '');
  cleaned = cleaned.replace(/^\[features\]\s*\n(?=\[|$)/m, '');
  cleaned = cleaned.replace(/^\[agents\]\s*\n(?=\[|$)/m, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  if (!cleaned) return null;
  return cleaned + '\n';
}

/**
 * Merge GSD config block into an existing or new config.toml.
 */
function mergeCodexConfig(configPath, gsdBlock) {
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, gsdBlock + '\n');
    return;
  }

  const existing = fs.readFileSync(configPath, 'utf8');
  const markerIndex = existing.indexOf(GSD_CODEX_MARKER);

  if (markerIndex !== -1) {
    const before = existing.substring(0, markerIndex).trimEnd();
    const newContent = before ? before + '\n\n' + gsdBlock + '\n' : gsdBlock + '\n';
    fs.writeFileSync(configPath, newContent);
    return;
  }

  let content = existing;
  const featuresRegex = /^\[features\]\s*$/m;
  const hasFeatures = featuresRegex.test(content);

  if (hasFeatures) {
    if (!content.includes('multi_agent')) {
      content = content.replace(featuresRegex, '[features]\nmulti_agent = true');
    }
    if (!content.includes('default_mode_request_user_input')) {
      content = content.replace(/^\[features\].*$/m, '$&\ndefault_mode_request_user_input = true');
    }
    const agentsBlock = gsdBlock.substring(gsdBlock.indexOf('[agents]'));
    content = content.trimEnd() + '\n\n' + GSD_CODEX_MARKER + '\n' + agentsBlock + '\n';
  } else {
    content = content.trimEnd() + '\n\n' + gsdBlock + '\n';
  }

  fs.writeFileSync(configPath, content);
}

/**
 * Generate config.toml and per-agent .toml files for Codex.
 */
function installCodexConfig(targetDir, agentsSrc) {
  const configPath = path.join(targetDir, 'config.toml');
  const agentsTomlDir = path.join(targetDir, 'agents');
  fs.mkdirSync(agentsTomlDir, { recursive: true });

  const agentEntries = fs.readdirSync(agentsSrc).filter(f => f.startsWith('gsd-') && f.endsWith('.md'));
  const agents = [];

  for (const file of agentEntries) {
    const content = fs.readFileSync(path.join(agentsSrc, file), 'utf8');
    const { frontmatter } = extractFrontmatterAndBody(content);
    const name = extractFrontmatterField(frontmatter, 'name') || file.replace('.md', '');
    const description = extractFrontmatterField(frontmatter, 'description') || '';

    agents.push({ name, description: toSingleLine(description) });

    const tomlContent = generateCodexAgentToml(name, content);
    fs.writeFileSync(path.join(agentsTomlDir, `${name}.toml`), tomlContent);
  }

  const gsdBlock = generateCodexConfigBlock(agents);
  mergeCodexConfig(configPath, gsdBlock);

  return agents.length;
}

// ─── Test-only exports ───────────────────────────────────────────────────────
// When loaded as a module for testing, skip main CLI logic and export functions
if (process.env.GSD_TEST_MODE) {
  module.exports = {
    getCodexSkillAdapterHeader,
    convertAgentToCodexFormat,
    generateCodexAgentToml,
    generateCodexConfigBlock,
    stripGsdFromCodexConfig,
    mergeCodexConfig,
    installCodexConfig,
    convertCommandToCodexSkill,
    GSD_CODEX_MARKER,
    CODEX_AGENT_SANDBOX,
  };
} else {

if (pathIdx !== -1 && !customPath) {
  console.error(`  ${yellow}--path requires a directory argument${reset}`);
  process.exit(1);
}

if (hasRepair && !hasVerify) {
  console.error(`  ${yellow}--repair requires --verify${reset}`);
  process.exit(1);
}

if (hasMigrate && hasSkipMigrate) {
  console.error(`  ${yellow}Cannot combine --migrate and --skip-migrate${reset}`);
  process.exit(1);
}

if (!hasNoVersionCheck && !hasVerify) {
  showCachedVersionWarning();
}

if (hasVerify) {
  const isGlobal = customPath ? false : (hasLocal ? false : true);
  let result = verifyInstall(isGlobal, customPath);

  if (!result.ok && hasRepair) {
    console.log(`\n  ${yellow}Repairing install...${reset}\n`);
    install(isGlobal, () => {
      console.log('');
      const repaired = verifyInstall(isGlobal, customPath);
      process.exit(repaired.ok ? 0 : 1);
    }, customPath);
  } else {
    process.exit(result.ok ? 0 : 1);
  }
} else {
  if (customPath) {
    install(false, () => {}, customPath);
  } else if (hasGlobal) {
    install(true);
  } else if (hasLocal) {
    install(false);
  } else {
    promptLocation((isGlobal) => {
      install(isGlobal);
    });
  }
}

} // end of else block for GSD_TEST_MODE
