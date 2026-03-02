#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf-8'));

/**
 * Run a Node.js script from the package, with CWD set to the user's directory.
 * Scripts find slides/ in CWD, templates/themes via src/resolve.js.
 */
function runNodeScript(relativePath, args = []) {
  return new Promise((resolvePromise, rejectPromise) => {
    const scriptPath = resolve(packageRoot, relativePath);
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: {
        ...process.env,
        PPT_AGENT_PACKAGE_ROOT: packageRoot,
      }
    });

    child.on('error', rejectPromise);
    child.on('close', (code, signal) => {
      if (signal) {
        rejectPromise(new Error(`Command terminated by signal ${signal}`));
        return;
      }
      resolvePromise(code ?? 0);
    });
  });
}

async function runCommand(relativePath, args = []) {
  try {
    const code = await runNodeScript(relativePath, args);
    if (code !== 0) {
      process.exitCode = code;
    }
  } catch (error) {
    console.error(`[ppt-agent] ${error.message}`);
    process.exitCode = 1;
  }
}

const program = new Command();

program
  .name('ppt-agent')
  .description('Agent-first PPT framework CLI')
  .version(packageJson.version);

// --- Core workflow commands ---

program
  .command('build-viewer')
  .description('Build viewer.html from slides/*.html in current directory')
  .argument('[args...]', 'Arguments to pass through')
  .action(async (args = []) => {
    await runCommand('scripts/build-viewer.js', args);
  });

program
  .command('validate')
  .description('Run structured validation on slides (Playwright-based, no API key needed)')
  .argument('[args...]', 'Arguments to pass through')
  .action(async (args = []) => {
    await runCommand('scripts/validate-slides.js', args);
  });

program
  .command('convert')
  .description('Convert slides to PPTX')
  .argument('[args...]', 'Arguments to pass through')
  .action(async (args = []) => {
    await runCommand('convert.cjs', args);
  });

program
  .command('pdf')
  .description('Convert slides to PDF')
  .argument('[args...]', 'Arguments to pass through')
  .action(async (args = []) => {
    await runCommand('scripts/html2pdf.js', args);
  });

program
  .command('edit')
  .description('Start interactive slide editor with Codex image-based edit flow')
  .argument('[args...]', 'Arguments: --port, --codex-model')
  .action(async (args = []) => {
    await runCommand('scripts/editor-server.js', args);
  });

// --- Template/theme discovery commands ---

program
  .command('list-templates')
  .description('List all available slide templates (local overrides + package built-ins)')
  .action(async () => {
    const { listTemplates } = await import('../src/resolve.js');
    const templates = listTemplates();
    if (templates.length === 0) {
      console.log('No templates found.');
      return;
    }
    console.log('Available templates:\n');
    for (const t of templates) {
      const tag = t.source === 'local' ? '(local)' : '(built-in)';
      console.log(`  ${t.name.padEnd(20)} ${tag}`);
    }
    console.log(`\nTotal: ${templates.length} templates`);
  });

program
  .command('list-themes')
  .description('List all available color themes (local overrides + package built-ins)')
  .action(async () => {
    const { listThemes } = await import('../src/resolve.js');
    const themes = listThemes();
    if (themes.length === 0) {
      console.log('No themes found.');
      return;
    }
    console.log('Available themes:\n');
    for (const t of themes) {
      const tag = t.source === 'local' ? '(local)' : '(built-in)';
      console.log(`  ${t.name.padEnd(20)} ${tag}`);
    }
    console.log(`\nTotal: ${themes.length} themes`);
  });

program
  .command('show-template')
  .description('Print the contents of a template file')
  .argument('<name>', 'Template name (e.g. "cover", "content", "chart")')
  .action(async (name) => {
    const { resolveTemplate } = await import('../src/resolve.js');
    const result = resolveTemplate(name);
    if (!result) {
      console.error(`Template "${name}" not found.`);
      process.exitCode = 1;
      return;
    }
    const content = readFileSync(result.path, 'utf-8');
    console.log(`# Template: ${name} (${result.source})`);
    console.log(`# Path: ${result.path}\n`);
    console.log(content);
  });

program
  .command('show-theme')
  .description('Print the contents of a theme file')
  .argument('<name>', 'Theme name (e.g. "modern-dark", "executive")')
  .action(async (name) => {
    const { resolveTheme } = await import('../src/resolve.js');
    const result = resolveTheme(name);
    if (!result) {
      console.error(`Theme "${name}" not found.`);
      process.exitCode = 1;
      return;
    }
    const content = readFileSync(result.path, 'utf-8');
    console.log(`/* Theme: ${name} (${result.source}) */`);
    console.log(`/* Path: ${result.path} */\n`);
    console.log(content);
  });

await program.parseAsync(process.argv);
