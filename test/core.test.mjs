import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {PrivatePipe} from '../src/cdp.mjs';
import {locations, inspectContract, sameBuild} from '../src/platform.mjs';
import {uiReady, trustedCache, createFixture} from '../src/launcher.mjs';
import {atomicJSON, readJSON, acquireLock} from '../src/storage.mjs';

test('paths derive from supplied home and support spaces and Unicode', () => {
  const home = path.join(os.tmpdir(), 'a user', '中文');
  const result = locations({}, home);
  assert.equal(result.profile, path.join(home, 'Library', 'Application Support', 'Codex'));
  assert.equal(result.prefix, path.join(home, 'Library', 'Application Support', 'CodexZhLauncher'));
});
test('known translation contract is required rather than version number alone', () => {
  assert(inspectContract('getLayer(`72216192`).get(`enable_i18n`,!1)', '新聊天 定时任务'));
  assert(!inspectContract('getLayer(`other`).get(`enable_i18n`,!1)', '新聊天 定时任务'));
  assert(!inspectContract('getLayer(`72216192`).get(`enable_i18n`,!1)', 'English only'));
});
test('UI proof requires the Codex surface and actual Chinese labels without English', () => {
  const valid = { surface: 'Codex', lang: 'zh-CN', labels: ['新聊天', '定时任务', '插件', '探索'] };
  assert(uiReady(valid));
  for (const invalid of [{ ...valid, surface: 'ChatGPT Work' }, { ...valid, lang: 'en' },
    { ...valid, labels: ['新聊天'] }, { ...valid, labels: [...valid.labels, 'New chat'] }]) assert(!uiReady(invalid));
});
test('cache must match all resource hashes and actual UI proof', () => {
  const build = { version: '1', archiveSha256: 'a', executableSha256: 'b', adapterSha256: 'c' };
  const cached = { ...build, ui: { verified: true, surface: 'Codex', lang: 'zh-CN', labels: ['新聊天', '定时任务', '插件'], englishLabels: [] } };
  assert(trustedCache(cached, build));
  for (const key of ['version', 'archiveSha256', 'executableSha256', 'adapterSha256']) {
    assert(!sameBuild(cached, { ...build, [key]: 'changed' })); assert(!trustedCache(cached, { ...build, [key]: 'changed' }));
  }
  assert(!trustedCache({ ...cached, ui: { ...cached.ui, verified: false } }, build));
});
test('lock prevents duplicate launch and refuses unknown or symlink owners', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-zh-lock-'));
  try {
    const lock = path.join(root, 'launch.lock');
    const release = acquireLock(lock);
    assert.throws(() => acquireLock(lock), /ALREADY_RUNNING/); release(); assert(!fs.existsSync(lock));
    fs.mkdirSync(lock); assert.throws(() => acquireLock(lock), /ALREADY_RUNNING/);
    fs.rmSync(lock, { recursive: true });
    const target = path.join(root, 'target'); fs.mkdirSync(target); fs.symlinkSync(target, lock);
    assert.throws(() => acquireLock(lock), /SYMLINK/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('private writes refuse symlink targets, retain unrelated data and do not read real credentials', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-zh-state-'));
  try {
    const file = path.join(root, 'state.json'); atomicJSON(file, { untouched: 1 });
    assert.equal(readJSON(file).untouched, 1);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const link = path.join(root, 'link'); fs.symlinkSync(file, link);
    assert.throws(() => atomicJSON(link, {}), /SYMLINK/); assert.equal(readJSON(file).untouched, 1);
    const fixture = createFixture(path.join(root, 'fixture'));
    assert(fs.readFileSync(path.join(fixture.codexHome, 'config.toml'), 'utf8').includes('http://127.0.0.1:9/v1'));
    assert(!fs.readFileSync(path.join(fixture.codexHome, 'config.toml'), 'utf8').includes('plugins = false'));
    assert(!fs.readFileSync(path.join(fixture.codexHome, 'auth.json'), 'utf8').includes('tokens'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('private CDP pipe handles fragmented replies and rejects pending work on exit', async () => {
  const child = new EventEmitter(); child.stdio = [null, null, null, new PassThrough(), new PassThrough()];
  const pipe = new PrivatePipe(child);
  const reply = pipe.call('Page.example');
  child.stdio[4].write('{"id":1,"res'); child.stdio[4].write('ult":{"ok":true}}\0');
  assert.deepEqual(await reply, { ok: true });
  const pending = pipe.call('Page.pending'); const rejected = assert.rejects(pending, /APP_EXITED/);
  child.emit('exit', 0); await rejected; assert(pipe.closed);
});
