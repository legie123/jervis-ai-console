import fs from "node:fs/promises";
import path from "node:path";

export class AuditLog {
  constructor(filePath = "./data/logs/audit.jsonl") {
    this.filePath = filePath;
  }

  async write(event) {
    const entry = {
      ts: new Date().toISOString(),
      source: event.source || "jarvis",
      action: event.action,
      status: event.status || "recorded",
      risk: event.risk || "UNVERIFIED",
      details: event.details || {}
    };

    if (!entry.action) throw new Error("Audit action is required");

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
    return entry;
  }

  async tail(limit = 50) {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return raw
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .slice(-limit)
        .reverse();
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }
}
