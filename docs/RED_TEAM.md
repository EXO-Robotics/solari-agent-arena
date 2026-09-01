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
