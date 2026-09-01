function control(robot, dt) {
  const phase = robot.time * Math.PI * 2 * 1.1;
  const stride = Math.sin(phase) * 0.18;
  return {
    drive: 0.8,
    turn: -robot.yaw * 0.8 - robot.lateral * 0.12,
    targets: {
      left_hip_pitch: -0.12 - stride,
      right_hip_pitch: -0.12 + stride,
      left_knee_pitch: 0.22 + Math.max(0, Math.sin(phase)) * 0.3,
      right_knee_pitch: 0.22 + Math.max(0, -Math.sin(phase)) * 0.3,
      left_ankle_pitch: -0.1 + stride * 0.35,
      right_ankle_pitch: -0.1 - stride * 0.35
    }
  };
}
