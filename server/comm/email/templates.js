/**
 * server/comm/email/templates.js — minimal template renderer
 * Author: claude-coder
 *
 * No deps. Mustache-style {{var}} substitution + simple {{#if x}}...{{/if}}.
 */

export function renderTemplate(template, vars = {}) {
  if (typeof template !== "string") throw new Error("renderTemplate: template must be string");
  let out = template;

  // {{#if VAR}}...{{/if}} blocks
  out = out.replace(/\{\{#if\s+([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, body) => {
    const value = lookup(vars, key);
    return value ? body : "";
  });

  // {{var}} substitution (escaped HTML by default off — text emails)
  out = out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const value = lookup(vars, key);
    return value === undefined || value === null ? "" : String(value);
  });

  return out;
}

function lookup(obj, key) {
  if (!obj) return undefined;
  const parts = key.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/** Built-in templates for common JERVIS scenarios. */
export const TEMPLATES = Object.freeze({
  task_reminder: `Salut {{name}},

{{#if subject}}Reminder: {{subject}}{{/if}}

{{body}}

— JERVIS
`,

  daily_brief: `Bună dimineața, {{name}}.

Briefing pentru {{date}}:
{{summary}}

— JERVIS · stardate {{stardate}}
`,

  weekly_recap: `{{name}}, săptămâna trecută:

{{recap}}

— JERVIS
`
});

export function renderBuiltin(templateName, vars = {}) {
  const tpl = TEMPLATES[templateName];
  if (!tpl) throw new Error(`unknown template: ${templateName}`);
  return renderTemplate(tpl, vars);
}

export default { renderTemplate, renderBuiltin, TEMPLATES };
