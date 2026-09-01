# Independent red-team log

## Pass 1 — Grok 4.6 Build — 2026-09-01

Score: **7.4 / 10**. No Critical findings. Four High, eight Medium, and seven Low findings were reported. This pass inspected the repository read-only with web search and Grok subagents disabled. Session: `01a05b1b-35f3-7992-99fa-24ca04f5144e`.

### Accepted and fixed

| Finding | Resolution |
|---|---|
| H1 authority minted on infrastructure failure | Infrastructure, unstructured-runner, and unconfirmed-teardown paths now throw; the API returns HTTP 502 and no `solari.arena.run.v1`. Tests cover create failure and teardown-gated timeout issuance. |
| H2 conflicting cold-install/lifetime bounds | Removed runtime `npm ci`. A checked-in 7.9 MB offline dependency bundle is uploaded and unpacked under 15 s; command and idle bounds are separate and recorded. A test executes that exact bundle offline. |
| H3 UI over-claimed authority | Added empty, pending, failed, and integrity-checked states. Starting a new request clears stale evidence. No screen says an artifact exists before hash verification. |
| H4 unsigned evidence called verified | UI/docs now say unsigned integrity check, evidence is restricted to same-origin `/evidence/*.json`, and issuance authenticity is not claimed. |
| M1 paid endpoint abuse | Live runs remain disabled by default, require a separate admission token, and permit one concurrent run per warm function instance. |
| M2 registry egress/supply chain | Runtime registry access removed; the lock-bound bundle hash is part of every artifact. Network blocking itself is still not attested. |
| M3 false SDK version | Solari dependencies are exact-pinned and the Sandbox SDK version is read from the installed lockfile. |
| M4 evidence table ambiguity | Missing live files are explicitly marked **PENDING** in the README table. |
| M5 incomplete local qualification command | `npm run qualify:local` now runs valid, hanging, capability, and full-uint32-seed tests. |
| M6 capability-fixture wording | Fixture/README now describe the contained QuickJS ReferenceError and evaluator mapping precisely. |
| M7 hardcoded host-impact verdict | Removed `hostAffected: false`; per-run evidence records `not-measured-per-run`, while the live post-failure valid run is the recovery observation. |
| M8 seed zero remapping | Replaced xorshift initialization with a uint32-safe generator and added seed 0 / `0xffffffff` coverage. |
| L1 thin failure tests | Added structured timeout/capability/unstructured failure and create/teardown authority tests. |
| L3 shallow authority guard | Requires confirmed teardown, real Sandbox ID hash, and dependency-bundle hash. |
| L4 Browser boot race | Solari Browser now waits for the exact expected controller hash, not merely for an existing placeholder node. |
| L6 leftover general-simulator tooling | Removed workstation-specific Blender MCP config/tools/docs and the original convenience launcher. |

### Deferred Low findings

- L2: browser/server canonicalization remains duplicated across runtimes; shared test vectors cover ordering, and live Browser proof will catch drift.
- L5: Local Preview and authoritative initial conditions intentionally differ; the UI now makes this non-authoritative relationship explicit.
- L7: the repository link is the intended publication target and remains unverified until publication.

No reviewer finding was rejected as incorrect. H2's exact Solari `timeoutMs` semantics were unverified by Grok; the implementation change was accepted anyway because eliminating runtime installation is a simpler and stronger design.

## Pass 2

Grok session `01a05b29-096d-7792-942f-89da1bfeb8bc` independently re-read the revised tree. Verdict: **no legitimate Critical, High, or Medium findings**; architecture confidence high; Solari materially improves Robot-3D-Sim. Score: **8.8 / 10 pre-live, 9.6 / 10 conditional on successful live proof**.

The actionable Lows were resolved after the verdict:

- the isolation class is now nested metadata with basis `solari-product-documentation` and `attested: false`;
- internal browser state/function names now say integrity rather than generic verification;
- a failed `sandbox.kill()` is explicitly tested to mint no authority;
- Solari Browser now asserts the seed;
- zero-telemetry timeout/rejection artifacts show replay `UNAVAILABLE` and disable the button;
- qualification docs use the package command consistently;
- paused API copy no longer implies checked-in evidence already exists.

Deferred Lows: the three canonical JSON implementations are deliberately independent across trusted runner, server, and browser and have shared-order tests/server re-validation; publication and live proof remain external gates. After the Low fixes, the broader milestone is **42/42 tests plus a successful production build**.

## Pass 3

Pending live Solari qualification, deployment, and Browser proof.
