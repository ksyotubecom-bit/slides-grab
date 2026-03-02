#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import { watch as fsWatch } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import {
  SLIDE_SIZE,
  buildCodexEditPrompt,
  buildCodexExecArgs,
  normalizeSelection,
  scaleSelectionToScreenshot,
  writeAnnotatedScreenshot,
} from '../src/editor/codex-edit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = process.env.PPT_AGENT_PACKAGE_ROOT || resolve(__dirname, '..');

let express;
let screenshotMod;

async function loadDeps() {
  if (!express) {
    express = (await import('express')).default;
  }
  if (!screenshotMod) {
    screenshotMod = await import('../src/editor/screenshot.js');
  }
}

const DEFAULT_PORT = 3456;
const DEFAULT_CODEX_MODEL = 'gpt-5.3-codex';
const SLIDE_FILE_PATTERN = /^slide-.*\.html$/i;

function printUsage() {
  process.stdout.write(`Usage: ppt-agent edit [options]\n\n`);
  process.stdout.write(`Options:\n`);
  process.stdout.write(`  --port <number>           Server port (default: ${DEFAULT_PORT})\n`);
  process.stdout.write(`  --codex-model <name>      Codex model (default: ${DEFAULT_CODEX_MODEL})\n`);
  process.stdout.write(`  -h, --help                Show this help message\n`);
}

function parseArgs(argv) {
  const opts = {
    port: DEFAULT_PORT,
    codexModel: DEFAULT_CODEX_MODEL,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      opts.help = true;
      continue;
    }

    if (arg === '--port') {
      opts.port = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg === '--codex-model') {
      opts.codexModel = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!Number.isInteger(opts.port) || opts.port <= 0) {
    throw new Error('`--port` must be a positive integer.');
  }

  if (typeof opts.codexModel !== 'string' || opts.codexModel.trim() === '') {
    throw new Error('`--codex-model` must be a non-empty string.');
  }

  return opts;
}

const sseClients = new Set();

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    res.write(payload);
  }
}

let browserPromise = null;

async function getScreenshotPage() {
  if (!browserPromise) {
    browserPromise = screenshotMod.createScreenshotBrowser();
  }
  return browserPromise;
}

async function closeBrowser() {
  if (browserPromise) {
    const { browser } = await browserPromise;
    browserPromise = null;
    await browser.close();
  }
}

function slidesDir() {
  return join(process.cwd(), 'slides');
}

async function listSlideFiles() {
  const entries = await readdir(slidesDir(), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && SLIDE_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => {
      const numA = Number.parseInt(a.match(/\d+/)?.[0] ?? '0', 10);
      const numB = Number.parseInt(b.match(/\d+/)?.[0] ?? '0', 10);
      return numA - numB || a.localeCompare(b);
    });
}

function sanitizeTargets(rawTargets) {
  if (!Array.isArray(rawTargets)) return [];

  return rawTargets
    .filter((target) => target && typeof target === 'object')
    .slice(0, 20)
    .map((target) => ({
      xpath: typeof target.xpath === 'string' ? target.xpath.slice(0, 400) : '',
      tag: typeof target.tag === 'string' ? target.tag.slice(0, 40) : '',
      text: typeof target.text === 'string' ? target.text.slice(0, 400) : '',
    }))
    .filter((target) => target.xpath);
}

function spawnCodexEdit({ prompt, imagePath, model, cwd, onLog }) {
  const codexBin = process.env.PPT_AGENT_CODEX_BIN || 'codex';
  const args = buildCodexExecArgs({ prompt, imagePath, model });

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(codexBin, args, { cwd, stdio: 'pipe' });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      onLog('stdout', text);
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      onLog('stderr', text);
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      resolvePromise({ code: code ?? 1, stdout, stderr });
    });

    child.on('error', (error) => {
      rejectPromise(error);
    });
  });
}

function randomRunId() {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 100000);
  return `run-${ts}-${rand}`;
}

async function startServer(opts) {
  await loadDeps();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const editorHtmlPath = join(PACKAGE_ROOT, 'src', 'editor', 'editor.html');
  let activeApplyRunId = null;

  app.get('/', async (_req, res) => {
    try {
      const html = await readFile(editorHtmlPath, 'utf-8');
      res.type('html').send(html);
    } catch (err) {
      res.status(500).send(`Failed to load editor: ${err.message}`);
    }
  });

  app.get('/slides/:file', async (req, res) => {
    const file = basename(req.params.file);
    if (!SLIDE_FILE_PATTERN.test(file)) {
      return res.status(400).send('Invalid slide filename');
    }

    const filePath = join(slidesDir(), file);
    try {
      const html = await readFile(filePath, 'utf-8');
      res.type('html').send(html);
    } catch {
      res.status(404).send(`Slide not found: ${file}`);
    }
  });

  app.get('/api/slides', async (_req, res) => {
    try {
      const files = await listSlideFiles();
      res.json(files);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('event: connected\ndata: {}\n\n');

    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
  });

  app.post('/api/apply', async (req, res) => {
    const { slide, prompt, selection, targets } = req.body ?? {};

    if (activeApplyRunId) {
      return res.status(409).json({
        error: `Another edit is already running (${activeApplyRunId}).`,
      });
    }

    if (!slide || typeof slide !== 'string' || !SLIDE_FILE_PATTERN.test(slide)) {
      return res.status(400).json({ error: 'Missing or invalid `slide`.' });
    }

    if (typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({ error: 'Missing or invalid `prompt`.' });
    }

    let normalizedSelection;
    try {
      normalizedSelection = normalizeSelection(selection, SLIDE_SIZE);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const runId = randomRunId();
    activeApplyRunId = runId;

    const cleanTargets = sanitizeTargets(targets);
    const tmpPath = await mkdtemp(join(tmpdir(), 'editor-codex-'));
    const screenshotPath = join(tmpPath, 'slide.png');
    const annotatedPath = join(tmpPath, 'slide-annotated.png');

    broadcastSSE('applyStarted', {
      runId,
      slide,
      selection: normalizedSelection,
      targetsCount: cleanTargets.length,
    });

    try {
      const { page } = await getScreenshotPage();

      await screenshotMod.captureSlideScreenshot(
        page,
        slide,
        screenshotPath,
        `http://localhost:${opts.port}/slides`,
        { useHttp: true },
      );

      const screenshotSelection = scaleSelectionToScreenshot(
        normalizedSelection,
        SLIDE_SIZE,
        screenshotMod.SCREENSHOT_SIZE,
      );

      await writeAnnotatedScreenshot(screenshotPath, annotatedPath, screenshotSelection);

      const codexPrompt = buildCodexEditPrompt({
        slideFile: slide,
        userPrompt: prompt,
        selection: normalizedSelection,
        targets: cleanTargets,
      });

      const result = await spawnCodexEdit({
        prompt: codexPrompt,
        imagePath: annotatedPath,
        model: opts.codexModel,
        cwd: process.cwd(),
        onLog: (stream, chunk) => {
          broadcastSSE('applyLog', { runId, stream, chunk });
        },
      });

      const success = result.code === 0;
      const message = success
        ? 'Codex edit completed.'
        : `Codex exited with code ${result.code}.`;

      broadcastSSE('applyFinished', {
        runId,
        slide,
        success,
        code: result.code,
        message,
      });

      res.json({
        success,
        runId,
        code: result.code,
        message,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      broadcastSSE('applyFinished', {
        runId,
        slide,
        success: false,
        code: -1,
        message,
      });

      res.status(500).json({
        success: false,
        runId,
        error: message,
      });
    } finally {
      activeApplyRunId = null;
      await rm(tmpPath, { recursive: true, force: true }).catch(() => {});
    }
  });

  let debounceTimer = null;
  const watcher = fsWatch(slidesDir(), { persistent: false }, (_eventType, filename) => {
    if (!filename || !SLIDE_FILE_PATTERN.test(filename)) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      broadcastSSE('fileChanged', { file: filename });
    }, 300);
  });

  const server = app.listen(opts.port, () => {
    process.stdout.write('\n  ppt-agent editor\n');
    process.stdout.write('  ─────────────────────────────────────\n');
    process.stdout.write(`  Local:       http://localhost:${opts.port}\n`);
    process.stdout.write(`  Codex model: ${opts.codexModel}\n`);
    process.stdout.write(`  Slides:      ${slidesDir()}\n`);
    process.stdout.write('  ─────────────────────────────────────\n\n');
  });

  async function shutdown() {
    process.stdout.write('\n[editor] Shutting down...\n');
    watcher.close();
    for (const client of sseClients) {
      client.end();
    }
    sseClients.clear();
    server.close();
    await closeBrowser();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const args = process.argv.slice(2);

let opts;
try {
  opts = parseArgs(args);
} catch (error) {
  process.stderr.write(`[editor] ${error.message}\n`);
  process.exit(1);
}

if (opts.help) {
  printUsage();
  process.exit(0);
}

startServer(opts).catch((err) => {
  process.stderr.write(`[editor] Fatal: ${err.message}\n`);
  process.exit(1);
});
