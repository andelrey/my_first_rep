// Бот-тестер: гоняет игру в headless Chromium по заданной стратегии и печатает итог
// каждой гонки. Нужен, чтобы после правок баланса проверить распределение исходов.
//
// Запуск (dev-сервер должен работать: npm run dev):
//   node tools/playtest.mjs <стратегия> [гонок=3] [url=http://localhost:5173]
// Стратегии: gas (всё время газ), tail (газ в полосе впереди идущего, сброс только перед поворотом), none (ничего не жать), skill (держит полоску у бампера лидера:
// газ, вбок из потока, мягкий дрифт вплотную, сброс перед поворотом).
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
    for (const k of ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'Shift']) await kb.up(k);
    await pg.evaluate(() => window.__g.scene.getScene('ResultScene').scene.start('GameScene'));
  }
  await pg.waitForTimeout(300);
  let n = 0, lead = 0, drafted = 0, skids = 0, bumps = 0, hold = false, res = null; const gapsL = [], gaps3 = [];
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
        gl: o[0] === s.player ? 0 : (o[0].dist - s.player.dist) / 40,
        g3: o[2] && o[2] !== s.player ? (s.player.dist - o[2].dist) / 40 : 0,
        v: s.player.speed,
        brakeNow: s._brakeNow(s.player),
        inCorner: s._zoneAt(s.player.t) === 'red',
        bump: s.player.bumpT > 0.35,
        skid: !!s.player.skidding,
        draft: !!s.player.drafting,
        ah: a ? { gap: a.dist - s.player.dist, dl: a.lane - s.player.lane } : null,
      };
    });
    if (st.res) { res = st; break; }
    n++; if (st.rank === 1) lead++; if (st.draft) drafted++; if (st.skid) skids++; if (st.bump) bumps++;
    if (st.rank === 2) { gapsL.push(st.gl); gaps3.push(st.g3); }

    if (strat === 'gas') await kb.down('ArrowUp');
    if (strat === 'tail') {
      // «Тупо газ за лидером»: в полосе впереди идущего, газ зажат (кроме точки торможения)
      if (st.brakeNow) hold = true;
      if (st.inCorner) hold = false;
      await steer(st.ah ? st.ah.dl : 0);
      if (hold) await kb.up('ArrowUp'); else await kb.down('ArrowUp');
    }
    if (strat === 'skill') {
      // Держит полоску у бампера лидера: газ зажат; ближе 1 корп. — вбок из потока,
      // вплотную — мягкий дрифт; снизу — в хвост и обгон вбок; перед поворотом — сброс до лимита
      let dl = 0, gas = true, drift = false;
      if (st.rank === 1) { gas = false; drift = true; dl = 60; }
      else if (st.rank >= 3) dl = st.ah.gap < 45 ? (st.ah.dl > 0 ? st.ah.dl - 46 : st.ah.dl + 46) : st.ah.dl;
      else {
        dl = st.ah.gap > 40 ? st.ah.dl : (st.ah.dl > 0 ? st.ah.dl - 40 : st.ah.dl + 40);
        if (st.ah.gap < 22) drift = true;
      }
      // Контур мигает (точка торможения) — отпустить газ и не жать до самого поворота
      if (st.brakeNow) hold = true;
      if (st.inCorner) hold = false;
      if (hold) gas = false;
      await steer(dl);
      if (gas) await kb.down('ArrowUp'); else await kb.up('ArrowUp');
      if (drift) await kb.down('Shift'); else await kb.up('Shift');
    }
    await pg.waitForTimeout(50);
  }
  const pct = (x) => Math.round((100 * x) / Math.max(n, 1));
  const q = (a, f) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(f * (b.length - 1))].toFixed(1) : '-'; };
  console.log(`${strat} #${r + 1}: ${res ? `${res.time}s  ${res.res}` : 'НЕТ РЕЗУЛЬТАТА (таймаут)'}  | первым ${pct(lead)}% | в потоке ${pct(drafted)}% | в заносе ${pct(skids)}% | толчков ${bumps} | вторым: до лидера ${q(gapsL, .5)} корп., до 3-го ${q(gaps3, .5)} корп. (медианы)`);
}
if (errors.length) console.log('Ошибки на странице:', errors);
await browser.close();
