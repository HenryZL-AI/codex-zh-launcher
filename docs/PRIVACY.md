# Privacy and issue reports

The tool has no HTTP client, telemetry endpoint or model-call code. The launched
official application retains its own normal network behavior. The tool does
not change its network settings, account or provider configuration.

Doctor reads the official app signature/resources and only the UI language
preference from local Codex state. It reports version, architecture, booleans
and normal-instance count. It does not output that state's other contents.

Validation creates a separate empty app profile. Its fixture credential is
invalid and local-only; no real key, auth token, account or conversation is
copied into it. Verification reads only known sidebar labels. Local state can
include installation paths, version, PIDs and digests. `--capture` additionally
retains the isolated profile and its sidebar image; treat these as private.
The official app can write diagnostics in that empty profile.

Do not attach your CODEX_HOME, normal profile, auth.json, config.toml, raw logs,
full desktop screenshots or conversation exports to public issues. Report the
tool version, macOS version, CPU architecture, Codex build and the displayed
error code. Review every diagnostic before sharing it.

For a security issue, first check whether it concerns this launcher or the
separately installed official application. The source distribution includes no
private communication endpoint; do not put secrets or exploit credentials in
public issue bodies. Reproduce with synthetic fixtures where possible.
