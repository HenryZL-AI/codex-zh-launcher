# Contributing

Use Node >=22.12.0 and pnpm 10. Install with the frozen lockfile and scripts
disabled, then run `pnpm test` and `pnpm check`.

Keep changes narrow. Tests should assert observable behavior: preserve other
feature flags, reject invalid UI proof, preserve original apps, refuse changed
uninstall inventories and keep credentials out of source archives. Do not copy
real user configurations or official app files into test fixtures.

CI runs deterministic unit and release-content checks. It does not download
Codex or claim live macOS compatibility. Live verification requires an already
installed signed official app; record version, architecture and safe result
booleans after a fresh isolated test. Do not attach private profiles or screenshots.

No automatic app termination, background recovery, account integration or new
permissions belong in a routine compatibility patch. Such functionality needs
its own design, user opt-in and real lifecycle testing. Never weaken signature
or translation validation to make a check green.
