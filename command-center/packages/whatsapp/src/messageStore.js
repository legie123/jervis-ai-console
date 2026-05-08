import fs from "node:fs/promises";
import path from "node:path";
import { dataPath } from "../../core/src/data-paths.js";

export class WhatsAppMessageStore {
  constructor(filePath = process.env.JARVIS_INBOX_STORE || dataPath("memory/whatsapp-inbox.json")) {
    this.filePath = filePath;
  }

  async list() {
    try {
      return JSON.parse(await fs.readFile(this.filePath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async addMany(messages) {
    if (!Array.isArray(messages)) throw new Error("Messages array is required");
    if (messages.length === 0) return [];

    const existing = await this.list();
    const existingIds = new Set(existing.map((message) => message.id));
    const fresh = messages.filter((message) => !existingIds.has(message.id));
    const next = [...existing, ...fresh].slice(-500);

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return fresh;
  }
}
