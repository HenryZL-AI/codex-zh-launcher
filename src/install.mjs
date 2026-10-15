import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {sourceRoot} from './platform.mjs';
import {atomicJSON, assertNoSymlinks, readJSON, sha256, alive} from './storage.mjs';

export const shellQuote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
const applescriptString = value => JSON.stringify(value);
export function copyTree(source, destination, boundary = fs.realpathSync(source), ancestors = new Set(), destinationRoot = destination) {
  const real = fs.realpathSync(source);
  if (real !== boundary && !real.startsWith(boundary + path.sep)) throw new Error('DEPENDENCY_OUTSIDE_INSTALL_REFUSED');
  if (fs.lstatSync(source).isSymbolicLink()) {
    const mapped = path.join(destinationRoot, path.relative(boundary, real));
    fs.symlinkSync(path.relative(path.dirname(destination), mapped), destination);
    return;
  }
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    if (ancestors.has(real)) throw new Error('DEPENDENCY_LINK_CYCLE');
    const next = new Set(ancestors); next.add(real);
    fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
    for (const name of fs.readdirSync(source)) copyTree(path.join(source, name), path.join(destination, name), boundary, next, destinationRoot);
  } else if (stat.isFile()) {
    fs.copyFileSync(real, destination);
    fs.chmodSync(destination, stat.mode & 0o777);
  } else throw new Error('SPECIAL_FILE_REFUSED');
}
export function launcherScript(node, cli, options, logFile) {
  const args = [node, cli, 'launch', '--app', options.app, '--prefix', options.prefix];
  const command = `/usr/bin/nohup ${args.map(shellQuote).join(' ')} >>${shellQuote(logFile)} 2>&1 &`;
  return `on run\n  do shell script ${applescriptString(command)}\nend run\non reopen\n  run\nend reopen\n`;
}
export function inventory(directory) {
  assertNoSymlinks(directory);
  const result = {};
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        const target = fs.readlinkSync(file);
        const resolved = path.resolve(path.dirname(file), target);
        if (path.isAbsolute(target) || !resolved.startsWith(path.resolve(directory) + path.sep)) throw new Error('INSTALLED_SYMLINK_REFUSED');
        result[path.relative(directory, file)] = { link: target };
      } else if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) result[path.relative(directory, file)] = sha256(file);
      else throw new Error('SPECIAL_FILE_REFUSED');
    }
  }
  walk(directory); return result;
}
export function install(paths, build, { root = sourceRoot, node = process.execPath,
  compile = (script, output) => execFileSync('/usr/bin/osacompile', ['-o', output, '-e', script], { stdio: 'pipe', timeout: 30000 }) } = {}) {
  for (const file of [paths.prefix, paths.runtime, paths.state, paths.launcher]) assertNoSymlinks(file);
  if (fs.existsSync(paths.runtime) || fs.existsSync(paths.launcher) || fs.existsSync(path.join(paths.prefix, 'installation.json'))) {
    throw new Error('INSTALL_TARGET_EXISTS');
  }
  if (path.extname(paths.launcher) !== '.app' || paths.launcher === build.app || paths.launcher.startsWith(build.app + path.sep)) {
    throw new Error('INVALID_LAUNCHER_TARGET');
  }
  if (paths.prefix === build.app || paths.prefix.startsWith(build.app + path.sep) ||
      paths.launcher === paths.prefix || paths.launcher.startsWith(paths.prefix + path.sep) ||
      paths.prefix.startsWith(paths.launcher + path.sep)) throw new Error('INSTALL_PATH_OVERLAP_REFUSED');
  fs.mkdirSync(paths.prefix, { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.dirname(paths.launcher), { recursive: true });
  const stage = fs.mkdtempSync(path.join(paths.prefix, '.install-'));
  const appStage = path.join(path.dirname(paths.launcher), `.codex-zh-${crypto.randomUUID()}.app`);
  let runtimeMoved = false, appMoved = false;
  try {
    for (const name of ['src', 'bin', 'package.json', 'LICENSE', 'NOTICE', 'node_modules']) {
      copyTree(path.join(root, name), path.join(stage, name));
    }
    fs.mkdirSync(paths.state, { recursive: true, mode: 0o700 });
    const script = launcherScript(node, path.join(paths.runtime, 'bin', 'codex-zh.mjs'),
      { app: build.app, prefix: paths.prefix }, path.join(paths.state, 'launcher.log'));
    compile(script, appStage);
    fs.renameSync(stage, paths.runtime); runtimeMoved = true;
    fs.renameSync(appStage, paths.launcher); appMoved = true;
    atomicJSON(path.join(paths.prefix, 'installation.json'), {
      tool: 'codex-zh-launcher', schema: 1, version: '0.1.0', runtime: paths.runtime, launcher: paths.launcher,
      installedAt: new Date().toISOString(), runtimeFiles: inventory(paths.runtime), launcherFiles: inventory(paths.launcher),
    });
    return { installed: true, launcher: paths.launcher, runtime: paths.runtime, backgroundService: false };
  } catch (error) {
    if (runtimeMoved) fs.rmSync(paths.runtime, { recursive: true });
    if (appMoved) fs.rmSync(paths.launcher, { recursive: true });
    throw error;
  } finally {
    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true });
    if (fs.existsSync(appStage)) fs.rmSync(appStage, { recursive: true });
  }
}
export function uninstall(paths) {
  for (const file of [paths.prefix, paths.runtime, paths.launcher]) assertNoSymlinks(file);
  const manifestFile = path.join(paths.prefix, 'installation.json');
  assertNoSymlinks(manifestFile);
  const manifest = readJSON(manifestFile, null);
  if (!manifest || manifest.tool !== 'codex-zh-launcher' || manifest.schema !== 1 ||
      manifest.runtime !== paths.runtime || manifest.launcher !== paths.launcher) throw new Error('INSTALL_MANIFEST_MISMATCH');
  if (!manifest.runtimeFiles || !manifest.launcherFiles || path.extname(paths.launcher) !== '.app' ||
      paths.launcher === paths.prefix || paths.launcher.startsWith(paths.prefix + path.sep) ||
      paths.prefix.startsWith(paths.launcher + path.sep)) throw new Error('INSTALL_MANIFEST_MISMATCH');
  const lock = readJSON(path.join(paths.state, 'launch.lock', 'owner.json'), null);
  if (lock && alive(lock.pid)) throw new Error('LAUNCHER_STILL_RUNNING');
  for (const [directory, expected] of [[paths.runtime, manifest.runtimeFiles], [paths.launcher, manifest.launcherFiles]]) {
    const actual = inventory(directory);
    if (JSON.stringify(Object.entries(actual).sort()) !== JSON.stringify(Object.entries(expected).sort())) throw new Error('INSTALLATION_CHANGED_REFUSED');
  }
  fs.rmSync(paths.launcher, { recursive: true });
  fs.rmSync(paths.runtime, { recursive: true });
  fs.unlinkSync(manifestFile);
  return { uninstalled: true, officialAppChanged: false, userConfigChanged: false, statePreserved: true };
}
