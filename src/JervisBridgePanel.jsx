/**
 * JervisBridgePanel
 * ----------------------------------------
 * Fixed bottom-right widget that polls the supervisor on :7777
 * and shows alert level, module health, agents, recent events.
 * Self-contained: zero new dependencies, inline styles.
 *
 * Drop-in usage in main.jsx:
 *   import JervisBridgePanel from "./JervisBridgePanel.jsx";
 *   ...inside <main>... <JervisBridgePanel />
 */

import React, { useEffect, useState, useRef } from "react";

const ENDPOINT = (typeof window !== "undefined" && window.JERVIS_BRIDGE_URL) || "http://localhost:7777";
const POLL_MS  = 5000;

const COLOR = {
  bg:      "#0a0a14",
  border:  "#1a1a2a",
  orange:  "#ff9933",
  cyan:    "#99ccff",
  green:   "#00ff88",
  yellow:  "#ffcc66",
  red:     "#ff3300",
  dim:     "#6b7280",
};

const STATUS_DOT = {
  ONLINE:   "#00ff88",
  STANDBY:  "#888",
  WARN:     "#ffcc66",
  INIT:     "#ffcc66",
  DEGRADED: "#ff3300",
  ERR:      "#ff3300",
  OFFLINE:  "#444",
};

export default function JervisBridgePanel() {
  const [open, setOpen]       = useState(false);
  const [data, setData]       = useState(null);
  const [error, setError]     = useState(null);
  const [lastUpdate, setLast] = useState(null);
  const timerRef              = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch(`${ENDPOINT}/status`, { signal: AbortSignal.timeout(2500) });
        if (!r.ok) throw new Error(`http ${r.status}`);
        const j = await r.json();
        if (!cancelled) { setData(j); setError(null); setLast(Date.now()); }
      } catch (e) {
        if (!cancelled) { setError(e.message || "offline"); }
      }
    }
    poll();
    timerRef.current = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(timerRef.current); };
  }, []);

  const connected = !!data && !error;
  const alert = (data?.alert || "").toUpperCase();
  const alertColor = alert === "RED" ? COLOR.red : alert === "YELLOW" ? COLOR.yellow : connected ? COLOR.green : "#444";
  const moduleEntries = data?.modules ? Object.entries(data.modules) : [];
  const onlineCount   = moduleEntries.filter(([, m]) => m.status === "ONLINE").length;
  const events        = (data?.recentEvents || []).slice(0, 4);
  const metrics       = data?.metrics || {};

  return (
    <>
      <style>{css}</style>
      <div className={`jvb-panel ${open ? "is-open" : "is-closed"}`} data-status={connected ? "up" : "down"}>
        <button className="jvb-toggle" onClick={() => setOpen(o => !o)} title="JERVIS Bridge :7777">
          <span className="jvb-dot" style={{ background: alertColor }} />
          <span className="jvb-label">BRIDGE</span>
          <span className="jvb-meta">{connected ? `${onlineCount}/${moduleEntries.length} UP` : "OFFLINE"}</span>
          <span className="jvb-arrow">{open ? "▾" : "▸"}</span>
        </button>

        {open && (
          <div className="jvb-body">
            {!connected && (
              <div className="jvb-row jvb-err">
                <strong>:7777 unreachable</strong>
                <small>Run: <code>node jervis-boot.mjs</code></small>
              </div>
            )}

            {connected && (
              <>
                <div className="jvb-row">
                  <span className="jvb-k">Alert</span>
                  <span className="jvb-v" style={{ color: alertColor, fontWeight: 700 }}>{alert}</span>
                </div>
                <div className="jvb-row">
                  <span className="jvb-k">Stardate</span>
                  <span className="jvb-v">{data.stardate}</span>
                </div>
                <div className="jvb-row">
                  <span className="jvb-k">Session</span>
                  <span className="jvb-v jvb-mono">{(data.sessionId || "").slice(-8)}</span>
                </div>

                <div className="jvb-divider">MODULES</div>
                <div className="jvb-modules">
                  {moduleEntries.map(([name, m]) => (
                    <div className="jvb-mod" key={name} title={m.note || ""}>
                      <span className="jvb-mod-dot" style={{ background: STATUS_DOT[m.status] || "#444" }} />
                      <span className="jvb-mod-name">{name.replace("MOD-", "").replace(".", " ")}</span>
                      <span className="jvb-mod-status">{m.status}</span>
                    </div>
                  ))}
                </div>

                <div className="jvb-divider">AGENTS · {data.swarm?.agents?.length || 0}</div>
                <div className="jvb-agents">
                  {(data.swarm?.agents || []).map(a => (
                    <span className="jvb-agent" key={a.id} title={`${a.role} · ${a.model}`}>
                      <span className="jvb-dot" style={{ background: COLOR.green }} />
                      {a.id}
                    </span>
                  ))}
                </div>

                <div className="jvb-divider">EVENTS</div>
                <div className="jvb-events">
                  {events.map((ev, i) => (
                    <div className={`jvb-ev jvb-ev-${ev.level}`} key={i}>
                      <span className="jvb-ev-ts">{ev.ts}</span>
                      <span className="jvb-ev-mod">{ev.mod}</span>
                      <span className="jvb-ev-msg">{ev.msg}</span>
                    </div>
                  ))}
                </div>

                <div className="jvb-metrics">
                  <span><b>{metrics.tasks ?? 0}</b> tasks</span>
                  <span><b>{metrics.alerts ?? 0}</b> alerts</span>
                  <span>last poll · {lastUpdate ? `${Math.round((Date.now()-lastUpdate)/1000)}s ago` : "—"}</span>
                </div>

                <div className="jvb-actions">
                  <button onClick={() => sendAlert("GREEN")}  className="jvb-btn green">GREEN</button>
                  <button onClick={() => sendAlert("YELLOW")} className="jvb-btn yellow">YELLOW</button>
                  <button onClick={() => sendAlert("RED")}    className="jvb-btn red">RED</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );

  async function sendAlert(level) {
    try {
      await fetch(`${ENDPOINT}/alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level }),
      });
    } catch {}
  }
}

const css = `
.jvb-panel {
  position: fixed; bottom: 12px; right: 12px; z-index: 9999;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px; color: ${COLOR.cyan};
  pointer-events: auto; user-select: none;
}
.jvb-toggle {
  background: ${COLOR.bg}; border: 1.5px solid ${COLOR.orange}; color: ${COLOR.cyan};
  border-radius: 24px; padding: 8px 14px; cursor: pointer;
  display: flex; align-items: center; gap: 8px;
  font-family: inherit; font-size: 11px; letter-spacing: 0.06em;
  box-shadow: 0 4px 18px rgba(0,0,0,.45), 0 0 12px rgba(255,153,51,.15);
  transition: filter .15s, transform .15s;
}
.jvb-toggle:hover { filter: brightness(1.15); transform: translateY(-1px); }
.jvb-panel[data-status="down"] .jvb-toggle { border-color: #444; }
.jvb-dot { width: 8px; height: 8px; border-radius: 50%; box-shadow: 0 0 6px currentColor; display: inline-block; }
.jvb-label { color: ${COLOR.orange}; font-weight: 700; }
.jvb-meta  { color: ${COLOR.dim}; font-size: 10px; }
.jvb-arrow { color: ${COLOR.orange}; }

.jvb-body {
  position: absolute; bottom: 44px; right: 0;
  width: 320px; max-height: 70vh; overflow-y: auto;
  background: ${COLOR.bg}; border: 1.5px solid ${COLOR.orange};
  border-radius: 14px; padding: 14px;
  box-shadow: 0 8px 32px rgba(0,0,0,.6), 0 0 24px rgba(255,153,51,.12);
}
.jvb-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; }
.jvb-k   { color: ${COLOR.dim}; }
.jvb-v   { color: ${COLOR.cyan}; }
.jvb-mono { font-family: inherit; }
.jvb-divider {
  margin: 10px 0 6px; padding-top: 6px; border-top: 1px solid ${COLOR.border};
  color: ${COLOR.orange}; font-size: 9px; letter-spacing: 0.16em; font-weight: 700;
}
.jvb-modules { display: flex; flex-direction: column; gap: 3px; }
.jvb-mod { display: grid; grid-template-columns: 10px 1fr auto; gap: 8px; align-items: center; padding: 2px 0; }
.jvb-mod-dot { width: 8px; height: 8px; border-radius: 50%; box-shadow: 0 0 4px currentColor; }
.jvb-mod-name { color: ${COLOR.cyan}; font-size: 10px; }
.jvb-mod-status { color: ${COLOR.dim}; font-size: 9px; letter-spacing: 0.08em; }
.jvb-agents { display: flex; flex-wrap: wrap; gap: 4px; }
.jvb-agent  { display: inline-flex; align-items: center; gap: 4px; background: #050510;
              padding: 3px 8px; border-radius: 10px; border: 1px solid ${COLOR.border};
              font-size: 9px; color: ${COLOR.cyan}; }
.jvb-events { display: flex; flex-direction: column; gap: 3px; }
.jvb-ev    { display: grid; grid-template-columns: 56px 70px 1fr; gap: 6px; align-items: baseline; font-size: 9.5px; }
.jvb-ev-ts { color: ${COLOR.dim}; font-size: 9px; }
.jvb-ev-mod{ color: ${COLOR.orange}; font-weight: 700; font-size: 9px; }
.jvb-ev-msg{ color: ${COLOR.cyan}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jvb-ev-warn .jvb-ev-msg { color: ${COLOR.yellow}; }
.jvb-ev-err  .jvb-ev-msg { color: ${COLOR.red}; }
.jvb-metrics{ display: flex; justify-content: space-between; gap: 8px; font-size: 9.5px; color: ${COLOR.dim};
              margin-top: 8px; padding-top: 6px; border-top: 1px solid ${COLOR.border}; }
.jvb-metrics b { color: ${COLOR.cyan}; }
.jvb-actions { display: flex; gap: 6px; margin-top: 10px; }
.jvb-btn { flex: 1; padding: 6px 8px; border: none; border-radius: 6px; cursor: pointer;
           font-family: inherit; font-size: 10px; font-weight: 700; color: #000; letter-spacing: 0.08em; }
.jvb-btn.green  { background: ${COLOR.green}; }
.jvb-btn.yellow { background: ${COLOR.yellow}; }
.jvb-btn.red    { background: ${COLOR.red}; color: #fff; }
.jvb-btn:hover { filter: brightness(1.1); }
.jvb-err { color: ${COLOR.red}; }
.jvb-err small { display: block; color: ${COLOR.dim}; margin-top: 4px; }
.jvb-err code { background: #050510; padding: 2px 6px; border-radius: 4px; color: ${COLOR.cyan}; }
`;
