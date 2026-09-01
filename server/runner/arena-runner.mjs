import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import loadMujoco from "@mujoco/mujoco";
import { getQuickJS } from "quickjs-emscripten";

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
const SAMPLE_DT = 0.04;
const RUN_SECONDS = 8;
const CHECKPOINTS = [0.75, 1.5, 2.25, 3];
const CONTROLLER_STEP_BUDGET_MS = 12;

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};
const canonical = (value) => JSON.stringify(stable(value));
const sha256 = (value) => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function quickJsController(source) {
  return getQuickJS().then((QuickJS) => {
    const runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(16 * 1024 * 1024);
    runtime.setMaxStackSize(512 * 1024);
    const vm = runtime.newContext();
    let deadline = performance.now() + 50;
    runtime.setInterruptHandler(() => performance.now() > deadline);
    const compiled = vm.evalCode(`"use strict";\n${source}\nif (typeof control !== "function") throw new Error("Define function control(robot, dt)");\nglobalThis.__arenaControl = control;`);
    if (compiled.error) {
      const detail = vm.dump(compiled.error);
      compiled.error.dispose(); vm.dispose(); runtime.dispose();
      throw new Error(`compile-error:${detail?.message ?? String(detail)}`);
    }
    compiled.value.dispose();
    return {
      step(frame, dt) {
        deadline = performance.now() + CONTROLLER_STEP_BUDGET_MS;
        const result = vm.evalCode(`JSON.stringify(globalThis.__arenaControl(${JSON.stringify(frame)}, ${dt}))`);
        if (result.error) {
          const detail = vm.dump(result.error);
          result.error.dispose();
          const message = String(detail?.message ?? detail);
          if (/interrupted/i.test(message)) throw new Error("controller-timeout");
          throw new Error(`controller-error:${message}`);
        }
        const json = vm.getString(result.value);
        result.value.dispose();
        if (json.length > 32_000) throw new Error("controller-output-limit");
        return JSON.parse(json);
      },
      dispose() { vm.dispose(); runtime.dispose(); },
    };
  });
}

function makeEngine(module, model, data) {
  const joints = new Map();
  const actuators = new Map();
  const sensors = new Map();
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
  const jointValue = (name) => {
    const address = joints.get(name);
    return address ? { position: data.qpos[address.qpos] ?? 0, velocity: data.qvel[address.qvel] ?? 0 } : { position: 0, velocity: 0 };
  };
  let previous = [0, 0];
  let velocity = 0;
  let energy = 0;
  const sensorFrame = () => {
    const js = {};
    for (const name of ACTUATORS) js[name] = jointValue(name);
    const accel = sensors.get("imu_accel") ?? 0;
    return {
      time: data.time,
      position: jointValue("root_x").position,
      lateral: jointValue("root_y").position,
      height: 0.89 + jointValue("root_z").position,
      velocity,
      yaw: jointValue("root_yaw").position,
      imu: { pitch: jointValue("root_pitch").position, roll: jointValue("root_roll").position, pitchRate: jointValue("root_pitch").velocity,
        accel: [data.sensordata[accel] ?? 0, data.sensordata[accel + 1] ?? 0, data.sensordata[accel + 2] ?? 0] },
      feet: { left: data.sensordata[sensors.get("touch_left_foot") ?? 0] ?? 0, right: data.sensordata[sensors.get("touch_right_foot") ?? 0] ?? 0 },
      joints: js,
    };
  };
  const apply = (candidate) => {
    const safe = candidate && typeof candidate === "object" ? candidate : {};
    const targets = safe.targets && typeof safe.targets === "object" ? safe.targets : {};
    for (const name of ACTUATORS) {
      const id = actuators.get(name); const value = targets[name];
      if (id === undefined || typeof value !== "number" || !Number.isFinite(value)) continue;
      data.ctrl[id] = Math.min(model.actuator_ctrlrange[id * 2 + 1], Math.max(model.actuator_ctrlrange[id * 2], value));
    }
    const drive = typeof safe.drive === "number" && Number.isFinite(safe.drive) ? Math.max(0, Math.min(3, safe.drive)) : 0;
    const turn = typeof safe.turn === "number" && Number.isFinite(safe.turn) ? Math.max(-1.8, Math.min(1.8, safe.turn)) : 0;
    const yaw = jointValue("root_yaw").position;
    for (const [name, value] of Object.entries({ pace_x: Math.cos(yaw) * drive, pace_y: Math.sin(yaw) * drive, turn_drive: turn })) {
      const id = module.mj_name2id(model, module.mjtObj.mjOBJ_ACTUATOR.value, name);
      if (id >= 0) data.ctrl[id] = value;
    }
  };
  const step = () => {
    module.mj_step(model, data);
    let power = 0;
    for (let i = 0; i < model.nactuator; i += 1) power += Math.abs((data.actuator_force[i] ?? 0) * (data.actuator_velocity[i] ?? 0));
    energy += power * model.opt.timestep;
    const next = [jointValue("root_x").position, jointValue("root_y").position];
    velocity = Math.hypot(next[0] - previous[0], next[1] - previous[1]) / model.opt.timestep;
    previous = next;
  };
  const collision = () => {
    const contacts = data.contact;
    try {
      for (let i = 0; i < contacts.size(); i += 1) {
        const contact = contacts.get(i);
        if (!contact) continue;
        try {
          if (contact.dist > 0) continue;
          const b1 = model.geom_bodyid[contact.geom1]; const b2 = model.geom_bodyid[contact.geom2];
          const worldGeom = b1 === 0 ? contact.geom1 : b2 === 0 ? contact.geom2 : -1;
          if ((b1 === 0) !== (b2 === 0)) {
            const floor = module.mj_name2id(model, module.mjtObj.mjOBJ_GEOM.value, "field_floor");
            if (worldGeom !== floor) return true;
          }
        } finally { contact.delete(); }
      }
      return false;
    } finally { contacts.delete(); }
  };
  return { sensorFrame, apply, step, collision, jointValue, get energy() { return energy; } };
}

async function main() {
  const inputPath = process.argv[2] ?? "/work/input.json";
  const modelPath = process.argv[3] ?? "/work/h1-sagittal.xml";
  const outputPath = process.argv[4] ?? "/work/result.json";
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const xml = await readFile(modelPath, "utf8");
  const random = seededRandom(input.seed);
  const module = await loadMujoco();
  const model = module.MjModel.from_xml_string(xml);
  const data = new module.MjData(model);
  const engine = makeEngine(module, model, data);
  const controller = await quickJsController(input.controller);
  const samples = [];
  let checkpoints = 0; let collisions = 0; let lastCollision = false; let distance = 0; let topSpeed = 0;
  let previous = [0, 0]; let controlClock = 0; let sampleClock = 0;
  try {
    module.mj_resetData(model, data);
    for (const [name, value] of Object.entries(INITIAL_POSE)) {
      const id = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, name);
      if (id >= 0) data.qpos[model.jnt_qposadr[id]] = value;
    }
    const yawJoint = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, "root_yaw");
    if (yawJoint >= 0) data.qpos[model.jnt_qposadr[yawJoint]] = (random() - 0.5) * 0.04;
    engine.apply({ targets: INITIAL_POSE });
    const heightActuator = module.mj_name2id(model, module.mjtObj.mjOBJ_ACTUATOR.value, "balance_height");
    if (heightActuator >= 0) data.ctrl[heightActuator] = -0.055;
    module.mj_forward(model, data);
    while (data.time < RUN_SECONDS) {
      controlClock += model.opt.timestep; sampleClock += model.opt.timestep;
      if (controlClock + 1e-10 >= CONTROL_DT) {
        engine.apply(controller.step(engine.sensorFrame(), CONTROL_DT));
        controlClock %= CONTROL_DT;
      }
      engine.step();
      const frame = engine.sensorFrame();
      const point = [frame.position, frame.lateral];
      const delta = Math.hypot(point[0] - previous[0], point[1] - previous[1]);
      if (delta < 0.25) distance += delta;
      previous = point; topSpeed = Math.max(topSpeed, frame.velocity);
      if (checkpoints < CHECKPOINTS.length && frame.position >= CHECKPOINTS[checkpoints] && Math.abs(frame.lateral) <= 1.5) checkpoints += 1;
      const contact = engine.collision(); if (contact && !lastCollision) collisions += 1; lastCollision = contact;
      if (sampleClock + 1e-10 >= SAMPLE_DT) {
        samples.push({ time: frame.time, qpos: Array.from(data.qpos), qvel: Array.from(data.qvel), frame });
        sampleClock %= SAMPLE_DT;
      }
    }
  } finally {
    controller.dispose(); data.delete(); model.delete();
  }
  const telemetryHash = sha256(samples);
  const metrics = {
    checkpoints, checkpointsTotal: CHECKPOINTS.length,
    score: Math.max(0, Math.round(checkpoints * 2500 + distance * 100 - collisions * 1000 - engine.energy * 0.01)),
    timeSeconds: RUN_SECONDS, collisions, distanceMeters: distance, topSpeedMps: topSpeed, energyJoules: engine.energy,
  };
  const artifact = { metrics, telemetry: { sampleCount: samples.length, hash: telemetryHash, samples } };
  await writeFile(outputPath, JSON.stringify(artifact), { mode: 0o600 });
  process.stdout.write(`SOLARI_ARENA_RESULT=${JSON.stringify({ outputPath, telemetryHash, sampleCount: samples.length })}\n`);
}

main().catch((error) => {
  const message = String(error?.message ?? error);
  const status = message.includes("controller-timeout") || message.includes("interrupted") ? "timeout" : "runtime_error";
  process.stderr.write(`SOLARI_ARENA_ERROR=${JSON.stringify({ status, reason: message })}\n`);
  process.exitCode = status === "timeout" ? 124 : 1;
});
