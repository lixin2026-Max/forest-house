// 白屏热修专项验收（2026-10-23：真机保命档进世界全白）
// 跑法：node test/whitefix-accept.js（已被 test/all.js 收编）
// 无头实测（SwiftShader 软件渲染——真机驱动故障在此复现不了，本专项只验
// 代码路径与机制：回退落点、白屏判定/豁免/摘除/记账，真机结论待用户复验）：
//  W1. glSafe=2：天空穹顶不建（skyMat 空、无 sky 网格）、Bloom 钉 0、云影压 0、
//      sky 不登记 __glFxActive；同页内放行档位并 createSky 后 program 计数
//      增长（反证保命档确实没编译穹顶 program）。
//  W2. 判定触发：judge(合成全白统计) → trip：gx.sky +1 并落盘、穹顶当场摘除。
//  W3. 豁免：冬季（雪原）与浓雾（mist）下 judge(全白) 不误杀；晴天恢复判定后
//      再次全白才 trip。
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAGE = 'file://' + path.join(ROOT, 'index.html');
const CHROME_CANDIDATES = [
    process.env.PERF_CHROME,
    '/opt/meta-chromium/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
].filter(Boolean);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function check(name, ok, extra) {
    if (ok) { passed++; console.log(' ✓ ' + name); }
    else { failed++; console.log(' FAIL: ' + name + (extra ? '：' + extra : '')); }
}

const SEED_DRAGON = JSON.stringify({
    avatar: { form: 'dragon', style: 0, chosen: true },
    view: { fp: false, chosen: true },
    egg: { hatched: true, laid: 1, born: 1 }
});

async function bootScenario(seedScene) {
    const chromePath = CHROME_CANDIDATES.find(p => fs.existsSync(p));
    if (!chromePath) throw new Error('找不到可用的 Chromium');
    const PORT = 9800 + Math.floor(Math.random() * 180);
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wfix-'));
    const chrome = spawn(chromePath, [
        '--headless=new', '--no-sandbox', '--use-angle=swiftshader',
        `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
        '--window-size=1100,850', 'about:blank'
    ], { stdio: 'ignore' });
    const cleanup = () => { try { chrome.kill(); } catch (e) {} try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} };
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
    if (!wsUrl) { cleanup(); throw new Error('连不上无头浏览器调试口'); }
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
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
        try {
            if (!localStorage.getItem('ct2_scene')) {
                localStorage.setItem('ct2_scene', ${JSON.stringify(JSON.stringify(seedScene))});
                localStorage.setItem('ct2_dragon', ${JSON.stringify(SEED_DRAGON)});
                localStorage.setItem('ct2_visits', JSON.stringify({ n: 3 }));
            }
        } catch (e) {}
    ` });
    const boot = async () => {
        await send('Page.navigate', { url: PAGE });
        for (let i = 0; i < 150; i++) {
            await sleep(1000);
            try {
                const s = await ev("document.getElementById('status') ? document.getElementById('status').textContent : ''");
                if (s && s.indexOf('运行中') >= 0) { await sleep(2500); return true; }
                await ev("(function(){ const m = document.getElementById('logMask'); const b = document.getElementById('logOk'); if (m && b && m.classList.contains('on')) { b.click(); return 1; } return 0; })()");
            } catch (e) {}
        }
        return false;
    };
    return { boot, ev, send, cleanup };
}

const WHITE = JSON.stringify({ mean: 0.99, sd: 0.01, whiteFrac: 0.99 });
const RESET_GUARD = "(function(){ const g = window.__whiteGuard; g.done = false; g.tripped = false; g._t0 = 0; return true; })()";

(async () => {
    const s = await bootScenario({ glSafe: 2, gt: 2 });
    try {
        /* ---------- W1：保命档回退落点 ---------- */
        check('W1 页面进入运行中', await s.boot());
        const p1 = await s.ev(`(function(){ return {
            skyMat: (typeof skyMat !== 'undefined' && !!skyMat),
            skyMesh: (typeof scene !== 'undefined' && scene) ? !!scene.getObjectByName('sky') : null,
            bloom: (typeof AtmoSys !== 'undefined') ? AtmoSys.bloomTier : null,
            cloud: (typeof ATMO_U !== 'undefined') ? ATMO_U.uCloudStrength.value : null,
            fxSky: !!(window.__glFxActive && window.__glFxActive.sky),
            programs: (typeof renderer !== 'undefined' && renderer) ? renderer.info.programs.length : -1,
            guard: !!window.__whiteGuard
        }; })()`);
        check('W1 保命档穹顶不建（skyMat 空）', p1.skyMat === false, JSON.stringify(p1));
        check('W1 保命档无 sky 网格', p1.skyMesh === false, JSON.stringify(p1));
        check('W1 保命档 Bloom 钉 0', p1.bloom === 0, JSON.stringify(p1));
        check('W1 保命档云影压 0', p1.cloud === 0, JSON.stringify(p1));
        check('W1 sky 不登记本会话启用', p1.fxSky === false, JSON.stringify(p1));
        check('W1 白屏自检钩子在位', p1.guard === true);
        const st = await s.ev("(function(){ const g = window.__whiteGuard; const s2 = g.sample(); return s2 ? { mean: s2.mean, sd: s2.sd, whiteFrac: s2.whiteFrac, white: g.isWhite(s2) } : null; })()");
        check('W1 正常画面采样非全白（不误触发）', !!st && st.white === false, JSON.stringify(st));
        /* 同页放行档位建穹顶 → program 计数应增长，反证保命档没编译穹顶 program */
        await s.ev("(function(){ SCENE.glSafe = 0; createSky(); return !!skyMat; })()");
        await sleep(2500);
        const p2 = await s.ev(`(function(){ return {
            skyMat: (typeof skyMat !== 'undefined' && !!skyMat),
            skyMesh: (typeof scene !== 'undefined' && scene) ? !!scene.getObjectByName('sky') : null,
            programs: (typeof renderer !== 'undefined' && renderer) ? renderer.info.programs.length : -1
        }; })()`);
        check('W1 放行后穹顶可建（skyMat 非空、网格在场）', p2.skyMat === true && p2.skyMesh === true, JSON.stringify(p2));
        check('W1 穹顶 program 计数增长（保命档未编译穹顶）', p2.programs > p1.programs, `safe=${p1.programs} withSky=${p2.programs}`);

        /* ---------- W2：判定触发 → 记账＋摘除 ---------- */
        await s.ev(RESET_GUARD);
        const gx0 = await s.ev("(function(){ return (typeof GL_FX !== 'undefined' && GL_FX.fails.sky) || 0; })()");
        const tripped = await s.ev(`(function(){ return window.__whiteGuard.judge(${WHITE}); })()`);
        check('W2 合成全白触发 trip', tripped === true);
        const p3 = await s.ev(`(function(){ const sv = JSON.parse(localStorage.getItem('ct2_scene') || '{}'); return {
            skyMat: (typeof skyMat !== 'undefined' && !!skyMat),
            skyMesh: (typeof scene !== 'undefined' && scene) ? !!scene.getObjectByName('sky') : null,
            gxMem: (typeof GL_FX !== 'undefined' && GL_FX.fails.sky) || 0,
            gxDisk: sv.gx ? (sv.gx.sky || 0) : 0
        }; })()`);
        check('W2 trip 后穹顶当场摘除（skyMat 空、无网格）', p3.skyMat === false && p3.skyMesh === false, JSON.stringify(p3));
        check('W2 gx.sky 内存记账 +1', p3.gxMem === gx0 + 1, `before=${gx0} after=${p3.gxMem}`);
        check('W2 gx.sky 已落盘', p3.gxDisk === gx0 + 1, `disk=${p3.gxDisk}`);

        /* ---------- W3：正当全白豁免 ---------- */
        await s.ev("(function(){ createSky(); return !!skyMat; })()");
        await s.ev(RESET_GUARD);
        await s.ev("(function(){ Season.name = 'winter'; Season.target = 'winter'; return Season.name; })()");
        const jWinter = await s.ev(`(function(){ return window.__whiteGuard.judge(${WHITE}); })()`);
        const domeAfterWinter = await s.ev("(function(){ return !!scene.getObjectByName('sky'); })()");
        check('W3 冬季雪原全白豁免（不 trip、穹顶保留）', jWinter === false && domeAfterWinter === true);
        await s.ev("(function(){ Season.name = 'summer'; Season.target = 'summer'; weatherIndex = 1; return weatherModes[weatherIndex]; })()");
        const jMist = await s.ev(`(function(){ return window.__whiteGuard.judge(${WHITE}); })()`);
        check('W3 浓雾全白豁免（不 trip）', jMist === false);
        await s.ev("(function(){ weatherIndex = 0; return weatherModes[weatherIndex]; })()");
        const jSunny = await s.ev(`(function(){ return window.__whiteGuard.judge(${WHITE}); })()`);
        const domeAfterSunny = await s.ev("(function(){ return !!scene.getObjectByName('sky'); })()");
        check('W3 晴天全白恢复判定（trip 且摘除）', jSunny === true && domeAfterSunny === false);
    } finally { s.cleanup(); }
    console.log(`\n白屏热修专项：${passed} 过 / ${failed} 红`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.log(' FAIL: 专项异常：' + e.message); process.exit(1); });
