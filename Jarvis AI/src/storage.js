import fs from "node:fs/promises";
import path from "node:path";

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export class JsonlStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async append(record) {
    await ensureDir(this.filePath);
    await fs.appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
  }

  async list({ limit = 100 } = {}) {
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

export class DraftStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async list() {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw);
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async create(draft) {
    const drafts = await this.list();
    drafts.push(draft);
    await this.#write(drafts);
    return draft;
  }

  async update(id, patch) {
    const drafts = await this.list();
    const index = drafts.findIndex((draft) => draft.id === id);
    if (index === -1) return null;
    drafts[index] = { ...drafts[index], ...patch, updatedAt: new Date().toISOString() };
    await this.#write(drafts);
    return drafts[index];
  }

  async get(id) {
    return (await this.list()).find((draft) => draft.id === id) || null;
  }

  async #write(drafts) {
    await ensureDir(this.filePath);
    await fs.writeFile(this.filePath, `${JSON.stringify(drafts, null, 2)}\n`, "utf8");
  }
}
