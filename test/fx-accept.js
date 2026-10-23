// #98 保命特效逐个放回 · 专项验收
// 跑法：node test/fx-accept.js（已被 test/all.js 收编）
// 无头实测（SwiftShader 软件渲染，只能验代码路径与状态，**不代表真机驱动结论**）：
//  A. glSafe=2 无嫌疑存档：水体 lite/草风摆恢复，水体被钉死 lite
//     （__waterTier('ultra') 无效）；天空穹顶/云影/Bloom 已由 2026-10-23
//     白屏热修回退（保命档停用/压 0/钉 0），只有 water/sway 登记 __glFxActive。
//  B. glSafe=2 且 gx{water:2, sky:2}：水/天单独关停回落剥离态，其余三件不受连坐。
//  C. glSafe=2 且 gx{water:1}：页内模拟一次「水体启用中上下文丢失」→ glNoteFxFailure
//     把水体系数攒到 2 并落盘 → 整页重载后水体回落 Phong、天空仍在。
//  D. glSafe=0 普通存档回归：水体 ultra 可切、天空在位（普通路径不被 #98 误伤）。
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
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fxacc-'));
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
    // 预置存档（仅在 ct2_scene 不存在时种入，重载不覆盖页内已落盘的账）
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
                // 安全档推迟路径：更新日志开着就点「开始游玩」触发 __startInit
                await ev("(function(){ const m = document.getElementById('logMask'); const b = document.getElementById('logOk'); if (m && b && m.classList.contains('on')) { b.click(); return 1; } return 0; })()");
            } catch (e) {}
        }
        return false;
    };
    return { boot, ev, send, cleanup };
}

const PROBE = `(function(){ return {
    sky: (typeof skyMat !== 'undefined' && !!skyMat),
    waterTier: (typeof WATER_U !== 'undefined' && WATER_U) ? WATER_U.uTier.value : null,
    grassKey: (typeof grassIM !== 'undefined' && grassIM && grassIM.material.customProgramCacheKey) ? grassIM.material.customProgramCacheKey() : null,
    cloud: (typeof ATMO_U !== 'undefined') ? ATMO_U.uCloudStrength.value : null,
    bloom: (typeof AtmoSys !== 'undefined') ? AtmoSys.bloomTier : null,
    fx: window.__glFxActive || {}
}; })()`;

(async () => {
    /* ---------- A：保命档五件全恢复 ---------- */
    {
        const s = await bootScenario({ glSafe: 2, gt: 2 });
        try {
            check('A 页面进入运行中', await s.boot());
            const p = await s.ev(PROBE);
            check('A 天空穹顶保命档停用（白屏热修回退，skyMat 空）', p.sky === false, JSON.stringify(p));
            check('A 水体已恢复且为 lite（uTier=0）', p.waterTier === 0, JSON.stringify(p));
            await s.ev("window.__waterTier && window.__waterTier('ultra')");
            const p2 = await s.ev(PROBE);
            check('A 保命档水体钉死 lite（切 ultra 无效）', p2.waterTier === 0, JSON.stringify(p2));
            check('A 草风摆已恢复（atmo 注入在位）', p.grassKey === 'atmo73', JSON.stringify(p));
            check('A 云影保命档压 0（白屏热修回退）', p.cloud === 0, JSON.stringify(p));
            check('A Bloom 保命档钉 0（白屏热修回退）', p.bloom === 0, JSON.stringify(p));
            check('A 登记口径：water/sway 已登记、sky/cloud/bloom 不再登记', p.fx.water === true && p.fx.sway === true && !p.fx.sky && !p.fx.cloud && !p.fx.bloom, JSON.stringify(p.fx));
        } finally { s.cleanup(); }
    }
    /* ---------- B：gx 攒满的两件单独关停 ---------- */
    {
        const s = await bootScenario({ glSafe: 2, gt: 2, gx: { water: 2, sky: 2 } });
        try {
            check('B 页面进入运行中', await s.boot());
            const p = await s.ev(PROBE);
            check('B 天空单独关停（skyMat 空）', p.sky === false, JSON.stringify(p));
            check('B 水体单独关停（回落 Phong，WATER_U 空）', p.waterTier === null, JSON.stringify(p));
            check('B 风摆不连坐（仍注入）', p.grassKey === 'atmo73', JSON.stringify(p));
            check('B 云影保命档压 0（白屏热修回退，与嫌疑账无关）', p.cloud === 0, JSON.stringify(p));
            check('B Bloom 保命档钉 0（白屏热修回退，与嫌疑账无关）', p.bloom === 0, JSON.stringify(p));
        } finally { s.cleanup(); }
    }
    /* ---------- C：嫌疑攒满→落盘→重载回落 ---------- */
    {
        const s = await bootScenario({ glSafe: 2, gt: 2, gx: { water: 1 } });
        try {
            check('C 页面进入运行中', await s.boot());
            // 钉住「跑稳 3 分钟」洗清计时：无头软件渲染启动慢，注账与重载之间
            // 若正好跨过 180s 洗清点，gx 会被设计内洗清（非缺陷）干扰断言；
            // 置 __glCtxLost 让稳定计时持续重置，模拟「刚丢过、不算跑稳」。
            await s.ev("window.__glCtxLost = true");
            const p = await s.ev(PROBE);
            check('C 水体系数 1 时仍恢复（uTier=0）', p.waterTier === 0, JSON.stringify(p));
            const gxAfter = await s.ev("(function(){ window.__glFxActive = { water: true }; SceneHub.glNoteFxFailure(); const sv = JSON.parse(localStorage.getItem('ct2_scene') || '{}'); return sv.gx ? sv.gx.water : null; })()");
            check('C 丢失记账把水体系数攒到 2 并落盘', gxAfter === 2, 'gx.water=' + gxAfter);
            check('C 重载后进入运行中', await s.boot());
            const p2 = await s.ev(PROBE);
            check('C 重载后水体回落 Phong（WATER_U 空）', p2.waterTier === null, JSON.stringify(p2));
            check('C 重载后天空保持兜底停用（白屏热修回退）', p2.sky === false, JSON.stringify(p2));
        } finally { s.cleanup(); }
    }
    /* ---------- D：钉死只认保命档（普通档口径回归） ---------- */
    {
        // 注：无头 SwiftShader 是软件渲染，探针弱判定会把启动档位直接定到
        // 保命（既有行为，与 #98 无关），无法在此环境构造真·普通档启动；
        // 故页内把 SCENE.glSafe 拨回 0 后验 __waterTier 的档位闸：ultra 只在
        // 非保命档放行——证明钉死逻辑只认档位、普通玩家切档不受影响。
        const s = await bootScenario({ glSafe: 2, gt: 2 });
        try {
            check('D 页面进入运行中', await s.boot());
            const p = await s.ev(PROBE);
            check('D 保命档天空停用（白屏热修回退）', p.sky === false, JSON.stringify(p));
            const t = await s.ev("(function(){ SCENE.glSafe = 0; window.__waterTier('ultra'); return WATER_U ? WATER_U.uTier.value : null; })()");
            check('D 档位回 0 后水体 ultra 可切（uTier=1）', t === 1, 'uTier=' + t);
        } finally { s.cleanup(); }
    }
    console.log(`\n#98 专项：${passed} 过 / ${failed} 红`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.log(' FAIL: 专项异常：' + e.message); process.exit(1); });
