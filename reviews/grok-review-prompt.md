# Independent Solari internship-submission review

You are a skeptical senior Solari engineer reviewing an internship submission. You have no implementation ownership. Work read-only. Inspect the entire repository, with particular attention to `README.md`, `docs/`, `api/`, `server/`, `scripts/`, qualification fixtures, client evidence/replay code, tests, workflows, and deployment configuration.

## Original challenge and product thesis

Build a focused public repository named `solari-agent-arena` from Robot-3D-Sim. The thesis is: **AI-generated robot controllers should be fast to preview locally, but isolated for authoritative evaluation.**

The existing Web Worker remains a clearly non-isolated, non-authoritative Local Preview. `Run Isolated Evaluation` must execute untrusted/user/AI-generated controller code inside a Solari Sandbox. Prefer controller plus deterministic MuJoCo simulation entirely inside Solari. Solari credentials must remain server-side. A versioned authoritative evidence contract must include run ID, controller hash, seed, execution/isolation metadata, outcome, applicable metrics, telemetry hash, and result hash. The browser must preserve deterministic replay.

Solari Browser must be an actual end-to-end verifier: open the deployed result/replay, assert rendered controller hash/result/checkpoints/time/evidence against the authoritative artifact, verify replay completion, and retain useful visual/session evidence. Do not add Solari Desktop without a real need.

Qualification must cover: valid controller; hanging controller with bounded termination and unaffected host; benign forbidden/hostile capability attempt with contained failure and unaffected host. No destructive malware.

The result must be polished, focused, understandable in a few minutes, and honest about proof limitations. The README must explain the original boundary problem, why a Web Worker/watchdog is not security, why Solari is useful, architecture, flow, qualification, evidence, setup, deployment, relationship to Robot-3D-Sim, and exact necessary Solari components.

## Current proof status

The repository's local tests and build have passed. Live Solari Sandbox artifacts, Solari Browser proof, deployment, and publication are intentionally not claimed yet because credentials are not available in the current environment. Treat that proof boundary as a positive only if the UI and docs are completely unambiguous about it.

## Required review

Act adversarially and look specifically for:

- fake or weak Solari usage
- unnecessary Solari components
- security-boundary mistakes or misleading claims
- client-side credential exposure
- determinism or replay inconsistencies
- weak failure isolation
- architecture overengineering
- supply-chain or request-abuse risks
- demo problems or broken UX
- README ambiguity
- missing or overstated evidence
- anything preventing a legitimate 10/10 submission

Categorize every finding as Critical, High, Medium, or Low. For each finding, cite exact file paths and line numbers, explain impact, and propose the smallest correct fix. Distinguish verified defects from questions and from proof that is merely pending. End with:

1. an overall score out of 10,
2. whether Solari materially improves Robot-3D-Sim,
3. whether there are any legitimate Critical/High/Medium findings,
4. confidence in the architecture and claims,
5. the shortest path to an effective 10/10.

Do not suggest adding Solari products merely to increase logo count. Do not claim live proof exists when it does not. Do not write files or execute repository code.
