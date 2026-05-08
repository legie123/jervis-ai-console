import { MissionStatus, RiskLevel } from "./types.js";

export function createMission({ input, source = "local", context = {} }) {
  if (!input || typeof input !== "string") {
    throw new Error("Mission input is required");
  }

  return {
    id: `mission_${Date.now()}`,
    input: input.trim(),
    source,
    context,
    status: MissionStatus.DRAFTED,
    createdAt: new Date().toISOString()
  };
}

export function planMission(mission, toolRegistry = []) {
  const text = mission.input.toLowerCase();
  const steps = [];
  const risks = [];

  if (text.includes("whatsapp") || text.includes("whatapp")) {
    steps.push({
      id: "draft_whatsapp_message",
      label: "Create WhatsApp draft",
      toolId: "whatsapp.draft",
      status: MissionStatus.WAITING_CONFIRMATION
    });
    risks.push(RiskLevel.DANGEROUS);
  }

  if (text.includes("obsidian")) {
    steps.push({
      id: "prepare_obsidian_sync",
      label: "Prepare Obsidian sync draft",
      toolId: "obsidian.sync",
      status: MissionStatus.WAITING_CONFIRMATION
    });
    risks.push(RiskLevel.PARTIAL);
  }

  if (text.includes("graphify")) {
    steps.push({
      id: "prepare_graphify_map",
      label: "Prepare Graphify map export",
      toolId: "graphify.export",
      status: MissionStatus.WAITING_CONFIRMATION
    });
    risks.push(RiskLevel.PARTIAL);
  }

  return {
    missionId: mission.id,
    status: steps.some((step) => step.status === MissionStatus.WAITING_CONFIRMATION)
      ? MissionStatus.WAITING_CONFIRMATION
      : MissionStatus.READY,
    risks,
    steps,
    availableTools: toolRegistry.map((tool) => tool.id),
    createdAt: new Date().toISOString()
  };
}
