# Codex Chinese UI Launcher

An independent third-party macOS launcher for the Simplified Chinese resources
already included in Codex Desktop. Experimental `0.1.0`, MIT. [中文](README.md)

Maintained by [HenryZL-AI](https://github.com/HenryZL-AI).

This is a launcher, not a Codex plugin or Skill. It does not redistribute or
modify the official app, its signature, model/provider settings, API keys or
conversations. There is no model invocation, telemetry, TCP debugging port,
automatic quit, updater patch or login daemon.

Requirements: official Codex Desktop, macOS, Node.js >=22.12.0, pnpm 10.
Validated on Intel macOS with Codex `26.1007.71326`. Apple Silicon and other
builds have not been verified by this project.

```sh
pnpm install --frozen-lockfile --ignore-scripts --prod
node bin/codex-zh.mjs doctor
node bin/codex-zh.mjs validate
node bin/codex-zh.mjs install
```

Set Codex Settings > General > Language to Simplified Chinese. Finish current
work, quit normally, then open `~/Applications/Codex 中文启动.app`. Pin that
separate launcher to the Dock yourself if desired. Existing apps are preserved;
the tool never issues a quit request. The CLI launch stays alive while its
private pipe serves the app; the generated launcher handles that background
process automatically for this app lifetime.

Each build must pass the official signature and translation-contract checks,
then demonstrate actual Chinese sidebar labels in an empty isolated profile.
No prompt is submitted and no real credential is copied to the fixture. The app
itself may fetch normal UI resources. A matching resource/adapter hash cache
avoids repeated isolated tests. Unknown contracts fail closed.

```sh
node bin/codex-zh.mjs launch
node bin/codex-zh.mjs status
node bin/codex-zh.mjs uninstall
```

Quit the tool-owned app normally before uninstalling. Uninstall verifies the
installed inventory and preserves modified or extra files instead of deleting
them blindly. Diagnostic state remains private and is not removed. Opening the
original app directly restores the official launch behavior.

Use `--app /path/to/Codex.app` for a custom official location. `--prefix` and
`--launcher` support explicit separate installation targets. The installer
does not overwrite an existing launcher or install a background service.

For development: `pnpm test`, `pnpm check`, `pnpm release:archive`. The source
archive excludes dependencies, official assets, app binaries, personal files,
logs and screenshots. Install dependencies from the included lockfile.

See [compatibility](docs/COMPATIBILITY.md), [architecture](docs/ARCHITECTURE.md),
[privacy](docs/PRIVACY.md) and [contributing](CONTRIBUTING.md).

This project is not affiliated with or endorsed by OpenAI. Its narrow runtime
adapter uses an internal translation gate that may change. Automatic recovery
and task-log inspection are intentionally outside this first release; they
require separate validation and explicit opt-in before any future inclusion.
