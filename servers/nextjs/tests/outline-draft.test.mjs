import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreOutlineDraft } from '../lib/outline-draft.ts';

test('a reopened outline restores the saved prompt, Chinese language, count and all controls', () => {
  const restored = restoreOutlineDraft({ content: '蓝鸟项目', n_slides: 5,
    language: 'Chinese (Simplified - 中文, 汉语)', tone: 'professional', verbosity: 'concise',
    instructions: '保留六项观察', include_table_of_contents: true, include_title_slide: false,
    web_search: true, file_paths: ['文档/input.txt'] });
  assert.deepEqual(restored, { config: { prompt: '蓝鸟项目', slides: '5',
    language: 'Chinese (Simplified - 中文, 汉语)', tone: 'professional', verbosity: 'concise',
    instructions: '保留六项观察', includeTableOfContents: true, includeTitleSlide: false, webSearch: true },
    files: [{ file_path: '文档/input.txt' }] });
});

test('automatic slide count and false controls remain automatic and false', () => {
  const restored = restoreOutlineDraft({ content: '', n_slides: 0, language: 'Auto (English)',
    include_title_slide: false, include_table_of_contents: false, web_search: false });
  assert.equal(restored.config.slides, null);
  assert.equal(restored.config.includeTitleSlide, false);
  assert.deepEqual(restored.files, []);
});
