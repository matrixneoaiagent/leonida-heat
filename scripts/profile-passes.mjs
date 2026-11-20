import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/tmp/opencode/identity_poc/node_modules/playwright-core');
const browser = await chromium.launch({ executablePath: '/home/kozak/.local/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.leonidaHeat);
await page.evaluate(() => { const g = window.leonidaHeat; g.newGame(2026); g.teleport(2520, 1400, -Math.PI/2); g.ui.toasts=[]; g.police.setWanted(2); });
const names = ['paintTerrain','paintOcean','paintBuildingShadows','paintStreetWear','paintAmbientWash','paintMirrors','paintLightPools','paintSirenHalos','paintHeadlightWashes','paintSearchSweep','paintBuildingHalos','paintNeonSigns','paintCityLife','paintTrafficSignals','paintPalms','paintContactShadows','paintActors','paintProjectiles','paintParticles','paintMuzzleLight','paintObjectives','paintWorldRain','paintReticle','paintGrade'];
async function sample() {
  return page.evaluate(async () => {
    const g = window.leonidaHeat;
    const t0 = performance.now();
    let frames = 0;
    await new Promise((res) => {
      const tick = () => { frames += 1; if (performance.now() - t0 > 2400) res(); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    return frames / ((performance.now() - t0) / 1000);
  });
}
const base = await sample();
console.log('baseline', base.toFixed(1));
for (const name of names) {
  await page.evaluate((n) => { const r = window.leonidaHeat.renderer; r.__orig = r.__orig || {}; r.__orig[n] = r[n]; r[n] = () => {}; }, name);
  const fps = await sample();
  console.log(name.padEnd(24), fps.toFixed(1), (fps - base >= 0 ? '+' : '') + (fps - base).toFixed(1));
  await page.evaluate((n) => { const r = window.leonidaHeat.renderer; r[n] = r.__orig[n]; }, name);
}
await browser.close();
