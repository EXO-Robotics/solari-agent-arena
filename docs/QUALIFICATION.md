# Qualification ledger

Evidence states are intentionally explicit:

- `LOCAL_PASS`: evaluator logic passed on the development host; no Solari claim.
- `SOLARI_PASS`: the official SDK created/ran/killed a Sandbox and returned a valid run artifact.
- `BROWSER_PASS`: a recording-enabled Solari Browser verified the deployed artifact and replay.
- `PENDING`: not yet run or retained.

| Case | Local | Solari Sandbox | Solari Browser | Evidence |
|---|---|---|---|---|
| Valid controller, seed 42 | `LOCAL_PASS` — deterministic hash/metrics, 4/4, zero collisions | `SOLARI_PASS` — succeeded, result `2704f608…f74dd2c0` | `PENDING` | `public/evidence/valid.solari-run.json` |
| Hanging controller | `LOCAL_PASS` — QuickJS interrupt, exit 124 | `SOLARI_PASS` — timeout, teardown confirmed, result `1ec51d60…38987f47` | Not applicable to empty replay | `public/evidence/hanging.solari-run.json` |
| Capability probe | `LOCAL_PASS` — `process` absent, runner-only failure | `SOLARI_PASS` — rejected, teardown confirmed, result `2e433ca7…aeb73bc6` | Not applicable to empty replay | `public/evidence/capability-attempt.solari-run.json` |
| Valid after both failures | Same controller/seed as first valid run | `SOLARI_PASS` — identical telemetry/metrics, result `c303aef7…f490b0d5` | Not applicable; first valid artifact is the public replay | `public/evidence/valid-after-failures.solari-run.json` |

## Local commands

```bash
npm run qualify:local
npm test
npm run build
```

## Live milestone

Completed 2026-09-01 with `@solarisdk/sandbox` 0.1.2 against template `base`. The final valid run reproduced telemetry hash `3147f1ebe1ef4070ac8168ceed35fd53d1c95799d3a6c787701fc145b2d35cfe` after both failure cases. Every issued contract reports `sandboxTerminated: true`. This proves evaluator-service recovery under the tested sequence; it is not physical-host forensics or remote attestation.
