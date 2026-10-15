import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {install, uninstall, shellQuote, copyTree} from '../src/install.mjs';
import {locations} from '../src/platform.mjs';

function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-zh-installer-'));
  const source = path.join(home, 'source'); fs.mkdirSync(source);
  for (const folder of ['src', 'bin', 'node_modules']) { fs.mkdirSync(path.join(source, folder)); fs.writeFileSync(path.join(source, folder, 'example.txt'), folder); }
  for (const file of ['package.json', 'LICENSE', 'NOTICE']) fs.writeFileSync(path.join(source, file), file);
  const paths = locations({ launcher: path.join(home, 'Applications', 'Separate.app') }, home);
  const build = { app: path.join(home, 'Original.app') }; fs.mkdirSync(build.app); fs.writeFileSync(path.join(build.app, 'original'), 'do not change');
  const compile = (script, output) => { fs.mkdirSync(output); fs.writeFileSync(path.join(output, 'applet'), script); };
  return { home, source, paths, build, options: { root: source, node: process.execPath, compile } };
}
test('shell quoting preserves literal dollars, quotes and command substitutions', () => {
  const literal = "a user/中文 ' $HOME $(echo unsafe) `echo unsafe`";
  assert.equal(execFileSync('/bin/sh', ['-c', `printf '%s' ${shellQuote(literal)}`], { encoding: 'utf8' }), literal);
});
test('installation and removal touch only tool-owned files and preserve state', () => {
  const f = fixture();
  try {
    assert(install(f.paths, f.build, f.options).installed);
    assert.throws(() => install(f.paths, f.build, f.options), /TARGET_EXISTS/);
    fs.writeFileSync(path.join(f.paths.state, 'diagnostic.json'), '{}');
    assert(uninstall(f.paths).uninstalled);
    assert(!fs.existsSync(f.paths.launcher)); assert(!fs.existsSync(f.paths.runtime));
    assert(fs.existsSync(path.join(f.paths.state, 'diagnostic.json')));
    assert.equal(fs.readFileSync(path.join(f.build.app, 'original'), 'utf8'), 'do not change');
  } finally { fs.rmSync(f.home, { recursive: true, force: true }); }
});
test('modified or extra installed files are preserved rather than blindly deleted', () => {
  for (const mutation of ['changed', 'extra']) {
    const f = fixture();
    try {
      install(f.paths, f.build, f.options);
      fs.writeFileSync(path.join(f.paths.runtime, mutation === 'changed' ? 'LICENSE' : 'user-file'), 'keep');
      assert.throws(() => uninstall(f.paths), /CHANGED_REFUSED/);
      assert(fs.existsSync(f.paths.launcher)); assert(fs.existsSync(f.paths.runtime));
    } finally { fs.rmSync(f.home, { recursive: true, force: true }); }
  }
});
test('installer rejects existing user app, official bundle target and symlinks', () => {
  const f = fixture();
  try {
    assert.throws(() => install({ ...f.paths, launcher: f.build.app }, f.build, f.options), /EXISTS|INVALID/);
    fs.mkdirSync(path.dirname(f.paths.launcher), { recursive: true }); fs.symlinkSync(f.build.app, f.paths.launcher);
    assert.throws(() => install(f.paths, f.build, f.options), /SYMLINK/);
    assert.equal(fs.readFileSync(path.join(f.build.app, 'original'), 'utf8'), 'do not change');
  } finally { fs.rmSync(f.home, { recursive: true, force: true }); }
});
test('installation refuses runtime or launcher nested in an official app or in each other', () => {
  const f = fixture();
  try {
    assert.throws(() => install({ ...f.paths, prefix: path.join(f.build.app, 'new-prefix') }, f.build, f.options), /OVERLAP/);
    assert.throws(() => install({ ...f.paths, launcher: path.join(f.paths.prefix, 'nested.app') }, f.build, f.options), /OVERLAP/);
    assert(fs.existsSync(path.join(f.build.app, 'original')));
  } finally { fs.rmSync(f.home, { recursive: true, force: true }); }
});
test('failed compilation rolls back new runtime and leaves existing application alone', () => {
  const f = fixture();
  try {
    assert.throws(() => install(f.paths, f.build, { ...f.options, compile: () => { throw new Error('compile failed'); } }), /compile failed/);
    assert(!fs.existsSync(f.paths.runtime)); assert(!fs.existsSync(f.paths.launcher));
    assert(fs.existsSync(path.join(f.build.app, 'original')));
  } finally { fs.rmSync(f.home, { recursive: true, force: true }); }
});
test('dependency links stay relative within the installed tree and external links are refused', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-zh-copy-'));
  try {
    const source = path.join(root, 'source'); fs.mkdirSync(source);
    fs.mkdirSync(path.join(source, 'package')); fs.writeFileSync(path.join(source, 'package', 'index.js'), 'portable');
    fs.symlinkSync('package', path.join(source, 'linked'));
    const dest = path.join(root, 'copy'); copyTree(source, dest);
    assert(fs.lstatSync(path.join(dest, 'linked')).isSymbolicLink());
    assert(!path.isAbsolute(fs.readlinkSync(path.join(dest, 'linked'))));
    assert.equal(fs.readFileSync(path.join(dest, 'linked', 'index.js'), 'utf8'), 'portable');
    const outside = path.join(root, 'private'); fs.writeFileSync(outside, 'private');
    fs.symlinkSync(outside, path.join(source, 'outside'));
    assert.throws(() => copyTree(source, path.join(root, 'refused')), /OUTSIDE_INSTALL/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
