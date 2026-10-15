import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync, spawnSync} from 'node:child_process';
import {extractFile, listPackage} from '@electron/asar';
import {fileURLToPath} from 'node:url';
import {sha256} from './storage.mjs';

export const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
export const adapterFile = fileURLToPath(new URL('./translation-adapter.js', import.meta.url));
export function locations(options = {}, home = os.homedir()) {
  const prefix = path.resolve(options.prefix ?? path.join(home, 'Library', 'Application Support', 'CodexZhLauncher'));
  return { prefix, state: path.resolve(options.stateDir ?? path.join(prefix, 'state')),
    runtime: path.join(prefix, 'runtime'),
    launcher: path.resolve(options.launcher ?? path.join(home, 'Applications', 'Codex 中文启动.app')),
    profile: path.join(home, 'Library', 'Application Support', 'Codex'),
    codexHome: path.resolve(process.env.CODEX_HOME ?? path.join(home, '.codex')) };
}
export function selectApp(requested, home = os.homedir()) {
  const candidates = requested ? [path.resolve(requested)] : [
    '/Applications/Codex.app', '/Applications/ChatGPT.app',
    path.join(home, 'Applications', 'Codex.app'), path.join(home, 'Applications', 'ChatGPT.app'),
  ];
  const app = candidates.find(app => fs.existsSync(path.join(app, 'Contents', 'Resources', 'app.asar')));
  if (!app) throw new Error('CODEX_APP_NOT_FOUND');
  return app;
}
export function readPlist(app, key) {
  return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, path.join(app, 'Contents', 'Info.plist')],
    { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
export function inspectContract(source, messages) {
  return /72216192[\s\S]{0,160}get\([`'"]enable_i18n[`'"],\s*(?:!1|false)\)/.test(source) &&
    messages.includes('新聊天') && messages.includes('定时任务');
}
export function inspectApp(app) {
  if (process.platform !== 'darwin') throw new Error('MACOS_REQUIRED');
  if (readPlist(app, 'CFBundleIdentifier') !== 'com.openai.codex') throw new Error('NOT_CODEX_DESKTOP');
  execFileSync('/usr/bin/codesign', ['--verify', '--strict', app], { timeout: 30000, stdio: 'pipe' });
  const signing = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=2', app], { encoding: 'utf8', timeout: 5000 });
  if (signing.status !== 0) throw new Error('APP_SIGNATURE_CHECK_FAILED');
  const team = signing.stdout + signing.stderr;
  if (!/^TeamIdentifier=2DC432GLL2$/m.test(team)) throw new Error('UNEXPECTED_APP_SIGNER');
  const archive = path.join(app, 'Contents', 'Resources', 'app.asar');
  const executableName = readPlist(app, 'CFBundleExecutable');
  if (!/^[A-Za-z0-9 _-]+$/.test(executableName)) throw new Error('INVALID_APP_EXECUTABLE');
  const executable = path.join(app, 'Contents', 'MacOS', executableName);
  const files = listPackage(archive);
  const initial = files.find(f => /^\/webview\/assets\/app-initial-[^/]+\.js$/.test(f));
  const locale = files.find(f => /^\/webview\/assets\/zh-CN-[^/]+\.js$/.test(f));
  const contract = Boolean(initial && locale && inspectContract(
    extractFile(archive, initial.slice(1)).toString(), extractFile(archive, locale.slice(1)).toString()));
  return { app, executable, version: readPlist(app, 'CFBundleShortVersionString'),
    archiveSha256: sha256(archive), executableSha256: sha256(executable),
    adapterSha256: sha256(adapterFile), contract, signatureVerified: true };
}
export const sameBuild = (a, b) => ['version', 'archiveSha256', 'executableSha256', 'adapterSha256'].every(key => a?.[key] === b?.[key]);
export function runningInstances(build, profile) {
  const rows = execFileSync('/bin/ps', ['-A', '-o', 'pid=,comm='], { encoding: 'utf8', timeout: 5000 }).split('\n');
  return rows.flatMap(row => {
    const match = row.trim().match(/^(\d+)\s+(.+)$/);
    if (match?.[2] !== build.executable) return [];
    const pid = Number(match[1]);
    try {
      const args = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8', timeout: 5000 });
      const selected = args.match(/--user-data-dir=(.*?)(?=\s--|$)/)?.[1]?.trim();
      return selected && selected !== profile ? [] : [{ pid }];
    } catch { return []; }
  });
}
