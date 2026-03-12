import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { inflateRawSync } from 'node:zlib';

import PptxGenJS from 'pptxgenjs';

import {
  buildDefaultFigmaOutput,
  configureFigmaExportPresentation,
  ensureOutputDirectory,
  FIGMA_EXPORT_LAYOUT_NAME,
  getFigmaImportCaveats,
  normalizeFigmaOutput,
  SLIDE_HEIGHT_INCHES,
  SLIDE_WIDTH_INCHES,
  sortFigmaSlideFiles,
} from '../../src/figma.js';

test('buildDefaultFigmaOutput places figma pptx next to slides dir', () => {
  const output = buildDefaultFigmaOutput('/tmp/decks/q1-review');
  assert.equal(output, '/tmp/decks/q1-review-figma.pptx');
});

test('normalizeFigmaOutput appends .pptx when omitted', () => {
  const output = normalizeFigmaOutput('slides', 'exports/demo-figma');
  assert.equal(output, 'exports/demo-figma.pptx');
});

test('getFigmaImportCaveats returns user-facing warnings', () => {
  const caveats = getFigmaImportCaveats();
  assert.equal(caveats.length, 4);
  assert.match(caveats[0], /best-effort/i);
  assert.match(caveats[1], /Pretendard/i);
});

test('ensureOutputDirectory creates missing parent directories for nested output paths', async () => {
  const root = mkdtempSync(join(tmpdir(), 'slides-grab-figma-'));
  const output = join(root, 'nested', 'exports', 'deck.pptx');

  try {
    await ensureOutputDirectory(output);
    assert.equal(existsSync(join(root, 'nested', 'exports')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('sortFigmaSlideFiles orders slide html files numerically', () => {
  const files = ['slide-10.html', 'slide-02.html', 'slide-1.html', 'slide-a.html'];
  files.sort(sortFigmaSlideFiles);
  assert.deepEqual(files, ['slide-1.html', 'slide-02.html', 'slide-10.html', 'slide-a.html']);
});

test('slides-grab help lists the figma command', () => {
  const output = execFileSync(process.execPath, ['bin/ppt-agent.js', '--help'], {
    cwd: process.cwd(),
    encoding: 'utf-8',
  });

  assert.match(output, /\bfigma\b/);
  assert.match(output, /Figma Slides importable PPTX/);
});

test('figma command help documents manual import intent', () => {
  const output = execFileSync(process.execPath, ['bin/ppt-agent.js', 'figma', '--help'], {
    cwd: process.cwd(),
    encoding: 'utf-8',
  });

  assert.match(output, /Output PPTX file/);
  assert.match(output, /slides-grab figma/);
});

test('configureFigmaExportPresentation applies the repo-standard slide size', () => {
  const pres = new PptxGenJS();
  configureFigmaExportPresentation(pres);

  assert.equal(pres.layout, FIGMA_EXPORT_LAYOUT_NAME);
  assert.equal(pres.presLayout.width / 914400, SLIDE_WIDTH_INCHES);
  assert.equal(pres.presLayout.height / 914400, SLIDE_HEIGHT_INCHES);
});

test('figma exporter generates a pptx with the repo-standard presentation size', () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'slides-grab-figma-export-'));
  const outputPath = join(outputDir, 'fixture-export.pptx');

  try {
    execFileSync(
      process.execPath,
      [
        'scripts/figma-export.js',
        '--slides-dir',
        'tests/fixtures/image-contract/positive-local-asset',
        '--output',
        outputPath,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
      },
    );

    const presentationXml = extractZipEntry(readFileSync(outputPath), 'ppt/presentation.xml').toString('utf-8');
    assert.match(presentationXml, /cx="9144000"/);
    assert.match(presentationXml, /cy="5143500"/);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test('npm pack includes packaged html2pptx runtime instead of relying on .claude assets', () => {
  const output = execFileSync('npm', ['pack', '--json', '--dry-run'], {
    cwd: process.cwd(),
    encoding: 'utf-8',
  });
  const [packInfo] = JSON.parse(output);
  const filePaths = packInfo.files.map((entry) => entry.path);

  assert.ok(filePaths.includes('src/html2pptx.cjs'));
  assert.ok(filePaths.includes('scripts/html2pptx.js'));
  assert.ok(!filePaths.some((filePath) => filePath.startsWith('.claude/')));
});

function extractZipEntry(zipBuffer, entryName) {
  let offset = 0;

  while (offset + 30 <= zipBuffer.length) {
    const signature = zipBuffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      break;
    }

    const compressionMethod = zipBuffer.readUInt16LE(offset + 8);
    const compressedSize = zipBuffer.readUInt32LE(offset + 18);
    const fileNameLength = zipBuffer.readUInt16LE(offset + 26);
    const extraFieldLength = zipBuffer.readUInt16LE(offset + 28);
    const fileNameStart = offset + 30;
    const fileNameEnd = fileNameStart + fileNameLength;
    const dataStart = fileNameEnd + extraFieldLength;
    const dataEnd = dataStart + compressedSize;
    const fileName = zipBuffer.subarray(fileNameStart, fileNameEnd).toString('utf-8');

    if (fileName === entryName) {
      const payload = zipBuffer.subarray(dataStart, dataEnd);
      if (compressionMethod === 0) return payload;
      if (compressionMethod === 8) return inflateRawSync(payload);
      throw new Error(`Unsupported ZIP compression method ${compressionMethod} for ${entryName}`);
    }

    offset = dataEnd;
  }

  throw new Error(`ZIP entry not found: ${entryName}`);
}
