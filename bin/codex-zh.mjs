#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {execFileSync} from 'node:child_process';
import {locations, selectApp, inspectApp, runningInstances, sameBuild} from '../src/platform.mjs';
import {validateBuild, runApp} from '../src/launcher.mjs';
import {install, uninstall} from '../src/install.mjs';
import {acquireLock, readJSON, alive} from '../src/storage.mjs';

const help = `codex-zh 0.1.0 (experimental, macOS)

  doctor       Read-only app signature/resource/locale check
  validate     Verify Chinese sidebar in a separate empty profile
  launch       Open through the Chinese adapter; never quits an existing app
  status       Read this launcher's current verification status
  install      Create a separate user-level launcher app
  uninstall    Remove only an unchanged installation owned by this tool

  --app PATH          Installed official Codex .app (auto-detected by default)
  --prefix PATH       Tool installation directory (does not replace Codex)
  --state-dir PATH    Validation/status directory; launch/validate/status only
  --launcher PATH     User-level .app path; install/uninstall only
  --fresh             Re-run isolated validation rather than reuse a matching cache
  --capture           Retain isolated test sidebar image and profile (private)
  --help              Show this help

Set Codex Settings > General > Language to Simplified Chinese before launch.
No model/API configuration, automatic quit, login hook, daemon or updater patch.
`;
const explain = {
  CODEX_APP_NOT_FOUND: '未找到已安装的官方 Codex。请用 --app 指定 .app 路径。',
  MACOS_REQUIRED: '此版本仅支持 macOS。',
  LOCALE_NOT_CHINESE: '请先在 Codex 设置中将语言选为简体中文，正常退出后再用中文入口启动。',
  TRANSLATION_CONTRACT_CHANGED: '此构建的翻译接口不匹配，未注入适配器。可直接使用原版应用。',
  ISOLATED_UI_CHECK_FAILED: '独立窗口未验证到 Codex 中文侧栏，未批准此构建。原版应用仍可使用。',
  INSTALL_TARGET_EXISTS: '安装位置已有文件，已保留。请先检查或卸载本工具的旧安装。',
  INSTALLATION_CHANGED_REFUSED: '安装内容已被修改，已停止卸载并保留文件。',
  LAUNCHER_ALREADY_RUNNING: '中文启动器已运行，未创建第二个实例。',
  LAUNCHER_STILL_RUNNING: '中文助手仍在服务应用。请正常退出该实例后再卸载。',
};
const print = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    app: { type: 'string' }, prefix: { type: 'string' }, 'state-dir': { type: 'string' },
    launcher: { type: 'string' }, fresh: { type: 'boolean' }, capture: { type: 'boolean' }, help: { type: 'boolean' },
  } });
  const command = positionals[0] ?? 'help';
  if (values.help || command === 'help') { process.stdout.write(help); }
  else {
    if (!['doctor', 'validate', 'launch', 'status', 'install', 'uninstall'].includes(command) || positionals.length !== 1) throw new Error('INVALID_COMMAND');
    if (values['state-dir'] && ['install', 'uninstall'].includes(command)) throw new Error('STATE_OVERRIDE_NOT_ALLOWED_FOR_INSTALL');
    const paths = locations({ prefix: values.prefix, stateDir: values['state-dir'], launcher: values.launcher });
    if (command === 'status') {
      const status = readJSON(path.join(paths.state, 'status.json'), { stage: 'not-started', verified: false });
      const live = alive(status.appPid) && alive(status.helperPid);
      print({ ...status, verified: status.stage === 'verified' && status.verified && live, processesAlive: live });
    } else if (command === 'uninstall') print(uninstall(paths));
    else {
      const build = inspectApp(selectApp(values.app));
      const settings = readJSON(path.join(paths.codexHome, '.codex-global-state.json'), {});
      const atom = settings['electron-persisted-atom-state'] ?? {};
      const locale = atom.localeOverride ?? atom.locale;
      if (command === 'doctor') print({ version: build.version, signatureVerified: build.signatureVerified,
        translationContract: build.contract, locale: locale ?? 'system-default', platform: process.platform,
        architecture: process.arch, existingNormalInstances: runningInstances(build, paths.profile).length,
        backgroundService: false, stateWritten: false });
      else if (command === 'install') print(install(paths, build));
      else {
        const running = command === 'launch' ? runningInstances(build, paths.profile) : [];
        if (running.length) {
          execFileSync('/usr/bin/open', ['-a', build.app], { stdio: 'ignore', timeout: 5000 });
          const status = readJSON(path.join(paths.state, 'status.json'), {});
          print({ stage: status.stage === 'verified' && status.verified && status.version === build.version &&
            status.appPid === running[0].pid && alive(status.helperPid) ? 'already-localized' : 'quit-and-use-chinese-launcher',
            existingAppPreserved: true, quitRequested: false });
        } else {
          const releaseLock = acquireLock(path.join(paths.state, 'launch.lock'));
          try {
            if (command === 'launch') {
              if (locale !== 'zh-CN') throw new Error('LOCALE_NOT_CHINESE');
              await validateBuild(build, paths, { fresh: values.fresh, capture: values.capture });
              if (!sameBuild(build, inspectApp(build.app))) throw new Error('BUILD_CHANGED_BEFORE_LAUNCH');
              if (runningInstances(build, paths.profile).length) throw new Error('NORMAL_APP_STARTED_DURING_VALIDATION');
              print({ stage: 'starting', version: build.version });
              await runApp(build, paths);
            } else print(await validateBuild(build, paths, { fresh: values.fresh, capture: values.capture }));
          } finally { releaseLock(); }
        }
      }
    }
  }
} catch (error) {
  const code = /^[A-Z_]+$/.test(error.message) ? error.message : 'OPERATION_FAILED';
  process.stderr.write(JSON.stringify({ error: code, message: explain[code] ?? '操作未完成，现有应用和用户配置保留。请检查环境及已验证版本。' }) + '\n');
  process.exitCode = 1;
}
