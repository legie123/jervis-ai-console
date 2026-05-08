import fs from "node:fs/promises";
import path from "node:path";

export class Scheduler {
  constructor({ auditLog = null, filePath = "./data/drafts/scheduled-jobs.json" } = {}) {
    this.auditLog = auditLog;
    this.filePath = filePath;
  }

  async scheduleDraft({ targetId, runAt, action }) {
    if (!targetId) throw new Error("Target id is required");
    if (!runAt) throw new Error("Run time is required");
    if (!action) throw new Error("Scheduled action is required");

    const job = {
      id: `job_${Date.now()}`,
      targetId,
      runAt,
      action,
      status: "scheduled",
      risk: "DANGEROUS",
      createdAt: new Date().toISOString()
    };

    const jobs = await this.list();
    jobs.push(job);
    await this.#write(jobs);

    await this.auditLog?.write({
      source: "scheduler",
      action: "job_scheduled",
      status: job.status,
      risk: job.risk,
      details: job
    });
    return job;
  }

  async list() {
    try {
      return JSON.parse(await fs.readFile(this.filePath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async due(now = new Date()) {
    const nowMs = now.getTime();
    return (await this.list()).filter((job) => {
      return job.status === "scheduled" && new Date(job.runAt).getTime() <= nowMs;
    });
  }

  async markReady(id) {
    return this.#update(id, { status: "ready_for_confirmation", readyAt: new Date().toISOString() });
  }

  async markFailed(id, error) {
    return this.#update(id, { status: "failed", error });
  }

  async #update(id, patch) {
    const jobs = await this.list();
    const index = jobs.findIndex((job) => job.id === id);
    if (index === -1) return null;

    jobs[index] = {
      ...jobs[index],
      ...patch,
      updatedAt: new Date().toISOString()
    };
    await this.#write(jobs);
    return jobs[index];
  }

  async #write(jobs) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(jobs, null, 2)}\n`, "utf8");
  }
}
