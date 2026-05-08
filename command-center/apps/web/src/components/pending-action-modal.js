/**
 * Double-confirm modal for HIGH risk-style gates (demo wired to FSM WAITING_CONFIRMATION + manual demo).
 */
export function mountPendingActionModal(container, { onResolve }) {
  container.innerHTML = `
    <dialog class="pending-modal glass-modal" id="pendingModal" aria-labelledby="pendingModalTitle">
      <form method="dialog" class="pending-modal-form">
        <h2 id="pendingModalTitle">Risk gate</h2>
        <p class="pending-modal-body" id="pendingModalBody">Confirmation required.</p>
        <label class="pending-modal-phrase" for="pendingPhraseInput">Type CONFIRM to arm</label>
        <input id="pendingPhraseInput" type="text" class="pending-input" autocomplete="off" aria-required="true" />
        <div class="pending-modal-actions">
          <button type="button" class="btn-secondary" id="pendingAbortBtn">Abort <kbd>Esc</kbd></button>
          <button type="button" class="btn-primary" id="pendingStep1Btn">Arm <kbd>⌘↵</kbd></button>
          <button type="button" class="btn-danger" id="pendingStep2Btn" disabled>Execute</button>
        </div>
      </form>
    </dialog>
  `;

  const dialog = container.querySelector("#pendingModal");
  const bodyEl = container.querySelector("#pendingModalBody");
  const phrase = container.querySelector("#pendingPhraseInput");
  const abortBtn = container.querySelector("#pendingAbortBtn");
  const step1 = container.querySelector("#pendingStep1Btn");
  const step2 = container.querySelector("#pendingStep2Btn");

  let armed = false;

  function reset() {
    armed = false;
    phrase.value = "";
    step2.disabled = true;
  }

  function open(opts = {}) {
    bodyEl.textContent = opts.message || "Dangerous action blocked pending confirmation.";
    reset();
    dialog.showModal();
    phrase.focus();
  }

  function close() {
    dialog.close();
    reset();
    onResolve?.({ action: "dismiss" });
  }

  abortBtn.addEventListener("click", close);

  step1.addEventListener("click", () => {
    if (phrase.value.trim().toUpperCase() === "CONFIRM") {
      armed = true;
      step2.disabled = false;
      step2.focus();
    }
  });

  step2.addEventListener("click", () => {
    if (!armed) return;
    onResolve?.({ action: "confirmed", phrase: phrase.value.trim() });
    dialog.close();
    reset();
  });

  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });

  return {
    open,
    close,
    get element() {
      return dialog;
    }
  };
}
