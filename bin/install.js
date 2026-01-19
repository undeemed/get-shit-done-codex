#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// Colors
const cyan = '\x1b[36m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

// Get version from package.json
const pkg = require('../package.json');

const banner = `
${cyan}   ██████╗ ███████╗██████╗
   ██╔════╝ ██╔════╝██╔══██╗
   ██║  ███╗███████╗██║  ██║
   ██║   ██║╚════██║██║  ██║
   ╚██████╔╝███████║██████╔╝
    ╚═════╝ ╚══════╝╚═════╝${reset}

   Get Shit Done ${dim}v${pkg.version}${reset}
   A meta-prompting, context engineering and spec-driven
   development system for OpenAI Codex CLI by TÂCHES.
`;

// Parse args
const args = process.argv.slice(2);
const hasGlobal = args.includes('--global') || args.includes('-g');
const hasLocal = args.includes('--local') || args.includes('-l');
const hasHelp = args.includes('--help') || args.includes('-h');

console.log(banner);

// Show help if requested
if (hasHelp) {
  console.log(`  ${yellow}Usage:${reset} npx get-shit-done-codex [options]

  ${yellow}Options:${reset}
    ${cyan}-g, --global${reset}              Install globally (to ~/.codex/)
    ${cyan}-l, --local${reset}               Install locally (to current directory)
    ${cyan}-h, --help${reset}                Show this help message

  ${yellow}Examples:${reset}
    ${dim}# Install globally to ~/.codex directory${reset}
    npx get-shit-done-codex --global

    ${dim}# Install to current project only${reset}
    npx get-shit-done-codex --local

  ${yellow}Notes:${reset}
    For codex-cli, this installer:
    - Creates/updates AGENTS.md in the target directory
    - Copies the get-shit-done skill and commands
    - Global install goes to ~/.codex/ (inherited by all projects)
    - Local install puts files in current directory
`);
  process.exit(0);
}

/**
 * Apply content replacements for Codex CLI compatibility
 */
function applyReplacements(content, pathPrefix) {
  // Path replacements
  content = content.replace(/~\/\.claude\//g, pathPrefix);
  content = content.replace(/\.claude\//g, pathPrefix.replace('~/', ''));
  
  // Claude → Codex naming
  content = content.replace(/Claude Code/g, 'Codex CLI');
  content = content.replace(/Claude/g, 'Codex');
  
  // Command format: /gsd:name → /prompts:gsd-name (Codex CLI custom prompts format)
  content = content.replace(/\/gsd:/g, '/prompts:gsd-');
  
  return content;
}

/**
 * Recursively copy directory, replacing paths in .md files
 */
function copyWithPathReplacement(srcDir, destDir, pathPrefix) {
  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyWithPathReplacement(srcPath, destPath, pathPrefix);
    } else if (entry.name.endsWith('.md')) {
      let content = fs.readFileSync(srcPath, 'utf8');
      content = applyReplacements(content, pathPrefix);
      fs.writeFileSync(destPath, content);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Install to the specified directory
 */
function install(isGlobal) {
  const src = path.join(__dirname, '..');
  const codexDir = isGlobal
    ? path.join(os.homedir(), '.codex')
    : process.cwd();

  const locationLabel = isGlobal
    ? '~/.codex'
    : '.';

  // Path prefix for file references
  const pathPrefix = isGlobal
    ? '~/.codex/'
    : './';

  console.log(`  Installing to ${cyan}${locationLabel}${reset}\n`);

  // Create target directory if needed
  fs.mkdirSync(codexDir, { recursive: true });

  // Copy AGENTS.md
  const agentsSrc = path.join(src, 'AGENTS.md');
  const agentsDest = path.join(codexDir, 'AGENTS.md');
  let agentsContent = fs.readFileSync(agentsSrc, 'utf8');
  agentsContent = applyReplacements(agentsContent, pathPrefix);
  fs.writeFileSync(agentsDest, agentsContent);
  console.log(`  ${green}✓${reset} Installed AGENTS.md`);

  // Create prompts directory (Codex CLI uses prompts/ for custom slash commands)
  const promptsDir = path.join(codexDir, 'prompts');
  fs.mkdirSync(promptsDir, { recursive: true });

  // Copy commands/gsd as prompts (flatten the structure for Codex CLI)
  // Codex CLI expects prompts/command-name.md format
  const gsdSrc = path.join(src, 'commands', 'gsd');
  const entries = fs.readdirSync(gsdSrc);
  for (const entry of entries) {
    if (entry.endsWith('.md')) {
      const srcPath = path.join(gsdSrc, entry);
      // Convert to gsd-command format (e.g., help.md -> gsd-help.md)
      const destName = 'gsd-' + entry;
      const destPath = path.join(promptsDir, destName);
      let content = fs.readFileSync(srcPath, 'utf8');
      content = applyReplacements(content, pathPrefix);
      fs.writeFileSync(destPath, content);
    }
  }
  console.log(`  ${green}✓${reset} Installed prompts/gsd-*.md (${entries.filter(e => e.endsWith('.md')).length} commands)`);

  // Copy get-shit-done skill with path replacement
  const skillSrc = path.join(src, 'get-shit-done');
  const skillDest = path.join(codexDir, 'get-shit-done');
  copyWithPathReplacement(skillSrc, skillDest, pathPrefix);
  console.log(`  ${green}✓${reset} Installed get-shit-done`);

  console.log(`
  ${green}Done!${reset} 
  
  ${yellow}For Codex CLI:${reset}
  - AGENTS.md is at ${cyan}${codexDir}/AGENTS.md${reset}
  - Slash commands are in ${cyan}${codexDir}/prompts/${reset}
  
  ${yellow}Getting Started:${reset}
  1. Run ${cyan}codex${reset} to start the Codex CLI
  2. Type ${cyan}/${reset} to see available commands
  3. Start with ${cyan}/prompts:gsd-new-project${reset} to initialize a project

  ${dim}Commands use /prompts:gsd-name format (e.g., /prompts:gsd-help)${reset}
`);
}

/**
 * Prompt for install location
 */
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
    const isGlobal = choice !== '2';
    install(isGlobal);
  });
}

// Main
if (hasGlobal && hasLocal) {
  console.error(`  ${yellow}Cannot specify both --global and --local${reset}`);
  process.exit(1);
} else if (hasGlobal) {
  install(true);
} else if (hasLocal) {
  install(false);
} else {
  promptLocation();
}
