export class EmergencyStopState {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.active = false;
    this.reason = "";
    this.source = "";
    this.triggeredAtMs = 0;
  }

  trigger({ reason = "manual_stop", source = "operator" } = {}) {
    this.active = true;
    this.reason = String(reason || "manual_stop");
    this.source = String(source || "operator");
    this.triggeredAtMs = this.now();
    return this.status();
  }

  clear({ reason = "manual_clear", source = "operator" } = {}) {
    const previous = this.status();
    this.active = false;
    this.reason = "";
    this.source = "";
    this.triggeredAtMs = 0;
    return {
      ...this.status(),
      cleared: true,
      previous,
      clearedBy: source,
      clearReason: reason
    };
  }

  status() {
    return {
      active: this.active,
      reason: this.reason || null,
      source: this.source || null,
      triggeredAt: this.triggeredAtMs ? new Date(this.triggeredAtMs).toISOString() : null
    };
  }

  assertRunnable(action = "operation") {
    if (!this.active) return;
    throw new Error(`Emergency stop active: ${action} blocked`);
  }
}

export function createEmergencyStopState(options = {}) {
  return new EmergencyStopState(options);
}
