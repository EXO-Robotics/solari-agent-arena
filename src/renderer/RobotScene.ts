import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { VISUAL_LINK_NAMES, visualModelUrl, type VisualLinkName } from "../model/visualContract";
import type { MujocoEngine } from "../physics/MujocoEngine";
import type { SensorFrame } from "../sim/types";
import type { CourseCheckpoint } from "../agent/contract";
import { HORIZON, STATUS_CYAN, createCollisionMaterial, fieldKindForGeom, fieldMaterial } from "./materials";
import { applyMuJoCoPose, createGeomGeometry } from "./mujocoMath";
import { loadVisualModel, type VisualLinks } from "./visualBinding";

export type CameraMode = "broadcast" | "follow" | "overhead";

const SHADOW_EXTENT = 8;

export class RobotScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.05, 140);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly collisionMeshes: Array<THREE.Mesh | null> = [];
  private readonly fieldMeshes: Array<THREE.Mesh | null> = [];
  private readonly visualLinks: VisualLinks;
  private readonly bodyIndex = new Map<VisualLinkName, number>();
  private readonly comMarker: THREE.Mesh;
  private readonly comLine: THREE.Line;
  private readonly forceArrows: [THREE.ArrowHelper, THREE.ArrowHelper];
  private readonly statusLight: THREE.PointLight;
  private readonly agentCourseGroup = new THREE.Group();
  private readonly agentCheckpointMarkers: THREE.Mesh[] = [];
  private readonly resizeObserver: ResizeObserver;
  private readonly pmrem: THREE.PMREMGenerator;
  private cameraMode: CameraMode = "follow";
  private debug = false;

  static async create(container: HTMLElement, engine: MujocoEngine): Promise<RobotScene> {
    const visual = await loadVisualModel(visualModelUrl());
    return new RobotScene(container, engine, visual.links);
  }

  private constructor(
    private readonly container: HTMLElement,
    private readonly engine: MujocoEngine,
    visualLinks: VisualLinks,
  ) {
    this.visualLinks = visualLinks;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(HORIZON, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.append(this.renderer.domElement);

    this.camera.up.set(0, 0, 1);
    this.camera.position.set(-4.8, -4.8, 2.9);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(1.2, 0, 0.8);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.enabled = false;

    this.scene.background = new THREE.Color(HORIZON);
    this.scene.fog = new THREE.Fog(HORIZON, 35, 95);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const environment = new RoomEnvironment();
    this.scene.environment = this.pmrem.fromScene(environment, 0.04).texture;
    environment.dispose();

    this.scene.add(new THREE.HemisphereLight(0xd7dde2, 0x3e433f, 0.45));
    this.keyLight = new THREE.DirectionalLight(0xfff1de, 1.55);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.bias = -0.0003;
    this.keyLight.shadow.normalBias = 0.03;
    this.keyLight.shadow.radius = 2;
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 36;
    this.keyLight.shadow.camera.left = -SHADOW_EXTENT;
    this.keyLight.shadow.camera.right = SHADOW_EXTENT;
    this.keyLight.shadow.camera.top = SHADOW_EXTENT;
    this.keyLight.shadow.camera.bottom = -SHADOW_EXTENT;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);
    const fill = new THREE.DirectionalLight(0xa8b8c8, 0.32);
    fill.position.set(8, 6, 6);
    this.scene.add(fill);

    this.resolveBodyIndices();
    this.buildArena();
    this.buildCollisionHulls();
    for (const name of VISUAL_LINK_NAMES) this.scene.add(this.visualLinks[name]);

    this.statusLight = new THREE.PointLight(STATUS_CYAN, 0.55, 2.6, 2);
    this.visualLinks.torso.add(this.statusLight);
    this.statusLight.position.set(0.16, 0, 0.34);

    this.comMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 16, 12),
      new THREE.MeshBasicMaterial({ color: STATUS_CYAN }),
    );
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.comLine = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: STATUS_CYAN }));
    this.forceArrows = [
      new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 0, STATUS_CYAN, 0.08, 0.04),
      new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 0, STATUS_CYAN, 0.08, 0.04),
    ];
    this.scene.add(this.comMarker, this.comLine, ...this.forceArrows);
    this.agentCourseGroup.visible = false;
    this.scene.add(this.agentCourseGroup);
    this.setDebug(false);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  update(frame: SensorFrame): void {
    const bodyPositions = this.engine.data.xpos as Float64Array;
    const bodyRotations = this.engine.data.xmat as Float64Array;
    for (const name of VISUAL_LINK_NAMES) {
      const index = this.bodyIndex.get(name);
      if (index === undefined) continue;
      applyMuJoCoPose(this.visualLinks[name], bodyPositions, bodyRotations, index);
    }

    const geomPositions = this.engine.data.geom_xpos as Float64Array;
    const geomRotations = this.engine.data.geom_xmat as Float64Array;
    for (let index = 0; index < this.collisionMeshes.length; index += 1) {
      const collision = this.collisionMeshes[index];
      if (collision) applyMuJoCoPose(collision, geomPositions, geomRotations, index);
      const field = this.fieldMeshes[index];
      if (field) applyMuJoCoPose(field, geomPositions, geomRotations, index);
    }

    this.updateShadowRig(frame);
    this.updateDebug(frame);
    this.updateCamera(frame);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    this.controls.enabled = mode === "broadcast";
  }

  setDebug(enabled: boolean): void {
    this.debug = enabled;
    this.comMarker.visible = enabled;
    this.comLine.visible = enabled;
    for (const arrow of this.forceArrows) arrow.visible = enabled;
    for (const mesh of this.collisionMeshes) {
      if (mesh) mesh.visible = enabled;
    }
  }

  configureAgentCourse(checkpoints: CourseCheckpoint[]): void {
    this.agentCourseGroup.clear();
    this.agentCheckpointMarkers.length = 0;
    const path = [new THREE.Vector3(0, 0, 0.025), ...checkpoints.map((point) => new THREE.Vector3(point.x, point.y, 0.025))];
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(path),
      new THREE.LineDashedMaterial({ color: STATUS_CYAN, transparent: true, opacity: 0.42, dashSize: 0.35, gapSize: 0.24 }),
    );
    line.computeLineDistances();
    this.agentCourseGroup.add(line);
    checkpoints.forEach((checkpoint) => {
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(0.18, checkpoint.radius - 0.08), checkpoint.radius, 48),
        new THREE.MeshBasicMaterial({ color: 0x697169, transparent: true, opacity: 0.68, side: THREE.DoubleSide }),
      );
      marker.position.set(checkpoint.x, checkpoint.y, 0.035);
      marker.userData.checkpointId = checkpoint.id;
      this.agentCheckpointMarkers.push(marker);
      this.agentCourseGroup.add(marker);
    });
  }

  setAgentCourseProgress(active: boolean, reached: number): void {
    this.agentCourseGroup.visible = active;
    this.agentCheckpointMarkers.forEach((marker, index) => {
      const material = marker.material as THREE.MeshBasicMaterial;
      material.color.setHex(index < reached ? 0x4f5a51 : index === reached ? STATUS_CYAN : 0x697169);
      material.opacity = index === reached ? 0.95 : 0.5;
    });
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.container.replaceChildren();
  }

  private resolveBodyIndices(): void {
    const bodyType = this.engine.module.mjtObj.mjOBJ_BODY.value;
    for (const name of VISUAL_LINK_NAMES) {
      const index = this.engine.module.mj_name2id(this.engine.model, bodyType, name);
      if (index < 0) throw new Error(`MuJoCo model is missing body "${name}"`);
      this.bodyIndex.set(name, index);
    }
  }

  private buildArena(): void {
    const asphalt = createAsphaltTexture();
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(120, 120, 0.05),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: asphalt,
        roughness: 0.95,
        metalness: 0.02,
      }),
    );
    ground.position.z = -0.035;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.scene.add(createGrid(2, 55, 0x4e5550, 0.12));
    this.scene.add(createGrid(10, 50, 0x9aa39b, 0.28));

    const origin = new THREE.Mesh(
      new THREE.RingGeometry(1.46, 1.54, 64),
      new THREE.MeshStandardMaterial({
        color: 0xd8d4cc,
        roughness: 0.72,
        metalness: 0.05,
        side: THREE.DoubleSide,
      }),
    );
    origin.position.z = 0.01;
    origin.receiveShadow = true;
    this.scene.add(origin);

    const chevron = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.34, 3),
      new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.7, metalness: 0.04 }),
    );
    chevron.rotation.x = Math.PI / 2;
    chevron.position.set(0.55, 0, 0.02);
    this.scene.add(chevron);
  }

  private buildCollisionHulls(): void {
    const types = this.engine.model.geom_type as Int32Array;
    const sizes = this.engine.model.geom_size as Float64Array;
    const bodyIds = this.engine.model.geom_bodyid as Int32Array;
    const geomType = this.engine.module.mjtObj.mjOBJ_GEOM.value;
    const collisionMaterial = createCollisionMaterial();
    const sphere = this.engine.module.mjtGeom.mjGEOM_SPHERE.value;
    const capsule = this.engine.module.mjtGeom.mjGEOM_CAPSULE.value;
    const cylinder = this.engine.module.mjtGeom.mjGEOM_CYLINDER.value;
    const ellipsoid = this.engine.module.mjtGeom.mjGEOM_ELLIPSOID.value;
    const plane = this.engine.module.mjtGeom.mjGEOM_PLANE.value;

    for (let index = 0; index < this.engine.model.ngeom; index += 1) {
      const type = types[index];
      if (type === plane) {
        this.collisionMeshes.push(null);
        this.fieldMeshes.push(null);
        continue;
      }
      const size: [number, number, number] = [
        sizes[index * 3] ?? 0.1,
        sizes[index * 3 + 1] ?? 0.1,
        sizes[index * 3 + 2] ?? 0.1,
      ];
      const geometry = createGeomGeometry(type, size, sphere, capsule, cylinder, ellipsoid);
      const bodyId = bodyIds[index] ?? 0;
      if (bodyId === 0) {
        const name = this.engine.module.mj_id2name(this.engine.model, geomType, index) || "";
        const material = fieldMaterial(fieldKindForGeom(name));
        if (name.startsWith("beacon") || name === "gate_top") {
          material.emissive = new THREE.Color(STATUS_CYAN);
          material.emissiveIntensity = 0.35;
          material.color = new THREE.Color(0x1a1e1c);
        }
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.fieldMeshes.push(mesh);
        this.collisionMeshes.push(null);
      } else {
        const mesh = new THREE.Mesh(geometry, collisionMaterial);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.visible = false;
        this.scene.add(mesh);
        this.collisionMeshes.push(mesh);
        this.fieldMeshes.push(null);
      }
    }
  }

  private updateShadowRig(frame: SensorFrame): void {
    const x = frame.position;
    const y = frame.lateral;
    const z = frame.height;
    this.keyLight.position.set(x - 6, y - 8, z + 14);
    this.keyLight.target.position.set(x, y, 0.2);
    this.keyLight.target.updateMatrixWorld();
    this.keyLight.shadow.camera.updateProjectionMatrix();
  }

  private updateDebug(frame: SensorFrame): void {
    if (!this.debug) return;
    const position = new THREE.Vector3(frame.position, frame.lateral, frame.height + 0.18);
    this.comMarker.position.copy(position);
    const linePositions = this.comLine.geometry.getAttribute("position") as THREE.BufferAttribute;
    linePositions.setXYZ(0, position.x, position.y, 0);
    linePositions.setXYZ(1, position.x, position.y, position.z);
    linePositions.needsUpdate = true;
    const feet: Array<[number, number]> = [[0.1, frame.feet.left], [-0.1, frame.feet.right]];
    feet.forEach(([offset, force], index) => {
      const arrow = this.forceArrows[index];
      arrow.position.set(
        frame.position + 0.07 * Math.cos(frame.yaw) - offset * Math.sin(frame.yaw),
        frame.lateral + 0.07 * Math.sin(frame.yaw) + offset * Math.cos(frame.yaw),
        0.01,
      );
      arrow.setLength(Math.min(0.8, force / 700), 0.09, 0.05);
    });
  }

  private updateCamera(frame: SensorFrame): void {
    const forwardX = Math.cos(frame.yaw);
    const forwardY = Math.sin(frame.yaw);
    const target = new THREE.Vector3(
      frame.position + forwardX * 1.1,
      frame.lateral + forwardY * 1.1,
      0.82,
    );
    if (this.cameraMode === "follow") {
      this.camera.position.lerp(new THREE.Vector3(
        frame.position - forwardX * 4.4 - forwardY * 2.6,
        frame.lateral - forwardY * 4.4 + forwardX * 2.6,
        2.65,
      ), 0.055);
      this.controls.target.lerp(target, 0.08);
      this.camera.lookAt(this.controls.target);
    } else if (this.cameraMode === "overhead") {
      this.camera.position.lerp(new THREE.Vector3(frame.position, frame.lateral, 10.5), 0.08);
      this.controls.target.lerp(new THREE.Vector3(frame.position, frame.lateral, 0), 0.08);
      this.camera.lookAt(this.controls.target);
    }
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}

function createGrid(step: number, extent: number, color: number, opacity: number): THREE.LineSegments {
  const positions: number[] = [];
  for (let coordinate = -extent; coordinate <= extent; coordinate += step) {
    positions.push(-extent, coordinate, 0.004, extent, coordinate, 0.004);
    positions.push(coordinate, -extent, 0.004, coordinate, extent, 0.004);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
}

function createAsphaltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create asphalt texture.");
  context.fillStyle = "#2a2c2b";
  context.fillRect(0, 0, 512, 512);
  const image = context.getImageData(0, 0, 512, 512);
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    const noise = (Math.random() - 0.5) * 22;
    data[index] = Math.max(0, Math.min(255, (data[index] ?? 0) + noise));
    data[index + 1] = Math.max(0, Math.min(255, (data[index + 1] ?? 0) + noise));
    data[index + 2] = Math.max(0, Math.min(255, (data[index + 2] ?? 0) + noise));
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(36, 36);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
