import test from 'node:test';
import assert from 'node:assert/strict';
import { MobileIdentityWorkspace } from '../servers/nextjs/lib/mobile-identity-workspace.ts';

test('a system picker result survives its Runtime scope but requires a new explicit file action', () => {
  const identity = new AbortController(), oldScope = new AbortController(), newScope = new AbortController();
  const state = new MobileIdentityWorkspace(identity.signal, () => {});
  const oldMessages = [], newMessages = [];
  state.bind('pc-a');
  state.request('old-input', oldScope.signal, message => oldMessages.push(message));
  oldScope.abort();
  const file = new File(['source material'], 'source.txt');
  state.selected([file]); state.deliver();
  assert.deepEqual(oldMessages, []);
  assert.equal(state.canDeliver(), false);
  assert.equal(state.files[0], file);
  state.request('new-input', newScope.signal, message => newMessages.push(message));
  assert.deepEqual(newMessages, []);
  state.deliver();
  assert.deepEqual(newMessages, [{ type: 'selected-files', id: 'new-input', files: [file] }]);
  assert.deepEqual(state.files, []);
});

test('files and unsubmitted drafts are not shared with another PC or identity', () => {
  const identity = new AbortController(), scope = new AbortController();
  const state = new MobileIdentityWorkspace(identity.signal, () => {});
  state.bind('pc-a'); state.drafts['upload:form'] = { prompt: 'private draft' };
  state.selected([new File(['private'], 'file.txt')]);
  state.request('input', scope.signal, () => assert.fail('stale recipient'));
  state.bind('pc-b'); state.deliver();
  assert.deepEqual(state.files, []); assert.deepEqual(state.drafts, {});
  state.drafts['chat:one'] = { input: 'unsent' }; state.selected([new File(['new'], 'new.txt')]);
  identity.abort();
  assert.deepEqual(state.files, []); assert.deepEqual(state.drafts, {});
  state.selected([new File(['late'], 'late.txt')]);
  assert.deepEqual(state.files, []);
});

test('reconnecting never mounts a page that starts generation automatically', () => {
  const state = new MobileIdentityWorkspace(new AbortController().signal, () => {});
  state.setRoute('/presentation?id=original'); assert.equal(state.route, '/presentation?id=original');
  state.setRoute('/presentation?id=original&stream=true'); assert.equal(state.route, '/');
  state.setRoute('/outline?id=original'); assert.equal(state.route, '/');
  state.setRoute('https://another.invalid/path'); assert.equal(state.route, '/');
});
