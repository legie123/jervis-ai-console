# JARVIS Safety Rules

Status: ACTIVE.

## Hard Rules

- Do not touch files outside `/Users/user/projects/JARVIS_COMMAND_CENTER`.
- Do not run destructive git commands.
- Do not send external messages without explicit confirmation.
- Do not expose secrets.
- Do not hardcode API keys.
- Preserve user data.

## Risk Labels

- REAL: verified working.
- MOCK: fake/demo/stub.
- PARTIAL: works incomplete.
- BROKEN: does not work.
- DANGEROUS: can damage data, money, accounts, or external communication.
- UNVERIFIED: not checked.

## Confirmation Gates

Required before:

- Sending WhatsApp messages.
- Running tools with external side effects.
- Writing to external apps.
- Deleting, moving, or overwriting user data.
- Scheduling recurring actions.

Scheduler may activate due drafts for confirmation.

Scheduler must not auto-send external messages.

Background scheduler loop must remain:

- env gated
- local only
- no auto-send
- audit-backed through due job activation

## Restore Gate

Restore can overwrite local JARVIS state.

It requires exact token:

`RESTORE_JARVIS`

Restore path must be inside `data/exports`.

## Obsidian Gate

Obsidian sync writes to a configured local vault.

It requires:

- `OBSIDIAN_VAULT_PATH`
- `OBSIDIAN_WRITE_ENABLED=true`
- exact `SYNC_OBSIDIAN` token

## WhatsApp Send Gate

WhatsApp send is DANGEROUS.

The system must require:

- env flag enabled
- access token configured outside source code
- phone number id configured outside source code
- exact confirmation token
- audit log write after success or failure
