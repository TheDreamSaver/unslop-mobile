// CrossPaths example: browse People, open a person, return, and add someone with only a name.
// Records live in memory only. Nothing is sent anywhere, and a reload restores the fixture.
//
// URL parameters (used by the capture and story configs, handy by hand too):
//   variant=before|after     the design study as it was, or with the fixes (default after)
//   screen=people|detail|capture|saved   id=<person id> for detail
//   name=<text>              with screen=capture, typed into the name field;
//                            with screen=saved, saved as a name-only person through the normal save path
//   hold                     keep the save confirmation on screen

(() => {
  const params = new URLSearchParams(location.search);
  const AFTER = document.documentElement.dataset.variant === "after";
  const records = structuredClone(window.CROSSPATHS_FIXTURE.records);
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  // The fixture's "today", so new records and captures are reproducible.
  const TODAY = { month: "Oct", date: "October 2026" };
  const $ = (id) => document.getElementById(id);
  const state = { screen: "people", current: null, editingId: null, returnTo: "people", openedId: null, listScroll: 0, draft: null, toastTimer: 0 };

  function elem(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#${name}`);
    svg.append(use);
    return svg;
  }
  const tone = (person) => ["berry", "sky", "plum", ""][((person.id % 4) + 3) % 4];
  const order = (person) => { const [month, year] = person.date.split(" "); return Number(year) * 12 + MONTHS.indexOf(month); };
  const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("");

  function show(screen) {
    state.screen = screen;
    $("app").dataset.screen = screen;
    for (const name of ["people", "detail", "capture"]) $(`${name}-screen`).hidden = name !== screen;
  }

  function notify(message, hold = false) {
    const toast = $("toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(state.toastTimer);
    if (!hold) state.toastTimer = setTimeout(() => (toast.hidden = true), 4000);
  }

  // People ----------------------------------------------------------------------------------------

  function card(person) {
    const button = elem("button", "person");
    button.type = "button";
    button.dataset.person = person.id;
    button.setAttribute("aria-label", `Open ${person.name}`);
    button.onclick = () => openPerson(person);
    const header = elem("span", "person-header");
    const info = elem("span", "person-info");
    info.append(elem("span", "person-name", person.name));
    if (person.handle) info.append(elem("span", "person-handle", person.handle));
    const date = elem("span", "person-date");
    date.id = `date-${person.id}`;
    date.setAttribute("aria-label", person.date);
    date.append(elem("strong", "", person.month), elem("small", "", person.date.split(" ").at(-1)));
    header.append(elem("span", `avatar ${tone(person)}`, person.initials), info, date);
    const encounter = elem("span", "person-encounter");
    encounter.id = `met-${person.id}`;
    const place = elem("span", "person-met-block");
    const label = elem("span", "person-met-label");
    label.append(icon("pin"), elem("span", "", "Met in"));
    place.append(label, elem("span", `person-met${person.met ? "" : " is-empty"}`, person.met || "Place not added"));
    encounter.append(place);
    const note = elem("span", `person-note${person.note ? "" : " is-empty"}`, person.note || "No memory added yet.");
    note.id = `note-${person.id}`;
    const locations = elem("span", "person-locations");
    locations.id = `places-${person.id}`;
    for (const [caption, value, glyph] of [["Homebase", person.home, "home"], ["Last known", person.last, "pin"]]) {
      const field = elem("span", "person-location");
      const title = elem("span", "person-location-label");
      title.append(icon(glyph), elem("span", "", caption));
      field.append(title, elem("span", `person-location-value${value ? "" : " is-empty"}`, value || "Not added"));
      locations.append(field);
    }
    button.setAttribute("aria-describedby", [date.id, encounter.id, note.id, locations.id].join(" "));
    button.append(header, encounter, note, locations);
    return button;
  }

  function renderPeople() {
    const query = $("search-input").value.trim().toLocaleLowerCase();
    const list = $("people-list");
    list.replaceChildren();
    $("people-count").textContent = `${records.length} people · ${new Set(records.map((r) => r.met).filter(Boolean)).size} places you met`;
    if ($("tab-places").getAttribute("aria-selected") === "true") {
      list.append(elem("p", "empty", "Places is not part of this example. It covers People, a person, and adding someone."));
      return;
    }
    const found = records.filter((r) => [r.name, r.met, r.home, r.last, r.note, r.handle].join(" ").toLocaleLowerCase().includes(query)).sort((a, b) => order(b) - order(a));
    if (!found.length) list.append(elem("p", "empty", "No people match that search."));
    found.forEach((person) => list.append(card(person)));
  }

  function openPerson(person) {
    state.listScroll = $("people-scroll").scrollTop;
    state.openedId = person.id;
    showPerson(person);
  }

  function backToPeople() {
    show("people");
    renderPeople();
    $("people-scroll").scrollTop = state.listScroll;
    // After: return focus to the card that was opened, so a keyboard or screen reader user keeps
    // their place in the list. Before, focus stayed on the hidden back button.
    if (AFTER && state.openedId !== null) document.querySelector(`.person[data-person="${state.openedId}"]`)?.focus({ preventScroll: true });
  }

  // Person ----------------------------------------------------------------------------------------

  function setValue(id, value, empty) {
    const node = $(id);
    node.textContent = value || empty;
    node.classList.toggle("is-empty", !value);
  }

  function showPerson(person) {
    state.current = person;
    $("detail-avatar").className = `avatar detail-avatar ${tone(person)}`;
    $("detail-avatar").textContent = person.initials;
    $("detail-name").textContent = person.name;
    $("detail-handle").textContent = person.handle || "Saved in your private book";
    setValue("detail-met", person.met, "Not added yet");
    $("detail-date").textContent = person.date;
    setValue("detail-home", person.home, "Not added yet");
    setValue("detail-last", person.last, "Not added yet");
    $("loc-home").toggleAttribute("data-empty", !person.home);
    $("loc-last").toggleAttribute("data-empty", !person.last);
    // A location date describes a saved location. After: no date line when there is no location.
    $("detail-freshness").textContent = person.freshness || "";
    $("detail-freshness").hidden = !person.freshness || (AFTER && !person.last);
    const note = $("detail-note");
    note.classList.toggle("is-empty", !person.note);
    if (person.note) note.textContent = person.note;
    else note.textContent = AFTER ? "No memory saved yet" : "Add a detail you would like to remember.";
    $("add-memory").hidden = !AFTER || !!person.note;
    $("note-private").hidden = AFTER && !person.note;
    $("whatsapp").hidden = !person.phone;
    $("detail-back").setAttribute("aria-label", "Back to People");
    setStatus("");
    show("detail");
    $("detail-scroll").scrollTop = 0;
  }

  // After: the save confirmation lives in the top bar's empty centre, so it covers nothing.
  // Before, a floating toast confirmed the save and sat on top of the screen's actions.
  function setStatus(message) {
    const status = $("save-status");
    status.replaceChildren();
    if (message) status.append(icon("check"), document.createTextNode(message));
  }

  // Capture ---------------------------------------------------------------------------------------

  const form = $("capture-screen");
  const FIELDS = ["name", "place", "note", "instagram", "phone", "home", "last"];
  const values = () => Object.fromEntries(FIELDS.map((name) => [name, form.elements[name].value]));
  const hasContent = (draft) => draft && Object.values(draft).some((value) => value.trim());

  function setMore(open) {
    $("more-fields").hidden = !open;
    $("more-button").setAttribute("aria-expanded", String(open));
    $("more-button").lastElementChild.textContent = open ? "−" : "+";
  }

  function fill(draft) {
    for (const name of FIELDS) form.elements[name].value = draft?.[name] ?? "";
    setMore(!!(draft && ["instagram", "phone", "home", "last"].some((name) => draft[name])));
  }

  function openCapture({ person = null, focus = "new-name" } = {}) {
    state.returnTo = state.screen;
    state.editingId = person?.id ?? null;
    if (person) {
      fill({ name: person.name, place: person.met, note: person.note, instagram: person.handle, phone: person.phone, home: person.home, last: person.last });
    } else if (AFTER && hasContent(state.draft)) {
      // After: an unsaved new person survives leaving the form. Before, + always cleared it.
      fill(state.draft);
    } else {
      fill(null);
    }
    $("capture-heading").textContent = person ? "Edit person" : "New person";
    $("save-person").textContent = person ? "Save changes" : "Save person";
    $("capture-back").setAttribute("aria-label", `Back to ${state.returnTo === "detail" ? state.current.name : "People"}`);
    show("capture");
    $("capture-scroll").scrollTop = 0;
    $(focus).focus({ preventScroll: true });
    if (focus !== "new-name") $(focus).scrollIntoView({ block: "center" });
  }

  function leaveCapture() {
    if (AFTER && state.editingId === null) state.draft = values();
    state.editingId = null;
    if (state.returnTo === "detail") showPerson(state.current);
    else backToPeople();
  }

  function save(event) {
    event.preventDefault();
    const typed = values();
    const name = typed.name.trim();
    if (!name) {
      $("new-name").setCustomValidity("Enter a name.");
      $("new-name").reportValidity();
      return;
    }
    const existing = state.editingId !== null ? records.find((r) => r.id === state.editingId) : null;
    const last = typed.last.trim();
    const person = {
      id: existing?.id ?? Math.max(...records.map((r) => r.id)) + 1,
      name,
      initials: initials(name),
      met: typed.place.trim(),
      month: existing?.month ?? TODAY.month,
      date: existing?.date ?? TODAY.date,
      home: typed.home.trim(),
      last,
      note: typed.note.trim(),
      handle: typed.instagram.trim(),
      phone: typed.phone.trim(),
      // Before: every saved record claimed "Location date unknown", even with no location.
      freshness: AFTER ? (last ? (existing?.last === last ? existing.freshness : "Location date unknown") : "") : "Location date unknown",
    };
    if (existing) records.splice(records.indexOf(existing), 1, person);
    else records.unshift(person);
    if (!existing) state.draft = null;
    state.editingId = null;
    state.openedId = person.id;
    showPerson(person);
    if (AFTER) setStatus(existing ? "Changes saved in this preview." : "A new path crossed. Saved in this preview.");
    else notify(existing ? "Changes saved in this preview." : "A new path crossed. Saved in this preview.", params.has("hold"));
  }

  // After: mobile keyboards get the right capitalisation and return key, and return moves to the
  // next field instead of saving a half-entered person.
  function keyboardHints() {
    const set = (id, attrs) => Object.entries(attrs).forEach(([key, value]) => $(id).setAttribute(key, value));
    set("new-name", { autocapitalize: "words", autocorrect: "off", spellcheck: "false", enterkeyhint: "next" });
    set("new-place", { autocapitalize: "words", enterkeyhint: "next" });
    set("new-instagram", { autocapitalize: "none", autocorrect: "off", spellcheck: "false", autocomplete: "off", enterkeyhint: "next" });
    set("new-phone", { autocomplete: "off", enterkeyhint: "next" });
    set("new-home", { autocapitalize: "words", enterkeyhint: "next" });
    set("new-last", { autocapitalize: "words", enterkeyhint: "done" });
    form.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.target.tagName !== "INPUT") return;
      event.preventDefault();
      const order = [...form.querySelectorAll("input, textarea")].filter((field) => field.offsetParent !== null);
      const next = order[order.indexOf(event.target) + 1];
      if (next) next.focus();
      else event.target.blur();
    });
  }

  // Wiring ----------------------------------------------------------------------------------------

  $("search-input").addEventListener("input", renderPeople);
  for (const tab of ["people", "places"]) {
    $(`tab-${tab}`).onclick = () => {
      for (const other of ["people", "places"]) {
        $(`tab-${other}`).setAttribute("aria-selected", String(other === tab));
        $(`tab-${other}`).tabIndex = other === tab ? 0 : -1;
      }
      renderPeople();
    };
  }
  document.querySelectorAll("[data-unavailable]").forEach((button) => (button.onclick = () => notify(`${button.dataset.unavailable} is not part of this example.`)));
  $("add-person").onclick = () => openCapture();
  $("detail-back").onclick = backToPeople;
  $("edit-person").onclick = () => openCapture({ person: state.current });
  $("add-memory").onclick = () => openCapture({ person: state.current, focus: "new-note" });
  $("capture-back").onclick = leaveCapture;
  $("more-button").onclick = () => setMore($("more-fields").hidden);
  $("new-name").addEventListener("input", () => $("new-name").setCustomValidity(""));
  form.addEventListener("submit", save);
  $("whatsapp").onclick = () => notify("The app opens a chat only after you tap. No message is sent by this example.");
  $("share-person").onclick = () => notify(`Share preview: ${state.current.name}${state.current.handle ? ` · ${state.current.handle}` : ""}. Private notes are excluded.`);
  if (AFTER) keyboardHints();

  renderPeople();
  const screen = params.get("screen");
  const byId = records.find((r) => String(r.id) === params.get("id"));
  if (screen === "detail" && byId) openPerson(byId);
  if (screen === "capture") {
    openCapture();
    if (params.get("name")) $("new-name").value = params.get("name");
  }
  if (screen === "saved") {
    openCapture();
    $("new-name").value = params.get("name") || "Ana Lucía Fernández-Wójcik";
    form.requestSubmit();
  }
})();
