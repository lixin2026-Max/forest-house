// 季节影响农场专项验收（Issue #69）
// 跑法：node test/season-farm-accept.js（已被 test/all.js 收编）
// 无头实测（每季一个全新浏览器档案，?season= 后门定季）：
//  ① 四季可种名单/生长点倍率/面板贴士/农田色调与规则表逐项对齐；
//  ② 生长结算：浇水→新的一天成熟（春夏秋）、冬季冻结不长不丢、
//     跨季（冬→春）续攒长完；春季 bonus 标记（桩 Math.random）与双倍收获；
//  ③ 老存档语义：无 g/bonus 的旧格子照常一天成熟、旧成熟格照常收获；
//  ④ FEAT 关：回老规矩（直接成熟/全名单/基线外观），再开恢复；
//  ⑤ 截图：春耕（1280×800）与冬雪田（850×400）各一张存 /tmp/farm-shots/。
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAGE = 'file://' + path.join(ROOT, 'index.html');
const SHOT_DIR = '/tmp/farm-shots';
const CHROME_CANDIDATES = [
    process.env.PERF_CHROME,
    '/opt/meta-chromium/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
].filter(Boolean);
const DRAGON_SAVE = JSON.stringify({
    name: '小龙',
    grow: { days: 6, last: '2026-10-22', stage: 1, seen: 1, events: [] },
    avatar: { form: 'dragon', style: 0, chosen: true },
    view: { fp: false, chosen: true }
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function check(name, ok, extra) {
    if (ok) { passed++; console.log(' ✓ ' + name); }
    else { failed++; console.log(' FAIL: ' + name + (extra ? '：' + extra : '')); }
}
const near = (a, b, tol) => Array.isArray(a) && a.length === b.length &&
    a.every((v, i) => Math.abs(v - b[i]) <= (tol || 0.02));

async function launch(winSize, seedScript) {
    const chromePath = CHROME_CANDIDATES.find(p => fs.existsSync(p));
    if (!chromePath) throw new Error('找不到可用的 Chromium');
    const PORT = 9600 + Math.floor(Math.random() * 300);
    const profile = '/tmp/farm-prof-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    const chrome = spawn(chromePath, [
        '--headless=new', '--no-sandbox', '--use-angle=swiftshader',
        '--remote-debugging-port=' + PORT, '--window-size=' + winSize,
        '--user-data-dir=' + profile, 'about:blank'
    ], { stdio: 'ignore' });
    let wsUrl = null;
    for (let i = 0; i < 40 && !wsUrl; i++) {
        try {
            const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
            const list = await r.json();
            const page = list.find(t => t.type === 'page');
            if (page) wsUrl = page.webSocketDebuggerUrl;
        } catch (e) {}
        if (!wsUrl) await sleep(500);
    }
    if (!wsUrl) { try { chrome.kill(); } catch (e) {} throw new Error('连不上无头浏览器调试口'); }
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map();
    ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async expr => {
        const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
        if (r.result && r.result.exceptionDetails) throw new Error('页面 JS 报错: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
        return r.result && r.result.result ? r.result.result.value : undefined;
    };
    await send('Page.enable'); await send('Runtime.enable');
    if (seedScript) await send('Page.addScriptToEvaluateOnNewDocument', { source: seedScript });
    const c = { chrome, send, ev };
    c.waitFor = async (expr, timeout, label) => {
        const t0 = Date.now();
        while (Date.now() - t0 < timeout) {
            try { if (await ev(expr)) return true; } catch (e) {}
            await sleep(700);
        }
        throw new Error('waitFor 超时: ' + label);
    };
    c.boot = async season => {
        await send('Page.navigate', { url: PAGE + '?season=' + season });
        await c.waitFor(`(document.getElementById('status')||{}).textContent && document.getElementById('status').textContent.indexOf('运行中') >= 0`, 120000, 'boot ' + season);
        await c.waitFor(`!!(window.__farmSeason && typeof farmState !== 'undefined' && farmState && typeof Season !== 'undefined' && Season.name === '${season}')`, 60000, 'farm ready ' + season);
        await sleep(1200);
    };
    c.snap = () => ev(`window.__farmSeason.snapshot()`);
    return c;
}

// 页内测试小工具（全局函数/变量直呼，与真机同一入口）
const HELPERS = `(function(){
    window.__t = {
        cell(key){ return farmGrid.find(c => (c.row + ',' + c.col) === key); },
        tap(key){ onFarmCellTap(this.cell(key)); },
        st(key){ return farmState.cells[key] || null; },
        plantWater(key){ this.tap(key); this.tap(key); return this.st(key); }
    };
    return true;
})()`;

async function seasonLogic() {
    // ---------- 春 ----------
    {
        const c = await launch('1100,850');
        try {
            await c.boot('spring');
            await c.ev(HELPERS);
            const s = await c.snap();
            check('春：季节源接通 Season.name', s.season === 'spring', s.season);
            check('春：可种名单=玉米+南瓜（向日葵未到）', JSON.stringify(s.plantable) === JSON.stringify(['corn', 'pumpkin']), JSON.stringify(s.plantable));
            check('春：生长点=2（一天成熟）', s.growRate === 2, String(s.growRate));
            check('春：贴士含季节与宜种', s.tip.indexOf('春') >= 0 && s.tip.indexOf('玉米') >= 0, s.tip);
            check('春：农田色调=嫩褐微绿', near(s.plotTint, [1.04, 1.03, 0.90]), JSON.stringify(s.plotTint));
            const planted = await c.ev(`__t.plantWater('2,1')`);
            check('春：首格按名单轮换种下玉米', planted && planted.crop === 'corn' && planted.watered === true, JSON.stringify(planted));
            const second = await c.ev(`(function(){ __t.tap('2,3'); return __t.st('2,3'); })()`);
            check('春：次格轮换到南瓜', second && second.crop === 'pumpkin', JSON.stringify(second));
            // 春季 bonus：桩 Math.random 到 0.1（<0.3 必中），验标记与双倍收获
            await c.ev(`window.__origRandom = Math.random; Math.random = function(){ return 0.1; };`);
            await c.ev(`farmNewDay()`);
            const after = await c.ev(`__t.st('2,1')`);
            check('春：一天成熟且 g 攒满 2', after && after.mature === true && after.g === 2, JSON.stringify(after));
            check('春：成熟作物带 bonus 标记（桩随机）', after && after.bonus === true, JSON.stringify(after));
            const h0 = await c.ev(`farmState.harvest`);
            await c.ev(`Math.random = window.__origRandom; __t.tap('2,1');`);
            const h1 = await c.ev(`farmState.harvest`);
            check('春：bonus 收获计数翻倍（+2）且格子清空', h1 - h0 === 2 && await c.ev(`__t.st('2,1')`) === null, `harvest ${h0}->${h1}`);
        } finally { c.chrome.kill(); }
    }
    // ---------- 夏 ----------
    {
        const c = await launch('1100,850');
        try {
            await c.boot('summer');
            await c.ev(HELPERS);
            const s = await c.snap();
            check('夏：可种名单=全三种', JSON.stringify(s.plantable) === JSON.stringify(['sunflower', 'corn', 'pumpkin']), JSON.stringify(s.plantable));
            check('夏：农田色调=基线', near(s.plotTint, [1, 1, 1]), JSON.stringify(s.plotTint));
            const planted = await c.ev(`__t.plantWater('2,1')`);
            check('夏：向日葵（夏季限定）种得下', planted && planted.crop === 'sunflower', JSON.stringify(planted));
            await c.ev(`farmNewDay()`);
            const after = await c.ev(`__t.st('2,1')`);
            check('夏：一天成熟（维持现状）', after && after.mature === true, JSON.stringify(after));
        } finally { c.chrome.kill(); }
    }
    // ---------- 秋 ----------
    {
        const c = await launch('1100,850');
        try {
            await c.boot('autumn');
            await c.ev(HELPERS);
            const s = await c.snap();
            check('秋：可种名单=玉米+南瓜（向日葵花期已过）', JSON.stringify(s.plantable) === JSON.stringify(['corn', 'pumpkin']), JSON.stringify(s.plantable));
            check('秋：农田色调=金褐', near(s.plotTint, [1.09, 0.99, 0.80]), JSON.stringify(s.plotTint));
            const planted = await c.ev(`__t.plantWater('2,1')`);
            await c.ev(`farmNewDay()`);
            const after = await c.ev(`__t.st('2,1')`);
            check('秋：种下玉米且一天成熟', planted && planted.crop === 'corn' && after && after.mature === true, JSON.stringify(after));
        } finally { c.chrome.kill(); }
    }
    // ---------- 冬 + 跨季 + 老存档 + FEAT 开关 ----------
    {
        const c = await launch('1100,850');
        try {
            await c.boot('winter');
            await c.ev(HELPERS);
            let s = await c.snap();
            check('冬：可种名单为空（封播）', Array.isArray(s.plantable) && s.plantable.length === 0, JSON.stringify(s.plantable));
            check('冬：生长点=0（冻结）', s.growRate === 0, String(s.growRate));
            check('冬：贴士说明冻住与封播', s.tip.indexOf('冻住') >= 0 && s.tip.indexOf('不能新播种') >= 0, s.tip);
            check('冬：农田色调=覆雪冷调', near(s.plotTint, [0.94, 0.99, 1.10]), JSON.stringify(s.plotTint));
            await c.ev(`__t.tap('2,1')`);
            check('冬：点空地不下种', await c.ev(`__t.st('2,1')`) === null);
            let snow = false;
            for (let i = 0; i < 14 && !snow; i++) { s = await c.snap(); snow = s.snowVisible === true; if (!snow) await sleep(700); }
            check('冬：农田雪盖可见', snow);
            // 跨季：夏种向日葵（直接注入等效状态）→ 冬冻存 → 春续长成熟，格子不丢
            await c.ev(`farmState.cells['2,1'] = { crop:'sunflower', watered:true, mature:false, g:0 }; saveFarm(); renderPlayCrops();`);
            await c.ev(`farmNewDay()`);
            let st = await c.ev(`__t.st('2,1')`);
            check('冬：已种作物冻存（不熟、g 不动、不消失）', st && st.mature === false && st.g === 0 && st.crop === 'sunflower', JSON.stringify(st));
            await c.ev(`Season.setTarget('spring', false)`);
            await sleep(1000);
            await c.ev(`farmNewDay()`);
            st = await c.ev(`__t.st('2,1')`);
            check('跨季：开春续攒长完（成熟、g=2、作物还在）', st && st.mature === true && st.g === 2 && st.crop === 'sunflower', JSON.stringify(st));
            // 老存档语义：无 g/bonus 字段的旧格子，春季照常一天成熟
            await c.ev(`farmState.cells['3,1'] = { crop:'pumpkin', watered:true, mature:false }; saveFarm();`);
            await c.ev(`farmNewDay()`);
            st = await c.ev(`__t.st('3,1')`);
            check('老存档：无 g 字段旧格照常一天成熟', st && st.mature === true, JSON.stringify(st));
            // 老存档已成熟格：照常收获 +1 并清格
            await c.ev(`farmState.cells['3,3'] = { crop:'corn', watered:true, mature:true }; saveFarm();`);
            const h0 = await c.ev(`farmState.harvest`);
            await c.ev(`__t.tap('3,3')`);
            const h1 = await c.ev(`farmState.harvest`);
            check('老存档：已成熟格照常收获（+1、清格）', h1 - h0 === 1 && await c.ev(`__t.st('3,3')`) === null, `harvest ${h0}->${h1}`);
            // FEAT 关 → 老规矩；再开 → 恢复
            await c.ev(`toggleFeat('farmSeason', false)`);
            s = await c.snap();
            check('FEAT 关：状态为关、名单全开、色调回基线、贴士说明已关',
                s.on === false && s.plantable.length === 3 && near(s.plotTint, [1, 1, 1]) && s.tip.indexOf('已关') >= 0,
                JSON.stringify({ on: s.on, tip: s.tip, tint: s.plotTint }));
            check('FEAT 关：雪盖隐藏', s.snowVisible === false);
            await c.ev(`farmState.cells['4,1'] = { crop:'corn', watered:true, mature:false }; farmNewDay()`);
            st = await c.ev(`__t.st('4,1')`);
            check('FEAT 关：新的一天直接成熟（老规矩）', st && st.mature === true, JSON.stringify(st));
            await c.ev(`toggleFeat('farmSeason', true)`);
            s = await c.snap();
            check('FEAT 再开：季节层恢复（当前春季）', s.on === true && s.season === 'spring' && s.growRate === 2, JSON.stringify({ on: s.on, season: s.season }));
        } finally { c.chrome.kill(); }
    }
}

async function seasonShots() {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    // 春耕：种满三格并成熟，进世界后传送到农田边截图（桌面视口）
    {
        const seed = `try{ localStorage.setItem('ct2_dragon', ${JSON.stringify(DRAGON_SAVE)}); }catch(e){}`;
        const c = await launch('1280,800', seed);
        try {
            await c.boot('spring');
            await c.ev(HELPERS);
            await c.ev(`__t.plantWater('2,1'); __t.plantWater('2,3'); __t.plantWater('3,1'); farmNewDay();`);
            await enterAndShoot(c, 'spring-farm.png');
            check('截图：春耕田已存盘', fs.existsSync(path.join(SHOT_DIR, 'spring-farm.png')));
        } finally { c.chrome.kill(); }
    }
    // 冬雪田：注入两株成熟作物（冬季封播，靠存档注入等效状态），进世界截图（移动横屏视口）
    {
        const seed = `try{ localStorage.setItem('ct2_dragon', ${JSON.stringify(DRAGON_SAVE)}); }catch(e){}`;
        const c = await launch('850,400', seed);
        try {
            await c.boot('winter');
            await c.ev(HELPERS);
            await c.ev(`farmState.cells['2,1'] = { crop:'corn', watered:true, mature:true }; farmState.cells['2,3'] = { crop:'pumpkin', watered:true, mature:true }; saveFarm(); renderPlayCrops();`);
            await enterAndShoot(c, 'winter-farm.png');
            check('截图：冬雪田已存盘', fs.existsSync(path.join(SHOT_DIR, 'winter-farm.png')));
        } finally { c.chrome.kill(); }
    }
}

async function tapLogOk(c) {
    // 日志面板比视口高，按钮常在折叠线以下：先滚进视野再取与视口相交的中心点
    const r = await c.ev(`(function(){ const e = document.getElementById('logOk'); if(!e) return null; try { e.scrollIntoView({ block: 'center', inline: 'center' }); } catch(_){ } const b = e.getBoundingClientRect(); const vx = Math.max(b.left, 0), vy = Math.max(b.top, 0); const ex = Math.min(b.right, window.innerWidth), ey = Math.min(b.bottom, window.innerHeight); if (ex - vx < 4 || ey - vy < 4) return { x: -1, y: -1 }; return { x: Math.round((vx + ex) / 2), y: Math.round((vy + ey) / 2) }; })()`);
    if (!r || r.x < 0) throw new Error('日志按钮不在视口内');
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await sleep(70);
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
}

async function enterAndShoot(c, file) {
    // 老存档直进：等更新日志弹出 → 点「开始游玩」关日志进世界
    await c.waitFor(`document.getElementById('logMask') && document.getElementById('logMask').classList.contains('on')`, 120000, 'logMask on');
    await tapLogOk(c);
    await c.waitFor(`typeof DragonCtl !== 'undefined' && DragonCtl.active === true`, 120000, 'entered world');
    // #117 的顺延口径：前置未齐的存档日志会在进世界后补弹——补弹出来就再关一次，
    // 确认日志已离场才截图，免得整张图被日志盖住
    for (let i = 0; i < 20; i++) {
        const on = await c.ev(`document.getElementById('logMask') && document.getElementById('logMask').classList.contains('on')`);
        if (!on) break;
        await tapLogOk(c);
        await sleep(600);
    }
    const logOff = await c.ev(`!(document.getElementById('logMask') && document.getElementById('logMask').classList.contains('on'))`);
    if (!logOff) throw new Error('更新日志关不掉，截图会被盖住');
    // 传送到农田南侧、面朝农田，等三人称镜头落位
    await c.ev(`(function(){
        const cell = farmGrid.find(g => (g.row + ',' + g.col) === '3,1');
        return avatarTeleportTo(cell.x + 1.5, cell.z + 6.5, cell.x, cell.z);
    })()`);
    await sleep(3000);
    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    if (shot.result && shot.result.data) fs.writeFileSync(path.join(SHOT_DIR, file), Buffer.from(shot.result.data, 'base64'));
}

async function main() {
    if (!CHROME_CANDIDATES.find(p => fs.existsSync(p))) { console.log(' FAIL: 找不到可用的 Chromium'); process.exit(1); }
    if (!process.env.SHOTS_ONLY) await seasonLogic();
    await seasonShots();
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(' FAIL: ' + e.message); process.exit(1); });
