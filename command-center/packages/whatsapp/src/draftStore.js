import fs from "node:fs/promises";
import path from "node:path";

export class WhatsAppDraftStore {
  constructor(filePath = "./data/drafts/whatsapp-drafts.json") {
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
