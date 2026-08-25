export const BASELINE_CONTROLLER = `// Assisted gait demo — position targets in radians.
// Sensors are copied from MuJoCo; edit, compile, then run.
function control(robot, dt) {
  const t = Math.max(0, robot.time - 0.8);
  const ramp = Math.min(1, t / 1.2);
  const phase = t * Math.PI * 2 * 1.15;
  const stride = Math.sin(phase) * 0.22 * ramp;
  const leftSwing = Math.max(0, Math.sin(phase));
  const rightSwing = Math.max(0, -Math.sin(phase));
  const pitchFix = Math.max(-0.12, Math.min(0.12,
    -0.28 * robot.imu.pitch - 0.035 * robot.imu.pitchRate
  ));

  return {
    drive: ramp * 1.05,
    turn: Math.sin(t * 0.35) * 0.32,
    targets: {
      left_hip_roll: 0.025,
      right_hip_roll: -0.025,
      left_hip_pitch: -0.12 - stride + pitchFix,
      right_hip_pitch: -0.12 + stride + pitchFix,
      left_knee_pitch: 0.22 + leftSwing * 0.38,
      right_knee_pitch: 0.22 + rightSwing * 0.38,
      left_ankle_pitch: -0.10 + stride * 0.45 - pitchFix * 0.8,
      right_ankle_pitch: -0.10 - stride * 0.45 - pitchFix * 0.8,
      left_ankle_roll: -0.015,
      right_ankle_roll: 0.015,
      left_shoulder_pitch: stride * 1.1,
      right_shoulder_pitch: -stride * 1.1,
      left_elbow_pitch: 0.34,
      right_elbow_pitch: 0.34
    }
  };
}`;
