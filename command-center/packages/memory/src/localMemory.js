import fs from "node:fs/promises";
import path from "node:path";
import { dataPath } from "../../core/src/data-paths.js";

export class LocalMemory {
  constructor(filePath = process.env.JARVIS_MEMORY_STORE || dataPath("memory/local-memory.json")) {
    this.filePath = filePath;
  }

  async read() {
    try {
      return JSON.parse(await fs.readFile(this.filePath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return { facts: [], updatedAt: null };
      throw error;
    }
  }

  async remember(fact) {
    if (!fact || typeof fact !== "string") throw new Error("Memory fact is required");
    const memory = await this.read();
    memory.facts.push({ fact, createdAt: new Date().toISOString() });
    memory.updatedAt = new Date().toISOString();

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(memory, null, 2)}\n`, "utf8");
    return memory;
  }
}
