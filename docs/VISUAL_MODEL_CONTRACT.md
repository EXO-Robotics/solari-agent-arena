# AION H1-S visual model contract

This is the binding contract between the frozen MuJoCo trainer, the Three.js renderer, and the Blender visual GLB. The physics XML is not a visual source. Collision geoms stay simple. Visuals bind to the 13 named rigid bodies.

Machine-readable copy: [`src/model/visualContract.ts`](../src/model/visualContract.ts).
Physics freeze: [`src/model/physicsBaseline.ts`](../src/model/physicsBaseline.ts) and [PHYSICS_BASELINE.md](PHYSICS_BASELINE.md).

## Thesis

Overcast industrial proving ground. Original AION humanoid in off-white covers and black structure. Color is operational state (cyan hardware-status LEDs), not decoration. Do not reproduce Unitree, Figure, or Atlas silhouettes.

## Units, axes, export

| Item | Value |
|---|---|
| Units | meters |
| Authoring up | +Z |
| Forward | +X |
| Right | −Y (MuJoCo / Blender Y-left when facing +X) |
| Body origins | MuJoCo body frames at zero joint pose |
| glTF Y-up conversion | **off** (`export_yup=False`) |
| Host scene | Three.js with `camera.up = (0,0,1)` |
| File | `public/models/aion-h1s.glb` |

The runtime scene is Z-up because MuJoCo is Z-up. Exporting a Y-up glTF would require a hidden correction matrix and is rejected by validation.

Each of the 13 links is a **scene-root node**. Decorative meshes are children of that node. Local mesh space equals MuJoCo body-local space. Every frame the adapter writes `MjData.xpos` / `xmat` onto that node and does not keep a Blender parent hierarchy for the 13 roots.

## Required nodes

Zero-pose rest locations. `restLocal` is relative to the parent body; `restWorld` is the bind-pose origin.

| Node | Parent | restLocal (m) | restWorld (m) | Collision hull center / half-extents | Extra pad |
|---|---|---|---|---|---|
| `pelvis` | — | `0 0 0.89` | `0 0 0.89` | `0 0 0` / `0.130 0.168 0.095` | 40 mm |
| `torso` | pelvis | `0 0 0.14` | `0 0 1.03` | `0 0 0.19` / `0.156 0.195 0.230` | 45 mm |
| `head` | torso | `0 0 0.51` | `0 0 1.54` | `0 0 0.085` / `0.121 0.105 0.140` | 30 mm |
| `left_upper_arm` | torso | `0 0.255 0.36` | `0 0.255 1.39` | `0 0 -0.145` / `0.055 0.055 0.200` | 30 mm |
| `left_forearm` | left_upper_arm | `0 0 -0.29` | `0 0.255 1.10` | `0 0 -0.16` / `0.048 0.048 0.200` | 30 mm |
| `right_upper_arm` | torso | `0 -0.255 0.36` | `0 -0.255 1.39` | `0 0 -0.145` / `0.055 0.055 0.200` | 30 mm |
| `right_forearm` | right_upper_arm | `0 0 -0.29` | `0 -0.255 1.10` | `0 0 -0.16` / `0.048 0.048 0.200` | 30 mm |
| `left_thigh` | pelvis | `0 0.1 -0.09` | `0 0.1 0.80` | `0 0 -0.185` / `0.075 0.075 0.260` | 35 mm |
| `left_shin` | left_thigh | `0 0 -0.37` | `0 0.1 0.43` | `0 0 -0.19` / `0.083 0.083 0.240` | 30 mm |
| `left_foot` | left_shin | `0 0 -0.36` | `0 0.1 0.07` | `0.065 0 -0.045` / `0.145 0.068 0.038` | 8 mm |
| `right_thigh` | pelvis | `0 -0.1 -0.09` | `0 -0.1 0.80` | `0 0 -0.185` / `0.075 0.075 0.260` | 35 mm |
| `right_shin` | right_thigh | `0 0 -0.37` | `0 -0.1 0.43` | `0 0 -0.19` / `0.083 0.083 0.240` | 30 mm |
| `right_foot` | right_shin | `0 0 -0.36` | `0 -0.1 0.07` | `0.065 0 -0.045` / `0.145 0.068 0.038` | 8 mm |

Names are exact, case-sensitive, and unique in the GLB. Missing, extra-root, or renamed links fail the adapter with no fallback.

Hands, visor glass, actuator cans, LEDs, and brand plates are **decorative children**. They must not use one of the 13 names.

Visual AABB must stay inside `hull ± padding`. Feet are tight so soles meet the ground plane.

## Materials

Required Blender / glTF material names:

| Name | Role |
|---|---|
| `AION_Cover` | Off-white painted structural covers |
| `AION_Anodized` | Black anodized structure and limb tubes |
| `AION_Aluminum` | Brushed actuator housings |
| `AION_Rubber` | Soles and grip pads |
| `AION_Visor` | Dark glass |
| `AION_LED` | Cyan hardware-status emitters |

No other materials on the robot GLB. No image textures in this milestone. IBL comes from the host `RoomEnvironment` PMREM.

## Budgets

- Triangles: ≤ 30 000
- GLB size: ≤ 1.5 MB
- Textures: none
- External / network assets: none
- Marketplace or branded H1 meshes: none

## Rigid links versus children

The 13 named nodes are the only objects the renderer transforms from MuJoCo. Children inherit that transform. Do not skin, do not use armatures, do not leave leftover `Cube` / `Empty` roots in the export set.

## Validation poses

1. **Zero pose** — all joints 0. Link origins must sit on `restWorld`.
2. **Reset pose** — `MujocoEngine` `INITIAL_POSE`. Visuals must stay welded to bodies through the standing offset.
3. **Walk** — baseline controller. No swimming, lag, or parent-scale shear.
4. **Fall / reset** — visuals follow `xpos`/`xmat` through collapse and `mj_resetData`.

The adapter tests these by applying body matrices; it does not retarget from Blender rest to a different skeleton.

## Authoring

The checked-in GLB and manifest are inherited from Robot-3D-Sim and remain covered by these binding tests. Workstation-specific Blender/MCP generation tooling is intentionally omitted from this focused evaluation submission.

First milestone geometry is a rigid-link original AION made of authored primitives (covers, cans, chassis, soles, visor, LEDs). It proves the contract. It is not the production sculpt.

## Out of scope for this milestone

World props, contact-patch graphics, power/fall mesh animation, hero camera, UI identity cleanup.
