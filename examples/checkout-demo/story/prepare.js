// Presentation only. Runs in app.html?variant=before before the story starts and marks what the
// reviewed screen says differently, so the renderer can roll the words over at the right step.
// Both versions of each string come from the page's own copy table; nothing is restated here.

(() => {
  const copy = window.MARLOW_COPY;
  const step = { "items-heading": 3, "slots-heading": 3, subtotal: 3, delivery: 3, total: 3, pay: 4, title: 5, subtitle: 5, promo: 5 };
  const span = (className, text) => Object.assign(document.createElement("span"), { className, textContent: text });
  for (const node of document.querySelectorAll("[data-copy]")) {
    const key = node.dataset.copy;
    const [before, after] = copy[key];
    if (before === after) continue;
    const swap = span("swap", "");
    swap.dataset.at = String(step[key] ?? 3);
    swap.append(span("from", before), span("to", after));
    node.replaceChildren(swap);
  }
  // Step 4: the floating chat button leaves and chat appears in the header. Inline display keeps
  // the fix stylesheet from cutting them, so they fade instead.
  const fab = document.querySelector(".fab");
  fab.style.setProperty("display", "grid", "important");
  fab.dataset.out = "4";
  const chat = document.querySelector(".chat");
  chat.style.setProperty("display", "grid", "important");
  chat.dataset.in = "4";
})();
