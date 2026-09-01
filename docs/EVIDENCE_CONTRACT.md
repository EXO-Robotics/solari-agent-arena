# `solari.arena.run.v1`

The TypeScript authority is [`src/evidence/contract.ts`](../src/evidence/contract.ts). Server canonicalization recursively sorts object keys and retains array order.

## Hashes

- `controllerHash`: SHA-256 of exact UTF-8 controller source.
- `runnerHash`: SHA-256 of the uploaded trusted evaluator source.
- `modelHash`: SHA-256 of the frozen MJCF bytes.
- `dependencyBundleHash`: SHA-256 of the offline, lock-bound MuJoCo/QuickJS bundle uploaded to the Sandbox.
- `sandboxIdHash`: SHA-256 of the opaque Solari Sandbox ID; the signed capability is never exposed.
- `isolation`: records `hardware-isolated-microvm` with basis `solari-product-documentation` and `attested: false`; it is provenance-bearing product metadata, not an SDK attestation.
- `telemetry.hash`: SHA-256 of canonical `telemetry.samples`.
- `resultHash`: SHA-256 of the complete canonical run object with only `resultHash` omitted.

Timestamps, run ID, Sandbox identity hash, and wall time intentionally make `resultHash` unique per attempt. Determinism is compared with `telemetry.hash` and physics metrics for the same controller/model/runner/seed tuple.

## Outcome semantics

| Status | Meaning |
|---|---|
| `succeeded` | Trusted evaluator completed the fixed run and emitted validated telemetry. |
| `timeout` | Controller step or Sandbox command exceeded a configured deadline. |
| `rejected` | Controller attempted an unavailable capability or failed an explicit input rule. |
| `runtime_error` | Submitted code compiled but failed inside the controller runtime. |

Infrastructure, upload/unpack, unstructured-runner, and teardown failures do not produce `solari.arena.run.v1`; the API returns HTTP 502. `hostImpactAssessment` is deliberately `not-measured-per-run`. Sandbox teardown plus the live valid → failure cases → valid sequence measures evaluator-service recovery, not physical-host state or general malware safety.

## Replay

Samples contain time, copied sensor frame, and complete MuJoCo `qpos`/`qvel`. The browser validates array sizes against the frozen model, restores the state, calls `mj_forward`, and renders it. It does not invoke the controller or call `mj_step` while replaying. Browser hash checks prove self-consistency and mutation detection, not cryptographic issuer identity; evidence URLs are restricted to same-origin `/evidence/*.json`.
