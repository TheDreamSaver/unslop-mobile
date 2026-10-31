// Renders the original CrossPaths People screen from the fictional fixture, as the Expo app did
// before the redesign: the same people, order, counts, flags and wording. The words the redesign
// changes are kept in a copy table, with the original first; story/prepare.js swaps them.

(() => {
  const { records } = window.CROSSPATHS_PEOPLE;
  const scenes = window.CROSSPATHS_LANDMARKS;

  // The original app sorted by meeting month, most recent first (src/utils/localStore.ts).
  const months = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  const parse = (value) => {
    const [m, y] = (value || "").split(" ");
    return (parseInt(y, 10) || 0) * 100 + (months[m] || 0);
  };
  const people = [...records].sort((a, b) => parse(b.met_date) - parse(a.met_date));

  const metCountries = new Set(records.map((c) => c.met_location?.country).filter(Boolean));
  const homebases = new Set(records.map((c) => c.homebase?.country).filter(Boolean));

  // [original, redesigned] for every string the redesign rewords.
  window.CROSSPATHS_COPY = {
    search: ["Search name, city, country, or handle...", "A person, a place, a memory…"],
    "tab-people": ["All People", "People"],
    "tab-places": ["Where We Met", "Places"],
    "nav-journey": ["Timeline", "Journey"],
    "nav-you": ["Profile", "You"],
    count: [null, `${records.length} people · ${metCountries.size} countries you met in`],
    home: ["Home", "Homebase"],
    now: ["Now in", "Last known"],
  };
  for (const node of document.querySelectorAll("[data-copy]")) node.textContent = window.CROSSPATHS_COPY[node.dataset.copy][0];
  document.getElementById("count-people").textContent = String(records.length);
  document.getElementById("count-homebases").textContent = String(homebases.size);
  // The visa pill counted people in countries the stored visa choices open. The reference capture
  // showed 2 for this fixture; the visa rules themselves are not part of this screen's redesign.
  document.getElementById("count-visitable").textContent = "2";

  const codes = { Colombia: "CO", France: "FR", Guatemala: "GT", India: "IN", Japan: "JP", Mexico: "MX", Portugal: "PT", "South Korea": "KR", Spain: "ES", Thailand: "TH", "United Kingdom": "GB" };
  const flag = (country) => (codes[country] ? [...codes[country]].map((ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65)).join("") : "");
  const label = (place) => [place?.city, place?.country].filter(Boolean).join(", ");
  const esc = (text) => String(text).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  // The redesigned avatar tones (src/utils/theme.ts AVATAR_COLORS, picked by ContactCard.tsx).
  const tones = ["#F1DCE3", "#E4DDF0", "#DEE9D9", "#F4E5CA", "#DAE7EF"];
  const tone = (name) => tones[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % tones.length];

  // Landmark.tsx, with the Passage theme's colours.
  const art = {
    "art-land": 'fill="#284D6B" opacity=".13"',
    "art-light": 'fill="#FFFEFA"',
    "art-surface": 'fill="#FFFEFA"',
    "art-line": 'fill="none" stroke="#65531E" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"',
    "art-accent": 'fill="#F4CE52" stroke="#65531E" stroke-width="1.2"',
    "art-dark": 'fill="#65531E"',
  };
  const landmark = (place, n) => {
    const scene = scenes[place];
    if (!scene) return "";
    const body = scene.art.replace(/class="([^"]+)"/g, (_, key) => art[key] || "");
    return `<svg class="art" viewBox="0 0 140 100" aria-hidden="true"><defs><linearGradient id="fade-${n}"><stop offset="0" stop-color="white" stop-opacity="0"/><stop offset="1" stop-color="white"/></linearGradient><mask id="mask-${n}"><rect width="140" height="100" fill="url(#fade-${n})"/></mask></defs><g mask="url(#mask-${n})"><circle cx="112" cy="24" r="14" fill="#F4CE52"/>${body}</g></svg>`;
  };

  // Ionicons glyphs: the original icon, then the redesigned one.
  const icons = { met: ["&#xf3c6;", "&#xf3c5;"], home: ["&#xf382;", "&#xf383;"], now: ["&#xf46c;", "&#xf3c5;"] };
  const place = (kind, value) => `
    <span class="loc-ico" data-loc="${kind}"><i class="ico a">${icons[kind][0]}</i><i class="ico b">${icons[kind][1]}</i></span>
    <span class="loc-label" data-loc="${kind}" ${kind === "met" ? "" : `data-copy-key="${kind}"`}>${kind === "met" ? "Met in" : window.CROSSPATHS_COPY[kind][0]}</span>
    <span class="loc-value" data-loc="${kind}"><span class="lv">${esc(`${flag(value?.country)} ${label(value)}`)}</span></span>`;

  // Only the people who are ever on screen: the fourth card starts below the tab bar.
  document.getElementById("cards").innerHTML = people.slice(0, 3).map((c, n) => {
    const [month, year] = c.met_date.split(" ");
    return `
    <article class="card" data-person="${c.id}" style="--tint: ${c.color}25; --ink: ${c.color}; --tone: ${tone(c.name)}">
      <span class="art-clip">${landmark(label(c.met_location), n)}</span>
      <span class="avatar"><span class="ini" data-after="${initials(c.name)}">${esc(c.name[0].toUpperCase())}</span></span>
      <span class="name">${esc(c.name)}</span>
      ${c.instagram ? `<span class="handle">${esc(c.instagram)}</span>` : ""}
      <span class="date"><span class="m">${month}</span><span class="y"><span class="yx">${year}</span></span></span>
      ${place("met", c.met_location)}
      ${place("home", c.homebase)}
      ${place("now", c.current_location)}
      <span class="note">${esc(c.notes)}</span>
      <i class="rule"></i>
    </article>`;
  }).join("");

  // What React Native's layout would size from the text, in the original type and in the redesigned
  // type: how many lines a memory takes, and the date's width on one line or as a centred stamp.
  // Measured again once the fonts are in.
  window.measureNotes = () => {
    const probe = document.createElement("span");
    probe.className = "probe";
    document.body.appendChild(probe);
    const size = (style, text) => {
      probe.style.cssText = style;
      probe.textContent = text;
      return probe.getBoundingClientRect();
    };
    const px = (value) => value.toFixed(3) + "px";
    for (const card of document.querySelectorAll(".card")) {
      const note = card.querySelector(".note").textContent;
      card.style.setProperty("--nb", px(size("width:324px;font:italic 13px/19px DMSans_400Regular", note).height));
      card.style.setProperty("--na", px(size("width:314px;font:14px/21px HankenGrotesk_400", note).height));
      const month = card.querySelector(".date .m").textContent;
      const year = card.querySelector(".date .y").textContent;
      const line = "white-space:pre;font:13px DMSans_400Regular";
      card.style.setProperty("--date-w", px(size(line, `${month} ${year}`).width));
      card.style.setProperty("--year-x", px(size(line, `${month} `).width));
      const m = size("white-space:pre;font:12px HankenGrotesk_700", month).width;
      const y = size("white-space:pre;font:11px HankenGrotesk_400", year).width;
      const inner = Math.max(m, y);
      card.style.setProperty("--stamp-w", px(inner + 18));
      card.style.setProperty("--stamp-month-x", px(9 + (inner - m) / 2));
      card.style.setProperty("--stamp-year-x", px(9 + (inner - y) / 2));
    }
    probe.remove();
  };
  window.measureNotes();
  Promise.all(["13px DMSans_400Regular", "14px HankenGrotesk_400", "12px HankenGrotesk_700"].map((font) => document.fonts.load(font))).then(window.measureNotes);
})();
