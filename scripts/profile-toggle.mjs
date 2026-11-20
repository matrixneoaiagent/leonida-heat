import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/tmp/opencode/identity_poc/node_modules/playwright-core');
const browser = await chromium.launch({ executablePath: '/home/kozak/.local/bin/chromium', args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.leonidaHeat);
await page.evaluate(() => { const g=window.leonidaHeat; g.newGame(2026); g.timeOfDay=0.845; g.todBase=0.845; g.sessionTime=0; g.setWeather('rain',0.78); g.weather.wetness=0.9; g.teleport(1850,1376,Math.PI); g.debugEnterCar('marlin',1850,1376,Math.PI,260); g.camera.zoom=1.56; });
async function sample(label){
  const fps = await page.evaluate(async () => { const t0=performance.now(); let n=0; await new Promise(res=>{ const f=()=>{n++; if(performance.now()-t0>3200)res(); else requestAnimationFrame(f);}; requestAnimationFrame(f);}); return n/((performance.now()-t0)/1000); });
  console.log(label, fps.toFixed(1));
}
await sample('baseline');
await page.evaluate(() => { const r=window.leonidaHeat.renderer; r.__amb=r.paintAmbientWash; r.paintAmbientWash=()=>{}; });
await sample('no ambient');
await page.evaluate(() => { const r=window.leonidaHeat.renderer; r.paintAmbientWash=function(g){ const l=this.light,v=this.view,ctx=this.ctx; if(l.dark>0.02){ ctx.save(); ctx.globalCompositeOperation='source-over'; ctx.fillStyle=`rgba(16,22,38,${l.dark*0.38})`; ctx.fillRect(v.x-4,v.y-4,v.w+8,v.h+8); ctx.restore(); } }; });
await sample('source-over ambient');
await page.evaluate(() => { const r=window.leonidaHeat.renderer; r.paintAmbientWash=r.__amb; r.__shadow=r.paintBuildingShadows; r.paintBuildingShadows=()=>{}; });
await sample('no shadows');
await page.evaluate(() => { const r=window.leonidaHeat.renderer; r.paintBuildingShadows=r.__shadow; r.__grade=r.paintGrade; r.paintGrade=()=>{}; });
await sample('no grade');
await page.evaluate(() => { const r=window.leonidaHeat.renderer; r.paintGrade=r.__grade; r.__obj=r.paintObjectives; r.paintObjectives=()=>{}; });
await sample('no objectives');
await browser.close();
