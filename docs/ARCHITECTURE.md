# Architecture and trust boundaries

## Product split

```mermaid
flowchart TB
  subgraph Agent[External agent / not isolated]
    C[Codex built-in browser]
    L[Local model MCP host]
    S[Safari computer use]
  end
  subgraph Browser[Non-authoritative browser trial]
    W[WebMCP site tools]
    M[Solari Browser MCP bridge]
    U[Accessible UI / window API]
    O[Reset / observe / bounded act]
    P[Deterministic gait + browser MuJoCo]
    T[Versioned action transcript]
    W --> O
    M --> O
    U --> O
    O --> P --> T
  end
  C --> W
  L --> M
  S --> U
  T --> API
  subgraph Server[Server-side authority]
    API[Admission + transcript validation]
    F[Canonical artifact finalization]
  end
  API --> SS
  subgraph SS[Fresh Solari Sandbox]
    V[Canonical transcript validation]
    R[Trusted transcript runner]
    MU[MuJoCo 3.12 / 2 ms]
    E[Score + telemetry + qpos/qvel]
    V --> R --> MU --> E
  end
  E --> F --> VR[Integrity-checked browser replay]
  B[Solari Browser release verifier] -->|numeric form + DOM/hash/replay assertions| VR
  B --> EV[rrweb + screenshots + assertion report]
```

The external agent may be local, remote, benign, broken, or adversarial. This submission does not claim to isolate that model. It turns the model's effect into a bounded data artifact; only transcript replay and scoring are authoritative inside Solari.

## Execution paths

| Path | Purpose | Authority |
|---|---|---|
| Local Preview | Fast generated-controller iteration through the original Worker/watchdog | Non-isolated and non-authoritative |
| Agent Tool Trial | Visual observe/act loop, zero-cost thinking, exact transcript capture | Non-authoritative; page/client can be manipulated |
| Agent Isolated Score | Validate and replay the action transcript in fixed-step MuJoCo in a fresh Sandbox | Authoritative for transcript replay and scoring only |
| Controller Isolated Evaluation | Run submitted controller source in QuickJS plus MuJoCo in a fresh Sandbox | Authoritative for the controller-source run |
| Browser Replay | Render integrity-checked recorded state | Presentation of authority, not new scoring |

## Course authority

The browser course library has three states:

| Course source | Browser tools | Solari score |
|---|---|---|
| Frozen official registry | Enabled | Eligible after transcript validation and Sandbox replay |
| Built-in practice route | Enabled | Disabled |
| Locally imported `solari.arena.course.v1` route | Enabled on the fixed arena | Disabled |

Local imports are checkpoint-route manifests, not arbitrary MuJoCo or JavaScript uploads. They are size/range/count validated in the browser and never reach the authoritative evaluator. A future community registry needs immutable course IDs/versions, moderation, bounded geometry, server-side validation, and a course hash in the authority bundle before uploaded level designs can produce comparable scores.

For the standard MCP path, a built-in selection is explicit and fail closed: the copied mission passes an allow-listed `courseId` to `arena_open`, the bridge creates a normalized same-origin `?agent=1&course=...` URL, the page selects that built-in before MuJoCo loads, and the agent must match the first observation's `courseId` before acting. Local imports are not silently substituted because their manifests exist only in the importing tab.

## Boundary inventory

| Boundary | What it guarantees | What it does not guarantee |
|---|---|---|
| Browser Worker | UI responsiveness and termination of a slow controller step | Origin isolation, compile timeout, authority, deterministic scheduling |
| WebMCP / window API / accessible buttons | A narrow shared robot-control interface | Trustworthiness of the agent or browser state |
| Agent transcript validation | Canonical sequence, bounded finite actions, course/seed/time/action limits | That the browser trial was honest or that a particular model produced it |
| Vercel API | Server-only credential handling, admission, request bounds, artifact finalization | Untrusted-code isolation by itself |
| Solari Sandbox | Fresh microVM outer boundary and SDK-controlled destruction | Publicly documented egress enforcement or remote attestation |
| QuickJS in controller-source runs | Controller lacks Node/browser APIs; CPU/memory/stack bounds | Used by agent transcript scoring; hardware isolation from the service host |
| Artifact hashes | Mutation detection between issuance and replay | Issuer identity without a signing/attestation system |
| Solari Browser | Deployed page-tool behavior, DOM evidence, hashes, and replay completion match the artifact | Recomputing MuJoCo physics, Codex safety-review UI, or isolating the external agent |

## Determinism rule

Agent Tool Trial removes the asynchronous Worker from the gait path. A trusted gait function executes every 10 ms of simulated time; MuJoCo steps every 2 ms. The seeded initial yaw uses the same uint32 PRNG transform in browser and runner. Simulation advances only while one `arena_act` call is active. Observation, screenshots, network latency, model inference, and human review consume zero simulated time.

The authoritative runner applies the ordered transcript to the same gait law and frozen MJCF. Within a fixed evaluator environment, identical transcript/seed/model/course/runner bytes must reproduce physics metrics and `telemetry.hash`. Cross-runtime floating-point byte identity is not claimed; the Sandbox result is the authority.

## Authority rules

An agent artifact is authoritative only when all are true:

1. the request passed server-side canonical transcript validation;
2. a fresh Solari Sandbox was created;
3. the frozen runner, model, course, input, lockfiles, and offline dependency bundle were uploaded without shell interpolation;
4. the runner returned a structured result whose telemetry and replay state were revalidated and rehashed by the server;
5. Sandbox teardown completed; and
6. the server emitted `solari.arena.agent-run.v1` with `authoritativeBoundary: validated-transcript-replay-and-scoring`.

Creation, upload, unpack, runner, hash, or teardown failure returns no authoritative artifact. Local output, browser trial status, screenshots, CI tests, and a copied transcript never satisfy this rule.

## Failure containment

- Agent evaluation executes no model-provided code. It accepts only strict JSON fields and bounded numeric actions.
- Controller source is never passed through a shell; it executes in QuickJS inside the Sandbox.
- The offline dependency bundle removes registry access from the evaluation path.
- Sandbox commands have explicit SDK deadlines; the Sandbox idle timer is a cleanup backstop, not a controller deadline.
- Teardown runs in `finally`; unconfirmed teardown fails closed and mints no evidence.
- Public evaluation stays disabled by default and requires a separate admission token when enabled.
- `hostImpactAssessment: not-measured-per-run` prevents teardown metadata from being overstated as host forensics.
