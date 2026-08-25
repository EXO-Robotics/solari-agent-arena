# Physics baseline freeze

The visual pass must not change contact, mass, actuators, sensors, controller behavior, or telemetry. [`src/model/h1-sagittal.xml`](../src/model/h1-sagittal.xml) is frozen at this SHA-256:

`03ae3bc817fa4e748dd27e14a5cd84993994df910c2eeff412ef9bfc8b9912ec` (10654 bytes)

Do not add decorative MuJoCo geoms. Visuals live in the GLB.

## Snapshot

| Item | Count / names |
|---|---|
| Named bodies | 13: pelvis, torso, head, left_upper_arm, left_forearm, right_upper_arm, right_forearm, left_thigh, left_shin, left_foot, right_thigh, right_shin, right_foot |
| Named geoms | 35 (12 world + 23 robot) |
| Programmable joint servos | 14 |
| Actuators | 20 including trainer assists `balance_pitch`, `balance_roll`, `pace_x`, `pace_y`, `turn_drive`, `balance_height` |
| Existing visual-only geoms | 5 (`contype=0 conaffinity=0`): pelvis_core, torso_panel, torso_light, visor, visor_signal |
| Timestep | 0.002 s |

The five visual-only XML geoms are a leftover of geom-as-mesh rendering. The body-transform adapter hides every robot geom as a collision hull. They remain in the XML so mass and contacts stay identical.

## Representative motion (must still hold)

- Reset pose stands at pelvis height ≈ 0.89 m.
- Baseline controller advances on the field with foot contact telemetry.
- Power Off disables actuation and the robot collapses under gravity.
- Debug mode must not change physics.
