/// <reference types="vite/client" />

declare module "node:fs" {
  export function readFileSync(path: URL): Uint8Array;
}

interface Window {
  solariAgentArena?: Readonly<{
    version: string;
    reset(seed?: number): import("./agent/contract").AgentObservation;
    observe(): import("./agent/contract").AgentObservation;
    act(input: { drive: number; turn: number; durationMs: number }): Promise<import("./agent/contract").AgentObservation>;
    transcript(): import("./agent/contract").AgentTranscript;
  }>;
}

interface Document {
  modelContext?: {
    registerTool(tool: {
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations?: { readOnlyHint?: boolean };
      execute(input: Record<string, unknown>): Promise<unknown>;
    }): Promise<unknown>;
  };
}
