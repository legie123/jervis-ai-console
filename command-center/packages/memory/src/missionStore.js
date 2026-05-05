import fs from "node:fs/promises";
import path from "node:path";

export class MissionStore {
  constructor(filePath = "./data/memory/missions.json") {
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

  async save(record) {
    const missions = await this.list();
    missions.push(record);
    const next = missions.slice(-200);
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return record;
  }
}
