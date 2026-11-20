import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/tmp/opencode/identity_poc/node_modules/playwright-core');
const browser = await chromium.launch({ executablePath: '/home/kozak/.local/bin/chromium', args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: '+e.message));
page.on('console', m => { if (m.type()==='error') errors.push('console: '+m.text()); });
for (const shot of ['menu','city','chase','mission']) {
  await page.goto('http://127.0.0.1:8080/?shot='+shot, { waitUntil: 'load' });
  try { await page.waitForFunction(() => window.__game && window.__game.shotReady, { timeout: 30000 }); }
  catch (e) { errors.push(shot+': no shotReady'); }
  console.log(shot, await page.evaluate(() => window.__game?.state));
}
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.leonidaHeat);
const result = await page.evaluate(async () => {
  const g = window.leonidaHeat;
  g.newGame(2026);
  const out = { state: g.state };
  g.phone.openPhone();
  out.phoneState = g.state;
  g.phone.closePhone();
  out.job = g.jobs.start('taxi');
  out.jobStatus = g.jobs.status();
  g.jobs.abort('test');
  g.races.start('grand_sprint');
  out.race = g.races.status();
  g.races.countdown = 0.1;
  for (let i=0;i<20;i++) g.update(1/60);
  out.racePhase = g.races.phase;
  out.raceState = g.races.status();
  g.races.abort('test');
  g.phone.openPhone(); g.phone.tab=1; g.phone.invoke('job:paramedic', g);
  out.paramedic = g.jobs.status();
  g.phone.openPhone(); g.phone.tab=1; g.phone.invoke('race:ocean_loop', g);
  out.oceanRace = g.races.status();
  g.autosave();
  const before = g.snapshot();
  out.load = g.loadSave();
  out.after = g.snapshot();
  out.before = before;
  return out;
});
console.log(JSON.stringify(result, null, 2));
if (errors.length) console.log('ERRORS\n'+errors.join('\n'));
await browser.close();
