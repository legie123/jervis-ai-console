export async function issueSecurityToken(api, scope, targetId = "", ttlMs) {
  const payload = await api("/api/security/tokens", {
    method: "POST",
    body: JSON.stringify({
      scope,
      targetId,
      ttlMs
    })
  });
  return payload.token;
}

export async function resolveScopedToken({ api, scope, targetId = "", inputEl, ttlMs }) {
  const manual = String(inputEl?.value || "").trim();
  if (manual) return manual;
  const issued = await issueSecurityToken(api, scope, targetId, ttlMs);
  if (inputEl) inputEl.value = issued.token;
  return issued.token;
}

export async function triggerEmergencyStop({
  api,
  pendingGate,
  approvalQueueCtl,
  voiceOrbApi,
  toastRegion,
  source = "ui_shortcut"
}) {
  const payload = await api("/api/emergency/stop", {
    method: "POST",
    body: JSON.stringify({
      reason: "operator_emergency_stop",
      source
    })
  });
  pendingGate?.close?.();
  approvalQueueCtl?.clearAll?.({ reason: "Emergency stop cleared pending approvals" });
  voiceOrbApi?.stopListening?.();
  toastRegion?.push?.("Emergency stop active", "error");
  return payload;
}

export async function clearEmergencyStop({
  api,
  toastRegion,
  source = "palette"
}) {
  const issued = await issueSecurityToken(api, "emergency.clear");
  const payload = await api("/api/emergency/clear", {
    method: "POST",
    body: JSON.stringify({
      confirmToken: issued.token,
      source,
      reason: "operator_resume"
    })
  });
  toastRegion?.push?.("Emergency stop cleared", "info");
  return payload;
}
