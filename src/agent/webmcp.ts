import type { AgentObservation, AgentTranscript } from "./contract";

interface AgentToolCallbacks {
  reset(seed: number): AgentObservation;
  observe(): AgentObservation;
  act(input: { drive: number; turn: number; durationMs: number }): Promise<AgentObservation>;
  transcript(): AgentTranscript;
}

export async function registerAgentSiteTools(callbacks: AgentToolCallbacks): Promise<boolean> {
  const modelContext = document.modelContext;
  if (typeof modelContext?.registerTool !== "function") return false;

  await Promise.all([
    modelContext.registerTool({
      name: "arena_reset",
      description: "Reset the non-authoritative robot tool trial to a uint32 seed. Thinking and observation consume zero simulated time.",
      inputSchema: {
        type: "object",
        properties: { seed: { type: "integer", minimum: 0, maximum: 4_294_967_295, default: 42 } },
        additionalProperties: false,
      },
      execute: async (input) => callbacks.reset(Number(input.seed ?? 42)),
    }),
    modelContext.registerTool({
      name: "arena_observe",
      description: "Read robot pose, progress, collisions, simulated time, and remaining action budget without advancing simulation.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => callbacks.observe(),
    }),
    modelContext.registerTool({
      name: "arena_act",
      description: "Apply one bounded drive and turn command for 100-2000 ms of simulated time, then return the resulting observation. This browser trial is non-authoritative.",
      inputSchema: {
        type: "object",
        properties: {
          drive: { type: "number", minimum: -1.6, maximum: 1.6 },
          turn: { type: "number", minimum: -1.4, maximum: 1.4 },
          durationMs: { type: "integer", minimum: 100, maximum: 2_000 },
        },
        required: ["drive", "turn", "durationMs"],
        additionalProperties: false,
      },
      execute: async (input) => callbacks.act({
        drive: Number(input.drive),
        turn: Number(input.turn),
        durationMs: Number(input.durationMs),
      }),
    }),
    modelContext.registerTool({
      name: "arena_transcript",
      description: "Return the exact bounded action transcript for later isolated deterministic scoring in Solari Sandbox.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => callbacks.transcript(),
    }),
  ]);
  return true;
}
