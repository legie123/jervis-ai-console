import fs from "node:fs/promises";
import path from "node:path";

export class ObsidianBridge {
  constructor({
    vaultPath = "",
    auditLog = null,
    writeEnabled = process.env.OBSIDIAN_WRITE_ENABLED === "true",
    confirmToken = process.env.OBSIDIAN_SYNC_CONFIRM_TOKEN || "SYNC_OBSIDIAN"
  } = {}) {
    this.vaultPath = vaultPath;
    this.auditLog = auditLog;
    this.writeEnabled = writeEnabled;
    this.confirmToken = confirmToken;
  }

  status() {
    return {
      status: this.vaultPath && this.writeEnabled ? "REAL" : this.vaultPath ? "PARTIAL" : "MOCK",
      vaultConfigured: Boolean(this.vaultPath),
      writeEnabled: this.writeEnabled,
      requiresConfirmation: true
    };
  }

  async prepareSyncNote({ title, body }) {
    if (!title) throw new Error("Note title is required");
    if (!body) throw new Error("Note body is required");

    const note = {
      title,
      body,
      status: "draft_only",
      writeEnabled: false,
      risk: "PARTIAL",
      createdAt: new Date().toISOString()
    };

    await this.auditLog?.write({
      source: "obsidian",
      action: "sync_note_drafted",
      status: note.status,
      risk: note.risk,
      details: { title }
    });

    return note;
  }

  async syncNote({ title, body, confirmToken, folder = "JARVIS" }) {
    if (confirmToken !== this.confirmToken) {
      throw new Error(`Missing exact ${this.confirmToken} confirmation token`);
    }
    if (!this.writeEnabled) {
      throw new Error("Obsidian write is disabled. Set OBSIDIAN_WRITE_ENABLED=true.");
    }
    if (!this.vaultPath) {
      throw new Error("Missing OBSIDIAN_VAULT_PATH");
    }
    if (!title || !body) {
      throw new Error("Note title and body are required");
    }

    const vaultRoot = path.resolve(this.vaultPath);
    const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, "_");
    const safeTitle = title.replace(/[^a-zA-Z0-9 _-]/g, "_").slice(0, 120);
    const targetDir = path.join(vaultRoot, safeFolder);
    const targetPath = path.join(targetDir, `${safeTitle}.md`);

    if (!targetPath.startsWith(vaultRoot)) {
      throw new Error("Obsidian target escaped vault path");
    }

    const content = [
      "---",
      "source: JARVIS_COMMAND_CENTER",
      `created: ${new Date().toISOString()}`,
      "---",
      "",
      body.trim(),
      ""
    ].join("\n");

    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(targetPath, content, "utf8");

    await this.auditLog?.write({
      source: "obsidian",
      action: "note_synced",
      status: "written",
      risk: "PARTIAL",
      details: { targetPath }
    });

    return {
      status: "written",
      targetPath,
      risk: "PARTIAL"
    };
  }

  async syncJarvisSummary({ state, confirmToken }) {
    const body = [
      "# JARVIS State Summary",
      "",
      `Exported: ${state.exportedAt}`,
      "",
      "## Files",
      "",
      ...Object.entries(state.files || {}).map(([file, content]) => {
        return `- ${file}: ${content.length} chars`;
      })
    ].join("\n");

    return this.syncNote({
      title: "JARVIS State Summary",
      body,
      confirmToken,
      folder: "JARVIS"
    });
  }
}
