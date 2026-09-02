# Independent Grok red-team ledger

Grok is advisory only. Findings are validated against code, tests, and retained proof before acceptance.

## Round 1 — score 8/10

Grok reported no Critical or High findings and seven legitimate Medium findings.

| Finding | Decision | Resolution |
|---|---|---|
| Runner-boundary transcript revalidation was claimed but missing | Accepted | Direct evaluator calls now canonicalize before Sandbox creation; the standalone runner independently validates schema, exact fields/sequence, seed, course, numeric/action limits, and total time. Targeted rejection tests cover both boundaries. |
| Architecture diagram said production Browser proof called WebMCP | Accepted | Diagram now says numeric-form DOM verification. WebMCP registration/delegation has a separate contract test; production proof does not claim to exercise Codex’s site-tool safety surface. |
| `evaluationInFlight` was not a distributed Vercel mutex | Accepted | Removed the process-local 429 theater from both APIs. Deployment docs explicitly require provider quota plus a durable distributed lease/rate control before multi-reviewer enablement. Public evaluation remains disabled. |
| MCP `arena_open` allowed arbitrary HTTP(S) origins | Accepted | Added exact configured-origin and `/` path enforcement. Alternate/local origins require deliberate `ARENA_URL`; tests reject hostile origin, credentials, and path. |
| Agent actions could inherit preview physics/power state or pause on visibility | Accepted | Entering Agent Tool Trial now restores power, actuation, strength, friction, and 1x rate. Visibility pause applies only outside agent mode; manual run controls were already pointer-disabled in agent mode. |
| `actionsUsed` counted unexecuted transcript tails | Accepted | Runner now reports `actionResults.length`; a padded-tail test proves early completion reports only executed actions. |
| Agent command and SDK call deadlines had no headroom | Accepted | Sandbox command deadline is 60 s wall time and SDK call timeout is 90 s, within the 120 s function budget. |

### Low and rejected/unverified feedback

- Accepted opportunistically: MCP session receipt now uses the same canonical transcript hash as authority; browser AgentTrial enforces the 60 s total command budget; a real stdio MCP verification script was added.
- Remaining Low: the trusted gait formula is duplicated in browser TypeScript and the standalone offline runner. This is deliberate bundle independence but is a maintenance drift risk; deterministic qualification catches outcome drift, not formula identity.
- Rejected: `.env.example` contains empty placeholders, not credentials.
- Rejected: `server/runner/**` in `vercel.json` already includes `runner-dependencies.tgz`.
- Rejected: Sandbox replay of bounded JSON is not unnecessary Solari theater; the product’s authority depends on a client-independent, pinned MuJoCo environment and kill-before-issuance evidence. The docs do not claim the JSON itself requires code isolation.
- Rejected: retaining the original controller path is an explicit hiring-challenge requirement, not accidental scope growth.
- Rejected: WebMCP `outputSchema` is optional and the official OpenAI example returns direct structured objects without one.

## Round 2 — score 9/10

Fresh Grok session `01a05cf2-e53a-7c90-9e61-dda8594988f4` reported: **“No legitimate Critical/High/Medium findings.”** It assessed architecture/claims confidence as high (about 0.9), confirmed Solari materially improves Robot-3D-Sim, and identified five Low issues.

| Low finding | Decision | Resolution |
|---|---|---|
| Physics/rate controls remained writable after entering Agent Tool Trial | Accepted | Speed, strength, and friction controls are disabled for the full agent-mode session; event handlers also fail closed on programmatic input events. |
| stdio MCP had no reset tool | Accepted | Added `arena_reset`, reusing the recording Browser session and returning a visual reset receipt. |
| Trusted gait law is duplicated | Accepted as remaining Low | Kept deliberately for standalone offline runner independence; deterministic qualification detects outcome drift. |
| “Why this boundary” linked to a missing heading | Accepted | Link now targets the real `#why-solari-matters` README anchor. |
| Retained MCP proof stopped after one action | Accepted | Upgraded the real stdio MCP verifier to prove reset, exact 800 ms action timing, the full 21-action 5/5 zero-collision course, exact transcript, screenshot, rrweb, and receipt hashes. |

Grok also listed narrow uncertainties about files excluded by the deliberately bounded review prompt. These were not findings; the broader local suite and retained release evidence cover those paths.

## Round 3 — score 10/10

Fresh Grok session `01a05cfc-db86-73f2-a741-a22a37201ce1` reviewed the revised implementation and retained proof. Final verdict:

- **“No legitimate Critical/High/Medium findings.”**
- Legitimate Critical: 0; High: 0; Medium: 0.
- Architecture/claims confidence: high.
- Solari materially improves Robot-3D-Sim: yes.
- Overall score: **10/10**.

Round 3 confirmed every Round 1 Medium is resolved and every Round 2 Low except the documented gait-duplication maintenance risk is resolved. It explicitly concluded that the remaining Low does not weaken the product or its claims.

## Course-first UX release review — effectively 10/10

Fresh Grok session `01a05d2d-901a-74c0-a620-6bb5f5b83a38` initially scored the candidate 7.5/10 and said `DO NOT RELEASE` for one High release-gate issue: the redesigned production build had not yet repeated its Browser and MCP E2E proofs. That finding was accepted.

The candidate was deployed as commit `f68c11c928027d0eacd681fc2d774d2284128864`. Solari Browser then completed the official course and integrity-checked replay; the real stdio MCP bridge independently listed all seven tools, proved zero-cost observation/reset/action timing, and completed the canonical 21-action course. Both retained hash-bound evidence and passed.

Fresh final Grok session `01a05d32-b99f-7ab2-a7da-17339d66b6e2` reported:

- Critical: 0; High: 0; Medium: 0; Low: 0.
- `RELEASE`, with high confidence.
- Solari materially improves Robot-3D-Sim.
- No concrete legitimate issue remains under the acceptance standard; submission quality is effectively **10/10**.

The first reviewer pass also raised an MCP wait-on-hidden-control bug, reserved built-in course-ID replacement, missing prompt budgets, import-label escaping, clipboard fallback, overlay focus/inert handling, mobile authority labels, and misleading local-course status copy. Each legitimate finding was fixed and covered by targeted tests or browser inspection. A later broad headless retry exhausted its turn budget reading files and returned no verdict; it was not counted as approval.

## New-task connection review — effectively 10/10

A real fresh Luna task exposed a missing product prerequisite: pasted mission text cannot attach an unconfigured local MCP server or inherit an unrelated Safari tab. The fix adds an idempotent `npm run setup:codex` connector, same-name project configuration, explicit copied-prompt preflight/restart guidance, and MCP server initialization instructions. The installer never copies or logs the Solari key and refuses to overwrite a conflicting entry.

Grok session `01a05d46-1779-75d1-a820-55b26537c5a2` reported `RELEASE` with no Critical, High, or material Medium findings. Its only Low was the platform-required restart. After a clean ephemeral Luna task successfully called open → observe → close and the production seven-tool verifier completed 5/5 with retained hashes, fresh session `01a05d4a-492f-7201-80da-bdd987c82e6d` concluded:

- No legitimate Critical/High/Medium remains.
- The restart is explicit and unavoidable, not a product defect.
- **`RELEASE` — effectively 10/10 for scope.**

## Course-binding regression review

A real new-task result exposed that First Steps copied as `practice-first-steps-v1` but the MCP bridge launched the default official route. The agent correctly stopped without acting. The accepted fix makes the built-in course an explicit copied-prompt → required MCP input → allow-listed same-origin URL → pre-MuJoCo browser selection contract, with a mandatory first-observation match. Unknown and imported IDs fail closed; imported manifests remain same-tab trials. Session and verifier evidence paths now resolve from the repository module location.

The first advisory attempt (`01a05d63-47ed-7a02-9053-5d5d7d786fb4`) exhausted its six-turn budget after a read-tool error and returned no verdict. Its incomplete internal notes contradicted inspected code and were rejected, not counted as approval.

Fresh Grok session `01a05d65-a073-7473-9c7e-afd3208de850` inspected the targeted code and live proof, reported no legitimate Critical/High/Medium findings, and issued `RELEASE` at 9/10. Two Low findings were accepted:

- First Steps lacked its own exact copied-prompt assertion. Added one for `arena_open({"seed":42,"courseId":"practice-first-steps-v1"})` and its observation guard.
- `courseId` still defaulted to the official route when omitted. MCP v1.1 now requires the allow-listed field, and the live verifier asserts omission is rejected before a Browser session launches.

The real production MCP qualification then passed again. Retained proof [`9b700e6322ef76d8/assertions.json`](../evidence/mcp/9b700e6322ef76d8/assertions.json) shows missing-course rejection, exact First Steps selection at seed 42 with 0 actions/0 simulated seconds, and the unchanged official 5/5, 21-action, zero-collision completion.

Fresh final Grok session `01a05d6c-fcd6-7ac2-be05-fa2cd4d1704d` reviewed the revised code and proof and concluded:

- Critical: 0; High: 0; Medium: 0; Low: 0.
- Both prior Low findings are closed in code and live evidence.
- The final production proof is accepted.
- Confidence in architecture and claim honesty is strong.
- Solari materially improves Robot-3D-Sim.
- **`RELEASE` — 10/10 and effectively 10/10 for this gate.**

## Hosted remote MCP review — focused V1

The hosted-agent change was reviewed from a sanitized copy that excluded `.env*`, `.vercel`, Git metadata, dependencies, build output, and retained evidence. Public remote execution stayed disabled throughout review and qualification.

The first bounded Grok session `01a05d91-2a87-7f82-8547-5abbf104dd0a` exhausted its turn budget before a verdict. One legitimate Medium issue appeared in its partial analysis: a clipped `#viewport` screenshot can still include sibling HUD layers composited over the same rectangle, leaking WORLD X/Y on the Vision track. Accepted fix: `viewportPng()` now enables `simulation--vision-capture`; CSS hides every direct simulation child except `#viewport` and removes its overlay until the PNG completes, restoring state in `finally`.

Two partial findings were rejected after code validation:

- `finishPractice()` does not continue into receipt construction with undefined state after a read failure; JavaScript propagates the original exception after the `finally` release attempt. Failing without evidence is the correct fail-closed behavior.
- Stateless MCP may return 405 for GET/SSE session operations. The installed MCP server explicitly supports stateless legacy POST exchanges, and a real initialize plus `tools/list` handshake returned the five tools. Custom-domain rejection is the intended exact Host/Origin policy, not an interoperability defect.

Fresh Grok session `01a05d93-c5b2-7bb3-b86b-e555f4e7f3d2` inspected the revised capture boundary and focused contract. Final result:

- Legitimate Critical: 0; High: 0; Medium: 0.
- Overall score: **9/10** for the focused V1.
- Solari materially improves Robot-3D-Sim: yes.
- No material finding remains under the stated default-disabled scope.

At this focused-review milestone, the public-production admission controls were implemented behind a closed release gate: atomic Redis holder/IP/global daily and concurrency limits, a one-time pairing transition, durable active leases, signed five-minute unclaimed cleanup, signed twenty-minute deadline cleanup, an exact five-minute recovery sweep with a fail-closed heartbeat, idempotent provider release, charged retention for uncertain provider outcomes, poison-record backoff/pruning, and an owner-only usage-epoch reset with a latest-reset record. Production Redis and QStash were attached and the first scheduled QStash request refreshed the namespaced Redis heartbeat. The later public-release qualification below supersedes this historical `SOLARI_REMOTE_ENABLED=false` state.

## Public-admission prelaunch review

Sanitized Grok session `01a05f0c-fe0f-7b23-ae4f-1a561b71e415` reviewed tracked public commit `5c2b21c` with web search, subagents, and write tools disabled. It exhausted the six-turn limit, so its 8.5/10 draft was not accepted as final signoff. Two concrete Medium candidates were validated independently:

- Accepted: after a committed ticket, simultaneous QStash scheduling failure and unconfirmed provider release left the recurring sweep index at the twenty-minute hard deadline. The lease remained charged and bounded, but the advertised five-minute unclaimed recovery was not independently guaranteed. Commit-time indexing now uses `pairingExpiresAt`; the one-time atomic redeem transition advances both global and per-IP indexes to `hardExpiresAt`. Targeted admission/expiry tests cover the lifecycle deadline transition.
- Rejected as a duplicate incorrect finding: `finishPractice()` does not construct a receipt from undefined browser state. JavaScript propagates the read error after its `finally` release attempt; `/api/arena-command` catches it, sanitizes infrastructure details, and returns HTTP 502. Capacity is cleared only when provider release is accepted. This is the same finding rejected with code evidence in the Hosted remote MCP review above.

At this prelaunch milestone, a fresh final Grok review was still required after the WAF gate became active and the cold anonymous public run was retained. This prelaunch pass was remediation input, not release approval; the final loop below completed that gate.

## Zero-install HTTPS live walkthrough

A fresh `gpt-5.6-luna` tester received only the exact system prompt copied from the production Safari course picker at deployed commit `7764793`. It ran in a projectless temporary directory with no repository and no Arena/MCP integration. The prompt exposed only a short one-time server-resolved run code, not the long sealed pairing capability. Using ordinary HTTPS, Luna completed `practice-first-steps-v1` at seed 42 with 3/3 checkpoints, 8 actions, 11.72 simulated seconds, zero collisions, and `releaseAccepted=true`.

The retained [`walkthrough`](../evidence/https-agent/practice_51ecfbada19ccea6c3b06744/walkthrough.json), [`receipt`](../evidence/https-agent/practice_51ecfbada19ccea6c3b06744/receipt.json), and [`final frame`](../evidence/https-agent/practice_51ecfbada19ccea6c3b06744/final.png) prove the zero-install handoff and recorded Browser practice loop, not authoritative Sandbox qualification. The screenshot hash was independently recomputed, the permission-restricted session file was removed, and the Redis active-lease index returned zero after release. The Solari Browser API did not return a downloadable replay for this run (`replayHash: null`), so no practice-replay claim is made. Public practice remains on with safeguards; `SOLARI_EVALUATION_ENABLED=false` was retained and probed fail-closed.

## Final public-release review loop

Fresh delta-review session `01a062c9-e3c4-7650-8a89-0086c3478a93` reviewed the complete tracked change from the prelaunch-reviewed commit through deployed commit `c368add2932c8ec5c0c561a49276b2dd97cab19e`. It accepted that the prior five-minute recovery Medium was closed: commit indexes pairing leases at `pairingExpiresAt`, while the atomic redeem transition advances both global and per-IP indexes to `hardExpiresAt`. It rejected the repeated `finishPractice()` undefined-state claim because the read failure still propagates after `finally`.

That review returned `RELEASE`, strong confidence, and zero Critical/High/Medium findings, but found two legitimate Lows:

- Accepted: successful admission redeemed the lease atomically but deleted the short-code mapping in a separate swallowed best-effort operation. Remediation commit `d3201d5` moved compare-and-delete into the same Redis Lua transaction that verifies the mapping and activates the lease.
- Accepted: the walkthrough used a short `7764793` commit field that could be confused with the later evidence-publication commit. The evidence now records full, separate `testedRuntimeCommit` and `evidenceFirstPublishedCommit` fields without claiming that the walkthrough was rerun on the remediation commit.

After the two fixes, 29/29 targeted admission/API tests, the full 127/127 suite, the production build, and diff hygiene passed. Production was redeployed and reprobed: root 200, remote-practice status 200/enabled, and both isolated-evaluation APIs 503/paused.

Fresh independent remediation-review session `01a062d4-50d8-7f31-988f-369042d73dcd` inspected the exact `c368add…d3201d5` tracked diff. It specifically rejected the following proposed regressions:

- no new redemption race: mapping verification, lease activation, deadline reindexing, and mapping deletion share one Redis `EVAL`;
- no compatibility break: the changed function is internal and the public HTTP/MCP contract is unchanged;
- no secret exposure: the sealed ticket was already a Redis value, remains server-side, and never enters the copied prompt;
- no weakened cleanup: pairing TTL, five-minute index, hard-deadline index, and close/cancel/abandon flows are unchanged;
- no requirement to mislabel the old live run as rerun on `d3201d5`: the corrected evidence preserves the tested-runtime lineage honestly.

Final result:

- Critical: 0; High: 0; Medium: 0; Low: 0.
- Score: **9.8/10; effectively 10/10**.
- Confidence in architecture and claim honesty: strong.
- Solari is load-bearing and materially improves Robot-3D-Sim: yes.
- **`RELEASE`.**

## Final production-function inventory review

Vercel deployment inspection found one presentation-surface defect after the full-product signoff: `api/arena-command.test.mjs` was being packaged as a production Serverless Function solely because it lived under `api/`. Commit `3708145` moved the unchanged test to `server/lib/arena-command-api.test.mjs` and adjusted its relative import. This reduces the deployed surface without changing the Arena command handler, trust boundary, or public protocol.

Post-fix verification passed the full 127/127 suite and production build. Production deployment `dpl_446mz686gSdG25rfc5TiMupzk3vG` was `Ready`; its inventory contains only the five intended functions (`agent-evaluate`, `arena-command`, `arena-expire`, `arena-ticket`, and `evaluate`). The canonical site returned 200, practice status returned 200/enabled, both isolated-evaluation APIs returned 503/paused, and the removed test route returned 404.

The first narrow advisory attempt (`01a062de-5241-7ee0-b642-345cb0a4703a`) tried to query Git metadata intentionally omitted from the sanitized archive and exhausted its turn budget. It produced no verdict and was not counted as approval.

Fresh independent delta-review session `01a062df-fafe-7811-95c0-a87547995397` received the complete mechanical diff and the post-deploy evidence with web search, subagents, and write tools disabled. It concluded:

- Critical: 0; High: 0; Medium: 0; Low: 0.
- The change correctly removes an accidental production Function and shrinks the deployed attack surface.
- The import relocation, test execution, deployment inventory, and 404 close the only plausible packaging concerns.
- Architecture and claims remain unchanged with high confidence.
- Solari remains load-bearing and materially improves Robot-3D-Sim.
- Prior score remains **9.8/10; exact final state effectively 10/10**.
- **`RELEASE`.**

## Post-release live-command incident

A public Luna run later reached 2/3 checkpoints before three consecutive generic `/api/arena-command` 502 responses, then disconnected with provider release accepted. The failure was contained and non-authoritative, but it correctly invalidated the claim that the copied-prompt path was reliably complete for that run. Vercel logs confirmed the sequence but the old route emitted no safe internal failure classification, so a specific upstream root cause is not asserted.

The remediation preserves mutation safety: CDP connection establishment receives one bounded retry before a callback begins; action evaluation is never blindly retried; an ambiguous action response directs the agent to observe and reconcile `nextExpectedSequence`; and a cleanup-only `browser.disconnect()` failure can no longer replace a successful command result. Structured diagnostics expose only allow-listed stage/code/recovery metadata and never the encrypted capability, CDP endpoint, provider session ID, or Solari credential.

Targeted tests passed 22/22, the full suite passed 128/128, and the production build passed. A fresh live canonical rerun completed First Steps 3/3 in 8 actions, 11.72 simulated seconds, zero collisions, with transcript hash `9076f4f1…68489` and `releaseAccepted:true`; its ten Arena command requests all returned 200. The temporary one-slot quota override was removed and production isolated evaluation remained disabled.

The first bounded Grok incident-review attempt (`01a06328-c8cd-76b2-94b5-6a548b566ac1`) exhausted its six-turn budget and produced conflicting scratch drafts, so it was not counted as approval. One concern in that incomplete analysis was accepted independently: `recordAction` advances the transcript sequence before its physics duration necessarily settles, so sequence advancement alone is insufficient recovery evidence. The remote window API and every HTTPS observation now expose `actionInProgress`; the copied prompt must wait for `false` before treating the action as settled or sending another command. Targeted tests, the full 128/128 suite, and the production build passed again. A minimal live production contract check returned `actionInProgress:false`, sequence 0, and zero simulated time at rest, then disconnected with release accepted. Its temporary test-slot override was removed and the default-quota deployment restored. A fresh final review is still required.
