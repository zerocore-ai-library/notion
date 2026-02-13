import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      ...options,
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) return resolve();
      reject(
        new Error(
          `Command failed: ${cmd} ${args.join(' ')} (code=${code ?? 'null'}, signal=${
            signal ?? 'null'
          })`
        )
      );
    });
  });
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureUpstreamSubmoduleReady({ toolDir, upstreamDir }) {
  const required = [
    path.join(upstreamDir, 'package.json'),
    path.join(upstreamDir, 'package-lock.json'),
    path.join(upstreamDir, 'scripts', 'notion-openapi.json'),
  ];
  const missing = [];

  for (const filePath of required) {
    if (!(await pathExists(filePath))) missing.push(path.basename(filePath));
  }

  if (missing.length === 0) return;

  console.log(
    `\nNOTE: Upstream submodule checkout looks incomplete (missing: ${missing.join(', ')}).\n` +
      'Attempting to init/update the submodule...'
  );

  try {
    await run('git', ['submodule', 'sync', '--recursive'], { cwd: toolDir });
    await run('git', ['submodule', 'update', '--init', '--recursive', 'upstream'], { cwd: toolDir });
  } catch (err) {
    throw new Error(
      'Failed to init/update upstream submodule.\n' +
        `- Expected files: ${required.map((p) => path.relative(toolDir, p)).join(', ')}\n` +
        '- Try: git submodule update --init --recursive upstream\n' +
        `- Original error: ${err?.message ?? String(err)}`
    );
  }

  for (const filePath of required) {
    if (!(await pathExists(filePath))) {
      throw new Error(
        `Upstream submodule is still missing ${path.relative(toolDir, filePath)} after init/update.\n` +
          'Try: git submodule update --init --recursive upstream'
      );
    }
  }
}

async function main() {
  const toolDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const upstreamDir = path.join(toolDir, 'upstream');

  if (!(await pathExists(upstreamDir))) {
    throw new Error(`Missing upstream submodule at ${upstreamDir} (did you init submodules?)`);
  }
  await ensureUpstreamSubmoduleReady({ toolDir, upstreamDir });

  const srcCli = path.join(upstreamDir, 'bin', 'cli.mjs');
  const srcSpec = path.join(upstreamDir, 'scripts', 'notion-openapi.json');

  const dstCli = path.join(toolDir, 'server', 'notion-mcp-server', 'bin', 'cli.mjs');
  const dstSpec = path.join(toolDir, 'server', 'notion-mcp-server', 'scripts', 'notion-openapi.json');

  // 1) Build upstream CLI bundle
  await run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: upstreamDir });
  await run('npm', ['run', 'build'], { cwd: upstreamDir });

  if (!(await pathExists(srcCli))) {
    throw new Error(`Expected build output not found at ${srcCli}`);
  }
  if (!(await pathExists(srcSpec))) {
    throw new Error(`Expected OpenAPI spec not found at ${srcSpec}`);
  }

  // 2) Vendor runtime artifacts into MCPB bundle layout
  await fs.mkdir(path.dirname(dstCli), { recursive: true });
  await fs.mkdir(path.dirname(dstSpec), { recursive: true });
  await fs.copyFile(srcCli, dstCli);
  await fs.copyFile(srcSpec, dstSpec);

  console.log('\nOK: notion MCPB bundle prepared.');
  console.log(`- Vendored CLI: ${path.relative(toolDir, dstCli)}`);
  console.log(`- Vendored OpenAPI spec: ${path.relative(toolDir, dstSpec)}`);
}

main().catch((err) => {
  console.error(`\nERROR: ${err?.message ?? String(err)}`);
  process.exit(1);
});
