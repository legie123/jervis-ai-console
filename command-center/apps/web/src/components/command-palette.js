function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function score(query, text) {
  const q = normalize(query);
  const t = normalize(text);
  if (!q) return 1;
  if (t.includes(q)) return 100 + q.length;
  const qw = q.split(" ");
  let s = 0;
  for (const w of qw) {
    if (w && t.includes(w)) s += 20;
  }
  return s;
}

export function mountCommandPalette(container, { commands, onClose }) {
  container.innerHTML = `
    <dialog class="cmd-palette glass-modal" id="cmdPalette" aria-label="Command palette">
      <div class="cmd-palette-inner">
        <label class="sr-only" for="cmdPaletteInput">Search commands</label>
        <input id="cmdPaletteInput" class="cmd-palette-input" type="search" autocomplete="off" spellcheck="false" placeholder="Search missions, navigation, actions…" />
        <ul class="cmd-palette-list" role="listbox" id="cmdPaletteList"></ul>
        <p class="cmd-palette-hint"><kbd>⌘</kbd><kbd>K</kbd> toggle · <kbd>↑</kbd><kbd>↓</kbd> · <kbd>Enter</kbd> run · <kbd>Esc</kbd> close</p>
      </div>
    </dialog>
  `;

  const dialog = container.querySelector("#cmdPalette");
  const input = container.querySelector("#cmdPaletteInput");
  const listEl = container.querySelector("#cmdPaletteList");

  let filtered = [...commands];
  let activeIndex = 0;

  function renderList() {
    listEl.replaceChildren();
    filtered.slice(0, 40).forEach((cmd, i) => {
      const li = document.createElement("li");
      li.className = "cmd-palette-item" + (i === activeIndex ? " is-active" : "");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === activeIndex));
      li.dataset.index = String(i);
      li.innerHTML = `<span class="cmd-title">${escapeHtml(cmd.title)}</span><span class="cmd-sub">${escapeHtml(cmd.group || "")}</span>`;
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        run(cmd);
      });
      listEl.append(li);
    });
  }

  function filter(q) {
    const ranked = commands
      .map((c) => ({ c, s: score(q, `${c.title} ${c.keywords || ""} ${c.group || ""}`) }))
      .filter((x) => x.s > 0 || !normalize(q))
      .sort((a, b) => b.s - a.s);
    filtered = ranked.map((x) => x.c);
    if (!normalize(q)) filtered = [...commands];
    activeIndex = 0;
    renderList();
  }

  function run(cmd) {
    try {
      cmd.run();
    } finally {
      dialog.close();
      onClose?.();
    }
  }

  input.addEventListener("input", () => filter(input.value));

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, Math.max(filtered.length - 1, 0));
      renderList();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      renderList();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[activeIndex];
      if (cmd) run(cmd);
    }
  });

  dialog.addEventListener("close", () => {
    input.value = "";
    onClose?.();
  });

  return {
    open() {
      filter("");
      dialog.showModal();
      requestAnimationFrame(() => input.focus());
    },
    close() {
      dialog.close();
    },
    get element() {
      return dialog;
    }
  };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
