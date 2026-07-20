# Empik Watch — nowe zapowiedzi (książki)

Monitoruje listing https://www.empik.com/zapowiedzi (kategoria 31, przedsprzedaż)
i pokazuje co **nowego** się pojawiło. Bez bazy danych — stan trzymany w `state.json`
w repo, raport publikowany przez GitHub Pages.

## Setup (5 minut)

1. Utwórz **prywatne** repo na GitHubie (np. `empik-watch`) i wrzuć te pliki:
   ```bash
   cd empik-watch
   git init && git add -A && git commit -m "init"
   git remote add origin git@github.com:TWOJLOGIN/empik-watch.git
   git push -u origin main
   ```

2. **GitHub Pages**: Settings → Pages → Source: *Deploy from a branch* →
   Branch: `main`, folder: `/docs` → Save.
   Raport będzie pod: `https://TWOJLOGIN.github.io/empik-watch/`
   (uwaga: przy prywatnym repo Pages wymaga planu Pro — jak masz Free,
   zrób repo publiczne albo czytaj raport bezpośrednio z pliku `docs/index.html` w repo).

3. **Pierwszy run**: zakładka Actions → "Empik zapowiedzi watch" → *Run workflow*.
   Pierwszy przebieg zapisuje stan początkowy (wszystko jest "nowe", bez powiadomień).
   Każdy kolejny pokazuje tylko realne nowości.

4. **(Opcjonalnie) Telegram**: Settings → Secrets and variables → Actions →
   dodaj `TG_BOT_TOKEN` (od @BotFather) i `TG_CHAT_ID` (od @userinfobot).
   Dostaniesz wiadomość przy każdej nowej zapowiedzi.

## Konfiguracja

W `scraper.js` na górze:
- `LISTING_URL` — możesz podmienić na inną kategorię/filtr Empiku
- `MAX_PAGES` — ile stron listingu sprawdzać (domyślnie 5 × 50 = 250 pozycji;
  przy sortowaniu `scoreDesc` nowości zwykle są wysoko, ale jak chcesz pełne
  pokrycie, zmień sort w URL na `releaseDateDesc` jeśli Empik taki oferuje,
  albo zwiększ MAX_PAGES)

## Jeśli Empik blokuje (HTTP 403 w logach Actions)

Plan B — podmień krok "Run scraper" na Playwright:

```yaml
      - run: npm install playwright && npx playwright install --with-deps chromium
      - run: node scraper-playwright.js
```

i daj znać — dopiszę wariant `scraper-playwright.js` (ten sam diff/raport,
tylko pobieranie przez prawdziwą przeglądarkę). Jakby i to nie przeszło,
ostatnia deska to VPS z rezydencjalnym proxy.

## Jak to działa

- `state.json` — mapa `id produktu → {tytuł, url, firstSeen}` + log runów
- diff: produkt na listingu, którego nie ma w stanie = nowość
- `docs/index.html` — raport pogrupowany po dniach (ostatnie 30 dni),
  pozycje które zniknęły z listingu (premiera/wycofanie) są przekreślone
