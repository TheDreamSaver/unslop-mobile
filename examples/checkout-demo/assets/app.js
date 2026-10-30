// Marlow Market is a fictional shop. Quantities and the delivery slot work; nothing is ordered.
// The copy differs between the draft and the reviewed screen; window.MARLOW_COPY exposes both
// versions of every string, so the story can swap one for the other without restating them.

(() => {
  const AFTER = document.documentElement.dataset.variant === "after";
  const items = [
    { id: "avocado", art: "p-avocado", name: "Organic Hass Avocados", unit: "3 pack", price: 4.99, qty: 1 },
    { id: "bread", art: "p-bread", name: "Sourdough Country Loaf, thick sliced", unit: "800 g", price: 6.5, qty: 1 },
    { id: "lemons", art: "p-lemons", name: "Amalfi Lemons, unwaxed", unit: "6 pack", price: 3.4, qty: 2 },
  ];
  const slots = [
    { id: "today", label: ["TODAY 6-8PM", "Today, 6–8 pm"] },
    { id: "tomorrow", label: ["TMRW 9-11AM", "Tomorrow, 9–11 am"] },
  ];
  let chosen = "today";
  const DELIVERY = 3.99;
  const FREE_FROM = 35;

  // The draft printed money however the arithmetic came out; the reviewed screen uses one format.
  const loose = (value) => `$${Math.round(value * 100) / 100 === Math.round(value * 10) / 10 ? Math.round(value * 10) / 10 : Math.round(value * 100) / 100}`;
  const money = (value) => `$${value.toFixed(2)}`;

  function copy() {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const delivery = subtotal >= FREE_FROM ? 0 : DELIVERY;
    const total = subtotal + delivery;
    const count = items.reduce((sum, item) => sum + item.qty, 0);
    const table = {
      title: ["My Cart ✨", "Your basket"],
      subtitle: [`🔥 ${count} items · don't miss out!`, `${count} items from Marlow Market`],
      promo: ["🎉 FREE DELIVERY ON ORDERS $35+!! 🎉", delivery ? `Free delivery from $35 · add ${money(FREE_FROM - subtotal)} more` : "Free delivery on this order"],
      "items-heading": ["🛒 YOUR ITEMS", "Items"],
      "slots-heading": ["🚚 DELIVERY TIME", "Delivery"],
      subtotal: [loose(subtotal), money(subtotal)],
      delivery: [delivery ? loose(delivery) : "FREE!!", delivery ? money(delivery) : "Free"],
      total: [loose(total), money(total)],
      pay: ["🚀 CHECKOUT NOW!!", "Check out"],
    };
    for (const item of items) table[`meta-${item.id}`] = [`$${item.price} · ${item.unit.toUpperCase()}`, `${item.unit} · ${money(item.price)} each`];
    for (const slot of slots) table[`slot-${slot.id}`] = slot.label;
    return table;
  }

  const svg = (id, className = "line") => `<svg class="${className}" aria-hidden="true"><use href="#${id}"/></svg>`;

  function render() {
    const list = document.getElementById("items");
    list.replaceChildren(...items.map((item) => {
      const row = document.createElement("li");
      row.className = "item";
      row.dataset.id = item.id;
      row.dataset.qty = item.qty;
      const fewer = item.qty === 1 && AFTER ? `Remove ${item.name}` : `One fewer ${item.name}`;
      row.innerHTML = `
        <div class="thumb">${svg(item.art, "art")}</div>
        <div class="info"><p class="name">${item.name}</p><p class="meta" data-copy="meta-${item.id}"></p></div>
        <div class="qty">
          <button type="button" class="dec" aria-label="${fewer}"><span class="glyph" aria-hidden="true">−</span>${svg("i-trash", "line trash")}</button>
          <output aria-label="Quantity">${item.qty}</output>
          <button type="button" class="inc" aria-label="One more ${item.name}"><span class="glyph" aria-hidden="true">+</span></button>
        </div>
        <button type="button" class="remove" aria-label="Remove ${item.name}">×</button>`;
      row.querySelector(".inc").onclick = () => change(item, 1);
      row.querySelector(".dec").onclick = () => change(item, -1);
      row.querySelector(".remove").onclick = () => change(item, -item.qty);
      return row;
    }));
    const group = document.getElementById("slots");
    group.replaceChildren(...slots.map((slot) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "slot";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(slot.id === chosen));
      button.innerHTML = `${svg("i-check", "line check")}<span class="slot-label" data-copy="slot-${slot.id}"></span>`;
      button.onclick = () => { chosen = slot.id; render(); };
      return button;
    }));
    const table = copy();
    window.MARLOW_COPY = table;
    for (const node of document.querySelectorAll("[data-copy]")) node.textContent = table[node.dataset.copy][AFTER ? 1 : 0];
  }

  function change(item, by) {
    // The draft could not remove an item at quantity 1 without the hover-only ×.
    const next = item.qty + by;
    if (next <= 0 && !AFTER && by === -1) return;
    if (next <= 0) items.splice(items.indexOf(item), 1);
    else item.qty = next;
    render();
  }

  render();
})();
