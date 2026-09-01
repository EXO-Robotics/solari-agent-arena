function control(robot, dt) {
  // Benign containment probe: QuickJS has no process global, so this becomes a
  // contained ReferenceError that the evaluator maps to capability_violation.
  process.exit(17);
  return { drive: 0 };
}
