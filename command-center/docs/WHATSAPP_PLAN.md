# WhatsApp Plan

Status: ACCESS IMPLEMENTED, LIVE SEND UNVERIFIED.

## Goal

Let JARVIS prepare WhatsApp replies safely.
Let JARVIS receive WhatsApp Business webhook messages.

## Current Allowed Behavior

- Create message drafts.
- Store drafts locally.
- Mark draft risk.
- Require confirmation before send.
- Schedule drafts as pending work.
- Write audit log entries.
- Send through WhatsApp Business Cloud API only when `.env` enables it.
- Receive inbound messages through Cloud API webhooks.
- Store inbound messages locally in `data/memory/whatsapp-inbox.json`.

## Send Gate

Real send requires all:

- `WHATSAPP_REAL_SEND_ENABLED=true`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- exact confirmation token from `WHATSAPP_SEND_CONFIRM_TOKEN`

Default token:

`CONFIRM_SEND`

## Not Allowed

- No automatic replies.
- No browser automation.
- No personal inbox scraping.
- No token storage in source code.

## Future Real Integration

Preferred official path:

- WhatsApp Business Cloud API.
- Webhook for inbound messages.
- Graph API for outbound messages.
- Signature verification.
- Explicit send confirmation gate.

Webhook endpoints:

- `GET /webhooks/whatsapp`
- `POST /webhooks/whatsapp`
- `GET /api/whatsapp/messages`

Webhook config:

```bash
WHATSAPP_VERIFY_TOKEN=change-this-webhook-token
WHATSAPP_APP_SECRET=optional-but-recommended
```

Implemented send endpoint:

`POST /api/whatsapp/drafts/:id/send`

Payload:

```json
{
  "confirmToken": "CONFIRM_SEND"
}
```

Personal WhatsApp automation is UNVERIFIED and riskier. It must be treated as DANGEROUS unless explicitly approved.
