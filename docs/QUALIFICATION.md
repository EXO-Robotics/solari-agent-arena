# Qualification ledger

Evidence states are intentionally explicit:

- `LOCAL_PASS`: evaluator logic passed on the development host; no Solari claim.
- `SOLARI_PASS`: the official SDK created/ran/killed a Sandbox and returned a valid run artifact.
- `BROWSER_PASS`: a recording-enabled Solari Browser verified the deployed artifact and replay.
- `PENDING`: not yet run or retained.

| Case | Local | Solari Sandbox | Solari Browser | Evidence |
|---|---|---|---|---|
| Valid controller, seed 42 | `LOCAL_PASS` — deterministic hash/metrics, 4/4, zero collisions | `PENDING` | `PENDING` | `public/evidence/valid.solari-run.json` after live run |
| Hanging controller | `LOCAL_PASS` — QuickJS interrupt, exit 124 | `PENDING` | Not applicable to empty replay | `public/evidence/hanging.solari-run.json` after live run |
| Capability probe | `LOCAL_PASS` — `process` absent, runner-only failure | `PENDING` | Not applicable to empty replay | `public/evidence/capability-attempt.solari-run.json` after live run |

## Local commands

```bash
npm run qualify:local
npm test
npm run build
```

## Live milestone

The live qualification must run valid → hanging → capability attempt → valid again. The final valid run demonstrates evaluator-service health after both failure cases; it is the meaningful recovery observation instead of a hardcoded per-run “host unaffected” boolean. Every issued contract must report `sandboxTerminated: true`; infrastructure or unconfirmed-teardown failures must issue no authoritative artifact.
