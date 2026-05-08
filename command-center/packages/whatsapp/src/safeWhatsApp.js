import { WhatsAppDraftStore } from "./draftStore.js";
import { WhatsAppCloudSender } from "./cloudSender.js";
import { WhatsAppMessageStore } from "./messageStore.js";
import { extractInboundMessages } from "./webhook.js";

export class SafeWhatsApp {
  constructor({
    draftStore = new WhatsAppDraftStore(),
    messageStore = new WhatsAppMessageStore(),
    sender = new WhatsAppCloudSender(),
    auditLog = null,
    confirmToken = process.env.WHATSAPP_SEND_CONFIRM_TOKEN || "CONFIRM_SEND"
  } = {}) {
    this.draftStore = draftStore;
    this.messageStore = messageStore;
    this.sender = sender;
    this.auditLog = auditLog;
    this.confirmToken = confirmToken;
  }

  status() {
    return {
      ...this.sender.status(),
      inboundWebhook: "PARTIAL",
      webhookVerifyConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
      webhookSignatureConfigured: Boolean(process.env.WHATSAPP_APP_SECRET)
    };
  }

  async draftMessage(input) {
    const draft = await this.draftStore.create(input);
    await this.auditLog?.write({
      source: "whatsapp",
      action: "draft_created",
      status: draft.status,
      risk: draft.risk,
      details: { draftId: draft.id, to: draft.to, scheduledFor: draft.scheduledFor }
    });
    return draft;
  }

  async confirmDraftNoSend(id) {
    const draft = await this.draftStore.markConfirmed(id);
    if (!draft) throw new Error("Draft not found");

    await this.auditLog?.write({
      source: "whatsapp",
      action: "draft_confirmed_no_send",
      status: draft.status,
      risk: draft.risk,
      details: { draftId: draft.id, to: draft.to }
    });

    return draft;
  }

  async listMessages() {
    return this.messageStore.list();
  }

  async receiveWebhook(payload) {
    const parsed = extractInboundMessages(payload);
    const saved = await this.messageStore.addMany(parsed.messages);

    for (const message of saved) {
      await this.auditLog?.write({
        source: "whatsapp",
        action: "message_received",
        status: "stored",
        risk: "REAL",
        details: { messageId: message.id, from: message.from, type: message.type }
      });
    }

    for (const status of parsed.statuses) {
      await this.auditLog?.write({
        source: "whatsapp",
        action: "message_status",
        status: status.status,
        risk: "REAL",
        details: { messageId: status.id, recipientId: status.recipientId }
      });
    }

    return { saved, statuses: parsed.statuses };
  }

  async send() {
    throw new Error("Use sendConfirmedDraft(id, confirmToken) so audit and gates are enforced");
  }

  async sendConfirmedDraft(id, confirmToken) {
    if (confirmToken !== this.confirmToken) {
      throw new Error(`Missing exact ${this.confirmToken} confirmation token`);
    }

    const drafts = await this.draftStore.list();
    const draft = drafts.find((item) => item.id === id);
    if (!draft) throw new Error("Draft not found");
    if (!["pending_confirmation", "scheduled_draft", "confirmed_no_send_adapter", "send_failed"].includes(draft.status)) {
      throw new Error(`Draft status ${draft.status} cannot be sent`);
    }

    try {
      const providerResponse = await this.sender.sendText({ to: draft.to, body: draft.body });
      const sentDraft = await this.draftStore.markSent(id, providerResponse);
      await this.auditLog?.write({
        source: "whatsapp",
        action: "message_sent",
        status: "sent",
        risk: "DANGEROUS",
        details: { draftId: id, to: draft.to, providerResponse }
      });
      return sentDraft;
    } catch (error) {
      const failedDraft = await this.draftStore.markFailed(id, error.message);
      await this.auditLog?.write({
        source: "whatsapp",
        action: "message_send_failed",
        status: "send_failed",
        risk: "DANGEROUS",
        details: { draftId: id, to: draft.to, error: error.message }
      });
      throw Object.assign(error, { draft: failedDraft });
    }
  }
}
