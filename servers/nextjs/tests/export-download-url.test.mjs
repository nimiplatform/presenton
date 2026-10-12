import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalExportDownloadUrl } from '../lib/export-download-url.ts';

test('Windows export names reach the unchanged file-download guard without backslashes', () => {
  const url = new URL(canonicalExportDownloadUrl('pptx\\Windows_743.pptx'), 'http://127.0.0.1');
  assert.equal(url.searchParams.get('name'), 'pptx/Windows_743.pptx');
  assert.equal(url.href.includes('%5C'), false);
});

test('POSIX export names and Unicode filename bytes retain their URL value', () => {
  const url = new URL(canonicalExportDownloadUrl('pdf/中文 页面.pdf'), 'http://127.0.0.1');
  assert.equal(url.searchParams.get('name'), 'pdf/中文 页面.pdf');
});
