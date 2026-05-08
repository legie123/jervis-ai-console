import fs from "node:fs/promises";
import path from "node:path";

export class GraphifyBridge {
  constructor({ exportPath = "./data/exports/graphify-map.json", auditLog = null, writeEnabled = true } = {}) {
    this.exportPath = exportPath;
    this.auditLog = auditLog;
    this.writeEnabled = writeEnabled;
  }

  status() {
    return {
      status: this.writeEnabled ? "REAL" : "PARTIAL",
      exportPath: this.exportPath,
      writeEnabled: this.writeEnabled
    };
  }

  async prepareOperationalMap({ missionId, nodes = [], edges = [] }) {
    if (!missionId) throw new Error("Mission id is required");

    const map = {
      missionId,
      nodes,
      edges,
      status: "draft_only",
      writeEnabled: false,
      risk: "PARTIAL",
      createdAt: new Date().toISOString()
    };

    await this.auditLog?.write({
      source: "graphify",
      action: "operational_map_drafted",
      status: map.status,
      risk: map.risk,
      details: { missionId, nodes: nodes.length, edges: edges.length }
    });

    return map;
  }

  buildOperationalMap({ missions = [], tools = [], drafts = [], inbox = [], jobs = [], audit = [] }) {
    const nodes = [
      {
        id: "jarvis",
        type: "system",
        label: "JARVIS Command Center",
        status: "REAL"
      },
      ...tools.map((tool) => ({
        id: `tool:${tool.id}`,
        type: "tool",
        label: tool.label || tool.id,
        status: tool.status || "UNVERIFIED",
        risk: tool.risk || "UNVERIFIED"
      })),
      ...missions.map((mission) => ({
        id: `mission:${mission.id}`,
        type: "mission",
        label: mission.input || mission.id,
        status: mission.status || "UNVERIFIED",
        createdAt: mission.createdAt
      })),
      ...drafts.map((draft) => ({
        id: `draft:${draft.id}`,
        type: "whatsapp_draft",
        label: `${draft.to} ${draft.status}`,
        status: draft.status,
        risk: draft.risk,
        scheduledFor: draft.scheduledFor || null
      })),
      ...inbox.map((message) => ({
        id: `message:${message.id}`,
        type: "whatsapp_message",
        label: `${message.displayName || message.from}: ${message.body || message.type}`,
        status: "received",
        from: message.from,
        receivedAt: message.receivedAt
      })),
      ...jobs.map((job) => ({
        id: `job:${job.id}`,
        type: "scheduler_job",
        label: `${job.action} ${job.status}`,
        status: job.status,
        risk: job.risk,
        runAt: job.runAt
      })),
      {
        id: "audit:summary",
        type: "audit_summary",
        label: `${audit.length} audit entries`,
        status: audit.length > 0 ? "REAL" : "EMPTY"
      }
    ];

    const edges = [
      ...tools.map((tool) => ({
        from: "jarvis",
        to: `tool:${tool.id}`,
        type: "uses"
      })),
      ...missions.flatMap((mission) => {
        return (mission.steps || []).map((step) => ({
          from: `mission:${mission.id}`,
          to: `tool:${step.toolId}`,
          type: "plans_with"
        }));
      }),
      ...drafts.map((draft) => ({
        from: "tool:whatsapp.draft",
        to: `draft:${draft.id}`,
        type: "creates"
      })),
      ...inbox.map((message) => ({
        from: `message:${message.id}`,
        to: "tool:whatsapp.draft",
        type: "can_reply_with"
      })),
      ...jobs.map((job) => ({
        from: `job:${job.id}`,
        to: `draft:${job.targetId}`,
        type: "activates"
      })),
      ...audit.slice(0, 100).map((entry, index) => ({
        from: "audit:summary",
        to: entry.details?.draftId ? `draft:${entry.details.draftId}` : "jarvis",
        type: `records:${entry.action}`,
        index
      }))
    ];

    return {
      schema: "jarvis.graphify.operational_map.v1",
      generatedAt: new Date().toISOString(),
      status: "REAL",
      counts: {
        missions: missions.length,
        tools: tools.length,
        drafts: drafts.length,
        inbox: inbox.length,
        jobs: jobs.length,
        audit: audit.length,
        nodes: nodes.length,
        edges: edges.length
      },
      nodes,
      edges
    };
  }

  async exportOperationalMap(input) {
    if (!this.writeEnabled) {
      throw new Error("Graphify write is disabled");
    }

    const map = this.buildOperationalMap(input);
    const targetPath = path.resolve(this.exportPath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, `${JSON.stringify(map, null, 2)}\n`, "utf8");

    await this.auditLog?.write({
      source: "graphify",
      action: "operational_map_exported",
      status: "written",
      risk: "PARTIAL",
      details: { exportPath: targetPath, nodes: map.nodes.length, edges: map.edges.length }
    });

    return { exportPath: targetPath, map };
  }
}
