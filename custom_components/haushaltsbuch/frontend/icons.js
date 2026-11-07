/* Haushaltsbuch panel – Material Design Icon search with German search words.
 * Split out of haushaltsbuch-panel.js; plain ES module without build step.
 */
const ICON_LIST_URL = (() => {
  const url = new URL("mdi-icons.json", import.meta.url);
  url.search = new URL(import.meta.url).search;
  return url.href;
})();
let iconListPromise = null;

/** Load the list of Material Design Icons ([name, ...aliases]) once. */
function loadIconList() {
  if (!iconListPromise) {
    iconListPromise = fetch(ICON_LIST_URL)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
  }
  return iconListPromise;
}

// German search words → English icon name parts, so "auto" also finds the car.
const GERMAN_ICON_WORDS = {
  abo: ["autorenew", "repeat"], arzt: ["doctor", "stethoscope"], auto: ["car"], bahn: ["train"],
  bank: ["bank"], baby: ["baby"], benzin: ["gas-station"], bonus: ["gift", "star"], buch: ["book"],
  diesel: ["gas-station"], einkauf: ["cart", "shopping"], essen: ["food", "silverware"],
  fahrrad: ["bicycle"], fernsehen: ["television"], film: ["movie"], fitness: ["dumbbell"],
  flug: ["airplane"], friseur: ["content-cut", "hair-dryer"], garten: ["flower", "shovel"],
  gas: ["fire", "gas-burner"], gehalt: ["cash", "briefcase"], geld: ["cash", "currency-eur", "wallet"],
  geschenk: ["gift"], gesundheit: ["medical", "heart-pulse"], handy: ["cellphone"], haus: ["home"],
  heizung: ["radiator", "fire"], hund: ["dog"], internet: ["web", "wifi", "router"], katze: ["cat"],
  kind: ["baby", "human-child"], kleidung: ["tshirt-crew", "hanger"], kredit: ["credit-card", "bank"],
  kfz: ["car"], lebensmittel: ["cart", "food-apple"], miete: ["home-city", "key"], müll: ["trash-can"],
  musik: ["music", "spotify"], pv: ["solar-power", "solar-panel"], rad: ["bicycle", "tire"],
  reifen: ["tire"], reise: ["airplane", "bag-suitcase"], rente: ["piggy-bank"], schule: ["school"],
  solar: ["solar-power", "solar-panel"], sparen: ["piggy-bank"], spende: ["hand-heart"],
  spiel: ["gamepad", "controller"], sport: ["dumbbell", "soccer"], steuer: ["file-document", "bank"],
  strom: ["flash", "lightning-bolt", "power-plug"], tanken: ["gas-station", "fuel"],
  telefon: ["phone"], tier: ["paw"], urlaub: ["beach", "airplane"], versicherung: ["shield", "umbrella"],
  wasser: ["water"], werkzeug: ["tools", "wrench"], wohnung: ["home", "key"], zeitung: ["newspaper"],
  zug: ["train"],
};

/** Best matching icon names for a search text, most relevant first. */
function searchIcons(list, query, limit = 40) {
  const q = query.trim().toLowerCase().replace(/^mdi:/, "").replace(/\s+/g, "-");
  if (!q) return [];
  const terms = [[q, 0]];
  if (q.length >= 3) {
    for (const [word, english] of Object.entries(GERMAN_ICON_WORDS)) {
      if (word.startsWith(q)) english.forEach((e, i) => terms.push([e, 5 - i]));
    }
  }
  const best = new Map();
  for (const [name, ...aliases] of list) {
    let top = 0;
    for (const [term, bonus] of terms) {
      let score = 0;
      if (name === term) score = 100;
      else if (name.startsWith(`${term}-`)) score = 85 - name.length / 100;
      else if (name.startsWith(term)) score = 80 - name.length / 100;
      else if (name.includes(term)) score = 60 - name.length / 100;
      else if (aliases.some((a) => a.startsWith(term))) score = 40 - name.length / 100;
      else if (aliases.some((a) => a.includes(term))) score = 20 - name.length / 100;
      if (score) top = Math.max(top, score + bonus);
    }
    if (top) best.set(name, top);
  }
  return [...best.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name]) => `mdi:${name}`);
}

export { ICON_LIST_URL, iconListPromise, loadIconList, GERMAN_ICON_WORDS, searchIcons };
