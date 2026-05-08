import { createMission, loadDotEnv, planMission } from "../../../packages/core/src/index.js";
import { loadToolRegistry } from "../../../packages/tools/src/index.js";
import { AuditLog, LocalMemory, MissionStore } from "../../../packages/memory/src/index.js";
import { SafeWhatsApp } from "../../../packages/whatsapp/src/index.js";
import { Scheduler } from "../../../packages/scheduler/src/index.js";
import { ObsidianBridge } from "../../../packages/obsidian/src/index.js";
import { GraphifyBridge } from "../../../packages/graphify/src/index.js";

export function createOperator() {
  loadDotEnv();
  const auditLog = new AuditLog();
  const memory = new LocalMemory();
  const missions = new MissionStore();
  const tools = loadToolRegistry();

  return {
    auditLog,
    memory,
    missions,
    tools,
    whatsapp: new SafeWhatsApp({ auditLog }),
    scheduler: new Scheduler({ auditLog }),
    obsidian: new ObsidianBridge({ vaultPath: process.env.OBSIDIAN_VAULT_PATH || "", auditLog }),
    graphify: new GraphifyBridge({ exportPath: process.env.GRAPHIFY_EXPORT_PATH || undefined, auditLog })
  };
}

export async function createWhatsAppDraft(input) {
  const operator = createOperator();
  const draft = await operator.whatsapp.draftMessage(input);

  let job = null;
  if (draft.scheduledFor) {
    job = await operator.scheduler.scheduleDraft({
      targetId: draft.id,
      runAt: draft.scheduledFor,
      action: "whatsapp.ready_for_confirmation"
    });
  }

  return { draft, job };
}

export async function runDueScheduler(now = new Date()) {
  const operator = createOperator();
  const dueJobs = await operator.scheduler.due(now);
  const results = [];

  for (const job of dueJobs) {
    try {
      if (job.action !== "whatsapp.ready_for_confirmation") {
        throw new Error(`Unsupported scheduled action ${job.action}`);
      }

      const draft = await operator.whatsapp.draftStore.markReadyForConfirmation(job.targetId);
      if (!draft) throw new Error("Target draft not found");

      const updatedJob = await operator.scheduler.markReady(job.id);
      await operator.auditLog.write({
        source: "scheduler",
        action: "job_ready_for_confirmation",
        status: "ready_for_confirmation",
        risk: "DANGEROUS",
        details: { jobId: job.id, draftId: draft.id }
      });
      results.push({ ok: true, job: updatedJob, draft });
    } catch (error) {
      const failedJob = await operator.scheduler.markFailed(job.id, error.message);
      await operator.auditLog.write({
        source: "scheduler",
        action: "job_failed",
        status: "failed",
        risk: "DANGEROUS",
        details: { jobId: job.id, error: error.message }
      });
      results.push({ ok: false, job: failedJob, error: error.message });
    }
  }

  return { processed: results.length, results };
}

export async function exportGraphifyMap() {
  const operator = createOperator();
  const [missions, drafts, inbox, jobs, audit] = await Promise.all([
    operator.missions.list(),
    operator.whatsapp.draftStore.list(),
    operator.whatsapp.listMessages(),
    operator.scheduler.list(),
    operator.auditLog.tail(200)
  ]);

  return operator.graphify.exportOperationalMap({
    missions,
    tools: operator.tools,
    drafts,
    inbox,
    jobs,
    audit
  });
}

export async function runMission(input) {
  const operator = createOperator();
  const mission = createMission({ input });
  const plan = planMission(mission, operator.tools);
  await operator.missions.save({ ...mission, plan, steps: plan.steps });

  await operator.auditLog.write({
    source: "operator",
    action: "mission_planned",
    status: plan.status,
    risk: plan.risks[0] || "UNVERIFIED",
    details: { missionId: mission.id, steps: plan.steps.length }
  });

  return { mission, plan };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = process.argv.slice(2).join(" ") || "status";
  const result = await runMission(input);
  console.log(JSON.stringify(result, null, 2));
}
