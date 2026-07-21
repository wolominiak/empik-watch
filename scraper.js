// Empik Zapowiedzi Watcher
// Pobiera listing zapowiedzi (kategoria 31 = książki, przedsprzedaż),
// porównuje z poprzednim stanem i generuje raport HTML (GitHub Pages).

import * as cheerio from "cheerio";
import fs from "fs";

const LISTING_URL =
  "https://www.empik.com/zapowiedzi?searchCategory=31&hideUnavailable=true&sort=scoreDesc&availabilitySeparable=przedsprzedaz&qtype=facetForm";

const STATE_FILE = "state.json";
const REPORT_FILE = "docs/index.html";
const MAX_PAGES = 5; // ile stron listingu przeglądać (50 wyników/strona)
const RESULTS_PER_PAGE = 50;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Referer": "https://www.empik.com/",
  "Cache-Control": "no-cache",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(startPos) {
  const url = `${LISTING_URL}&resultsPP=${RESULTS_PER_PAGE}&start=${startPos}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} dla start=${startPos}`);
  }
  return await res.text();
}

function parseProducts(html) {
  const $ = cheerio.load(html);
  const products = new Map();

  // Produkty na listingu Empiku mają linki w formacie:
  // /tytul-autor,pXXXXXXXXX,ksiazka-p  (ID = pXXXXXXXXX)
  $("a[href*=',p']").each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/,(p\d{6,}),/);
    if (!m) return;
    const id = m[1];

    // Tytuł: atrybut title linku albo tekst wewnątrz
    let title =
      $(el).attr("title") ||
      $(el).find("[class*='title'], strong, span").first().text().trim() ||
      $(el).text().trim();
    title = title.replace(/\s+/g, " ").trim();

    const existing = products.get(id);
    if (!existing || (title && title.length > existing.title.length)) {
      products.set(id, {
        id,
        title: title.slice(0, 200),
        url: `https://www.empik.com${href.split("?")[0]}`,
      });
    }
  });

  return products;
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return { seen: {}, log: [] };
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderReport(state, currentIds, lastRun) {
  // Nowości z ostatnich 30 dni, najnowsze na górze
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  const entries = Object.values(state.seen)
    .filter((p) => new Date(p.firstSeen).getTime() > cutoff)
    .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));

  // Grupowanie po dniu
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
          (p) => `<li class="${currentIds.has(p.id) ? "" : "gone"}">
            <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.title || p.id)}</a>
            ${currentIds.has(p.id) ? "" : '<span class="badge">zniknęło z listingu</span>'}
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
<title>Empik — nowe zapowiedzi (książki)</title>
<style>
  :root { --bg:#0f1115; --card:#171a21; --text:#e8e8ea; --muted:#8b8f98; --accent:#e6a23c; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, -apple-system, sans-serif; background:var(--bg); color:var(--text); line-height:1.5; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 20px 80px; }
  h1 { font-size: 1.5rem; margin: 0 0 4px; }
  .sub { color: var(--muted); font-size: .875rem; margin-bottom: 32px; }
  section { background: var(--card); border-radius: 12px; padding: 16px 20px; margin-bottom: 16px; }
  h2 { font-size: 1rem; margin: 0 0 10px; color: var(--accent); }
  .count { color: var(--muted); font-weight: normal; font-size: .8rem; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { padding: 7px 0; border-bottom: 1px solid #23262e; }
  li:last-child { border-bottom: none; }
  a { color: var(--text); text-decoration: none; }
  a:hover { color: var(--accent); }
  .gone a { color: var(--muted); text-decoration: line-through; }
  .badge { font-size: .7rem; color: var(--muted); margin-left: 6px; }
  .empty { color: var(--muted); }
</style>
</head>
<body>
<main>
  <h1>Empik — nowe zapowiedzi 📚</h1>
  <p class="sub">Kategoria: książki / przedsprzedaż · Ostatnie sprawdzenie: ${lastRun} · Śledzonych łącznie: ${Object.keys(state.seen).length}</p>
  ${sections || '<p class="empty">Brak nowości w ostatnich 30 dniach (albo pierwszy run — wszystko poniżej to stan początkowy).</p>'}
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
  for (let page = 0; page < MAX_PAGES; page++) {
    const start = page * RESULTS_PER_PAGE + 1;
    try {
      const html = await fetchPage(start);
      const products = parseProducts(html);
      console.log(`Strona start=${start}: ${products.size} produktów`);
      if (products.size === 0) break; // koniec wyników albo zmiana struktury
      for (const [id, p] of products) all.set(id, p);
      await sleep(2500 + Math.random() * 2000); // grzeczna pauza
    } catch (e) {
      console.error(`Błąd strony start=${start}: ${e.message}`);
      if (page === 0) throw e; // pierwsza strona padła = cały run nieudany
      break;
    }
  }

  if (all.size === 0) {
    throw new Error("Nie sparsowano żadnych produktów — możliwa blokada albo zmiana HTML.");
  }

  // Diff
  const newOnes = [];
  for (const [id, p] of all) {
    if (!state.seen[id]) {
      state.seen[id] = { ...p, firstSeen: now };
      newOnes.push(p);
    }
  }

  state.lastRun = now;
  state.log.push({ at: now, total: all.size, new: newOnes.length });
  state.log = state.log.slice(-200);

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  renderReport(state, new Set(all.keys()), now.slice(0, 16).replace("T", " ") + " UTC");

  console.log(`\nŁącznie na listingu: ${all.size}`);
  console.log(`Nowych: ${newOnes.length}${isFirstRun ? " (pierwszy run — stan początkowy)" : ""}`);
  for (const p of newOnes.slice(0, 30)) console.log(`  + ${p.title}`);

  // Opcjonalne powiadomienie Telegram (sekrety: TG_BOT_TOKEN, TG_CHAT_ID)
  if (!isFirstRun && newOnes.length > 0 && process.env.TG_BOT_TOKEN && process.env.TG_CHAT_ID) {
    const lines = newOnes.map((p) => `• <a href="${p.url}">${escapeHtml(p.title)}</a>`);
    const header = `📚 <b>Empik: ${newOnes.length} nowych zapowiedzi</b>`;
    await sendTelegramChunks(header, lines);
  }
}

async function sendTelegramChunks(header, lines) {
  const LIMIT = 3800; // margines pod limitem 4096 znaków Telegrama
  const chunks = [];
  let current = [];
  let len = 0;
  for (const line of lines) {
    if (len + line.length + 1 > LIMIT && current.length > 0) {
      chunks.push(current);
      current = [];
      len = 0;
    }
    current.push(line);
    len += line.length + 1;
  }
  if (current.length > 0) chunks.push(current);

  for (let i = 0; i < chunks.length; i++) {
    const part = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : "";
    const text = `${header}${part}\n\n${chunks[i].join("\n")}`;
    const res = await fetch(
      `https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TG_CHAT_ID,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      }
    );
    if (!res.ok) console.error(`Telegram: HTTP ${res.status}`);
    await sleep(1100); // limit Telegrama: ~1 wiadomość/sek.
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
