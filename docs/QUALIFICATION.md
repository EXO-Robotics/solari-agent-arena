# Qualification ledger

Evidence states are intentionally explicit:

- `LOCAL_PASS`: evaluator logic passed on the development host; no Solari claim.
- `SOLARI_PASS`: the official SDK created/ran/killed a Sandbox and returned a valid run artifact.
- `BROWSER_PASS`: a recording-enabled Solari Browser verified the deployed artifact and replay.
- `PENDING`: not yet run or retained.

| Case | Local | Solari Sandbox | Solari Browser | Evidence |
|---|---|---|---|---|
| Agent tool clock | `LOCAL_PASS` — observe, wait one wall second, observe; simulated time stayed fixed | Not applicable; browser tool behavior | `BROWSER_PASS` — 750 ms wall delay left displayed simulation time at 0.00 s | `evidence/agent-e2e/0472ad47-5a2c-4c7f-9dd5-a590ada0880d/assertions.json` |
| Fresh Codex/Luna connection | `LOCAL_PASS` — a new ephemeral Luna task loaded the globally registered stdio server, called open → observe → close, and required neither shell nor a pre-opened tab | Not applicable; connection transport only | `BROWSER_PASS` transport — `arena_open` launched and closed a recording-enabled Solari Browser; replay retention was deliberately disabled for this connection check | `evidence/codex-connection/luna-clean-task.json` |
| Local-model MCP transport | `LOCAL_PASS` — real stdio MCP handshake rejected a missing course ID, selected First Steps exactly, proved reset and an exact 800 ms action, then completed the 21-action 5/5 official course | Not applicable; connection transport only | `BROWSER_PASS` transport — bridge launched two recording-enabled Solari Browser sessions against production and retained the official session; not a scoring claim | `evidence/mcp/9b700e6322ef76d8/assertions.json` |
| Valid agent transcript, seed 42 | `LOCAL_PASS` — deterministic, 5/5, 21 actions, 26.124 s, zero collisions | `SOLARI_PASS` — two fresh Sandboxes produced identical metrics and telemetry hash `f87f2653…71dfbcf`; teardown confirmed | `BROWSER_PASS` — numeric UI completed 5/5 with exact transcript; all artifact fields matched; replay `COMPLETE` | `public/evidence/valid-agent.solari-run.json`; `public/evidence/agent-qualification-summary.json`; `evidence/agent-e2e/0472ad47-5a2c-4c7f-9dd5-a590ada0880d/assertions.json` |
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

The final agent transcript milestone also completed on 2026-09-01. Run IDs `0472ad47-5a2c-4c7f-9dd5-a590ada0880d` and `41501a74-9b9d-4590-b98b-9caee7218691` each completed 5/5 checkpoints in 21 actions, 26.124 simulated seconds, zero collisions, and score 14,304. Both fresh Sandboxes produced telemetry hash `f87f265301a8d64d54a85761f912cc5a5e812af96f46bf654a2ece03571dfbcf` and confirmed teardown.

## Production Browser milestone

Completed 2026-09-01 with `@solarisdk/browser` 0.1.2 against [the production replay](https://solari-agent-arena.vercel.app/?evidence=%2Fevidence%2Fvalid.solari-run.json) for deployed commit `8ec6c39afa07f7460b957b91d7a9abdb489737b7`. The verifier independently matched run ID, controller hash, seed, outcome, checkpoints, score, time, collisions, telemetry hash, and result hash, asserted the global phase was `READY`, then waited for both replay and global phase state `COMPLETE`. Recording was enabled. Retained evidence:

- [`assertions.json`](../evidence/e2e/b1706f4c-95e6-4245-85e9-6674f97834bb/assertions.json)
- [`loaded.png`](../evidence/e2e/b1706f4c-95e6-4245-85e9-6674f97834bb/loaded.png)
- [`replay-complete.png`](../evidence/e2e/b1706f4c-95e6-4245-85e9-6674f97834bb/replay-complete.png)
- [`solari-browser-replay.ndjson`](../evidence/e2e/b1706f4c-95e6-4245-85e9-6674f97834bb/solari-browser-replay.ndjson)
- [`hashes.json`](../evidence/e2e/b1706f4c-95e6-4245-85e9-6674f97834bb/hashes.json)

The final embodied-agent production proof was re-run against deployed course-first UX commit `f68c11c928027d0eacd681fc2d774d2284128864`. A recording-enabled Solari Browser used the reviewer-visible numeric action form to submit all 21 bounded actions, proved a 750 ms wall delay consumed zero simulated time, reached 5/5 with zero collisions, and read back the exact transcript. It then loaded run `0472ad47-5a2c-4c7f-9dd5-a590ada0880d`, matched run/transcript/outcome/checkpoint/score/time/collision/seed/telemetry/result fields, and waited for replay `COMPLETE`. The browser trial completed at 26.18 s while the authoritative Sandbox artifact completed at 26.124 s; this expected cross-runtime floating-point difference is why browser output is explicitly non-authoritative. Retained proof:

- [`assertions.json`](../evidence/agent-e2e/0472ad47-5a2c-4c7f-9dd5-a590ada0880d/assertions.json)
- [`agent-course-complete.png`](../evidence/agent-e2e/0472ad47-5a2c-4c7f-9dd5-a590ada0880d/agent-course-complete.png)
- [`authoritative-artifact-loaded.png`](../evidence/agent-e2e/0472ad47-5a2c-4c7f-9dd5-a590ada0880d/authoritative-artifact-loaded.png)
- [`authoritative-replay-complete.png`](../evidence/agent-e2e/0472ad47-5a2c-4c7f-9dd5-a590ada0880d/authoritative-replay-complete.png)
- [`solari-browser-replay.ndjson`](../evidence/agent-e2e/0472ad47-5a2c-4c7f-9dd5-a590ada0880d/solari-browser-replay.ndjson)

The local-model stdio MCP bridge was independently re-exercised against production after the course-binding regression fix. The retained proof rejects `arena_open` without a `courseId`, opens `practice-first-steps-v1` at seed 42, and matches 3 checkpoints with `first-gate` next before any action or simulated time. It then opens the official course, proves reset and zero-cost observation, completes all 5 checkpoints in 21 actions with zero collisions, and retains the canonical transcript, final screenshot, rrweb replay, and hash receipt. Both the session writer and verifier resolve evidence paths from the repository module location rather than the model host's working directory:

- [`MCP assertions.json`](../evidence/mcp/9b700e6322ef76d8/assertions.json)
- [`MCP receipt.json`](../evidence/mcp/9b700e6322ef76d8/receipt.json)
- [`MCP final.png`](../evidence/mcp/9b700e6322ef76d8/final.png)

The deployed root opens on the streamlined course-first onboarding surface. A production page-level browser inspection against commit `419877e966432c3c5722fdbd8c45d77e91844a59` confirmed the official/practice authority labels and one-click course controls without exposing creator/import or trust-boundary controls to a first-time visitor. Retained visual proof of that prelaunch surface: [`course-first-onboarding.png`](../evidence/ux/course-first-onboarding.png).

Public remote practice was then enabled only after Redis/QStash admission and cleanup qualification plus the exact `/api/arena-ticket` WAF observation/rate-limit rule were live; public isolated evaluation remained disabled. Against deployed commit `7764793`, Safari selected First Steps and copied a prompt containing a short one-time run code but no long pairing capability. A fresh projectless `gpt-5.6-luna` task with no repository or MCP completed 3/3 checkpoints in 8 actions, 11.72 simulated seconds, and zero collisions. Browser deletion was accepted, the permission-restricted session file was removed, and the Redis active-lease index returned zero. The receipt is explicitly non-authoritative and has `replayHash: null`, so no practice-replay claim is made. Retained proof:

- [`walkthrough.json`](../evidence/https-agent/practice_51ecfbada19ccea6c3b06744/walkthrough.json)
- [`receipt.json`](../evidence/https-agent/practice_51ecfbada19ccea6c3b06744/receipt.json)
- [`final.png`](../evidence/https-agent/practice_51ecfbada19ccea6c3b06744/final.png)

A later public Luna run reached 2/3 checkpoints before three consecutive generic command `502` responses; its safe disconnect was accepted, but no result artifact could be issued. Pre-fix production logs confirmed the response sequence but contained no internal failure classification, so the underlying provider/page failure is not claimed as known. Commit `11855df` added a bounded pre-action CDP connection retry, prevented cleanup-only detach failure from overriding a completed response, added secret-free failure diagnostics, and taught the copied prompt to observe and reconcile `nextExpectedSequence` before any ambiguous action retry.

The post-fix live First Steps rerun completed 3/3 in the canonical 8 actions, 11.72 simulated seconds, zero collisions, with the same transcript hash and confirmed release. All ten command calls returned 200 and no 502 occurred. The temporary one-slot IP quota override used solely for this rerun was removed; final production again uses the default two-per-IP daily limit. Retained summary: [`recovery-verification.json`](../evidence/https-agent/practice_5788a57b672a55be8df32759/recovery-verification.json).

After independent review identified that sequence advancement can precede action settlement, the remote observation contract added `actionInProgress`. A minimal paid production check against commit `2f3fb5b` connected to First Steps, observed `actionInProgress:false`, sequence 0, and zero simulated time, then disconnected with release accepted. Its temporary fourth per-IP test slot was removed and production was redeployed at the default limit before signoff.

## Codex connection milestone

After a clean Codex task correctly reported that pasted text could not create missing tools, the connection contract was repaired. The repository now provides an idempotent `npm run setup:codex` installer, a project-scoped `.codex/config.toml`, MCP initialization instructions, and a copied-prompt preflight that distinguishes a same-task Codex Browser page from an unrelated Safari tab. A fresh ephemeral `gpt-5.6-luna` task then discovered the registered MCP server and completed the then-current open → observe → close connection check without shell access, file edits, course actions, or a pre-opened tab. Retained proof: [`luna-clean-task.json`](../evidence/codex-connection/luna-clean-task.json). The current v1.1 tool contract additionally requires an explicit built-in `courseId`; the latest MCP production proof above covers that binding.
