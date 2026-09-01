import { BASELINE_CONTROLLER } from "./control/baseline";
import { PHYSICS_MODEL_XML } from "./model/physicsBaseline";
import { ControllerHost } from "./control/ControllerHost";
import { FieldSession } from "./events/FieldSession";
import { MujocoEngine } from "./physics/MujocoEngine";
import { RobotScene, type CameraMode } from "./renderer/RobotScene";
import type { SensorFrame } from "./sim/types";
import { TelemetryBuffer } from "./telemetry/TelemetryBuffer";
import { validateControllerSource } from "./control/validation";
import type { AuthoritativeRun } from "./evidence/contract";
import { verifyArtifactIntegrity } from "./evidence/verify";
import { AgentTrial } from "./agent/AgentTrial";
import { AGENT_TOOL_VERSION, type AgentObservation, type AgentTranscript } from "./agent/contract";
import { registerAgentSiteTools } from "./agent/webmcp";
import { agentGaitTargets } from "./agent/gait";
import { COURSE_CATALOG, parseImportedCourse, type CourseListing } from "./agent/courseCatalog";
import { buildAgentPrompt, type RemoteTrack } from "./agent/prompt";

const CONTROL_DT = 0.01;
const TELEMETRY_DT = 0.04;
const IDLE_RENDER_INTERVAL_MS = 100;
const ACTIVE_UI_INTERVAL_MS = 80;
const IDLE_UI_INTERVAL_MS = 500;

export class App {
  private engine: MujocoEngine | null = null;
  private scene: RobotScene | null = null;
  private readonly controller = new ControllerHost();
  private readonly session = new FieldSession();
  private readonly telemetry = new TelemetryBuffer(750);
  private previousFrameTime = performance.now();
  private accumulator = 0;
  private controlAccumulator = 0;
  private telemetryAccumulator = 0;
  private simulationSpeed = 1;
  private countdownToken = 0;
  private lastUiUpdate = 0;
  private lastSceneRender = Number.NEGATIVE_INFINITY;
  private powerEnabled = true;
  private animationId = 0;
  private readonly heldControls = new Set<string>();
  private mode: "preview" | "agent" | "isolated" = "preview";
  private evaluationState: "empty" | "pending" | "integrityChecked" | "failed" = "empty";
  private authoritativeRun: AuthoritativeRun | null = null;
  private replayIndex = 0;
  private lastRenderedReplayIndex = -1;
  private replayPlaying = false;
  private replayElapsed = 0;
  private readonly agentTrial = new AgentTrial();
  private readonly courseListings: CourseListing[] = [...COURSE_CATALOG];
  private activeCourse: CourseListing = this.courseListings.find((listing) => listing.course.courseId === "practice-first-steps-v1") ?? this.courseListings[0]!;
  private remoteTrack: RemoteTrack = "state-v1";
  private remoteAvailability: "checking" | "ready" | "paused" | "unknown" = "checking";
  private remotePairing: { ticket: string; expiresAt: number; courseId: string; seed: number; track: RemoteTrack } | null = null;
  private agentCommand: {
    drive: number;
    turn: number;
    remainingSeconds: number;
    resolve: (observation: AgentObservation) => void;
    reject: (error: Error) => void;
  } | null = null;

  constructor(private readonly root: HTMLElement) {
    this.agentTrial.configureCourse(this.activeCourse.course);
    this.root.innerHTML = this.template();
    this.bindStaticUi();
  }

  async start(): Promise<void> {
    try {
      const parameters = new URLSearchParams(location.search);
      this.selectCourseFromUrl(parameters.get("course"));
      this.setBoot("Loading 10 MB physics core", 28);
      this.engine = await MujocoEngine.create(PHYSICS_MODEL_XML);
      this.setBoot("Binding visual model", 62);
      this.scene = await RobotScene.create(this.requireElement("#viewport"), this.engine);
      this.scene.configureAgentCourse(this.activeCourse.course.checkpoints);
      this.controller.compile(BASELINE_CONTROLLER);
      this.session.ready();
      this.setBoot("Sensors online", 100);
      this.renderModelStats();
      window.setTimeout(() => this.requireElement("#boot").classList.add("boot--hidden"), 420);
      this.previousFrameTime = performance.now();
      await this.loadEvidenceFromUrl();
      this.installAgentToolApi();
      if (!parameters.has("evidence")) {
        this.setMode("agent");
        await this.checkRemoteAvailability();
        if (parameters.get("agent") !== "1") this.openStartScreen();
      }
      await this.installAgentSiteTools();
      this.animationId = requestAnimationFrame((time) => this.animate(time));
    } catch (error) {
      this.fail(`Simulator initialization failed: ${String(error)}`);
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.animationId);
    this.controller.dispose();
    this.scene?.dispose();
    this.engine?.dispose();
    delete window.solariAgentArena;
  }

  private animate(now: number): void {
    const engine = this.engine;
    const scene = this.scene;
    if (!engine || !scene) return;
    const wallDt = Math.min(0.05, (now - this.previousFrameTime) / 1000);
    this.previousFrameTime = now;
    if (this.mode === "isolated" && this.authoritativeRun) {
      if (this.replayPlaying || now - this.lastSceneRender >= IDLE_RENDER_INTERVAL_MS) {
        const sample = this.advanceReplay(wallDt);
        if (sample) {
          engine.restoreState(sample.qpos, sample.qvel);
          scene.update(sample.frame);
          if (this.replayPlaying || this.replayIndex !== this.lastRenderedReplayIndex) {
            this.renderReplayFrame(sample.frame);
            this.lastRenderedReplayIndex = this.replayIndex;
          }
          this.lastSceneRender = now;
        }
      }
      this.animationId = requestAnimationFrame((time) => this.animate(time));
      return;
    }
    const active = this.mode === "agent"
      ? this.session.phase === "running" && this.agentCommand !== null
      : this.session.phase === "running" || (!this.powerEnabled && this.session.phase === "ready");
    if (active) this.accumulator = Math.min(0.05, this.accumulator + wallDt * this.simulationSpeed);

    let steps = 0;
    let latestFrame: SensorFrame | null = null;
    while (active && this.accumulator >= engine.timestep && steps < 25) {
      this.controlAccumulator += engine.timestep;
      this.telemetryAccumulator += engine.timestep;
      if (this.controlAccumulator >= CONTROL_DT) {
        const controlFrame = engine.sensors();
        if (this.mode === "agent") {
          engine.applyTargets(agentGaitTargets(controlFrame));
        } else {
          this.controller.step(this.copyFrame(controlFrame), CONTROL_DT);
          engine.applyTargets(this.controller.targets);
        }
        const command = this.fieldCommand();
        engine.setFieldDrive(command.drive, command.turn);
        this.controlAccumulator %= CONTROL_DT;
      }
      engine.step();
      const updated = engine.sensors();
      latestFrame = updated;
      const fallen = engine.isFallen(updated);
      if (this.session.phase === "running") {
        this.session.update(updated);
        if (fallen) this.session.fall(updated, engine.energy);
      }
      if (this.telemetryAccumulator >= TELEMETRY_DT) {
        this.captureTelemetry(updated);
        this.telemetryAccumulator %= TELEMETRY_DT;
      }
      if (this.mode === "agent") {
        this.agentTrial.update(updated, engine.worldCollision, fallen);
        this.advanceAgentCommand(engine.timestep, updated);
        if (this.agentCommand === null) {
          this.accumulator = 0;
          break;
        }
      }
      this.accumulator -= engine.timestep;
      steps += 1;
    }

    const sceneDue = active || now - this.lastSceneRender >= IDLE_RENDER_INTERVAL_MS;
    const uiDue = now - this.lastUiUpdate > (active ? ACTIVE_UI_INTERVAL_MS : IDLE_UI_INTERVAL_MS);
    if (sceneDue || uiDue) {
      const frame = latestFrame ?? engine.sensors();
      if (sceneDue) {
        scene.update(frame);
        this.lastSceneRender = now;
      }
      if (uiDue) {
        this.renderTelemetry(frame);
        this.renderRunState();
        if (this.mode === "agent" && active) this.renderAgentPanel(frame);
        this.lastUiUpdate = now;
      }
    }
    this.animationId = requestAnimationFrame((time) => this.animate(time));
  }

  private bindStaticUi(): void {
    this.requireElement("#course-list").addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-course-index]");
      if (button) this.selectCourse(Number(button.dataset.courseIndex));
    });
    this.requireElement("#mission-copy").addEventListener("click", () => void this.copyMissionPrompt());
    this.requireElement("#mission-courses").addEventListener("click", () => this.openStartScreen());
    this.requireElement("#open-courses").addEventListener("click", () => this.openStartScreen());
    this.requireElement("#guide-open").addEventListener("click", () => this.setGuideOpen(true));
    this.requireElement("#guide-close").addEventListener("click", () => this.setGuideOpen(false));
    this.requireElement("#guide-backdrop").addEventListener("click", () => this.setGuideOpen(false));
    this.root.querySelectorAll<HTMLElement>("[data-copy-mcp-command]").forEach((button) => button.addEventListener("click", () => void this.copyMcpCommand(button)));
    this.requireInput("#course-import").addEventListener("change", (event) => void this.importCourse((event.currentTarget as HTMLInputElement).files?.[0]));
    this.requireElement("#mode-preview").addEventListener("click", () => this.setMode("preview"));
    this.requireElement("#mode-agent").addEventListener("click", () => this.setMode("agent"));
    this.requireElement("#mode-isolated").addEventListener("click", () => this.setMode("isolated"));
    this.requireElement("#run-button").addEventListener("click", () => this.toggleRun());
    this.requireElement("#reset-button").addEventListener("click", () => this.reset());
    this.requireElement("#power-button").addEventListener("click", () => this.togglePower());
    this.bindDriveControls();
    this.requireElement("#debug-button").addEventListener("click", (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      const active = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("tool-button--active", active);
      this.scene?.setDebug(active);
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-camera]").forEach((button) => {
      button.addEventListener("click", () => {
        this.root.querySelectorAll("[data-camera]").forEach((item) => item.classList.remove("tool-button--active"));
        button.classList.add("tool-button--active");
        this.scene?.setCameraMode(button.dataset.camera as CameraMode);
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-panel]").forEach((button) => {
      button.addEventListener("click", () => this.selectPanel(button.dataset.panel ?? "lab"));
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-speed]").forEach((button) => {
      button.addEventListener("click", () => {
        if (this.mode === "agent") return;
        this.simulationSpeed = Number(button.dataset.speed);
        this.root.querySelectorAll("[data-speed]").forEach((item) => item.classList.remove("segment__button--active"));
        button.classList.add("segment__button--active");
      });
    });
    this.requireInput("#strength").addEventListener("input", (event) => {
      if (this.mode === "agent") return;
      const value = Number((event.currentTarget as HTMLInputElement).value);
      this.engine?.setActuatorStrength(value);
      this.requireElement("#strength-value").textContent = `${Math.round(value * 100)}%`;
    });
    this.requireInput("#friction").addEventListener("input", (event) => {
      if (this.mode === "agent") return;
      const value = Number((event.currentTarget as HTMLInputElement).value);
      this.engine?.setGroundFriction(value);
      this.requireElement("#friction-value").textContent = value.toFixed(2);
    });
    this.requireElement("#compile-button").addEventListener("click", () => {
      const source = this.requireElement("#controller-source") as HTMLTextAreaElement;
      const validation = validateControllerSource(source.value);
      if (!validation.valid) {
        this.requireElement("#console-output").textContent = validation.reason ?? "Controller validation failed.";
        this.requireElement("#console-output").classList.add("console--error");
        return;
      }
      this.requireElement("#console-output").textContent = "Compiling controller…";
      this.controller.compile(source.value);
    });
    this.requireElement("#isolated-button").addEventListener("click", () => void this.runIsolatedEvaluation());
    this.requireElement("#replay-button").addEventListener("click", () => this.toggleReplay());
    this.requireInput("#replay-scrubber").addEventListener("input", (event) => {
      this.replayPlaying = false;
      this.replayIndex = Number((event.currentTarget as HTMLInputElement).value);
      this.replayElapsed = 0;
      this.setReplayState("paused");
    });
    this.requireElement("#download-evidence").addEventListener("click", () => this.downloadEvidence());
    this.root.querySelectorAll<HTMLButtonElement>("[data-agent-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        const presets: Record<string, { drive: number; turn: number; durationMs: number }> = {
          forward: { drive: 1.2, turn: 0, durationMs: 800 },
          left: { drive: 0.55, turn: 1, durationMs: 650 },
          right: { drive: 0.55, turn: -1, durationMs: 650 },
          reverse: { drive: -0.7, turn: 0, durationMs: 600 },
          wait: { drive: 0, turn: 0, durationMs: 400 },
        };
        const input = presets[button.dataset.agentPreset ?? ""];
        if (input) void this.actAgent(input).catch((error) => this.showAgentStatus(String(error), true));
      });
    });
    this.requireElement("#agent-reset").addEventListener("click", () => this.resetAgentTrial(Number(this.requireInput("#agent-seed").value)));
    this.requireElement("#agent-copy").addEventListener("click", () => void this.copyAgentTranscript());
    this.requireElement("#agent-isolated").addEventListener("click", () => void this.runIsolatedAgentEvaluation());
    this.requireElement("#agent-execute").addEventListener("click", () => void this.executeAgentFormAction());
    this.requireElement("#restore-button").addEventListener("click", () => {
      (this.requireElement("#controller-source") as HTMLTextAreaElement).value = BASELINE_CONTROLLER;
      this.controller.compile(BASELINE_CONTROLLER);
    });
    this.controller.addEventListener("compiled", () => {
      this.requireElement("#console-output").textContent = "Controller compiled. Sensor bridge at 100 Hz.";
      this.requireElement("#console-output").classList.remove("console--error");
    });
    this.controller.addEventListener("error", (event) => {
      const detail = (event as CustomEvent<string>).detail;
      this.requireElement("#console-output").textContent = detail;
      this.requireElement("#console-output").classList.add("console--error");
    });
    document.addEventListener("visibilitychange", () => {
      if (this.mode !== "agent" && document.hidden && this.session.phase === "running") this.session.pause();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.setGuideOpen(false);
      }
    });
    window.addEventListener("beforeunload", () => this.dispose(), { once: true });
  }

  private async toggleRun(): Promise<void> {
    if (!this.engine) return;
    if (this.session.phase === "ready") {
      this.session.countdown();
      const token = ++this.countdownToken;
      const countdown = this.requireElement("#countdown");
      countdown.classList.add("countdown--visible");
      for (const label of ["3", "2", "1", "GO"]) {
        if (token !== this.countdownToken) return;
        countdown.textContent = label;
        await new Promise((resolve) => window.setTimeout(resolve, label === "GO" ? 420 : 650));
      }
      countdown.classList.remove("countdown--visible");
      if (token === this.countdownToken) this.session.start(this.engine.data.time, this.engine.sensors());
    } else if (this.session.phase === "running") {
      this.session.pause();
    } else if (this.session.phase === "paused") {
      this.session.resume(this.engine.data.time, this.engine.sensors());
    } else if (this.session.phase === "fallen") {
      this.reset();
    }
  }

  private reset(seed?: number): void {
    if (!this.engine) return;
    this.countdownToken += 1;
    this.requireElement("#countdown").classList.remove("countdown--visible");
    this.engine.reset(seed);
    this.engine.setActuationEnabled(this.powerEnabled);
    this.telemetry.clear();
    this.accumulator = 0;
    this.controlAccumulator = 0;
    this.telemetryAccumulator = 0;
    this.heldControls.clear();
    this.syncDriveKeys();
    this.session.reset();
  }

  private togglePower(): void {
    if (!this.engine) return;
    this.powerEnabled = !this.powerEnabled;
    this.engine.setActuationEnabled(this.powerEnabled);
    const button = this.requireElement("#power-button");
    button.textContent = this.powerEnabled ? "POWER ON" : "POWER OFF";
    button.classList.toggle("power--off", !this.powerEnabled);
  }

  private bindDriveControls(): void {
    const keyMap: Record<string, string> = {
      w: "forward", ArrowUp: "forward",
      s: "reverse", ArrowDown: "reverse",
      a: "left", ArrowLeft: "left",
      d: "right", ArrowRight: "right",
    };
    window.addEventListener("keydown", (event) => {
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
      const control = keyMap[event.key] ?? keyMap[event.key.toLowerCase()];
      if (!control) return;
      event.preventDefault();
      this.heldControls.add(control);
      this.syncDriveKeys();
    });
    window.addEventListener("keyup", (event) => {
      const control = keyMap[event.key] ?? keyMap[event.key.toLowerCase()];
      if (!control) return;
      this.heldControls.delete(control);
      this.syncDriveKeys();
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-drive]").forEach((button) => {
      const control = button.dataset.drive ?? "";
      const press = (event: PointerEvent) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        this.heldControls.add(control);
        this.syncDriveKeys();
      };
      const release = () => {
        this.heldControls.delete(control);
        this.syncDriveKeys();
      };
      button.addEventListener("pointerdown", press);
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
    });
  }

  private fieldCommand(): { drive: number; turn: number } {
    if (this.mode === "agent") {
      return this.agentCommand
        ? { drive: this.agentCommand.drive, turn: this.agentCommand.turn }
        : { drive: 0, turn: 0 };
    }
    if (this.heldControls.size === 0) {
      return { drive: this.controller.drive, turn: this.controller.turn };
    }
    const drive = (this.heldControls.has("forward") ? 1.35 : 0) - (this.heldControls.has("reverse") ? 0.85 : 0);
    const turn = (this.heldControls.has("left") ? 1.15 : 0) - (this.heldControls.has("right") ? 1.15 : 0);
    return { drive, turn };
  }

  private syncDriveKeys(): void {
    this.root.querySelectorAll<HTMLElement>("[data-drive]").forEach((button) => {
      button.classList.toggle("drive-key--active", this.heldControls.has(button.dataset.drive ?? ""));
    });
  }

  private captureTelemetry(frame: SensorFrame): void {
    if (!this.engine) return;
    this.telemetry.push({
      time: frame.time,
      distance: this.session.distance,
      speed: Math.max(0, frame.velocity),
      pitch: frame.imu.pitch,
      energy: this.engine.energy,
      leftForce: frame.feet.left,
      rightForce: frame.feet.right,
      drive: this.engine.telemetryDrive(),
    });
  }

  private renderTelemetry(frame: SensorFrame): void {
    if (!this.engine) return;
    this.requireElement("#metric-time").textContent = this.session.elapsed.toFixed(3);
    this.requireElement("#metric-speed").textContent = Math.max(0, frame.velocity).toFixed(2);
    this.requireElement("#metric-distance").textContent = this.session.distance.toFixed(2);
    this.requireElement("#metric-energy").textContent = (this.engine.energy / 1000).toFixed(2);
    this.requireElement("#metric-pitch").textContent = `${(frame.imu.pitch * 57.2958).toFixed(1)}°`;
    this.requireElement("#metric-force").textContent = `${Math.round(frame.feet.left + frame.feet.right)} N`;
    this.requireElement("#coord-x").textContent = frame.position.toFixed(1);
    this.requireElement("#coord-y").textContent = frame.lateral.toFixed(1);
    const heading = ((frame.yaw * 57.2958) % 360 + 360) % 360;
    this.requireElement("#metric-heading").textContent = `${heading.toFixed(0)}°`;
    const drive = this.engine.telemetryDrive();
    this.requireElement("#drive-fill").setAttribute("style", `--drive:${(drive * 100).toFixed(1)}%`);
    if (this.mode !== "agent") {
      this.requireElement("#speed-line").setAttribute("points", this.telemetry.points("speed", 360, 74));
      this.requireElement("#pitch-line").setAttribute("points", this.telemetry.points("pitch", 360, 74));
    }
  }

  private renderRunState(): void {
    if (this.mode === "agent" && this.engine) {
      const observation = this.agentTrial.observation(this.engine.sensors());
      const labels: Record<typeof observation.phase, string> = {
        idle: "AGENT IDLE",
        running: this.agentCommand ? "TOOL ACTION" : "AWAITING TOOL",
        complete: "COURSE COMPLETE",
        fallen: "ROBOT FALLEN",
        time_limit: "TIME LIMIT",
      };
      const dot = observation.phase === "complete" ? "ready" : observation.phase === "running" ? "running" : observation.phase === "idle" ? "paused" : "fallen";
      this.requireElement("#phase-label").textContent = labels[observation.phase];
      this.requireElement("#phase-dot").className = `status-dot status-dot--${dot}`;
      return;
    }
    const phase = this.session.phase;
    const runButton = this.requireElement("#run-button");
    const labels: Partial<Record<typeof phase, string>> = {
      ready: "ENTER FIELD",
      countdown: "ARMED",
      running: "PAUSE",
      paused: "RESUME",
      fallen: "RESET ROBOT",
    };
    runButton.textContent = labels[phase] ?? "ENTER FIELD";
    this.requireElement("#phase-label").textContent = phase.toUpperCase();
    this.requireElement("#phase-dot").className = `status-dot status-dot--${phase}`;
    const terminal = phase === "fallen";
    this.requireElement("#result-overlay").classList.toggle("result--visible", terminal);
    if (this.session.result) {
      this.requireElement("#result-title").textContent = "FIELD SESSION ENDED";
      this.requireElement("#result-score").textContent = this.session.result.score.toLocaleString("en-US");
      this.requireElement("#result-detail").textContent = `${this.session.result.distance.toFixed(1)} m explored · ${this.session.result.time.toFixed(2)} s · ${(this.session.result.energy / 1000).toFixed(2)} kJ`;
    }
  }

  private renderModelStats(): void {
    if (!this.engine) return;
    this.requireElement("#model-mass").textContent = "49.8 KG";
    this.requireElement("#model-dof").textContent = `${this.engine.model.nv} DOF`;
    this.requireElement("#model-actuators").textContent = `${this.engine.model.nactuator} ACTUATORS`;
  }

  private selectPanel(panel: string): void {
    this.root.querySelectorAll("[data-panel]").forEach((item) => item.classList.toggle("panel-tab--active", (item as HTMLElement).dataset.panel === panel));
    this.requireElement("#lab-panel").classList.toggle("inspector-panel--active", panel === "lab");
    this.requireElement("#agent-panel").classList.toggle("inspector-panel--active", panel === "agent");
    this.requireElement("#code-panel").classList.toggle("inspector-panel--active", panel === "code");
    this.requireElement("#evidence-panel").classList.toggle("inspector-panel--active", panel === "evidence");
  }

  private setMode(mode: "preview" | "agent" | "isolated"): void {
    this.mode = mode;
    this.root.querySelector(".app-shell")?.classList.toggle("app-shell--isolated", mode === "isolated");
    this.root.querySelector(".app-shell")?.classList.toggle("app-shell--agent", mode === "agent");
    this.requireElement("#mode-preview").classList.toggle("trust-mode--active", mode === "preview");
    this.requireElement("#mode-agent").classList.toggle("trust-mode--active", mode === "agent");
    this.requireElement("#mode-isolated").classList.toggle("trust-mode--active", mode === "isolated");
    this.root.querySelectorAll<HTMLInputElement | HTMLButtonElement>("[data-speed], #strength, #friction").forEach((control) => {
      control.disabled = mode === "agent";
    });
    this.renderTrustState();
    if (mode === "agent") {
      this.powerEnabled = true;
      this.engine?.setActuationEnabled(true);
      this.engine?.setActuatorStrength(1);
      this.engine?.setGroundFriction(1.05);
      this.simulationSpeed = 1;
      this.requireElement("#power-button").textContent = "POWER ON";
      this.requireElement("#power-button").classList.remove("power--off");
      this.requireInput("#strength").value = "1";
      this.requireElement("#strength-value").textContent = "100%";
      this.requireInput("#friction").value = "1.05";
      this.requireElement("#friction-value").textContent = "1.05";
      this.root.querySelectorAll<HTMLElement>("[data-speed]").forEach((item) => item.classList.toggle("segment__button--active", item.dataset.speed === "1"));
      this.setTelemetryPresentation("live");
      this.selectPanel("agent");
      this.renderMissionSummary();
      this.scene?.setAgentCourseProgress(true, 0);
      this.resetAgentTrial(Number(this.requireInput("#agent-seed").value));
    } else if (mode === "isolated") {
      if (this.session.phase === "running") this.session.pause();
      this.setTelemetryPresentation("recorded");
      this.scene?.setAgentCourseProgress(false, 0);
      this.selectPanel(this.authoritativeRun ? "evidence" : "code");
    } else {
      this.replayPlaying = false;
      this.setTelemetryPresentation("live");
      this.scene?.setAgentCourseProgress(false, 0);
      this.selectPanel("lab");
      this.reset();
    }
  }

  private renderTrustState(): void {
    const trust = this.requireElement("#trust-status");
    const viewport = this.requireElement("#viewport-mode");
    const intro = this.requireElement("#evidence-intro-title");
    const detail = this.requireElement("#evidence-intro-detail");
    if (this.mode === "preview") {
      trust.textContent = "NON-ISOLATED / NON-AUTHORITATIVE";
      viewport.textContent = "LOCAL PREVIEW";
      return;
    }
    if (this.mode === "agent") {
      trust.textContent = "AGENT SESSION / TRANSCRIPT ONLY";
      viewport.textContent = "COURSE READY · AWAITING AGENT";
      return;
    }
    const states = {
      empty: ["ISOLATED EVALUATION / NO ARTIFACT LOADED", "EVALUATION SETUP"],
      pending: ["ISOLATED EVALUATION / REQUEST PENDING", "EVALUATION PENDING"],
      integrityChecked: ["SOLARI ARTIFACT / INTEGRITY CHECKED", "RECORDED REPLAY"],
      failed: ["ISOLATED EVALUATION / NO ARTIFACT ISSUED", "EVALUATION FAILED"],
    } as const;
    [trust.textContent, viewport.textContent] = states[this.evaluationState];
    const integrityChecked = this.evaluationState === "integrityChecked";
    intro.textContent = integrityChecked ? "UNSIGNED ARTIFACT / INTEGRITY CHECKED" : "NO VERIFIED ARTIFACT LOADED";
    detail.textContent = integrityChecked
      ? "Hashes are self-consistent and the file came from this deployment. Issuer authenticity is not cryptographically signed."
      : "Authority exists only after the server returns a valid Solari run and this browser checks its hashes.";
    this.renderIsolatedRunState();
  }

  private renderIsolatedRunState(): void {
    if (this.mode !== "isolated") return;
    const replayState = this.requireElement("#replay-state").dataset.state;
    const state = this.evaluationState === "pending"
      ? { label: "EVALUATING", dot: "running" }
      : this.evaluationState === "failed"
        ? { label: "FAILED", dot: "fallen" }
        : this.evaluationState === "integrityChecked"
          ? ({
              ready: { label: "READY", dot: "ready" },
              playing: { label: "REPLAYING", dot: "running" },
              paused: { label: "PAUSED", dot: "paused" },
              complete: { label: "COMPLETE", dot: "ready" },
              unavailable: { label: "NO REPLAY", dot: "paused" },
            }[replayState ?? ""] ?? { label: "READY", dot: "ready" })
          : { label: "ISOLATED", dot: "paused" };
    this.requireElement("#phase-label").textContent = state.label;
    this.requireElement("#phase-dot").className = `status-dot status-dot--${state.dot}`;
  }

  private clearEvidence(): void {
    this.authoritativeRun = null;
    this.lastRenderedReplayIndex = -1;
    for (const element of this.root.querySelectorAll<HTMLElement>("#evidence-panel dd, #evidence-panel code")) element.textContent = "—";
    const replay = this.requireElement("#replay-state");
    replay.dataset.state = "empty";
    replay.textContent = "EMPTY";
    this.requireInput("#replay-scrubber").max = "0";
    this.requireInput("#replay-scrubber").value = "0";
  }

  private async runIsolatedEvaluation(): Promise<void> {
    const source = (this.requireElement("#controller-source") as HTMLTextAreaElement).value;
    const validation = validateControllerSource(source);
    if (!validation.valid && !validation.capability) {
      this.showEvaluationStatus(validation.reason ?? "Controller validation failed.", true);
      return;
    }
    const seed = Number(this.requireInput("#evaluation-seed").value);
    const accessCode = this.requireInput("#evaluation-access-code").value;
    const button = this.requireElement("#isolated-button") as HTMLButtonElement;
    button.disabled = true;
    this.clearEvidence();
    this.evaluationState = "pending";
    this.setMode("isolated");
    this.showEvaluationStatus("Requesting a server-side isolated evaluation…", false);
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json", ...(accessCode ? { authorization: `Bearer ${accessCode}` } : {}) },
        body: JSON.stringify({ controller: source, seed }),
      });
      const text = await response.text();
      let body: Record<string, unknown>;
      try { body = JSON.parse(text) as Record<string, unknown>; }
      catch { throw new Error("Isolated Evaluation requires the server runtime. Start with `vercel dev`, not Vite alone."); }
      if (!response.ok) throw new Error(String(body.error ?? `Evaluation failed (${response.status}).`));
      await this.loadEvidence(body);
      this.showEvaluationStatus("Artifact integrity checked. Ready to replay; issuer signature is not claimed.", false);
    } catch (error) {
      this.evaluationState = "failed";
      this.renderTrustState();
      this.showEvaluationStatus(String(error instanceof Error ? error.message : error), true);
    } finally {
      button.disabled = false;
    }
  }

  private async loadEvidenceFromUrl(): Promise<void> {
    const path = new URLSearchParams(location.search).get("evidence");
    if (!path) return;
    try {
      const url = new URL(path, location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith("/evidence/") || !url.pathname.endsWith(".json")) {
        throw new Error("Evidence must be a same-origin /evidence/*.json artifact.");
      }
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Evidence request failed (${response.status}).`);
      await this.loadEvidence(await response.json());
      this.setMode("isolated");
    } catch (error) {
      this.evaluationState = "failed";
      this.setMode("isolated");
      this.showEvaluationStatus(`Evidence failed verification: ${String(error)}`, true);
    }
  }

  private async loadEvidence(value: unknown): Promise<void> {
    const { run } = await verifyArtifactIntegrity(value);
    this.authoritativeRun = run;
    this.evaluationState = "integrityChecked";
    this.replayIndex = 0;
    this.replayElapsed = 0;
    this.replayPlaying = false;
    this.renderEvidence(run);
    this.selectPanel("evidence");
    this.setReplayState(run.telemetry.sampleCount > 0 ? "ready" : "unavailable");
    this.renderTrustState();
  }

  private advanceReplay(wallDt: number): AuthoritativeRun["telemetry"]["samples"][number] | null {
    const samples = this.authoritativeRun?.telemetry.samples;
    if (!samples?.length) return null;
    if (this.replayPlaying) {
      this.replayElapsed += wallDt;
      while (this.replayIndex < samples.length - 1 && this.replayElapsed >= Math.max(0.001, samples[this.replayIndex + 1]!.time - samples[this.replayIndex]!.time)) {
        this.replayElapsed -= Math.max(0.001, samples[this.replayIndex + 1]!.time - samples[this.replayIndex]!.time);
        this.replayIndex += 1;
      }
      if (this.replayIndex >= samples.length - 1) {
        this.replayPlaying = false;
        this.setReplayState("complete");
      }
    }
    this.requireInput("#replay-scrubber").value = String(this.replayIndex);
    return samples[this.replayIndex] ?? null;
  }

  private toggleReplay(): void {
    const samples = this.authoritativeRun?.telemetry.samples;
    if (!samples?.length) return;
    if (this.replayIndex >= samples.length - 1) {
      this.replayIndex = 0;
      this.lastRenderedReplayIndex = -1;
    }
    this.replayPlaying = !this.replayPlaying;
    this.setReplayState(this.replayPlaying ? "playing" : "paused");
  }

  private setReplayState(state: "ready" | "playing" | "paused" | "complete" | "unavailable"): void {
    const status = this.requireElement("#replay-state");
    status.dataset.state = state;
    status.textContent = state.toUpperCase();
    const replayButton = this.requireElement("#replay-button") as HTMLButtonElement;
    replayButton.disabled = state === "unavailable";
    replayButton.textContent = state === "playing" ? "PAUSE REPLAY" : state === "complete" ? "REPLAY AGAIN" : state === "unavailable" ? "NO REPLAY FOR THIS OUTCOME" : "PLAY INTEGRITY-CHECKED REPLAY";
    this.renderIsolatedRunState();
  }

  private renderReplayFrame(frame: SensorFrame): void {
    this.requireElement("#metric-time").textContent = frame.time.toFixed(3);
    this.requireElement("#metric-speed").textContent = Math.max(0, frame.velocity).toFixed(2);
    this.requireElement("#metric-distance").textContent = frame.position.toFixed(2);
    this.requireElement("#metric-energy").textContent = ((this.authoritativeRun?.metrics.energyJoules ?? 0) / 1000).toFixed(2);
    this.requireElement("#coord-x").textContent = frame.position.toFixed(1);
    this.requireElement("#coord-y").textContent = frame.lateral.toFixed(1);
    this.requireElement("#speed-line").setAttribute("points", this.replayPoints((sample) => Math.max(0, sample.frame.velocity)));
    this.requireElement("#pitch-line").setAttribute("points", this.replayPoints((sample) => sample.frame.imu.pitch));
  }

  private replayPoints(value: (sample: AuthoritativeRun["telemetry"]["samples"][number]) => number): string {
    const samples = this.authoritativeRun?.telemetry.samples;
    if (!samples?.length) return "";
    const values = samples.map(value);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const span = Math.max(1e-9, maximum - minimum);
    const denominator = Math.max(1, samples.length - 1);
    return samples.slice(0, this.replayIndex + 1).map((sample, index) => {
      const x = (index / denominator) * 360;
      const y = 74 - ((value(sample) - minimum) / span) * 74;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
  }

  private setTelemetryPresentation(mode: "live" | "recorded"): void {
    const recorded = mode === "recorded";
    this.requireElement("#metric-distance-label").textContent = recorded ? "RECORDED X / M" : "EXPLORED / M";
    this.requireElement("#metric-energy-label").textContent = recorded ? "RUN ENERGY / KJ" : "ENERGY / KJ";
    this.requireElement("#speed-chart-mode").textContent = recorded ? "RECORDED" : "LIVE";
    this.requireElement("#pitch-chart-mode").textContent = recorded ? "RECORDED" : "RAD";
  }

  private installAgentToolApi(): void {
    window.solariAgentArena = Object.freeze({
      version: AGENT_TOOL_VERSION,
      reset: (seed = 42) => this.resetAgentFromTool(seed),
      observe: () => this.observeAgent(),
      act: (input) => this.actAgent(input),
      transcript: () => this.agentTrial.transcript(),
      manifest: () => ({ course: structuredClone(this.activeCourse.course) }),
    });
  }

  private async installAgentSiteTools(): Promise<void> {
    try {
      const installed = await registerAgentSiteTools({
        reset: (seed) => this.resetAgentFromTool(seed),
        observe: () => this.observeAgent(),
        act: (input) => this.actAgent(input),
        transcript: () => this.agentTrial.transcript(),
      });
      this.requireElement("#agent-interface").textContent = installed
        ? "CODEX SITE TOOLS READY · WINDOW API READY"
        : "WINDOW API READY · SITE TOOLS REQUIRE CODEX BROWSER";
    } catch (error) {
      this.requireElement("#agent-interface").textContent = "WINDOW API READY · SITE TOOL REGISTRATION FAILED";
      console.warn("Site tool registration failed", error);
    }
  }

  private resetAgentFromTool(seed: number): AgentObservation {
    this.requireInput("#agent-seed").value = String(seed);
    if (this.mode !== "agent") {
      this.setMode("agent");
      return this.observeAgent();
    }
    return this.resetAgentTrial(seed);
  }

  private resetAgentTrial(seed: number): AgentObservation {
    if (!this.engine) throw new Error("MuJoCo is not ready.");
    this.agentCommand?.reject(new Error("Agent trial reset."));
    this.agentCommand = null;
    this.reset(seed);
    const frame = this.engine.sensors();
    this.session.start(this.engine.data.time, frame);
    this.agentTrial.reset(seed, this.engine.data.time);
    this.scene?.setAgentCourseProgress(true, 0);
    const observation = this.agentTrial.observation(frame);
    this.renderAgentPanel(frame);
    this.showAgentStatus("RESET receipt · awaiting observe/act tool call", false);
    return observation;
  }

  private observeAgent(): AgentObservation {
    if (!this.engine) throw new Error("MuJoCo is not ready.");
    if (this.mode !== "agent") throw new Error("Open Agent Tool Trial before observing.");
    return this.agentTrial.observation(this.engine.sensors());
  }

  private actAgent(input: { drive: number; turn: number; durationMs: number; expectedSequence?: number }): Promise<AgentObservation> {
    if (!this.engine) return Promise.reject(new Error("MuJoCo is not ready."));
    if (this.mode !== "agent") this.setMode("agent");
    if (this.agentCommand) return Promise.reject(new Error("Wait for the active tool action to finish."));
    const action = this.agentTrial.recordAction(input);
    this.showAgentStatus(`ACT ${String(action.sequence).padStart(3, "0")} · drive ${action.drive.toFixed(2)} · turn ${action.turn.toFixed(2)} · ${action.durationMs} ms`, false);
    return new Promise<AgentObservation>((resolve, reject) => {
      this.agentCommand = {
        drive: action.drive,
        turn: action.turn,
        remainingSeconds: action.durationMs / 1000,
        resolve,
        reject,
      };
    });
  }

  private advanceAgentCommand(timestep: number, frame: SensorFrame): void {
    const command = this.agentCommand;
    if (!command) return;
    command.remainingSeconds -= timestep;
    const observation = this.agentTrial.observation(frame);
    if (command.remainingSeconds <= 1e-9 || observation.phase !== "running") {
      this.agentCommand = null;
      this.renderAgentPanel(frame);
      command.resolve(observation);
    }
  }

  private renderAgentPanel(frame: SensorFrame): void {
    const observation = this.agentTrial.observation(frame);
    const values: Record<string, string> = {
      "#agent-phase": observation.phase === "running" && observation.actionsUsed === 0 ? "READY" : observation.phase.toUpperCase().replace("_", " "),
      "#agent-checkpoints": `${observation.checkpoints.reached} / ${observation.checkpoints.total}`,
      "#agent-next": observation.checkpoints.nextId ?? "FINISH",
      "#agent-position": `${observation.position.x.toFixed(2)}, ${observation.position.y.toFixed(2)}`,
      "#agent-yaw": observation.yawRadians.toFixed(3),
      "#agent-time": `${observation.simulatedTimeSeconds.toFixed(2)} S`,
      "#agent-collisions": String(observation.collisions),
      "#agent-actions": `${observation.actionsUsed} / ${observation.actionBudget}`,
    };
    for (const [selector, value] of Object.entries(values)) this.requireElement(selector).textContent = value;
    this.requireInput("#agent-observation-json").value = JSON.stringify(observation);
    this.scene?.setAgentCourseProgress(this.mode === "agent", observation.checkpoints.reached);
    const recent = this.agentTrial.transcript().actions.slice(-5).map((action) => `#${action.sequence} d=${action.drive.toFixed(2)} t=${action.turn.toFixed(2)} ${action.durationMs}ms`);
    this.requireElement("#agent-transcript").textContent = recent.length ? recent.join("\n") : "No actions recorded.";
    this.requireInput("#agent-transcript-json").value = JSON.stringify(this.agentTrial.transcript());
  }

  private showAgentStatus(message: string, error: boolean): void {
    const status = this.requireElement("#agent-status");
    status.textContent = message;
    status.classList.toggle("console--error", error);
  }

  private async copyAgentTranscript(): Promise<void> {
    const transcript: AgentTranscript = this.agentTrial.transcript();
    await this.writeClipboard(JSON.stringify(transcript, null, 2));
    this.showAgentStatus(this.activeCourse.authoritative
      ? "Transcript copied. It is eligible for isolated deterministic scoring."
      : "Transcript copied. This practice/local route cannot mint an authoritative score.", false);
  }

  private async executeAgentFormAction(): Promise<void> {
    const button = this.requireElement("#agent-execute") as HTMLButtonElement;
    button.disabled = true;
    try {
      const observation = await this.actAgent({
        drive: Number(this.requireInput("#agent-drive").value),
        turn: Number(this.requireInput("#agent-turn").value),
        durationMs: Number(this.requireInput("#agent-duration").value),
      });
      button.dataset.receipt = String(observation.actionsUsed - 1);
      this.showAgentStatus(`ACT COMPLETE · ${observation.actionsUsed} actions · ${observation.simulatedTimeSeconds.toFixed(3)} simulated seconds`, false);
    } catch (error) {
      this.showAgentStatus(String(error), true);
    } finally { button.disabled = false; }
  }

  private async runIsolatedAgentEvaluation(): Promise<void> {
    const button = this.requireElement("#agent-isolated") as HTMLButtonElement;
    const accessCode = this.requireInput("#agent-access-code").value;
    if (!this.activeCourse.authoritative) {
      this.showAgentStatus("Practice and imported routes are local trials. Choose the official Slalom Ramp for isolated scoring.", true);
      return;
    }
    button.disabled = true;
    this.showAgentStatus("Submitting the bounded transcript for isolated deterministic replay…", false);
    this.clearEvidence();
    this.evaluationState = "pending";
    try {
      const response = await fetch("/api/agent-evaluate", {
        method: "POST",
        headers: { "content-type": "application/json", ...(accessCode ? { authorization: `Bearer ${accessCode}` } : {}) },
        body: JSON.stringify({ transcript: this.agentTrial.transcript(), agentLabel: "browser-tool-agent" }),
      });
      const text = await response.text();
      let body: Record<string, unknown>;
      try { body = JSON.parse(text) as Record<string, unknown>; }
      catch { throw new Error("Isolated scoring requires the server runtime. Start with `vercel dev`, not Vite alone."); }
      if (!response.ok) throw new Error(String(body.error ?? `Agent evaluation failed (${response.status}).`));
      await this.loadEvidence(body);
      this.setMode("isolated");
      this.showEvaluationStatus("Agent transcript scored in Solari. Artifact integrity checked and ready to replay.", false);
    } catch (error) {
      this.evaluationState = "failed";
      this.showAgentStatus(String(error instanceof Error ? error.message : error), true);
    } finally { button.disabled = false; }
  }

  private renderEvidence(run: AuthoritativeRun): void {
    const values: Record<string, string> = {
      "#evidence-run-id": run.runId,
      "#evidence-controller-hash": run.controllerHash,
      "#evidence-outcome": run.outcome.status.toUpperCase(),
      "#evidence-checkpoints": `${run.metrics.checkpoints} / ${run.metrics.checkpointsTotal}`,
      "#evidence-score": run.metrics.score.toLocaleString("en-US"),
      "#evidence-time": `${run.metrics.timeSeconds.toFixed(2)} S`,
      "#evidence-collisions": String(run.metrics.collisions),
      "#evidence-telemetry-hash": run.telemetry.hash,
      "#evidence-result-hash": run.resultHash,
      "#evidence-seed": String(run.seed),
    };
    for (const [selector, value] of Object.entries(values)) this.requireElement(selector).textContent = value;
    const scrubber = this.requireInput("#replay-scrubber");
    scrubber.max = String(Math.max(0, run.telemetry.sampleCount - 1));
    scrubber.value = "0";
  }

  private showEvaluationStatus(message: string, error: boolean): void {
    const status = this.requireElement("#evaluation-status");
    status.textContent = message;
    status.classList.toggle("console--error", error);
  }

  private downloadEvidence(): void {
    if (!this.authoritativeRun) return;
    const blob = new Blob([JSON.stringify(this.authoritativeRun, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${this.authoritativeRun.runId}.solari-run.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  private setBoot(label: string, progress: number): void {
    this.requireElement("#boot-label").textContent = label;
    this.requireElement("#boot-progress").setAttribute("style", `--progress:${progress}%`);
  }

  private openStartScreen(): void {
    this.renderCourseLibrary();
    this.renderRemoteTrack();
    this.requireElement("#start-screen").classList.add("start-screen--visible");
    this.requireElement(".app-shell").setAttribute("inert", "");
    window.setTimeout(() => {
      this.requireElement(".course-row--active").focus();
    }, 60);
  }

  private closeStartScreen(): void {
    this.requireElement("#start-screen").classList.remove("start-screen--visible");
    this.requireElement(".app-shell").removeAttribute("inert");
    this.requireElement("#mission-copy").focus();
  }

  private setGuideOpen(open: boolean): void {
    const drawer = this.requireElement("#guide-drawer");
    const wasOpen = drawer.classList.contains("guide-drawer--open");
    if (!open && !wasOpen) return;
    drawer.classList.toggle("guide-drawer--open", open);
    drawer.setAttribute("aria-hidden", String(!open));
    if (open) {
      this.requireElement(".app-shell").setAttribute("inert", "");
      window.setTimeout(() => this.requireElement("#guide-close").focus(), 40);
    } else {
      if (!this.requireElement("#start-screen").classList.contains("start-screen--visible")) this.requireElement(".app-shell").removeAttribute("inert");
      this.requireElement("#guide-open").focus();
    }
  }

  private selectCourse(index: number): void {
    const listing = this.courseListings[index];
    if (!listing) return;
    this.activeCourse = listing;
    this.remotePairing = null;
    this.agentTrial.configureCourse(listing.course);
    this.scene?.configureAgentCourse(listing.course.checkpoints);
    if (this.engine) {
      if (this.mode !== "agent") this.setMode("agent");
      else this.resetAgentTrial(Number(this.requireInput("#agent-seed").value));
    }
    this.renderCourseLibrary();
    this.renderMissionSummary();
    this.renderRemoteTrack();
    if (this.requireElement("#start-screen").classList.contains("start-screen--visible")) this.closeStartScreen();
  }

  private selectCourseFromUrl(courseId: string | null): void {
    if (!courseId) return;
    const listing = this.courseListings.find((candidate) => candidate.source !== "imported" && candidate.course.courseId === courseId);
    if (!listing) throw new Error(`Unknown or non-transferable courseId: ${courseId}`);
    this.activeCourse = listing;
    this.remotePairing = null;
    this.agentTrial.configureCourse(listing.course);
    this.renderCourseLibrary();
    this.renderMissionSummary();
  }

  private renderCourseLibrary(): void {
    this.requireElement("#course-list").innerHTML = this.courseListings.map((listing, index) => `
      <button class="course-row${listing === this.activeCourse ? " course-row--active" : ""}" data-course-index="${index}" aria-pressed="${listing === this.activeCourse}">
        <span class="course-row__map">${listing.course.checkpoints.map((_, point) => `<i style="--point:${point}"></i>`).join("")}</span>
        <span class="course-row__copy"><strong>${this.escapeHtml(listing.title)}</strong><small>${this.escapeHtml(listing.summary)}</small></span>
        <span class="course-row__meta"><b>${this.escapeHtml(listing.difficulty)}</b><em>${listing.authoritative ? "OFFICIAL SCORE" : listing.source === "imported" ? "LOCAL IMPORT" : "PRACTICE"}</em></span>
      </button>`).join("");
    this.requireElement("#selected-course-name").textContent = this.activeCourse.title;
    this.requireElement("#selected-course-summary").textContent = this.activeCourse.summary;
    this.requireElement("#selected-course-meta").textContent = `${this.activeCourse.course.checkpoints.length} checkpoints · ${this.activeCourse.course.maxSeconds}s · ${this.activeCourse.authoritative ? "recorded practice + isolated scoring" : "recorded browser practice"}`;
  }

  private renderMissionSummary(): void {
    this.requireElement("#mission-course").textContent = this.activeCourse.title;
    this.requireElement("#mission-description").textContent = this.activeCourse.summary;
    this.requireElement("#mission-authority").textContent = "WORLD READY · AWAITING FIRST DECISION";
    const isolated = this.requireElement("#agent-isolated") as HTMLButtonElement;
    isolated.disabled = !this.activeCourse.authoritative;
    isolated.textContent = this.activeCourse.authoritative ? "RUN ISOLATED SCORE" : "OFFICIAL COURSE REQUIRED";
  }

  private renderRemoteTrack(): void {
    const copy = this.requireElement("#mission-copy") as HTMLButtonElement;
    const status = this.requireElement("#remote-connect-status");
    status.classList.toggle("remote-connect-status--paused", this.remoteAvailability === "paused");
    if (!this.remotePairing) {
      copy.textContent = "COPY AGENT PROMPT ↗";
      copy.disabled = this.activeCourse.source === "imported" || this.remoteAvailability === "checking" || this.remoteAvailability === "paused";
      status.textContent = this.activeCourse.source === "imported"
        ? "Imported courses stay in this browser and cannot create a hosted session."
        : this.remoteAvailability === "checking"
          ? "Checking hosted practice availability…"
          : this.remoteAvailability === "paused"
            ? "Hosted agent sessions are paused. The selected course is still ready for local inspection."
            : "Arena ready. Copy the prompt and paste it into your agent.";
    }
  }

  private async checkRemoteAvailability(): Promise<void> {
    try {
      const response = await fetch("/api/arena-ticket", { method: "GET", headers: { accept: "application/json" } });
      const body = await response.json() as { enabled?: boolean };
      this.remoteAvailability = response.ok && body.enabled === false ? "paused" : response.ok && body.enabled === true ? "ready" : "unknown";
    } catch {
      this.remoteAvailability = "unknown";
    }
    this.renderRemoteTrack();
  }

  private async connectRemoteAgent(copy: HTMLButtonElement): Promise<boolean> {
    if (this.activeCourse.source === "imported") {
      this.requireElement("#remote-connect-status").textContent = "Imported routes are local-only. Choose a built-in course for hosted agent practice.";
      return false;
    }
    const seed = Number(this.requireInput("#agent-seed").value) || 42;
    copy.disabled = true; copy.textContent = "CREATING SOLARI RUN…";
    this.requireElement("#remote-connect-status").textContent = "Solari Browser is loading the selected course and verifying its seed and manifest.";
    try {
      const response = await fetch("/api/arena-ticket", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId: this.activeCourse.course.courseId, seed, track: this.remoteTrack }),
      });
      const text = await response.text();
      let body: { pairingTicket?: string; expiresAt?: string; error?: string };
      try { body = JSON.parse(text) as typeof body; }
      catch { throw new Error("Hosted Agent Practice requires the deployed app or `vercel dev`; Vite serves the browser UI only."); }
      if (!response.ok || !body.pairingTicket || !body.expiresAt) throw new Error(body.error ?? "Hosted Agent Practice did not issue a ticket.");
      const expiresAt = Date.parse(body.expiresAt);
      this.remotePairing = { ticket: body.pairingTicket, expiresAt, courseId: this.activeCourse.course.courseId, seed, track: this.remoteTrack };
      copy.textContent = "RUN READY · COPYING PROMPT…";
      copy.disabled = false;
      this.requireElement("#remote-connect-status").textContent = `Run reserved until ${new Date(expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Copying its complete system prompt…`;
      window.setTimeout(() => {
        const pairing = this.remotePairing;
        if (pairing && pairing.ticket === body.pairingTicket && pairing.expiresAt <= Date.now()) {
          this.remotePairing = null;
          this.renderRemoteTrack();
        }
      }, Math.max(0, expiresAt - Date.now()) + 200);
      return true;
    } catch (error) {
      this.remotePairing = null;
      copy.textContent = this.remoteAvailability === "paused" ? "COPY AGENT PROMPT ↗" : "TRY AGAIN · CREATE RUN";
      copy.disabled = this.remoteAvailability === "paused";
      this.requireElement("#remote-connect-status").textContent = String(error instanceof Error ? error.message : error);
      return false;
    }
  }

  private async copyMcpCommand(button: HTMLElement): Promise<void> {
    const command = "https://solari-agent-arena.vercel.app/mcp";
    await this.writeClipboard(command);
    button.textContent = "COPIED";
    window.setTimeout(() => { button.textContent = button.dataset.copyLabel ?? "COPY SETUP COMMAND"; }, 1_800);
  }

  private async copyMissionPrompt(): Promise<void> {
    const seed = Number(this.requireInput("#agent-seed").value) || 42;
    const button = this.requireElement("#mission-copy");
    if (!this.remotePairing || this.remotePairing.expiresAt <= Date.now() || this.remotePairing.courseId !== this.activeCourse.course.courseId || this.remotePairing.seed !== seed || this.remotePairing.track !== this.remoteTrack) {
      const connected = await this.connectRemoteAgent(button as HTMLButtonElement);
      if (!connected || !this.remotePairing) return;
    }
    const prompt = buildAgentPrompt(
      this.activeCourse,
      seed,
      this.remotePairing.ticket,
      this.remoteTrack,
      `${window.location.origin}/api/arena-command`,
    );
    const restingLabel = "COPY AGENT PROMPT ↗";
    try {
      await this.writeClipboard(prompt);
      button.textContent = "PROMPT COPIED — GIVE IT TO YOUR AGENT";
      button.classList.add("copy-success");
      this.requireElement("#prompt-fallback").classList.remove("prompt-fallback--visible");
      this.requireElement("#remote-connect-status").textContent = "Copied. Paste it as the agent's first message; the run starts from that prompt with no plugin setup.";
      window.setTimeout(() => { button.textContent = restingLabel; button.classList.remove("copy-success"); }, 2_400);
    } catch {
      const fallback = this.requireElement("#prompt-fallback") as HTMLTextAreaElement;
      fallback.value = prompt;
      fallback.classList.add("prompt-fallback--visible");
      fallback.focus(); fallback.select();
      this.requireElement("#course-import-status").textContent = "Automatic copy was blocked. The complete mission is selected below—copy it, paste it into your agent, and keep this tab open.";
    }
  }

  private async importCourse(file?: File): Promise<void> {
    if (!file) return;
    try {
      if (file.size > 32_000) throw new Error("Course files must be 32 KB or smaller.");
      const listing = parseImportedCourse(JSON.parse(await file.text()));
      const existing = this.courseListings.findIndex((item) => item.course.courseId === listing.course.courseId);
      if (existing >= 0 && this.courseListings[existing]?.source !== "imported") throw new Error("Built-in course IDs cannot be replaced by local imports.");
      if (existing >= 0) this.courseListings.splice(existing, 1, listing); else this.courseListings.push(listing);
      this.selectCourse(this.courseListings.indexOf(listing));
      this.requireElement("#course-import-status").textContent = `${listing.title} is a local browser trial. The file never leaves this page and cannot mint a Solari score.`;
    } catch (error) {
      this.requireElement("#course-import-status").textContent = String(error instanceof Error ? error.message : error);
    } finally { this.requireInput("#course-import").value = ""; }
  }

  private async writeClipboard(text: string): Promise<void> {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(text);
    } catch {
      const fallback = document.createElement("textarea");
      fallback.value = text;
      fallback.setAttribute("readonly", "");
      fallback.style.position = "fixed";
      fallback.style.left = "-10000px";
      document.body.append(fallback);
      try {
        fallback.select();
        if (!document.execCommand("copy")) throw new Error("Copy failed.");
      } finally { fallback.remove(); }
    }
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" })[character] ?? character);
  }

  private fail(message: string): void {
    this.requireElement("#boot-label").textContent = message;
    this.requireElement("#boot").classList.add("boot--error");
  }

  private copyFrame(frame: SensorFrame): SensorFrame {
    return structuredClone(frame);
  }

  private requireElement(selector: string): HTMLElement {
    const element = this.root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing required element: ${selector}`);
    return element;
  }

  private requireInput(selector: string): HTMLInputElement {
    const input = this.root.querySelector<HTMLInputElement>(selector);
    if (!input) throw new Error(`Missing required input: ${selector}`);
    return input;
  }

  private template(): string {
    return `
      <div class="app-shell">
        <header class="topbar">
          <div class="brand"><span class="brand__mark">SA</span><span>SOLARI AGENT ARENA</span></div>
          <nav class="product-nav" aria-label="Arena navigation"><button id="open-courses">CHOOSE COURSE</button><button id="guide-open" hidden>TOOLS & PHYSICS</button></nav>
          <div class="system-state"><span id="phase-dot" class="status-dot status-dot--loading"></span><span id="phase-label" data-testid="phase-label">LOADING</span><small>MUJOCO 3.12 / WASM</small></div>
        </header>

        <section class="trust-switch" aria-label="Evaluation trust boundary">
          <div class="trust-switch__copy"><small>EXECUTION BOUNDARY</small><strong id="trust-status">NON-ISOLATED / NON-AUTHORITATIVE</strong></div>
          <div class="trust-switch__modes">
            <button id="mode-preview" class="trust-mode trust-mode--active"><span>01</span><strong>LOCAL PREVIEW</strong><small>Browser Worker · fast feedback</small></button>
            <button id="mode-agent" class="trust-mode"><span>02</span><strong>AGENT TOOL TRIAL</strong><small>Observe/act tools · transcript</small></button>
            <button id="mode-isolated" class="trust-mode"><span>03</span><strong>ISOLATED EVALUATION</strong><small>Solari Sandbox · artifact on success</small></button>
          </div>
          <a href="https://github.com/EXO-Robotics/solari-agent-arena#why-solari-matters" target="_blank" rel="noreferrer">WHY THIS BOUNDARY ↗</a>
        </section>

        <main class="workspace">
          <section class="simulation" aria-label="3D humanoid simulation">
            <div id="viewport" class="viewport"></div>
            <div class="viewport__hud viewport__hud--top">
              <div><small id="viewport-mode">LOCAL PREVIEW</small><strong>AION // H1-S</strong></div>
              <div class="model-tags"><span id="model-mass">— KG</span><span id="model-dof">— DOF</span><span id="model-actuators">— ACTUATORS</span></div>
            </div>
            <div class="viewport__hud viewport__hud--bottom">
              <div class="field-position"><span>WORLD X <b id="coord-x">0.0</b></span><span>WORLD Y <b id="coord-y">0.0</b></span><span class="preview-only">W/A/S/D TO STEER</span><span class="agent-only">MCP / BROWSER TOOL CONTROL · TRANSCRIPT ONLY</span><span class="isolated-only">RECORDED MUJOCO STATE / NO BROWSER SCORING</span></div>
              <div class="field-bearing"><i></i><span>NAV GRID / 5 M</span></div>
            </div>
            <div class="toolrail" aria-label="View controls">
              <button class="tool-button" data-camera="broadcast" title="Free camera">B</button>
              <button class="tool-button tool-button--active" data-camera="follow" title="Follow camera">F</button>
              <button class="tool-button" data-camera="overhead" title="Overhead camera">T</button>
              <span></span>
              <button id="debug-button" class="tool-button" aria-pressed="false" title="Physics debug">Δ</button>
            </div>
            <div class="drive-pad" aria-label="Robot drive controls">
              <button data-drive="forward" aria-label="Drive forward">W</button>
              <button data-drive="left" aria-label="Turn left">A</button>
              <button data-drive="reverse" aria-label="Drive backward">S</button>
              <button data-drive="right" aria-label="Turn right">D</button>
            </div>
            <div id="countdown" class="countdown">3</div>
            <div id="result-overlay" class="result">
              <small id="result-title">FIELD SESSION ENDED</small>
              <strong id="result-score">0</strong>
              <span>SCORE</span>
              <p id="result-detail">0.0 m explored · 0.00 s · 0.00 kJ</p>
            </div>
          </section>

          <aside class="inspector">
            <nav class="panel-tabs" aria-label="Inspector panels">
              <button class="panel-tab panel-tab--active" data-panel="lab">ROBOT LAB</button>
              <button class="panel-tab" data-panel="agent">AGENT TOOLS</button>
              <button class="panel-tab" data-panel="code">CONTROLLER</button>
              <button class="panel-tab" data-panel="evidence">EVIDENCE</button>
            </nav>
            <div id="lab-panel" class="inspector-panel inspector-panel--active">
              <div class="mode-note"><span>LOCAL PREVIEW / NOT A SECURITY BOUNDARY</span><p>The Worker watchdog protects responsiveness. It does not isolate same-origin code or issue authoritative results.</p></div>
              <section class="control-section">
                <div class="section-label"><span>ACTUATOR STRENGTH</span><output id="strength-value">100%</output></div>
                <input id="strength" type="range" min="0.35" max="1.5" value="1" step="0.05" />
                <div class="range-label"><span>35%</span><span>150%</span></div>
              </section>
              <section class="control-section">
                <div class="section-label"><span>FOOT FRICTION</span><output id="friction-value">1.05</output></div>
                <input id="friction" type="range" min="0.2" max="1.6" value="1.05" step="0.05" />
                <div class="range-label"><span>ICE</span><span>TERRAIN</span></div>
              </section>
              <section class="control-section">
                <div class="section-label"><span>SIMULATION RATE</span><output>FIXED 2 MS</output></div>
                <div class="segment"><button data-speed="0.25">¼×</button><button data-speed="0.5">½×</button><button class="segment__button--active" data-speed="1">1×</button></div>
              </section>
              <section class="sensor-readout">
                <div><span>HEADING</span><strong id="metric-heading">0°</strong></div>
                <div><span>GROUND FORCE</span><strong id="metric-force">0 N</strong></div>
                <div><span>IMU PITCH</span><strong id="metric-pitch">0.0°</strong></div>
                <div class="drive"><span>ACTUATOR LOAD</span><i id="drive-fill"></i></div>
              </section>
            </div>
            <div id="agent-panel" class="inspector-panel inspector-panel--agent">
              <header class="mission-head">
                <span id="mission-authority">COURSE READY</span>
                <h1 id="mission-course">${this.escapeHtml(this.activeCourse.title)}</h1>
                <p id="mission-description">${this.escapeHtml(this.activeCourse.summary)}</p>
                <div class="mission-actions"><button id="mission-copy" class="button button--accent">COPY AGENT PROMPT ↗</button><button id="mission-courses" type="button" hidden>CHANGE COURSE</button></div>
                <input id="agent-seed" type="hidden" value="42" />
                <p id="remote-connect-status" class="remote-connect-status" aria-live="polite">Getting the arena ready…</p>
                <textarea id="prompt-fallback" class="prompt-fallback" aria-label="Agent mission prompt"></textarea>
              </header>
              <dl class="agent-grid">
                <div><dt>PHASE</dt><dd id="agent-phase" data-testid="agent-phase">IDLE</dd></div>
                <div><dt>CHECKPOINTS</dt><dd id="agent-checkpoints" data-testid="agent-checkpoints">0 / 5</dd></div>
                <div><dt>NEXT</dt><dd id="agent-next" data-testid="agent-next">SLALOM ENTRY</dd></div>
                <div><dt>POSITION X,Y</dt><dd id="agent-position" data-testid="agent-position">0.00, 0.00</dd></div>
                <div><dt>YAW / RAD</dt><dd id="agent-yaw" data-testid="agent-yaw">0.000</dd></div>
                <div><dt>SIM TIME</dt><dd id="agent-time" data-testid="agent-time">0.00 S</dd></div>
                <div><dt>COLLISIONS</dt><dd id="agent-collisions" data-testid="agent-collisions">0</dd></div>
                <div><dt>ACTIONS</dt><dd id="agent-actions" data-testid="agent-actions">0 / 120</dd></div>
              </dl>
              <details id="agent-manual-tools" class="manual-tools">
                <summary>Manual tool console <span>for testing & automation</span></summary>
              <div class="agent-actions" aria-label="Agent tool actions">
                <button data-agent-preset="left" data-testid="agent-turn-left">ARC LEFT</button>
                <button data-agent-preset="forward" data-testid="agent-forward">FORWARD</button>
                <button data-agent-preset="right" data-testid="agent-turn-right">ARC RIGHT</button>
                <button data-agent-preset="reverse">REVERSE</button>
                <button data-agent-preset="wait">WAIT</button>
              </div>
              <div class="agent-command-form" aria-label="Exact bounded agent action">
                <label>DRIVE<input id="agent-drive" type="number" min="-1.6" max="1.6" step="0.05" value="1.2" /></label>
                <label>TURN<input id="agent-turn" type="number" min="-1.4" max="1.4" step="0.05" value="0" /></label>
                <label>MS<input id="agent-duration" type="number" min="100" max="2000" step="50" value="800" /></label>
                <button id="agent-execute" data-testid="agent-execute" data-receipt="-1">EXECUTE ACTION</button>
              </div>
              <pre id="agent-transcript" class="agent-transcript">No actions recorded.</pre>
              <textarea id="agent-observation-json" class="agent-transcript-json" data-testid="agent-observation-json" tabindex="-1" aria-hidden="true"></textarea>
              <textarea id="agent-transcript-json" class="agent-transcript-json" data-testid="agent-transcript-json" tabindex="-1" aria-hidden="true"></textarea>
              <div id="agent-interface" class="agent-interface" data-testid="agent-interface" data-api-version="${AGENT_TOOL_VERSION}">INITIALIZING TOOL INTERFACES…</div>
              <div class="evaluation-input"><label for="agent-access-code">ACCESS</label><input id="agent-access-code" type="password" autocomplete="off" placeholder="demo code" /><span>SERVER ADMISSION ONLY</span></div>
              <div id="agent-status" class="console evaluation-status" data-testid="agent-status">Open with ?agent=1 or call window.solariAgentArena.</div>
              </details>
              <div class="agent-footer"><button id="agent-reset" class="button button--quiet">RESET TRIAL</button><button id="agent-copy" class="button button--quiet">COPY TRANSCRIPT</button><button id="agent-isolated" class="button button--accent">RUN ISOLATED SCORE</button></div>
            </div>
            <div id="code-panel" class="inspector-panel inspector-panel--code">
              <div class="editor-head"><span>control.js</span><small>PREVIEW + EVALUATION INPUT</small></div>
              <textarea id="controller-source" class="code-editor" spellcheck="false" aria-label="JavaScript robot controller">${BASELINE_CONTROLLER}</textarea>
              <div id="console-output" class="console">Baseline controller ready.</div>
              <div class="evaluation-input"><label for="evaluation-seed">SEED</label><input id="evaluation-seed" type="number" min="0" max="4294967295" value="42" /><span>FIXED 2 MS / 8.00 S</span></div>
              <div class="evaluation-input"><label for="evaluation-access-code">ACCESS</label><input id="evaluation-access-code" type="password" autocomplete="off" placeholder="demo code" /><span>ADMISSION ONLY / NOT A SOLARI KEY</span></div>
              <div id="evaluation-status" class="console evaluation-status">Ready. Solari credentials remain on the server.</div>
              <div class="editor-actions"><button id="restore-button" class="button button--quiet">RESTORE</button><button id="compile-button" class="button button--quiet">COMPILE PREVIEW</button><button id="isolated-button" class="button button--accent">RUN ISOLATED EVALUATION</button></div>
            </div>
            <div id="evidence-panel" class="inspector-panel inspector-panel--evidence">
              <div class="evidence-intro"><span id="evidence-intro-title">NO VERIFIED ARTIFACT LOADED</span><p id="evidence-intro-detail">Authority exists only after the server returns a valid Solari run and this browser checks its hashes.</p></div>
              <dl class="evidence-grid">
                <div><dt>RUN ID</dt><dd id="evidence-run-id" data-testid="run-id">—</dd></div>
                <div><dt>OUTCOME</dt><dd id="evidence-outcome" data-testid="outcome">—</dd></div>
                <div><dt>CHECKPOINTS</dt><dd id="evidence-checkpoints" data-testid="checkpoints">—</dd></div>
                <div><dt>SCORE</dt><dd id="evidence-score" data-testid="score">—</dd></div>
                <div><dt>TIME</dt><dd id="evidence-time" data-testid="time">—</dd></div>
                <div><dt>COLLISIONS</dt><dd id="evidence-collisions" data-testid="collisions">—</dd></div>
                <div><dt>SEED</dt><dd id="evidence-seed" data-testid="seed">—</dd></div>
              </dl>
              <div class="hash-stack"><span>CONTROLLER / TRANSCRIPT SHA-256</span><code id="evidence-controller-hash" data-testid="controller-hash">—</code><span>TELEMETRY SHA-256</span><code id="evidence-telemetry-hash" data-testid="telemetry-hash">—</code><span>RESULT SHA-256</span><code id="evidence-result-hash" data-testid="result-hash">—</code></div>
              <div class="replay-control"><div><span id="replay-state" data-testid="replay-state" data-state="empty">EMPTY</span><small>RECORDED STATE</small></div><input id="replay-scrubber" type="range" min="0" max="0" value="0" /><button id="replay-button" class="button button--accent">PLAY INTEGRITY-CHECKED REPLAY</button><button id="download-evidence" class="button button--quiet">DOWNLOAD ARTIFACT</button></div>
            </div>
          </aside>
        </main>

        <section class="telemetry" aria-label="Field telemetry">
          <div class="metrics">
            <div><span>TIME / S</span><strong id="metric-time">0.000</strong></div>
            <div><span>SPEED / M·S⁻¹</span><strong id="metric-speed">0.00</strong></div>
            <div><span id="metric-distance-label">EXPLORED / M</span><strong id="metric-distance">0.00</strong></div>
            <div><span id="metric-energy-label">ENERGY / KJ</span><strong id="metric-energy">0.00</strong></div>
          </div>
          <div class="chart"><div class="chart__label"><span>VELOCITY</span><small id="speed-chart-mode">LIVE</small></div><svg viewBox="0 0 360 74" preserveAspectRatio="none"><path d="M0 18H360M0 37H360M0 56H360"/><polyline id="speed-line" points=""/></svg></div>
          <div class="chart"><div class="chart__label"><span>BODY PITCH</span><small id="pitch-chart-mode">RAD</small></div><svg viewBox="0 0 360 74" preserveAspectRatio="none"><path d="M0 18H360M0 37H360M0 56H360"/><polyline id="pitch-line" points=""/></svg></div>
          <div class="run-controls"><button id="power-button" class="button button--power">POWER ON</button><button id="reset-button" class="button button--quiet">RESET</button><button id="run-button" class="button button--accent">ENTER FIELD</button></div>
        </section>
      </div>
      <section id="start-screen" class="start-screen" role="dialog" aria-modal="true" aria-labelledby="start-title" aria-label="Choose an agent course">
        <div class="start-screen__veil"></div>
        <div class="start-screen__content">
          <div class="start-screen__intro"><small>SOLARI AGENT ARENA</small><h1 id="start-title">Choose a course.</h1><p>One click loads the world and leaves it ready for your agent's first decision.</p></div>
          <div class="course-heading"><span>AVAILABLE COURSES</span><small>Click once to enter</small></div>
          <div id="course-list" class="course-list"></div>
          <div class="selected-course"><span>SELECTED</span><strong id="selected-course-name">${this.activeCourse.title}</strong><p id="selected-course-summary">${this.activeCourse.summary}</p><small id="selected-course-meta"></small></div>
        </div>
      </section>
      <div id="guide-drawer" class="guide-drawer" aria-hidden="true">
        <button id="guide-backdrop" class="guide-drawer__backdrop" aria-label="Close guide"></button>
        <aside>
          <header><div><small>AGENT FIELD MANUAL</small><h2>Tools & physics</h2></div><button id="guide-close" aria-label="Close guide">×</button></header>
          <section class="tool-setup"><span>01 / COPY + PASTE</span><h3>No agent setup</h3><p>The course button reserves a recorded Solari Browser and copies a complete system prompt. Paste it into any coding agent with shell or HTTPS access. The prompt carries only a short-lived encrypted run capability; Solari credentials remain server-side.</p><code>POST /api/arena-command</code></section>
          <section class="tool-list"><span>02 / HTTPS LOOP</span><dl><div><dt>connect</dt><dd>Redeem the course-bound ticket and return an opaque session.</dd></div><div><dt>observe</dt><dd>Read track-specific state without advancing simulation.</dd></div><div><dt>act</dt><dd>Apply one expected bounded action and inspect its result.</dd></div><div><dt>finish</dt><dd>Release Browser and return transcript plus practice receipt.</dd></div><div><dt>disconnect</dt><dd>Release safely without issuing a result.</dd></div></dl></section>
          <section class="physics-sheet"><span>03 / PHYSICS</span><h3>MuJoCo 3.12 · deterministic clock</h3><code>M(q)·v̇ + c(q,v) = τ + J(q)ᵀf</code><p><b>Physics step</b> Δt = 0.002 s<br/><b>Control/gait tick</b> Δt<sub>c</sub> = 0.010 s<br/><b>Planar command</b> v<sub>x</sub> = cos(ψ)d, v<sub>y</sub> = sin(ψ)d<br/><b>Energy</b> E += Σ|τᵢq̇ᵢ|Δt</p><small>Observing, screenshots, network delay, and model thinking consume zero simulated time.</small></section>
          <section><span>04 / AUTHORITY</span><h3>Practice in Browser. Judge in Sandbox.</h3><p>HTTPS practice is isolated from your machine and recorded in Solari Browser, but the page still owns the simulation and cannot mint authority. Official transcripts are replayed and scored in fixed-step MuJoCo inside a fresh Solari Sandbox.</p></section><section class="local-fallback"><span>05 / ADVANCED</span><h3>Creator and MCP tools</h3><p>Course JSON import, remote MCP, and the checked-in stdio MCP remain optional development surfaces. Imported routes stay in this browser and cannot mint a score.</p><label class="import-course">IMPORT COURSE JSON<input id="course-import" type="file" accept="application/json,.json" /></label><a href="/course-template.json" download>Download the course template</a><p id="course-import-status" class="course-import-status"></p></section>
        </aside>
      </div>
      <div id="boot" class="boot"><div class="boot__brand">SA</div><p id="boot-label">Initializing Solari Agent Arena</p><div class="boot__track"><i id="boot-progress"></i></div><small>LOCAL PREVIEW BOOTS FIRST / AUTHORITY STAYS SERVER-SIDE</small></div>
    `;
  }
}
