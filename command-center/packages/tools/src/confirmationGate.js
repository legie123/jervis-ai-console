import { RiskLevel } from "../../core/src/types.js";

const CONFIRMATION_REQUIRED = new Set([
  RiskLevel.DANGEROUS,
  RiskLevel.UNVERIFIED,
  RiskLevel.BROKEN
]);

export function assessConfirmation({ action, risk, target }) {
  if (!action) throw new Error("Action is required");

  const requiresConfirmation = CONFIRMATION_REQUIRED.has(risk);

  return {
    action,
    target: target || null,
    risk: risk || RiskLevel.UNVERIFIED,
    requiresConfirmation,
    allowed: !requiresConfirmation,
    reason: requiresConfirmation
      ? "Explicit confirmation required before execution"
      : "No confirmation required by current policy"
  };
}

export function confirmAction(gate, confirmationText) {
  if (!gate?.requiresConfirmation) {
    return { ...gate, allowed: true, confirmedAt: new Date().toISOString() };
  }

  const accepted = confirmationText === "CONFIRM";
  return {
    ...gate,
    allowed: accepted,
    confirmedAt: accepted ? new Date().toISOString() : null,
    reason: accepted ? "Confirmed by user" : "Missing exact CONFIRM token"
  };
}
