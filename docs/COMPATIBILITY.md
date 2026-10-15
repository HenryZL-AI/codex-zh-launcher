# Compatibility

| Platform | Build | Evidence | Status |
| --- | --- | --- | --- |
| macOS Intel x86_64 | 26.1007.71326 | Official signature + fresh-profile sidebar test | Verified for this build |
| macOS Apple Silicon | Any | No project-owned machine test | Not yet verified |
| Windows / Linux | Any | No platform adapter | Unsupported in 0.1.0 |

Run `doctor` and `validate --fresh` on your own installed build. A version string
alone is never sufficient: cache identity includes archive, executable and
translation-adapter hashes. A source-contract change or missing Chinese labels
does not become a success just because the app starts.

The adapter recognizes the current bundled translation gate and requires the
Codex surface, `lang=zh-CN`, 新聊天/定时任务/插件 and no matching English sidebar
labels. It reads only this small UI label set, not chat contents.

Set Simplified Chinese through the official settings first. Work-only views,
other products, arbitrary websites and native menu wording are not evidence
that the Codex sidebar has been localized. An app relaunch through the official
updater may bypass this separate entry; open the Chinese launcher after a
normal quit. No automatic upgrade/restart reliability is claimed.

Do not remove signature or UI gates to support a new build. Obtain fresh local
evidence and add regression coverage for the changed contract. The project
does not copy the official app or its translation dictionary into releases.
