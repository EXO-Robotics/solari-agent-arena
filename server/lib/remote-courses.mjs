import { readFileSync } from "node:fs";
import { sha256 } from "./evidence.mjs";

const registry = JSON.parse(readFileSync(new URL("../../src/agent/course-registry.json", import.meta.url), "utf8"));
const builtIns = new Map(registry.map((listing) => [listing.course.courseId, Object.freeze(listing)]));

export const REMOTE_TRACKS = Object.freeze(["state-v1", "vision-v1"]);

export function getRemoteCourse(courseId) {
  const listing = builtIns.get(courseId);
  if (!listing) throw new Error("Unknown built-in course.");
  return listing;
}

export function remoteCourseHash(course) {
  return sha256(course);
}

export function listRemoteCourseIds() {
  return [...builtIns.keys()];
}
