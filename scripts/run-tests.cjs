#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function collectTests(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTests(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".test.cjs")) {
      files.push(fullPath);
    }
  }

  return files;
}

const withCoverage = process.argv.includes("--coverage");
const testFiles = collectTests(path.resolve(__dirname, "..", "tests")).sort();

if (testFiles.length === 0) {
  console.error("No test files found in ./tests");
  process.exit(1);
}

const args = [];
if (withCoverage) args.push("--experimental-test-coverage");
args.push("--test", ...testFiles);

const result = spawnSync(process.execPath, args, { stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
