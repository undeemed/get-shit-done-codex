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

const banner = `
${green}   ██████╗ ███████╗██████╗
   ██╔════╝ ██╔════╝██╔══██╗
   ██║  ███╗███████╗██║  ██║
   ██║   ██║╚════██║██║  ██║
   ╚██████╔╝███████║██████╔╝
    ╚═════╝ ╚══════╝╚═════╝${reset}

   Get Shit Done ${dim}v${pkg.version}${reset}
   A meta-prompting, context engineering, and spec-driven
   development system for OpenAI Codex CLI.
`;

const args = process.argv.slice(2);
const hasGlobal = args.includes('--global') || args.includes('-g');
const hasLocal = args.includes('--local') || args.includes('-l');
const hasHelp = args.includes('--help') || args.includes('-h');

console.log(banner);

if (hasHelp) {
  console.log(`  ${yellow}Usage:${reset} npx ${NPM_PACKAGE} [options]

  ${yellow}Options:${reset}
    ${cyan}-g, --global${reset}              Install globally (to ~/.codex/)
    ${cyan}-l, --local${reset}               Install locally (to current directory)
    ${cyan}-h, --help${reset}                Show this help message

  ${yellow}Examples:${reset}
    ${dim}# Install globally${reset}
    npx ${NPM_PACKAGE} --global

    ${dim}# Install to current project only${reset}
    npx ${NPM_PACKAGE} --local

  ${yellow}Notes:${reset}
    - Installs AGENTS.md into the target directory
    - Installs GSD prompt commands into prompts/
    - Installs get-shit-done/ workflow files
`);
  process.exit(0);
}

function applyReplacements(content, pathPrefix) {
  const runtimeRelativePrefix = pathPrefix.replace('~/', '');
  const explicitRelativePrefix = runtimeRelativePrefix === './'
    ? './'
    : `./${runtimeRelativePrefix}`;

  // Replace explicit relative/global patterns first to avoid producing "././".
  content = content.replace(/\.\/\.claude\//g, explicitRelativePrefix);
  content = content.replace(/~\/\.claude\//g, '~/.codex/');
  content = content.replace(/\.claude\//g, runtimeRelativePrefix);

  content = content.replace(/Claude Code/g, 'Codex CLI');
  content = content.replace(/Claude/g, 'Codex');

  content = content.replace(/\/gsd:/g, '/prompts:gsd-');

  // Keep update workflows pointed to this fork's npm package/repo.
  content = content.replace(new RegExp(UPSTREAM_PACKAGE, 'g'), NPM_PACKAGE);
  content = content.replace(new RegExp(UPSTREAM_REPO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), FORK_REPO);
  content = content.replace(/npmjs\.com\/package\/get-shit-done-cc/g, `npmjs.com/package/${encodeURIComponent(NPM_PACKAGE)}`);

  return content;
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

function install(isGlobal) {
  const src = path.join(__dirname, '..');
  const codexDir = isGlobal ? path.join(os.homedir(), '.codex') : process.cwd();
  const locationLabel = isGlobal ? '~/.codex' : '.';
  const pathPrefix = isGlobal ? '~/.codex/' : './';

  console.log(`  Installing to ${cyan}${locationLabel}${reset}\n`);
  fs.mkdirSync(codexDir, { recursive: true });

  const agentsSrc = path.join(src, 'AGENTS.md');
  const agentsDest = path.join(codexDir, 'AGENTS.md');
  const agentsContent = applyReplacements(fs.readFileSync(agentsSrc, 'utf8'), pathPrefix);
  fs.writeFileSync(agentsDest, agentsContent, 'utf8');
  console.log(`  ${green}✓${reset} Installed AGENTS.md`);

  const promptsDir = path.join(codexDir, 'prompts');
  fs.mkdirSync(promptsDir, { recursive: true });

  const gsdSrc = path.join(src, 'commands', 'gsd');
  const entries = fs.readdirSync(gsdSrc);
  const markdownEntries = entries.filter((entry) => entry.endsWith('.md'));
  for (const entry of markdownEntries) {
    const srcPath = path.join(gsdSrc, entry);
    const destPath = path.join(promptsDir, `gsd-${entry}`);
    const content = applyReplacements(fs.readFileSync(srcPath, 'utf8'), pathPrefix);
    fs.writeFileSync(destPath, content, 'utf8');
  }
  console.log(`  ${green}✓${reset} Installed prompts/gsd-*.md (${markdownEntries.length} commands)`);

  const skillSrc = path.join(src, 'get-shit-done');
  const skillDest = path.join(codexDir, 'get-shit-done');
  copyWithPathReplacement(skillSrc, skillDest, pathPrefix);
  writeVersionFile(skillDest, isGlobal);
  console.log(`  ${green}✓${reset} Installed get-shit-done/ workflow files`);
  console.log(`  ${green}✓${reset} Wrote get-shit-done/VERSION (${pkg.version})`);

  console.log(`
  ${green}Done!${reset}

  ${yellow}For Codex CLI:${reset}
  - AGENTS.md: ${cyan}${codexDir}/AGENTS.md${reset}
  - Prompt commands: ${cyan}${codexDir}/prompts/${reset}

  ${yellow}Getting Started:${reset}
  1. Run ${cyan}codex${reset}
  2. Use ${cyan}/prompts:gsd-help${reset} to list commands
  3. Start with ${cyan}/prompts:gsd-new-project${reset}

  ${yellow}Staying Updated:${reset}
  - In Codex: ${cyan}/prompts:gsd-update${reset}
  - In terminal: ${cyan}npx ${NPM_PACKAGE_LATEST}${reset}
`);
}

function promptLocation() {
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
    install(choice !== '2');
  });
}

showCachedVersionWarning();

if (hasGlobal && hasLocal) {
  console.error(`  ${yellow}Cannot specify both --global and --local${reset}`);
  process.exit(1);
}

if (hasGlobal) {
  install(true);
} else if (hasLocal) {
  install(false);
} else {
  promptLocation();
}
