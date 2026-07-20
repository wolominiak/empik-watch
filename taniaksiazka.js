// TaniaKsiazka Zapowiedzi Watcher
// Monitoruje strony zapowiedzi w wybranych kategoriach, diffuje ze stanem
// i generuje raport HTML (docs/taniaksiazka.html).

import * as cheerio from "cheerio";
import fs from "fs";

const BASE = "https://www.taniaksiazka.pl/zapowiedzi/";

const CATEGORIES = [
  ["Kryminał, sensacja, thriller", "kryminal-sensacja-thriller-ksiazki-14285"],
  ["Literatura obyczajowa", "literatura-obyczajowa-14315"],
  ["Literatura piękna", "beletrystyka-i-literatura-piekna-ksiazki-14436"],
  ["Fantastyka", "ksiazki-fantastyczne-fantastyka-14263"],
  ["Young adult", "ksiazki-dla-mlodziezy-young-adult-14243"],
  ["Poezja i dramat", "poezja-i-dramat-ksiazki-14359"],
  ["Literatura faktu, reportaż", "literatura-faktu-reportaz-14306"],
  ["Biografie", "ksiazki-biograficzne-14195"],
  ["Historia", "ksiazki-historyczne-14267"],
  ["Popularnonaukowe", "ksiazki-popularnonaukowe-14363"],
  ["Nauki humanistyczne", "nauki-humanistyczne-ksiazki-14334"],
  ["Nauki ścisłe, medycyna", "nauki-scisle-medycyna-ksiazki-14344"],
  ["Kultura i sztuka", "ksiazki-o-kulturze-i-sztuce-14298"],
  ["Religia", "ksiazki-o-religii-i-religioznawstwie-14393"],
  ["Prawo", "ksiazki-prawnicze-14379"],
  ["Podręczniki akademickie", "ksiazki-i-podreczniki-akademickie-1994"],
  ["Poradniki", "poradniki-ksiazki-poradnikowe-14366"],
  ["Rozwój osobisty", "ksiazki-i-poradniki-o-rozwoju-osobistym-14399"],
  ["Biznes", "ksiazki-biznesowe-14200"],
  ["Kuchnia i diety", "kuchnia-i-diety-ksiazki-14290"],
  ["Podróże i turystyka", "ksiazki-podroznicze-i-turystyczne-14354"],
  ["Sport", "ksiazki-sportowe-14403"],
  ["Ezoteryka i parapsychologia", "ksiazki-o-ezoteryce-i-parapsychologii-14251"],
];

const STATE_FILE = "state-tk.json";
const REPORT_FILE = "docs/taniaksiazka.html";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
  "Accept-Language": "pl-PL,pl;q=0.9",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // Strona serwuje ISO-8859-2, więc dekodujemy zgodnie z nagłówkiem
  const buf = await res.arrayBuffer();
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const charset = ct.includes("8859-2") ? "iso-8859-2" : "utf-8";
  return new TextDecoder(charset).decode(buf);
}

async function fetchCategory(slug) {
  // Preferujemy sortowanie po dacie dodania (najnowsze na górze);
  // jak wariant z sortowaniem nie działa, bierzemy domyślny listing.
  try {
    return await fetchHtml(`${BASE}${slug}/sortuj-datamalejaco`);
  } catch {
    return await fetchHtml(`${BASE}${slug}`);
  }
}

function parseProducts(html, categoryName) {
  const $ = cheerio.load(html);
  const products = new Map();

  // Linki produktowe: /tytul-slug-p-2495632.html
  $("a[href*='-p-']").each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/-p-(\d{5,})\.html/);
    if (!m) return;
    const id = "tk" + m[1];

    let title =
      $(el).attr("title") ||
      $(el).find("h3, [class*='title'], strong").first().text().trim() ||
      $(el).text().trim();
    title = title.replace(/\s+/g, " ").trim();
    if (/^(dodaj do koszyka|zapowiedź|bestseller|nowość)$/i.test(title)) title = "";

    const url = href.startsWith("http")
      ? href.split("?")[0]
      : `https://www.taniaksiazka.pl${href.split("?")[0]}`;

    const existing = products.get(id);
    if (!existing || (title && title.length > (existing.title || "").length)) {
      products.set(id, { id, title: title.slice(0, 200), url, category: categoryName });
    }
  });

  return products;
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { seen: {}, log: [] };
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderReport(state, lastRun) {
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  const entries = Object.values(state.seen)
    .filter((p) => new Date(p.firstSeen).getTime() > cutoff)
    .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));

  const byDay = {};
  for (const p of entries) {
    const day = p.firstSeen.slice(0, 10);
    (byDay[day] ??= []).push(p);
  }

  const days = Object.keys(byDay).sort().reverse();
  const sections = days
    .map((day) => {
      const items = byDay[day]
        .map(
          (p) => `<li>
            <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.title || p.id)}</a>
            <span class="cat">${escapeHtml(p.category || "")}</span>
          </li>`
        )
        .join("\n");
      return `<section>
        <h2>${day} <span class="count">${byDay[day].length}</span></h2>
        <ul>${items}</ul>
      </section>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>TaniaKsiazka — nowe zapowiedzi</title>
<style>
  :root { --bg:#0f1115; --card:#171a21; --text:#e8e8ea; --muted:#8b8f98; --accent:#5eb0ef; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, -apple-system, sans-serif; background:var(--bg); color:var(--text); line-height:1.5; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 20px 80px; }
  h1 { font-size: 1.5rem; margin: 0 0 4px; }
  .sub { color: var(--muted); font-size: .875rem; margin-bottom: 8px; }
  .nav { font-size: .875rem; margin-bottom: 24px; }
  .nav a { color: var(--accent); text-decoration: none; }
  section { background: var(--card); border-radius: 12px; padding: 16px 20px; margin-bottom: 16px; }
  h2 { font-size: 1rem; margin: 0 0 10px; color: var(--accent); }
  .count { color: var(--muted); font-weight: normal; font-size: .8rem; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { padding: 7px 0; border-bottom: 1px solid #23262e; }
  li:last-child { border-bottom: none; }
  a { color: var(--text); text-decoration: none; }
  li a:hover { color: var(--accent); }
  .cat { display: block; font-size: .72rem; color: var(--muted); margin-top: 1px; }
  .empty { color: var(--muted); }
</style>
</head>
<body>
<main>
  <h1>TaniaKsiazka — nowe zapowiedzi 📚</h1>
  <p class="sub">${CATEGORIES.length} kategorii · Ostatnie sprawdzenie: ${lastRun} · Śledzonych łącznie: ${Object.keys(state.seen).length}</p>
  <p class="nav"><a href="index.html">→ raport Empik</a></p>
  ${sections || '<p class="empty">Brak nowości w ostatnich 30 dniach (albo pierwszy run — stan początkowy).</p>'}
</main>
</body>
</html>`;

  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync(REPORT_FILE, html);
}

async function main() {
  const state = loadState();
  const isFirstRun = Object.keys(state.seen).length === 0;
  const now = new Date().toISOString();

  const all = new Map();
  let failed = 0;

  for (const [name, slug] of CATEGORIES) {
    try {
      const html = await fetchCategory(slug);
      const products = parseProducts(html, name);
      console.log(`${name}: ${products.size} produktów`);
      for (const [id, p] of products) {
        if (!all.has(id)) all.set(id, p);
      }
    } catch (e) {
      failed++;
      console.error(`${name}: BŁĄD — ${e.message}`);
    }
    await sleep(1500 + Math.random() * 1000);
  }

  if (all.size === 0) {
    throw new Error("Nie sparsowano żadnych produktów — możliwa zmiana struktury strony.");
  }
  if (failed > 0) console.warn(`\nUwaga: ${failed} kategorii nie udało się pobrać.`);

  const newOnes = [];
  for (const [id, p] of all) {
    if (!state.seen[id]) {
      state.seen[id] = { ...p, firstSeen: now };
      newOnes.push(p);
    }
  }

  state.lastRun = now;
  state.log.push({ at: now, total: all.size, new: newOnes.length, failed });
  state.log = state.log.slice(-200);

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  renderReport(state, now.slice(0, 16).replace("T", " ") + " UTC");

  console.log(`\nŁącznie na listingach: ${all.size}`);
  console.log(`Nowych: ${newOnes.length}${isFirstRun ? " (pierwszy run — stan początkowy)" : ""}`);
  for (const p of newOnes.slice(0, 30)) console.log(`  + [${p.category}] ${p.title}`);

  if (!isFirstRun && newOnes.length > 0 && process.env.TG_BOT_TOKEN && process.env.TG_CHAT_ID) {
    const lines = newOnes
      .slice(0, 20)
      .map((p) => `• <a href="${p.url}">${escapeHtml(p.title)}</a> <i>(${escapeHtml(p.category)})</i>`)
      .join("\n");
    const more = newOnes.length > 20 ? `\n…i ${newOnes.length - 20} więcej` : "";
    await fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TG_CHAT_ID,
        text: `📗 <b>TaniaKsiazka: ${newOnes.length} nowych zapowiedzi</b>\n\n${lines}${more}`,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
