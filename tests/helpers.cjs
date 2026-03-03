/**
 * GSD Tools Test Helpers
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOOLS_PATH = path.join(__dirname, '..', 'get-shit-done', 'bin', 'gsd-tools.cjs');
const INSTALLER_PATH = path.join(__dirname, '..', 'bin', 'install.js');

function splitCommand(command) {
  if (Array.isArray(command)) return command.map(String);
  if (!command) return [];

  const parts = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^\s]+)/g;
  let match;
  while ((match = pattern.exec(command)) !== null) {
    const value = match[1] ?? match[2] ?? match[3] ?? '';
    parts.push(value.replace(/\\(["'])/g, '$1'));
  }
  return parts;
}

// Helper to run gsd-tools command
function runGsdTools(args, cwd = process.cwd()) {
  const argv = splitCommand(args);
  const result = spawnSync(process.execPath, [TOOLS_PATH, ...argv], {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.status === 0) {
    return { success: true, output: (result.stdout || '').trim() };
  }

  return {
    success: false,
    output: (result.stdout || '').trim(),
    error: (result.stderr || '').trim() || result.error?.message || `Exited with code ${result.status}`,
  };
}

// Create temp directory structure
function createTempProject() {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gsd-test-'));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });
  return tmpDir;
}

function createTempGitProject() {
  const tmpDir = createTempProject();

  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'pipe' });

  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test\n', 'utf-8');
  execSync('git add README.md', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });

  return tmpDir;
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function runInstaller(args, cwd = process.cwd()) {
  try {
    const result = execSync(`node "${INSTALLER_PATH}" ${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GSD_SKIP_VERSION_CHECK: '1',
      },
    });
    return { success: true, output: result.trim() };
  } catch (err) {
    return {
      success: false,
      output: err.stdout?.toString().trim() || '',
      error: err.stderr?.toString().trim() || err.message,
    };
  }
}

module.exports = {
  runGsdTools,
  runInstaller,
  createTempProject,
  createTempGitProject,
  cleanup,
  TOOLS_PATH,
  INSTALLER_PATH,
};
