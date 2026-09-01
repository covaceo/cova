export const RITHMIC_SYSTEMS = Object.freeze([
  "Rithmic Paper Trading",
  "Rithmic 01",
  "Rithmic Test",
]);

const RITHMIC_SYSTEM_SET = new Set(RITHMIC_SYSTEMS);

export function isSupportedRithmicSystem(value) {
  return typeof value === "string" && RITHMIC_SYSTEM_SET.has(value);
}
