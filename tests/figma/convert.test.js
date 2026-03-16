import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { buildPageOptions, getTargetRasterSize, parseArgs } = require('../../convert.cjs');

test('parseArgs applies default slides dir and output', () => {
  assert.deepEqual(parseArgs([]), {
    slidesDir: 'slides',
    output: 'output.pptx',
    help: false,
  });
});

test('buildPageOptions uses a 2x capture device scale factor', () => {
  assert.deepEqual(buildPageOptions(), {
    viewport: { width: 960, height: 540 },
    deviceScaleFactor: 2,
  });
});

test('getTargetRasterSize preserves the legacy 150 DPI slide target', () => {
  assert.deepEqual(getTargetRasterSize(), {
    width: 2000,
    height: 1125,
  });
});
