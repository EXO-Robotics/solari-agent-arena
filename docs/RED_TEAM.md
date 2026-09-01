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

The public-production admission controls are now implemented behind the still-closed release gate: atomic Redis holder/IP/global daily and concurrency limits, a one-time pairing transition, durable active leases, signed five-minute unclaimed cleanup, signed twenty-minute deadline cleanup, an exact five-minute recovery sweep with a fail-closed heartbeat, idempotent provider release, charged retention for uncertain provider outcomes, poison-record backoff/pruning, and an owner-only usage-epoch reset with a latest-reset record. Production Redis and QStash are attached; the first scheduled QStash request was delivered and refreshed the namespaced Redis heartbeat. `SOLARI_REMOTE_ENABLED=false` remains the release gate until the staged managed challenge is published and the live admission/release qualification passes.

## Public-admission prelaunch review

Sanitized Grok session `01a05f0c-fe0f-7b23-ae4f-1a561b71e415` reviewed tracked public commit `5c2b21c` with web search, subagents, and write tools disabled. It exhausted the six-turn limit, so its 8.5/10 draft was not accepted as final signoff. Two concrete Medium candidates were validated independently:

- Accepted: after a committed ticket, simultaneous QStash scheduling failure and unconfirmed provider release left the recurring sweep index at the twenty-minute hard deadline. The lease remained charged and bounded, but the advertised five-minute unclaimed recovery was not independently guaranteed. Commit-time indexing now uses `pairingExpiresAt`; the one-time atomic redeem transition advances both global and per-IP indexes to `hardExpiresAt`. Targeted admission/expiry tests cover the lifecycle deadline transition.
- Rejected as a duplicate incorrect finding: `finishPractice()` does not construct a receipt from undefined browser state. JavaScript propagates the read error after its `finally` release attempt; `/api/arena-command` catches it, sanitizes infrastructure details, and returns HTTP 502. Capacity is cleared only when provider release is accepted. This is the same finding rejected with code evidence in the Hosted remote MCP review above.

A fresh final Grok review is still required after the WAF gate is active and the cold anonymous public run is retained. This prelaunch pass is remediation input, not release approval.

## Zero-install HTTPS live walkthrough

A fresh `gpt-5.6-luna` tester received only the exact system prompt copied from the production Safari course picker. It had no repository context and was explicitly forbidden from using preconfigured Arena/MCP tools. Using ordinary HTTPS, it completed `practice-first-steps-v1` at seed 42 with 3/3 checkpoints, 9 actions, 9.81 simulated seconds, zero collisions, and `releaseAccepted=true`.

The redacted record and Safari copy-state screenshot are retained under [`evidence/https-agent/practice_df95e68118ed5aff246c2a84`](../evidence/https-agent/practice_df95e68118ed5aff246c2a84). This proves the zero-install handoff and recorded Browser practice loop, not authoritative Sandbox qualification. The temporary production window was closed immediately afterward; both `SOLARI_REMOTE_ENABLED` and `SOLARI_EVALUATION_ENABLED` were verified off.
