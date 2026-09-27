import test from 'node:test';
import assert from 'node:assert/strict';
import { helperEnvironment } from '../electron/nimi/backend.ts';

test('business helper environment excludes protected and provider credentials', () => {
  const names = ['NIMI_RUNTIME_ENDPOINT', 'NIMI_ACCESS_TOKEN', 'OPENAI_API_KEY'];
  const old = names.map((name) => process.env[name]);
  try {
    for (const name of names) process.env[name] = 'not-for-workers';
    const env = helperEnvironment();
    for (const name of names) assert.equal(env[name], undefined);
    assert.equal(env.PYTHONIOENCODING, 'utf-8');
  } finally { names.forEach((name, index) => { if (old[index] === undefined) delete process.env[name]; else process.env[name] = old[index]; }); }
});
