import fs from "node:fs/promises";
import path from "node:path";
import { dataPath } from "../../core/src/data-paths.js";

function findTopLevelJsonArrayEnd(text, fromIndex) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = fromIndex; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "[") depth += 1;
    if (c === "]") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function recoverDraftArrayJson(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return { drafts: [], recovered: false };
  try {
    const parsed = JSON.parse(t);
    if (!Array.isArray(parsed)) return { drafts: [], recovered: false };
    return { drafts: parsed, recovered: false };
  } catch {
    const start = t.indexOf("[");
    if (start === -1) return { drafts: [], recovered: true };
    const end = findTopLevelJsonArrayEnd(t, start);
    if (end === -1) return { drafts: [], recovered: true };
    const slice = t.slice(start, end + 1);
    try {
      const parsed = JSON.parse(slice);
      if (Array.isArray(parsed)) return { drafts: parsed, recovered: true };
    } catch {
      /* fall through */
    }
    return { drafts: [], recovered: true };
  }
}

export class WhatsAppDraftStore {
  constructor(filePath = process.env.JARVIS_DRAFT_STORE || dataPath("drafts/whatsapp-drafts.json")) {
    this.filePath = filePath;
  }

  async list() {
    let raw;
    try {
      raw = await fs.readFile(this.filePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }

    const { drafts, recovered } = recoverDraftArrayJson(raw);
    if (recovered) await this.#write(drafts);
    return drafts;
  }

  async create({ to, body, reason = "", scheduledFor = null }) {
    if (!to || typeof to !== "string") throw new Error("Recipient is required");
    if (!body || typeof body !== "string") throw new Error("Draft body is required");

    const draft = {
      id: `wa_draft_${Date.now()}`,
      to,
      body: body.trim(),
      reason,
      scheduledFor,
      status: scheduledFor ? "scheduled_draft" : "pending_confirmation",
      risk: "DANGEROUS",
      realSendEnabled: "env_gated",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const drafts = await this.list();
    drafts.push(draft);
    await this.#write(drafts);
    return draft;
  }

  async markConfirmed(id) {
    return this.update(id, { status: "confirmed_no_send_adapter" });
  }

  async markSent(id, providerResponse) {
    return this.update(id, {
      status: "sent",
      sentAt: new Date().toISOString(),
      providerResponse
    });
  }

  async markFailed(id, error) {
    return this.update(id, {
      status: "send_failed",
      error
    });
  }

  async markReadyForConfirmation(id) {
    return this.update(id, {
      status: "pending_confirmation",
      readyForConfirmationAt: new Date().toISOString()
    });
  }

  async update(id, patch) {
    const drafts = await this.list();
    const index = drafts.findIndex((draft) => draft.id === id);
    if (index === -1) return null;

    drafts[index] = {
      ...drafts[index],
      ...patch,
      updatedAt: new Date().toISOString()
    };

    await this.#write(drafts);
    return drafts[index];
  }

  async #write(drafts) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(drafts, null, 2)}\n`, "utf8");
  }
}
