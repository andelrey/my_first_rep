// Бот-тестер: гоняет игру в headless Chromium по заданной стратегии и печатает итог
// каждой гонки. Нужен, чтобы после правок баланса проверить распределение исходов.
//
// Запуск (dev-сервер должен работать: npm run dev):
//   node tools/playtest.mjs <стратегия> [гонок=3] [url=http://localhost:5173]
// Стратегии: gas (всё время газ), none (ничего не жать), skill (в хвост + вовремя отпускать).
// Нужен playwright: локально `npm i -D playwright && npx playwright install chromium`,
// либо путь к установленному пакету в PLAYWRIGHT_PATH (…/node_modules/playwright).

const strat = process.argv[2] || 'skill';
const runs = +process.argv[3] || 3;
const url = process.argv[4] || 'http://localhost:5173';

const { chromium } = process.env.PLAYWRIGHT_PATH
  ? await import(`${process.env.PLAYWRIGHT_PATH}/index.mjs`)
  : await import('playwright');

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const pg = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
pg.on('pageerror', (e) => errors.push(e.message));
await pg.goto(url);
await pg.waitForTimeout(800);
// Берём ТОТ ЖЕ экземпляр игры, что загрузила страница (import с другим URL создал бы вторую копию)
await pg.evaluate(async () => {
  const u = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/main.js'));
  window.__g = (await import(u)).default;
});
await pg.mouse.click(640, 300); // фокус клавиатуры на странице
const kb = pg.keyboard;

async function steer(dl) {
  if (dl < -6) { await kb.up('ArrowRight'); await kb.down('ArrowLeft'); }
  else if (dl > 6) { await kb.up('ArrowLeft'); await kb.down('ArrowRight'); }
  else { await kb.up('ArrowLeft'); await kb.up('ArrowRight'); }
}

for (let r = 0; r < runs; r++) {
  if (r > 0) {
    for (const k of ['ArrowUp', 'ArrowLeft', 'ArrowRight']) await kb.up(k);
    await pg.evaluate(() => window.__g.scene.getScene('ResultScene').scene.start('GameScene'));
  }
  await pg.waitForTimeout(300);
  let n = 0, lead = 0, drafted = 0, res = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const st = await pg.evaluate(() => {
      const g = window.__g, s = g.scene.getScene('GameScene'), rs = g.scene.getScene('ResultScene');
      if (rs.scene.isActive()) {
        return { res: rs.children.list.filter((c) => c.text).map((c) => c.text).slice(0, 3).join(' | '), time: s.raceTime.toFixed(1) };
      }
      const o = s._ranking(), i = o.indexOf(s.player), a = o[i - 1];
      return {
        rank: i + 1,
        draft: !!s.player.drafting,
        ah: a ? { gap: a.dist - s.player.dist, dl: a.lane - s.player.lane } : null,
      };
    });
    if (st.res) { res = st; break; }
    n++; if (st.rank === 1) lead++; if (st.draft) drafted++;

    if (strat === 'gas') await kb.down('ArrowUp');
    if (strat === 'skill') {
      // Всегда в хвосте у впереди идущего; снизу — обгон вбок;
      // вторым — газ, только если лидер дальше 70 px; первым — газ отпущен
      let dl = 0, gas = true;
      if (st.rank === 1) { gas = false; dl = 60; }
      else if (st.rank >= 3) dl = st.ah.gap < 45 ? (st.ah.dl > 0 ? st.ah.dl - 46 : st.ah.dl + 46) : st.ah.dl;
      else { dl = st.ah.dl; gas = st.ah.gap > 70; }
      await steer(dl);
      if (gas) await kb.down('ArrowUp'); else await kb.up('ArrowUp');
    }
    await pg.waitForTimeout(50);
  }
  const pct = (x) => Math.round((100 * x) / Math.max(n, 1));
  console.log(`${strat} #${r + 1}: ${res ? `${res.time}s  ${res.res}` : 'НЕТ РЕЗУЛЬТАТА (таймаут)'}  | первым ${pct(lead)}% | в потоке ${pct(drafted)}%`);
}
if (errors.length) console.log('Ошибки на странице:', errors);
await browser.close();
