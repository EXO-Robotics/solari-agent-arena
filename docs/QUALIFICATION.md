# Qualification ledger

Evidence states are intentionally explicit:

- `LOCAL_PASS`: evaluator logic passed on the development host; no Solari claim.
- `SOLARI_PASS`: the official SDK created/ran/killed a Sandbox and returned a valid run artifact.
- `BROWSER_PASS`: a recording-enabled Solari Browser verified the deployed artifact and replay.
- `PENDING`: not yet run or retained.

| Case | Local | Solari Sandbox | Solari Browser | Evidence |
|---|---|---|---|---|
| Agent tool clock | `LOCAL_PASS` — observe, wait one wall second, observe; simulated time stayed fixed | Not applicable; browser tool behavior | `BROWSER_PASS` — 750 ms wall delay left displayed simulation time at 0.00 s | `evidence/agent-e2e/cdfd67c8-8dc3-4f50-b5ea-7e519c2cd89f/assertions.json` |
| Valid agent transcript, seed 42 | `LOCAL_PASS` — deterministic, 5/5, 21 actions, 26.124 s, zero collisions | `SOLARI_PASS` — two fresh Sandboxes produced identical metrics and telemetry hash `f87f2653…71dfbcf`; teardown confirmed | `BROWSER_PASS` — numeric UI completed 5/5 with exact transcript; all artifact fields matched; replay `COMPLETE` | `public/evidence/valid-agent.solari-run.json`; `public/evidence/agent-qualification-summary.json`; `evidence/agent-e2e/cdfd67c8-8dc3-4f50-b5ea-7e519c2cd89f/assertions.json` |
| Valid controller, seed 42 | `LOCAL_PASS` — deterministic hash/metrics, 4/4, zero collisions | `SOLARI_PASS` — succeeded, result `2704f608…f74dd2c0` | `BROWSER_PASS` — all evidence fields matched; replay reached `COMPLETE` | `public/evidence/valid.solari-run.json`; `evidence/e2e/b1706f4c-95e6-4245-85e9-6674f97834bb/assertions.json` |
| Hanging controller | `LOCAL_PASS` — QuickJS interrupt, exit 124 | `SOLARI_PASS` — timeout, teardown confirmed, result `1ec51d60…38987f47` | Not applicable to empty replay | `public/evidence/hanging.solari-run.json` |
| Capability probe | `LOCAL_PASS` — `process` absent, runner-only failure | `SOLARI_PASS` — rejected, teardown confirmed, result `2e433ca7…aeb73bc6` | Not applicable to empty replay | `public/evidence/capability-attempt.solari-run.json` |
| Valid after both failures | Same controller/seed as first valid run | `SOLARI_PASS` — identical telemetry/metrics, result `c303aef7…f490b0d5` | Not applicable; first valid artifact is the public replay | `public/evidence/valid-after-failures.solari-run.json` |

## Local commands

```bash
npm run qualify:local
npm run qualify:solari-agent
npm test
npm run build
```

## Live milestone

Completed 2026-09-01 with `@solarisdk/sandbox` 0.1.2 against template `base`. The final valid run reproduced telemetry hash `3147f1ebe1ef4070ac8168ceed35fd53d1c95799d3a6c787701fc145b2d35cfe` after both failure cases. Every issued contract reports `sandboxTerminated: true`. This proves evaluator-service recovery under the tested sequence; it is not physical-host forensics or remote attestation.

The agent transcript milestone also completed on 2026-09-01. Run IDs `cdfd67c8-8dc3-4f50-b5ea-7e519c2cd89f` and `4421a877-00ec-4e73-a711-7fcba6141c60` each completed 5/5 checkpoints in 21 actions, 26.124 simulated seconds, zero collisions, and score 14,304. Both fresh Sandboxes produced telemetry hash `f87f265301a8d64d54a85761f912cc5a5e812af96f46bf654a2ece03571dfbcf` and confirmed teardown.

## Production Browser milestone

Completed 2026-09-01 with `@solarisdk/browser` 0.1.2 against [the production replay](https://solari-agent-arena.vercel.app/?evidence=%2Fevidence%2Fvalid.solari-run.json) for deployed commit `8ec6c39afa07f7460b957b91d7a9abdb489737b7`. The verifier independently matched run ID, controller hash, seed, outcome, checkpoints, score, time, collisions, telemetry hash, and result hash, asserted the global phase was `READY`, then waited for both replay and global phase state `COMPLETE`. Recording was enabled. Retained evidence:

- [`assertions.json`](../evidence/e2e/b1706f4c-95e6-4245-85e9-6674f97834bb/assertions.json)
- [`loaded.png`](../evidence/e2e/b1706f4c-95e6-4245-85e9-6674f97834bb/loaded.png)
- [`replay-complete.png`](../evidence/e2e/b1706f4c-95e6-4245-85e9-6674f97834bb/replay-complete.png)
- [`solari-browser-replay.ndjson`](../evidence/e2e/b1706f4c-95e6-4245-85e9-6674f97834bb/solari-browser-replay.ndjson)
- [`hashes.json`](../evidence/e2e/b1706f4c-95e6-4245-85e9-6674f97834bb/hashes.json)

The embodied-agent production proof completed against deployed commit `8ee3d76e2a0e723792e2a7882a8787f260f1a4d1`. A recording-enabled Solari Browser used the reviewer-visible numeric action form to submit all 21 bounded actions, proved a 750 ms wall delay consumed zero simulated time, reached 5/5 with zero collisions, and read back the exact transcript. It then loaded run `cdfd67c8-8dc3-4f50-b5ea-7e519c2cd89f`, matched run/transcript/outcome/checkpoint/score/time/collision/seed/telemetry/result fields, and waited for replay `COMPLETE`. The browser trial completed at 26.69 s while the authoritative Sandbox artifact completed at 26.124 s; this expected cross-runtime difference is why browser output is explicitly non-authoritative. Retained proof:

- [`assertions.json`](../evidence/agent-e2e/cdfd67c8-8dc3-4f50-b5ea-7e519c2cd89f/assertions.json)
- [`agent-course-complete.png`](../evidence/agent-e2e/cdfd67c8-8dc3-4f50-b5ea-7e519c2cd89f/agent-course-complete.png)
- [`authoritative-artifact-loaded.png`](../evidence/agent-e2e/cdfd67c8-8dc3-4f50-b5ea-7e519c2cd89f/authoritative-artifact-loaded.png)
- [`authoritative-replay-complete.png`](../evidence/agent-e2e/cdfd67c8-8dc3-4f50-b5ea-7e519c2cd89f/authoritative-replay-complete.png)
- [`solari-browser-replay.ndjson`](../evidence/agent-e2e/cdfd67c8-8dc3-4f50-b5ea-7e519c2cd89f/solari-browser-replay.ndjson)
