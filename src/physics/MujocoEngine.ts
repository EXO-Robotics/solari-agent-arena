import loadMujoco, { type MainModule, type MjData, type MjModel } from "@mujoco/mujoco";
import mujocoWasmUrl from "@mujoco/mujoco/mujoco.wasm?url";
import { ACTUATOR_NAMES, type ActuatorTargets, type SensorFrame } from "../sim/types";

interface JointAddress {
  qpos: number;
  qvel: number;
}

const INITIAL_POSE: Partial<Record<(typeof ACTUATOR_NAMES)[number], number>> = {
  left_hip_roll: 0.025,
  right_hip_roll: -0.025,
  left_hip_pitch: -0.12,
  right_hip_pitch: -0.12,
  left_knee_pitch: 0.22,
  right_knee_pitch: 0.22,
  left_ankle_pitch: -0.1,
  right_ankle_pitch: -0.1,
  left_ankle_roll: -0.015,
  right_ankle_roll: 0.015,
  left_elbow_pitch: 0.34,
  right_elbow_pitch: 0.34,
};

export class MujocoEngine {
  readonly module: MainModule;
  readonly model: MjModel;
  readonly data: MjData;
  readonly timestep: number;
  private readonly jointAddresses = new Map<string, JointAddress>();
  private readonly actuatorIds = new Map<string, number>();
  private readonly sensorAddresses = new Map<string, number>();
  private energyJoules = 0;
  private lastPosition: [number, number] = [0, 0];
  private lastVelocity = 0;
  private contactStep = 0;
  private footForces: [number, number] = [0, 0];
  private readonly footGeomIds: [number, number];

  private constructor(module: MainModule, model: MjModel, data: MjData) {
    this.module = module;
    this.model = model;
    this.data = data;
    this.timestep = model.opt.timestep;
    this.footGeomIds = [
      module.mj_name2id(model, module.mjtObj.mjOBJ_GEOM.value, "left_foot_geom"),
      module.mj_name2id(model, module.mjtObj.mjOBJ_GEOM.value, "right_foot_geom"),
    ];

    for (const name of [...ACTUATOR_NAMES, "root_x", "root_y", "root_z", "root_yaw", "root_roll", "root_pitch"]) {
      const jointId = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, name);
      if (jointId >= 0) {
        this.jointAddresses.set(name, {
          qpos: (model.jnt_qposadr as Int32Array)[jointId] ?? 0,
          qvel: (model.jnt_dofadr as Int32Array)[jointId] ?? 0,
        });
      }
    }
    for (const name of ACTUATOR_NAMES) {
      const actuatorId = module.mj_name2id(model, module.mjtObj.mjOBJ_ACTUATOR.value, name);
      if (actuatorId >= 0) this.actuatorIds.set(name, actuatorId);
    }
    for (const name of ["imu_accel", "touch_left_foot", "touch_right_foot"]) {
      const sensorId = module.mj_name2id(model, module.mjtObj.mjOBJ_SENSOR.value, name);
      if (sensorId >= 0) {
        this.sensorAddresses.set(name, (model.sensor_adr as Int32Array)[sensorId] ?? 0);
      }
    }
  }

  static async create(xml: string): Promise<MujocoEngine> {
    const module = await loadMujoco({
      locateFile: (path: string) => (path === "mujoco.wasm" ? mujocoWasmUrl : path),
    });
    const model = module.MjModel.from_xml_string(xml);
    const data = new module.MjData(model);
    const engine = new MujocoEngine(module, model, data);
    engine.reset();
    return engine;
  }

  reset(seed?: number): void {
    this.module.mj_resetData(this.model, this.data);
    const qpos = this.data.qpos as Float64Array;
    for (const [name, value] of Object.entries(INITIAL_POSE)) {
      const address = this.jointAddresses.get(name)?.qpos;
      if (address !== undefined) qpos[address] = value;
    }
    if (seed !== undefined) {
      let state = seed >>> 0;
      state = (state + 0x6d2b79f5) >>> 0;
      let mixed = state;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      const random = ((mixed ^ (mixed >>> 14)) >>> 0) / 0x1_0000_0000;
      const yawAddress = this.jointAddresses.get("root_yaw")?.qpos;
      if (yawAddress !== undefined) qpos[yawAddress] = (random - 0.5) * 0.04;
    }
    this.energyJoules = 0;
    this.lastPosition = [0, 0];
    this.lastVelocity = 0;
    this.contactStep = 0;
    this.footForces = [0, 0];
    this.applyTargets(INITIAL_POSE);
    const heightActuator = this.module.mj_name2id(this.model, this.module.mjtObj.mjOBJ_ACTUATOR.value, "balance_height");
    if (heightActuator >= 0) (this.data.ctrl as Float64Array)[heightActuator] = -0.055;
    this.module.mj_forward(this.model, this.data);
  }

  applyTargets(targets: Partial<ActuatorTargets>): void {
    const ctrl = this.data.ctrl as Float64Array;
    const ranges = this.model.actuator_ctrlrange as Float64Array;
    for (const name of ACTUATOR_NAMES) {
      const id = this.actuatorIds.get(name);
      const target = targets[name];
      if (id === undefined || target === undefined || !Number.isFinite(target)) continue;
      const min = ranges[id * 2] ?? -Infinity;
      const max = ranges[id * 2 + 1] ?? Infinity;
      ctrl[id] = Math.min(max, Math.max(min, target));
    }
  }

  setActuatorStrength(scale: number): void {
    const ranges = this.model.actuator_forcerange as Float64Array;
    const baseLimits = [90, 150, 180, 110, 65, 90, 150, 180, 110, 65, 35, 25, 35, 25, 1500, 1500, 1000, 1000, 700, 1400];
    for (let id = 0; id < baseLimits.length; id += 1) {
      const limit = (baseLimits[id] ?? 0) * scale;
      ranges[id * 2] = -limit;
      ranges[id * 2 + 1] = limit;
    }
  }

  setGroundFriction(value: number): void {
    const floorId = this.module.mj_name2id(this.model, this.module.mjtObj.mjOBJ_GEOM.value, "field_floor");
    if (floorId >= 0) (this.model.geom_friction as Float64Array)[floorId * 3] = value;
  }

  setFieldDrive(metersPerSecond: number, turnRate: number): void {
    const ctrl = this.data.ctrl as Float64Array;
    const yaw = this.jointValue("root_yaw").position;
    const speed = Math.max(-3, Math.min(3, metersPerSecond));
    const commands = {
      pace_x: Math.cos(yaw) * speed,
      pace_y: Math.sin(yaw) * speed,
      turn_drive: Math.max(-1.8, Math.min(1.8, turnRate)),
    };
    for (const [name, value] of Object.entries(commands)) {
      const id = this.module.mj_name2id(this.model, this.module.mjtObj.mjOBJ_ACTUATOR.value, name);
      if (id >= 0) ctrl[id] = value;
    }
  }

  setActuationEnabled(enabled: boolean): void {
    const bit = this.module.mjtDisableBit.mjDSBL_ACTUATION.value;
    this.model.opt.disableflags = enabled
      ? this.model.opt.disableflags & ~bit
      : this.model.opt.disableflags | bit;
  }

  step(): void {
    this.module.mj_step(this.model, this.data);
    this.contactStep += 1;
    if (this.contactStep % 5 === 0) this.measureFootForces();
    const force = this.data.actuator_force as Float64Array;
    const velocity = this.data.actuator_velocity as Float64Array;
    let power = 0;
    for (let index = 0; index < this.model.nactuator; index += 1) {
      power += Math.abs((force[index] ?? 0) * (velocity[index] ?? 0));
    }
    this.energyJoules += power * this.timestep;
    const position: [number, number] = [
      this.jointValue("root_x").position,
      this.jointValue("root_y").position,
    ];
    this.lastVelocity = Math.hypot(
      position[0] - this.lastPosition[0],
      position[1] - this.lastPosition[1],
    ) / this.timestep;
    this.lastPosition = position;
  }

  restoreState(qposValues: readonly number[], qvelValues: readonly number[]): void {
    const qpos = this.data.qpos as Float64Array;
    const qvel = this.data.qvel as Float64Array;
    if (qposValues.length !== qpos.length || qvelValues.length !== qvel.length) {
      throw new Error("Replay state does not match the frozen MuJoCo model.");
    }
    qpos.set(qposValues);
    qvel.set(qvelValues);
    this.module.mj_forward(this.model, this.data);
  }

  sensors(): SensorFrame {
    const joints = {} as SensorFrame["joints"];
    for (const name of ACTUATOR_NAMES) joints[name] = this.jointValue(name);
    const accelAddress = this.sensorAddresses.get("imu_accel") ?? 0;
    const sensors = this.data.sensordata as Float64Array;
    return {
      time: this.data.time,
      position: this.jointValue("root_x").position,
      lateral: this.jointValue("root_y").position,
      height: 0.89 + this.jointValue("root_z").position,
      velocity: this.lastVelocity,
      yaw: this.jointValue("root_yaw").position,
      imu: {
        pitch: this.jointValue("root_pitch").position,
        roll: this.jointValue("root_roll").position,
        pitchRate: this.jointValue("root_pitch").velocity,
        accel: [
          sensors[accelAddress] ?? 0,
          sensors[accelAddress + 1] ?? 0,
          sensors[accelAddress + 2] ?? 0,
        ],
      },
      feet: {
        left: Math.max(sensors[this.sensorAddresses.get("touch_left_foot") ?? 0] ?? 0, this.footForces[0]),
        right: Math.max(sensors[this.sensorAddresses.get("touch_right_foot") ?? 0] ?? 0, this.footForces[1]),
      },
      joints,
    };
  }

  telemetryDrive(): number {
    const force = this.data.actuator_force as Float64Array;
    let peak = 0;
    for (let index = 0; index < this.model.nactuator; index += 1) {
      peak = Math.max(peak, Math.abs(force[index] ?? 0));
    }
    return Math.min(1, peak / 180);
  }

  get energy(): number {
    return this.energyJoules;
  }

  get fallen(): boolean {
    const frame = this.sensors();
    return frame.height < 0.5 || Math.abs(frame.imu.pitch) > 0.96 || Math.abs(frame.imu.roll) > 0.96;
  }

  get worldCollision(): boolean {
    const floorId = this.module.mj_name2id(this.model, this.module.mjtObj.mjOBJ_GEOM.value, "field_floor");
    const bodyIds = this.model.geom_bodyid as Int32Array;
    const contacts = this.data.contact;
    try {
      for (let index = 0; index < contacts.size(); index += 1) {
        const contact = contacts.get(index);
        if (!contact) continue;
        try {
          if (contact.dist > 0) continue;
          const firstWorld = (bodyIds[contact.geom1] ?? -1) === 0;
          const secondWorld = (bodyIds[contact.geom2] ?? -1) === 0;
          if (firstWorld === secondWorld) continue;
          const worldGeom = firstWorld ? contact.geom1 : contact.geom2;
          if (worldGeom !== floorId) return true;
        } finally {
          contact.delete();
        }
      }
      return false;
    } finally {
      contacts.delete();
    }
  }

  dispose(): void {
    this.data.delete();
    this.model.delete();
  }

  private jointValue(name: string): { position: number; velocity: number } {
    const address = this.jointAddresses.get(name);
    if (!address) return { position: 0, velocity: 0 };
    return {
      position: (this.data.qpos as Float64Array)[address.qpos] ?? 0,
      velocity: (this.data.qvel as Float64Array)[address.qvel] ?? 0,
    };
  }

  private measureFootForces(): void {
    const measured: [number, number] = [0, 0];
    const constraintForces = this.data.efc_force as Float64Array;
    const contacts = this.data.contact;
    try {
      for (let index = 0; index < contacts.size(); index += 1) {
        const contact = contacts.get(index);
        if (!contact) continue;
        try {
          if (contact.efc_address < 0) continue;
          const normalForce = Math.max(0, constraintForces[contact.efc_address] ?? 0);
          for (let foot = 0; foot < this.footGeomIds.length; foot += 1) {
            const geomId = this.footGeomIds[foot];
            if (contact.geom1 === geomId || contact.geom2 === geomId) measured[foot] += normalForce;
          }
        } finally {
          contact.delete();
        }
      }
    } finally {
      contacts.delete();
    }
    this.footForces = measured;
  }
}
