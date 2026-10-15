# Architecture and authority

`bin/codex-zh.mjs` exposes doctor, validate, launch, status, install and uninstall.
`platform.mjs` discovers the installed official app and reads its existing
resources with `@electron/asar`. Signature verification requires the Codex
bundle ID and OpenAI signing team. No archive writes or signature changes occur.

`launcher.mjs` runs that same executable with the normal profile and a private
Chromium debugging pipe. `translation-adapter.js` is installed at document
startup and returns immediately outside internal `app://-/` pages. It overrides
only `enable_i18n` for the known translation layer and delegates other calls.
No DevTools TCP listener, process attachment or credentials are added.

The helper remains alive for that owned app lifetime. It does not issue quit,
reload, kill, model, payment or account requests. Existing normal instances are
activated and preserved; they cannot be retroactively translated through a new
startup pipe. The launcher tells the user to quit normally and use this entry.

New builds are first opened in an empty profile and separate CODEX_HOME using
a deliberately invalid local-only fixture credential and loopback model URL.
The tool never submits a prompt. Browser.close is used only to end this owned
empty test window. UI evidence is cached by exact build and adapter digest.
Temporary fixture profiles are removed unless --capture explicitly retains them.

Installation copies only tool code and installed dependencies into a separate
user-level runtime, compiles an original generic AppleScript app, and records
file digests. It does not modify Dock, Login Items, LaunchAgents, model settings
or the official app. Uninstall requires this manifest and unchanged files.
No administrator password or new accessibility permission is required.

The existing private machine repair system is not part of this release.
Automatic recovery, task scanning and after-turn quit coordination are omitted.
This keeps the first public interface small and avoids repeating restart races
or the official scheduled-task quit-confirmation behavior.
