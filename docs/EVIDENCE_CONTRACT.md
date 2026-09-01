# Evidence contracts

The TypeScript authority is [`src/evidence/contract.ts`](../src/evidence/contract.ts). Server canonicalization recursively sorts object keys and preserves array order.

## `solari.arena.agent-run.v1`

This is the embodied-agent benchmark artifact.

### Identity and controller artifact

- `runId`: unique issuance ID.
- `seed`: uint32 starting seed.
- `transcriptHash`: SHA-256 of canonical `solari.arena.agent-transcript.v1`.
- `controllerHash`: equal to `transcriptHash`; the transcript is the exact effective bounded controller artifact judged by this run.
- `agent.label`: informational, caller-supplied label.
- `agent.runtime: external-not-isolated`: explicit proof boundary.
- `agent.controllerArtifact: bounded-action-transcript`.

### Execution and isolation

- Solari provider/product/SDK/template and SHA-256 of the opaque Sandbox ID.
- `authoritativeBoundary: validated-transcript-replay-and-scoring`.
- runner, MJCF model, course, and offline dependency-bundle SHA-256 hashes.
- simulator version, start/end/wall timing, command/unpack/idle deadlines, network-policy and attestation disclaimers.
- `sandboxTerminated: true` is required before issuance.

### Outcome and evidence

- Outcome statuses: `succeeded`, `incomplete`, `fallen`, or `time_limit`; the reason records the exact runner terminal state.
- Metrics: checkpoints, score, simulated time, collisions, distance, top speed, energy, and actions used.
- `actionResults`: state/progress receipt after every bounded action.
- `telemetry.samples`: time, sensor frame, and complete MuJoCo `qpos`/`qvel` replay state.
- `telemetry.hash`: SHA-256 of canonical samples.
- `resultHash`: SHA-256 of the full canonical run with only `resultHash` omitted.

## `solari.arena.run.v1`

This is the retained generated-controller source contract. Its `controllerHash` hashes the exact UTF-8 JavaScript source. Submitted source runs in QuickJS WASM inside the Sandbox evaluator and can result in `succeeded`, `timeout`, `rejected`, or `runtime_error`.

## Hash semantics

`resultHash` is unique per attempt because run ID, timestamps, Sandbox identity hash, and wall time are included. Determinism is compared using physics metrics and `telemetry.hash` for identical transcript/controller, seed, model, runner, course, and evaluator environment.

Browser verification independently recomputes `telemetry.hash` and `resultHash` before enabling replay. Evidence URLs are restricted to same-origin `/evidence/*.json` paths.

## Claim boundaries

- These are unsigned integrity artifacts, not Solari remote attestation or publisher signatures.
- Hardware isolation metadata has basis `solari-product-documentation` and `attested: false`.
- `networkPolicy: not-enforced-no-egress-required` says the run requires no network; it does not attest an egress block.
- `sandboxTerminated: true` records successful SDK teardown, not cryptographic destruction.
- `hostImpactAssessment: not-measured-per-run` prevents per-run host-safety claims.
- Browser replay calls `mj_forward` only to render recorded state. It does not invoke controller code, apply transcript actions, call `mj_step`, or rescore the run.
