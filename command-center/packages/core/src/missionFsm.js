import { MissionStatus } from "./types.js";

export function deriveMissionUiFsm(missionRecord) {
  if (!missionRecord) {
    return { fsm: "STANDBY", reason: "no_mission" };
  }

  const plan = missionRecord.plan;
  if (!plan) {
    if (missionRecord.status === MissionStatus.DRAFTED) {
      return { fsm: "THINKING", reason: "drafted_without_plan" };
    }
    return { fsm: "STANDBY", reason: "no_plan" };
  }

  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  const stepNeedsConfirm = steps.some((step) => step.status === MissionStatus.WAITING_CONFIRMATION);

  if (plan.status === MissionStatus.WAITING_CONFIRMATION || stepNeedsConfirm) {
    return { fsm: "WAITING_CONFIRMATION", reason: stepNeedsConfirm ? "step_waiting_confirmation" : "plan_waiting_confirmation" };
  }

  if (plan.status === MissionStatus.BLOCKED) {
    return { fsm: "BLOCKED", reason: "plan_blocked" };
  }

  if (plan.status === MissionStatus.FAILED) {
    return { fsm: "ERROR", reason: "plan_failed" };
  }

  if (plan.status === MissionStatus.EXECUTED) {
    return { fsm: "DONE", reason: "plan_executed" };
  }

  if (plan.status === MissionStatus.READY) {
    return { fsm: "DONE", reason: "plan_ready" };
  }

  if (missionRecord.status === MissionStatus.DRAFTED) {
    return { fsm: "PLANNING", reason: "mission_drafted" };
  }

  return { fsm: "STANDBY", reason: "fallback" };
}

export function buildMissionStateSnapshot(lastMission) {
  const { fsm, reason } = deriveMissionUiFsm(lastMission);
  const preview =
    lastMission && typeof lastMission.input === "string"
      ? lastMission.input.slice(0, 160)
      : "";
  return {
    derivedFsm: fsm,
    reason,
    mission: lastMission
      ? {
          id: lastMission.id,
          status: lastMission.status,
          createdAt: lastMission.createdAt,
          inputPreview: preview,
          planStatus: lastMission.plan?.status,
          stepCount: Array.isArray(lastMission.plan?.steps) ? lastMission.plan.steps.length : 0,
          intentRouter: lastMission.plan?.intentRouter || null
        }
      : null,
    generatedAt: new Date().toISOString()
  };
}
