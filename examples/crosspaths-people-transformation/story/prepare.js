// Presentation only. Runs in app.html before the story starts and marks, for the renderer, which
// words change at which step and what leaves. Both versions of each string come from the page's
// copy table; nothing is restated here.

(() => {
  const copy = window.CROSSPATHS_COPY;
  const span = (className, content) => {
    const node = document.createElement("span");
    node.className = className;
    if (typeof content === "string") node.textContent = content;
    else node.append(...content);
    return node;
  };
  const swap = (node, step, to) => {
    const wrap = span("swap", "");
    wrap.dataset.at = String(step);
    wrap.append(span("from", [...node.childNodes]), span("to", to));
    node.replaceChildren(wrap);
  };

  // Step 1: three statistics become one count; three grouping tabs become People and Places.
  swap(document.getElementById("pill-people"), 1, copy.count[1]);
  document.getElementById("pill-from").dataset.out = "1";
  document.getElementById("pill-visitable").dataset.out = "1";
  document.getElementById("tab-homebases").dataset.out = "1";
  for (const node of document.querySelectorAll(".tab-item [data-copy]")) swap(node, 1, copy[node.dataset.copy][1]);

  // Step 2: the search asks for what people remember.
  swap(document.querySelector(".placeholder"), 2, copy.search[1]);

  // Step 3: initials instead of a single letter.
  for (const node of document.querySelectorAll(".ini")) swap(node, 3, node.dataset.after);

  // Step 4: the footer's labels say what each place is.
  for (const node of document.querySelectorAll(".loc-label[data-copy-key]")) swap(node, 4, copy[node.dataset.copyKey][1]);

  // Step 7: Timeline and Profile are renamed.
  for (const node of document.querySelectorAll(".tab-label[data-copy]")) swap(node, 7, copy[node.dataset.copy][1]);

  // The fonts are in by now, so card heights can be measured for both typefaces.
  window.measureNotes();
})();
