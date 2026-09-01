import { AGENT_COURSE, type AgentCourse } from "./contract";

export interface CourseListing {
  course: AgentCourse;
  title: string;
  summary: string;
  difficulty: "Starter" | "Intermediate" | "Expert";
  author: string;
  authoritative: boolean;
  source: "official" | "practice" | "imported";
}

const shared = {
  schemaVersion: "solari.arena.course.v1" as const,
  maxActionDurationMs: 2_000,
  maxDrive: 1.6,
  maxTurn: 1.4,
};

export const COURSE_CATALOG: readonly CourseListing[] = [
  {
    course: AGENT_COURSE,
    title: "Slalom Ramp",
    summary: "Thread two crates, clear the ramp gate, and reach the east beacon.",
    difficulty: "Expert",
    author: "Solari Arena",
    authoritative: true,
    source: "official",
  },
  {
    course: {
      ...shared, courseId: "practice-first-steps-v1", maxSeconds: 24, maxActions: 48,
      checkpoints: [
        { id: "first-gate", x: 3, y: 0, radius: 1.35 },
        { id: "wide-turn", x: 6, y: 2, radius: 1.5 },
        { id: "home-line", x: 9, y: 0, radius: 1.5 },
      ],
    },
    title: "First Steps",
    summary: "A short three-gate route for learning the action and observation loop.",
    difficulty: "Starter",
    author: "Solari Arena",
    authoritative: false,
    source: "practice",
  },
  {
    course: {
      ...shared, courseId: "practice-east-sprint-v1", maxSeconds: 42, maxActions: 80,
      checkpoints: [
        { id: "launch", x: 4, y: -1.5, radius: 1.2 },
        { id: "ramp-west", x: 9, y: -1, radius: 1.25 },
        { id: "ramp-east", x: 13, y: 0, radius: 1.25 },
        { id: "sprint-finish", x: 16, y: -5, radius: 1.5 },
      ],
    },
    title: "East Sprint",
    summary: "A faster line with one committed ramp approach and a hard turn home.",
    difficulty: "Intermediate",
    author: "Solari Arena",
    authoritative: false,
    source: "practice",
  },
];

const RESERVED_COURSE_IDS = new Set(COURSE_CATALOG.map((listing) => listing.course.courseId));

export function parseImportedCourse(value: unknown): CourseListing {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Course must be a JSON object.");
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== "solari.arena.course.v1") throw new Error("Unsupported course schema.");
  const courseId = String(input.courseId ?? "");
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(courseId)) throw new Error("courseId must be 3-64 lowercase letters, numbers, or hyphens.");
  if (RESERVED_COURSE_IDS.has(courseId)) throw new Error("That courseId is reserved by the built-in course library.");
  const finite = (name: string, min: number, max: number) => {
    const number = Number(input[name]);
    if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${name} is outside the supported range.`);
    return number;
  };
  const rawCheckpoints = input.checkpoints;
  if (!Array.isArray(rawCheckpoints) || rawCheckpoints.length < 2 || rawCheckpoints.length > 12) throw new Error("Courses need 2-12 checkpoints.");
  const checkpoints = rawCheckpoints.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Checkpoint ${index + 1} is invalid.`);
    const point = raw as Record<string, unknown>;
    const x = Number(point.x); const y = Number(point.y); const radius = Number(point.radius);
    if (![x, y, radius].every(Number.isFinite) || Math.abs(x) > 40 || Math.abs(y) > 40 || radius < 0.5 || radius > 3) throw new Error(`Checkpoint ${index + 1} is outside the arena bounds.`);
    const id = String(point.id ?? `gate-${index + 1}`);
    if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)) throw new Error(`Checkpoint ${index + 1} id must use lowercase letters, numbers, and hyphens.`);
    return { id, x, y, radius };
  });
  return {
    course: {
      schemaVersion: "solari.arena.course.v1", courseId,
      maxSeconds: finite("maxSeconds", 5, 120),
      maxActions: Math.floor(finite("maxActions", 5, 240)),
      maxActionDurationMs: Math.floor(finite("maxActionDurationMs", 100, 2_000)),
      maxDrive: finite("maxDrive", 0.1, 1.6), maxTurn: finite("maxTurn", 0.1, 1.4), checkpoints,
    },
    title: String(input.title ?? courseId).replace(/[\r\n\t]/g, " ").slice(0, 48),
    summary: String(input.summary ?? "Imported checkpoint route on the fixed Solari arena.").replace(/[\r\n\t]/g, " ").slice(0, 140),
    difficulty: "Intermediate", author: "Local import", authoritative: false, source: "imported",
  };
}
