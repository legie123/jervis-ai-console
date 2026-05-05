import { runDueScheduler } from "./index.js";

export class SchedulerLoop {
  constructor({
    intervalMs = Number(process.env.JARVIS_SCHEDULER_INTERVAL_MS || 60000),
    enabled = process.env.JARVIS_SCHEDULER_ENABLED === "true",
    runDue = runDueScheduler,
    logger = console
  } = {}) {
    this.intervalMs = intervalMs;
    this.enabled = enabled;
    this.runDue = runDue;
    this.logger = logger;
    this.timer = null;
    this.running = false;
  }

  status() {
    return {
      status: this.enabled ? "REAL" : "PARTIAL",
      enabled: this.enabled,
      intervalMs: this.intervalMs,
      running: Boolean(this.timer),
      autoSend: false
    };
  }

  start() {
    if (!this.enabled) return this.status();
    if (this.timer) return this.status();

    this.timer = setInterval(() => {
      this.tick().catch((error) => {
        this.logger.error(`Scheduler loop failed: ${error.message}`);
      });
    }, this.intervalMs);

    this.timer.unref?.();
    this.tick().catch((error) => {
      this.logger.error(`Scheduler loop failed: ${error.message}`);
    });

    return this.status();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    return this.status();
  }

  async tick(now = new Date()) {
    if (this.running) {
      return { skipped: true, reason: "previous_tick_running" };
    }

    this.running = true;
    try {
      const result = await this.runDue(now);
      if (result.processed > 0) {
        this.logger.log(`Scheduler processed ${result.processed} due job(s)`);
      }
      return result;
    } finally {
      this.running = false;
    }
  }
}
