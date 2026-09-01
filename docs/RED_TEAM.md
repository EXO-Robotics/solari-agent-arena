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
