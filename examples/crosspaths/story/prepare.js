// Presentation only. Runs inside app.html?variant=before&screen=saved before the story starts and
// marks what differs from app.html?variant=after, so the renderer can tween one into the other.
// The step stylesheets are the same files app.html links for the after variant.

(() => {
  const $ = (id) => document.getElementById(id);
  const span = (className, text) => Object.assign(document.createElement("span"), { className, textContent: text });

  // Step 1: a date line for a location that was never saved.
  $("detail-freshness").dataset.out = "1";

  // Step 2: placeholder copy set as a saved note becomes an empty state with an action.
  const note = $("detail-note");
  const swap = span("swap", "");
  swap.dataset.at = "2";
  swap.append(span("from", note.textContent), span("to", "No memory saved yet"));
  note.replaceChildren(swap);
  $("note-private").dataset.out = "2";
  $("add-memory").hidden = false;
  $("add-memory").dataset.in = "2";

  // Step 3: the floating toast leaves, and the confirmation appears in the top bar.
  $("toast").dataset.out = "3";
  const status = $("save-status");
  status.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#check"/></svg>A new path crossed. Saved in this preview.';
  status.dataset.in = "3";
})();
