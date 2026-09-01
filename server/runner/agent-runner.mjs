import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import loadMujoco from "@mujoco/mujoco";

const ACTUATORS = [
  "left_hip_roll", "left_hip_pitch", "left_knee_pitch", "left_ankle_pitch", "left_ankle_roll",
  "right_hip_roll", "right_hip_pitch", "right_knee_pitch", "right_ankle_pitch", "right_ankle_roll",
  "left_shoulder_pitch", "left_elbow_pitch", "right_shoulder_pitch", "right_elbow_pitch",
];
const INITIAL_POSE = {
  left_hip_roll: 0.025, right_hip_roll: -0.025, left_hip_pitch: -0.12, right_hip_pitch: -0.12,
  left_knee_pitch: 0.22, right_knee_pitch: 0.22, left_ankle_pitch: -0.1, right_ankle_pitch: -0.1,
  left_ankle_roll: -0.015, right_ankle_roll: 0.015, left_elbow_pitch: 0.34, right_elbow_pitch: 0.34,
};
const CONTROL_DT = 0.01;
const SAMPLE_DT = 0.1;

const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const canonical = (value) => JSON.stringify(stable(value));
const sha256 = (value) => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");

function validateTranscript(value, course) {
  if (!course || course.schemaVersion !== "solari.arena.course.v1" || !Array.isArray(course.checkpoints)) throw new Error("invalid-course-contract");
  if (![course.maxSeconds, course.maxActions, course.maxActionDurationMs, course.maxDrive, course.maxTurn].every(Number.isFinite)) throw new Error("invalid-course-limits");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("transcript-must-be-an-object");
  if (Object.keys(value).sort().join(",") !== "actions,courseId,schemaVersion,seed") throw new Error("non-canonical-transcript-fields");
  if (value.schemaVersion !== "solari.arena.agent-transcript.v1" || value.courseId !== course.courseId) throw new Error("transcript-contract-mismatch");
  if (!Number.isSafeInteger(value.seed) || value.seed < 0 || value.seed > 0xffff_ffff) throw new Error("invalid-transcript-seed");
  if (!Array.isArray(value.actions) || value.actions.length > course.maxActions) throw new Error("invalid-transcript-action-count");
  let commandedMs = 0;
  const actions = value.actions.map((action, index) => {
    if (!action || typeof action !== "object" || Array.isArray(action) || Object.keys(action).sort().join(",") !== "drive,durationMs,sequence,turn") throw new Error(`invalid-action-fields:${index}`);
    if (action.sequence !== index || ![action.drive, action.turn, action.durationMs].every(Number.isFinite)) throw new Error(`invalid-action-values:${index}`);
    if (Math.abs(action.drive) > course.maxDrive || Math.abs(action.turn) > course.maxTurn) throw new Error(`action-out-of-range:${index}`);
    if (!Number.isInteger(action.durationMs) || action.durationMs < 100 || action.durationMs > course.maxActionDurationMs) throw new Error(`invalid-action-duration:${index}`);
    commandedMs += action.durationMs;
    return { sequence: index, drive: action.drive, turn: action.turn, durationMs: action.durationMs };
  });
  if (commandedMs > course.maxSeconds * 1_000) throw new Error("transcript-time-budget-exceeded");
  return { schemaVersion: value.schemaVersion, courseId: value.courseId, seed: value.seed, actions };
}

function seededYaw(seed) {
  let state = seed >>> 0;
  state = (state + 0x6d2b79f5) >>> 0;
  let mixed = state;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return ((((mixed ^ (mixed >>> 14)) >>> 0) / 0x1_0000_0000) - 0.5) * 0.04;
}

function gaitTargets(robot) {
  const t = Math.max(0, robot.time - 0.8);
  const ramp = Math.min(1, t / 1.2);
  const phase = t * Math.PI * 2 * 1.15;
  const stride = Math.sin(phase) * 0.22 * ramp;
  const leftSwing = Math.max(0, Math.sin(phase));
  const rightSwing = Math.max(0, -Math.sin(phase));
  const pitchFix = Math.max(-0.12, Math.min(0.12, -0.28 * robot.imu.pitch - 0.035 * robot.imu.pitchRate));
  return {
    left_hip_roll: 0.025, right_hip_roll: -0.025,
    left_hip_pitch: -0.12 - stride + pitchFix, right_hip_pitch: -0.12 + stride + pitchFix,
    left_knee_pitch: 0.22 + leftSwing * 0.38, right_knee_pitch: 0.22 + rightSwing * 0.38,
    left_ankle_pitch: -0.1 + stride * 0.45 - pitchFix * 0.8, right_ankle_pitch: -0.1 - stride * 0.45 - pitchFix * 0.8,
    left_ankle_roll: -0.015, right_ankle_roll: 0.015,
    left_shoulder_pitch: stride * 1.1, right_shoulder_pitch: -stride * 1.1,
    left_elbow_pitch: 0.34, right_elbow_pitch: 0.34,
  };
}

function makeEngine(module, model, data) {
  const joints = new Map(); const actuators = new Map(); const sensors = new Map();
  for (const name of [...ACTUATORS, "root_x", "root_y", "root_z", "root_yaw", "root_roll", "root_pitch"]) {
    const id = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, name);
    if (id >= 0) joints.set(name, { qpos: model.jnt_qposadr[id], qvel: model.jnt_dofadr[id] });
  }
  for (const name of ACTUATORS) {
    const id = module.mj_name2id(model, module.mjtObj.mjOBJ_ACTUATOR.value, name);
    if (id >= 0) actuators.set(name, id);
  }
  for (const name of ["imu_accel", "touch_left_foot", "touch_right_foot"]) {
    const id = module.mj_name2id(model, module.mjtObj.mjOBJ_SENSOR.value, name);
    if (id >= 0) sensors.set(name, model.sensor_adr[id]);
  }
  const joint = (name) => {
    const address = joints.get(name);
    return address ? { position: data.qpos[address.qpos] ?? 0, velocity: data.qvel[address.qvel] ?? 0 } : { position: 0, velocity: 0 };
  };
  let previous = [0, 0]; let velocity = 0; let energy = 0;
  const frame = () => {
    const js = {}; for (const name of ACTUATORS) js[name] = joint(name);
    const accel = sensors.get("imu_accel") ?? 0;
    return {
      time: data.time, position: joint("root_x").position, lateral: joint("root_y").position,
      height: 0.89 + joint("root_z").position, velocity, yaw: joint("root_yaw").position,
      imu: { pitch: joint("root_pitch").position, roll: joint("root_roll").position, pitchRate: joint("root_pitch").velocity,
        accel: [data.sensordata[accel] ?? 0, data.sensordata[accel + 1] ?? 0, data.sensordata[accel + 2] ?? 0] },
      feet: { left: data.sensordata[sensors.get("touch_left_foot") ?? 0] ?? 0, right: data.sensordata[sensors.get("touch_right_foot") ?? 0] ?? 0 },
      joints: js,
    };
  };
  const targets = (values) => {
    for (const name of ACTUATORS) {
      const id = actuators.get(name); const value = values[name];
      if (id === undefined || typeof value !== "number" || !Number.isFinite(value)) continue;
      data.ctrl[id] = Math.min(model.actuator_ctrlrange[id * 2 + 1], Math.max(model.actuator_ctrlrange[id * 2], value));
    }
  };
  const drive = (speed, turn) => {
    const yaw = joint("root_yaw").position;
    for (const [name, value] of Object.entries({ pace_x: Math.cos(yaw) * speed, pace_y: Math.sin(yaw) * speed, turn_drive: turn })) {
      const id = module.mj_name2id(model, module.mjtObj.mjOBJ_ACTUATOR.value, name);
      if (id >= 0) data.ctrl[id] = value;
    }
  };
  const step = () => {
    module.mj_step(model, data);
    let power = 0;
    for (let i = 0; i < model.nactuator; i += 1) power += Math.abs((data.actuator_force[i] ?? 0) * (data.actuator_velocity[i] ?? 0));
    energy += power * model.opt.timestep;
    const next = [joint("root_x").position, joint("root_y").position];
    velocity = Math.hypot(next[0] - previous[0], next[1] - previous[1]) / model.opt.timestep; previous = next;
  };
  const collision = () => {
    const floor = module.mj_name2id(model, module.mjtObj.mjOBJ_GEOM.value, "field_floor"); const contacts = data.contact;
    try {
      for (let i = 0; i < contacts.size(); i += 1) {
        const contact = contacts.get(i); if (!contact) continue;
        try {
          if (contact.dist > 0) continue;
          const b1 = model.geom_bodyid[contact.geom1]; const b2 = model.geom_bodyid[contact.geom2];
          if ((b1 === 0) !== (b2 === 0) && (b1 === 0 ? contact.geom1 : contact.geom2) !== floor) return true;
        } finally { contact.delete(); }
      }
      return false;
    } finally { contacts.delete(); }
  };
  return { joint, frame, targets, drive, step, collision, get energy() { return energy; } };
}

async function main() {
  const inputPath = process.argv[2] ?? "/work/input.json";
  const modelPath = process.argv[3] ?? "/work/h1-sagittal.xml";
  const coursePath = process.argv[4] ?? "/work/course.json";
  const outputPath = process.argv[5] ?? "/work/result.json";
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const course = JSON.parse(await readFile(coursePath, "utf8"));
  const transcript = validateTranscript(input.transcript, course);
  const xml = await readFile(modelPath, "utf8");
  const module = await loadMujoco(); const model = module.MjModel.from_xml_string(xml); const data = new module.MjData(model);
  const engine = makeEngine(module, model, data); const samples = []; const actionResults = [];
  let checkpoints = 0; let collisions = 0; let lastCollision = false; let distance = 0; let topSpeed = 0;
  let previous = [0, 0]; let controlClock = 0; let sampleClock = 0; let outcome = "transcript_exhausted";
  try {
    module.mj_resetData(model, data);
    for (const [name, value] of Object.entries(INITIAL_POSE)) {
      const id = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, name);
      if (id >= 0) data.qpos[model.jnt_qposadr[id]] = value;
    }
    const yawJoint = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, "root_yaw");
    if (yawJoint >= 0) data.qpos[model.jnt_qposadr[yawJoint]] = seededYaw(transcript.seed);
    engine.targets(INITIAL_POSE);
    const heightActuator = module.mj_name2id(model, module.mjtObj.mjOBJ_ACTUATOR.value, "balance_height");
    if (heightActuator >= 0) data.ctrl[heightActuator] = -0.055;
    module.mj_forward(model, data);
    for (const action of transcript.actions) {
      let remaining = action.durationMs / 1_000;
      let terminal = false;
      while (remaining > 1e-9) {
        controlClock += model.opt.timestep; sampleClock += model.opt.timestep;
        if (controlClock + 1e-10 >= CONTROL_DT) { engine.targets(gaitTargets(engine.frame())); controlClock %= CONTROL_DT; }
        engine.drive(action.drive, action.turn); engine.step(); remaining -= model.opt.timestep;
        const frame = engine.frame(); const point = [frame.position, frame.lateral]; const delta = Math.hypot(point[0] - previous[0], point[1] - previous[1]);
        if (delta < 0.25) distance += delta; previous = point; topSpeed = Math.max(topSpeed, frame.velocity);
        const next = course.checkpoints[checkpoints];
        if (next && Math.hypot(frame.position - next.x, frame.lateral - next.y) <= next.radius) checkpoints += 1;
        const contact = engine.collision(); if (contact && !lastCollision) collisions += 1; lastCollision = contact;
        if (sampleClock + 1e-10 >= SAMPLE_DT) { samples.push({ time: frame.time, qpos: Array.from(data.qpos), qvel: Array.from(data.qvel), frame }); sampleClock %= SAMPLE_DT; }
        if (checkpoints === course.checkpoints.length) { outcome = "course_complete"; terminal = true; break; }
        if (frame.height < 0.5 || Math.abs(frame.imu.pitch) > 0.96 || Math.abs(frame.imu.roll) > 0.96) { outcome = "fallen"; terminal = true; break; }
        if (data.time >= course.maxSeconds) { outcome = "time_limit"; terminal = true; break; }
      }
      const observed = engine.frame();
      actionResults.push({ sequence: action.sequence, time: observed.time, position: { x: observed.position, y: observed.lateral }, yaw: observed.yaw, checkpoints, collisions });
      if (terminal) break;
    }
  } finally { /* MuJoCo state is read below before disposal. */ }
  const finalFrame = engine.frame(); const telemetryHash = sha256(samples);
  const metrics = {
    checkpoints, checkpointsTotal: course.checkpoints.length,
    score: Math.max(0, Math.round(checkpoints * 2_500 + distance * 100 - collisions * 1_000 - engine.energy * 0.01 - finalFrame.time * 10)),
    timeSeconds: finalFrame.time, collisions, distanceMeters: distance, topSpeedMps: topSpeed, energyJoules: engine.energy,
    actionsUsed: actionResults.length,
  };
  data.delete(); model.delete();
  const artifact = { outcome, metrics, actionResults, telemetry: { sampleCount: samples.length, hash: telemetryHash, samples } };
  await writeFile(outputPath, JSON.stringify(artifact), { mode: 0o600 });
  process.stdout.write(`SOLARI_AGENT_RESULT=${JSON.stringify({ outputPath, outcome, telemetryHash, sampleCount: samples.length })}\n`);
}

main().catch((error) => {
  process.stderr.write(`SOLARI_AGENT_ERROR=${JSON.stringify({ status: "runtime_error", reason: String(error?.message ?? error) })}\n`);
  process.exitCode = 1;
});
