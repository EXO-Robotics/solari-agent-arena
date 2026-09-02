import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { actPractice, connectPractice, disconnectPractice, finishPractice, observePractice, sanitizeRemoteError } from "./remote-arena.mjs";

function result(value, image) {
  const publicValue = { ...value };
  delete publicValue.image;
  return {
    content: [
      { type: "text", text: JSON.stringify(publicValue, null, 2) },
      ...(image ? [{ type: "image", mimeType: "image/png", data: Buffer.from(image).toString("base64") }] : []),
    ],
    structuredContent: publicValue,
  };
}

function safe(callback) {
  return async (input) => {
    try { const value = await callback(input); return result(value, value.image); }
    catch (error) { return { isError: true, content: [{ type: "text", text: sanitizeRemoteError(error) }] }; }
  };
}

export function buildRemoteMcpServer() {
  const server = new McpServer({ name: "solari-agent-arena-remote", version: "1.2.0" }, {
    capabilities: { tools: {} },
    instructions: "Recorded robot practice in Solari Browser. Call arena_connect with the short-lived ticket from the Arena page. Then observe, act once with the returned nextExpectedSequence, and inspect the resulting observation. Finish to release the Browser and receive a hash-bound practice receipt. Practice is non-authoritative; only the separate token-gated Solari Sandbox scorer can issue authoritative evidence.",
  });
  server.registerTool("arena_connect", {
    title: "Connect to recorded Arena practice",
    description: "Redeem a short-lived course-bound pairing ticket and return an opaque Arena session plus the first observation.",
    inputSchema: z.strictObject({ ticket: z.string().min(20).max(8_192) }),
  }, safe(({ ticket }) => connectPractice(ticket)));
  server.registerTool("arena_observe", {
    title: "Observe the Arena",
    description: "Read the track-specific robot observation without advancing simulated time.",
    inputSchema: z.strictObject({ arenaSession: z.string().min(40).max(8_192) }),
    annotations: { readOnlyHint: true },
  }, safe(({ arenaSession }) => observePractice(arenaSession)));
  server.registerTool("arena_act", {
    title: "Apply one bounded robot action",
    description: "Apply exactly one expected action, then return the resulting observation. Use nextExpectedSequence from the prior observation.",
    inputSchema: z.strictObject({
      arenaSession: z.string().min(40).max(8_192), expectedSequence: z.number().int().min(0),
      drive: z.number().min(-1.6).max(1.6), turn: z.number().min(-1.4).max(1.4), durationMs: z.number().int().min(100).max(2_000),
    }),
  }, safe((input) => actPractice(input.arenaSession, input)));
  server.registerTool("arena_finish", {
    title: "Finish recorded Arena practice",
    description: "Release Solari Browser and return the transcript plus an unsigned, hash-bound, non-authoritative practice receipt.",
    inputSchema: z.strictObject({ arenaSession: z.string().min(40).max(8_192) }),
  }, safe(({ arenaSession }) => finishPractice(arenaSession)));
  server.registerTool("arena_disconnect", {
    title: "Disconnect Arena practice",
    description: "Release Solari Browser without issuing a practice result.",
    inputSchema: z.strictObject({ arenaSession: z.string().min(40).max(8_192) }),
  }, safe(({ arenaSession }) => disconnectPractice(arenaSession)));
  return server;
}
