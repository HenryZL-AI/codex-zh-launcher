import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {PrivatePipe} from './cdp.mjs';
import {adapterFile, inspectApp, sameBuild} from './platform.mjs';
import {atomicJSON, readJSON} from './storage.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export const englishLabels = ['New chat', 'Scheduled', 'Plugins', 'Explore', 'Pinned'];
export const uiReady = data => data?.surface === 'Codex' && data.lang === 'zh-CN' &&
  ['新聊天', '定时任务', '插件'].every(label => data.labels?.includes(label)) &&
  !englishLabels.some(label => data.labels?.includes(label));
const expression = `(() => {
  if (location.protocol !== 'app:' || location.hostname !== '-') return null;
  const wanted = ['新聊天','定时任务','插件','探索','置顶','New chat','Scheduled','Plugins','Explore','Pinned','Codex','ChatGPT Work'];
  const labels = new Set();
  for (const element of document.querySelectorAll('button,a,span,div,p,summary')) {
    const rect = element.getBoundingClientRect();
    if (rect.width<=0 || rect.height<=0 || rect.x<0 || rect.x>400 || rect.y>650) continue;
    const text = element.textContent.trim(); if (wanted.includes(text)) labels.add(text);
  }
  const header=Array.from(document.querySelectorAll('button')).find(b=>['Codex','ChatGPT Work'].includes(b.innerText.trim()));
  return JSON.stringify({surface:header?.innerText.trim(),lang:document.documentElement.lang,labels:[...labels]});
})()`;

export function createFixture(root) {
  const profile = path.join(root, 'profile'), codexHome = path.join(root, 'codex-home');
  for (const dir of [profile, codexHome]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(codexHome, 'config.toml'),
    'model = "local-ui-only"\nmodel_provider = "ui-fixture"\n[model_providers.ui-fixture]\nname = "Local UI fixture"\nbase_url = "http://127.0.0.1:9/v1"\nwire_api = "responses"\nrequires_openai_auth = true\n[features]\nhooks = false\n', { mode: 0o600 });
  atomicJSON(path.join(codexHome, 'auth.json'), { OPENAI_API_KEY: 'local-ui-fixture-not-a-real-key' });
  atomicJSON(path.join(codexHome, '.codex-global-state.json'), {
    'electron-persisted-atom-state': { locale: 'zh-CN', localeOverride: 'zh-CN',
      'home-composer-mode-v1': 'codex',
      'electron:onboarding-override': false, 'electron:onboarding-welcome-pending': false,
      'electron:onboarding-projectless-completed': true, 'electron:onboarding-hide-first-new-thread-promos': true,
      'electron:onboarding-plugin-checklist-active': false, last_completed_onboarding: '2026-10-15' },
  });
  return { profile, codexHome };
}

export async function runApp(build, paths, { isolated = false, deadlineMs = 120000, capture = false } = {}) {
  const statusFile = path.join(paths.state, 'status.json');
  let status = { version: build.version, app: build.app, helperPid: process.pid, isolated, verified: false };
  const record = extra => { status = { ...status, ...extra, updatedAt: new Date().toISOString() }; atomicJSON(statusFile, status); };
  const injection = fs.readFileSync(adapterFile, 'utf8');
  const env = isolated ? { HOME: process.env.HOME, PATH: process.env.PATH,
    TMPDIR: process.env.TMPDIR, LANG: 'zh_CN.UTF-8' } : { ...process.env };
  const child = spawn(build.executable, [`--user-data-dir=${paths.profile}`, '--remote-debugging-pipe'], {
    env: { ...env, CODEX_HOME: paths.codexHome, CODEX_ELECTRON_USER_DATA_PATH: paths.profile },
    stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
  });
  const exited = once(child, 'exit'); exited.catch(() => {});
  const pipe = new PrivatePipe(child); const sessions = new Set();
  let attachmentFailed = false;
  pipe.on('event', message => {
    if (message.method !== 'Target.attachedToTarget' || message.params.targetInfo.type !== 'page') return;
    const { sessionId } = message.params;
    pipe.call('Page.addScriptToEvaluateOnNewDocument', { source: injection, runImmediately: true }, sessionId)
      .then(() => sessions.add(sessionId)).catch(() => { attachmentFailed = true; });
  });
  record({ stage: 'starting', appPid: child.pid });
  let observed;
  let lastDiagnostic;
  try {
    await pipe.call('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    const deadline = Date.now() + deadlineMs;
    while (!pipe.closed && Date.now() < deadline && !observed && !attachmentFailed) {
      await pause(500);
      for (const sessionId of sessions) {
        try {
          const result = await pipe.call('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
          if (typeof result.result?.value !== 'string') continue;
          const data = JSON.parse(result.result.value);
          lastDiagnostic = data;
          if (isolated) record({ stage: 'checking-sidebar', ...data });
          if (!uiReady(data)) continue;
          observed = { ...data, englishLabels: [] };
          record({ stage: 'verified', verified: true, verifiedDuringRun: true, ...observed });
          if (capture && isolated) {
            const screenshot = await pipe.call('Page.captureScreenshot', { format: 'png',
              clip: { x: 0, y: 0, width: 320, height: 390, scale: 1 }, captureBeyondViewport: false }, sessionId);
            fs.writeFileSync(path.join(paths.state, 'sidebar.png'), Buffer.from(screenshot.data, 'base64'), { mode: 0o600 });
          }
          break;
        } catch { if (pipe.closed) break; }
      }
    }
    if (!observed) {
      record({ stage: attachmentFailed ? 'attachment-failed' : 'verification-timeout', verified: false, lastDiagnostic });
      if (capture && isolated) {
        for (const sessionId of sessions) try {
          const screenshot = await pipe.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
          fs.writeFileSync(path.join(paths.state, 'failed-ui.png'), Buffer.from(screenshot.data, 'base64'), { mode: 0o600 });
          break;
        } catch {}
      }
    }
  } finally {
    if (isolated) {
      if (!pipe.closed) await pipe.call('Browser.close').catch(() => {});
      const stopped = pipe.closed || await Promise.race([exited.then(() => true, () => true), pause(10000).then(() => false)]);
      if (!stopped) throw Object.assign(new Error('ISOLATED_CLEANUP_UNCONFIRMED'), { retainFixture: true });
    }
  }
  if (!pipe.closed) await exited;
  record({ stage: 'stopped', verified: false, ...(observed ? { lastVerified: observed } : {}) });
  return { verified: Boolean(observed), observed, appPid: child.pid };
}

export const trustedCache = (cached, build) => sameBuild(cached, build) && cached.ui?.verified === true &&
  uiReady(cached.ui) && cached.ui.englishLabels?.length === 0;

export async function validateBuild(build, paths, options = {}) {
  if (!build.contract) throw new Error('TRANSLATION_CONTRACT_CHANGED');
  const cacheFile = path.join(paths.state, 'validated-builds.json');
  const cache = readJSON(cacheFile, {});
  if (!options.fresh && trustedCache(cache[build.version], build)) return { verified: true, cached: true, version: build.version };
  fs.mkdirSync(paths.state, { recursive: true, mode: 0o700 });
  const fixtureRoot = fs.mkdtempSync(path.join(paths.state, 'validation-'));
  const fixture = createFixture(fixtureRoot);
  let result;
  let retainFixture = options.capture === true;
  try {
    result = await runApp(build, { ...fixture, state: fixtureRoot }, { isolated: true, capture: options.capture === true });
    if (!result.verified) throw new Error('ISOLATED_UI_CHECK_FAILED');
    if (!sameBuild(build, inspectApp(build.app))) throw new Error('BUILD_CHANGED_DURING_VALIDATION');
    cache[build.version] = { version: build.version, archiveSha256: build.archiveSha256,
      executableSha256: build.executableSha256, adapterSha256: build.adapterSha256,
      ui: { verified: true, ...result.observed }, verifiedAt: new Date().toISOString() };
    atomicJSON(cacheFile, cache);
    return { verified: true, cached: false, version: build.version };
  } catch (error) {
    if (error.retainFixture) retainFixture = true;
    throw error;
  } finally {
    // Keep only value-free verification; temporary profiles can contain ordinary app diagnostics.
    if (!retainFixture) fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}
