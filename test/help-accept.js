// 小龙帮忙干活 · 一期浇水专项验收（Issue #70）
// 跑法：node test/help-accept.js（已被 test/all.js 收编）
// 无头实测（三种子存档各开一局）：
//  A 本体·少年：造 3 块干地 → 使唤 → 小龙逐块到达（位置轨迹取样）且
//    湿度逐块回升 → 全浇完自动停下、菜单钮文案/状态正确；
//  B 无干地块：使唤只摇头＋提示、不进入浇水流程；
//  C 幼龙（stage 0）：使唤被萌系提示挡下、不进入浇水流程；
//  D 少女·少年：同入口改为她自己浇，干地块照样浇完。
// 注：无头 SwiftShader 约 1–2 FPS 且主循环 dt 钳 0.05，纯等真实秒数会
// 误判——进世界后用 AgentKit.update(dt) 在页内同步「泵」游戏时间再
// 断言（与真机每帧调用的是同一入口，口径一致，NPC 专项同例）。
const { spawn } = require('child_process');
const fs = require('fs');
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
function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function seedScript(form, days) {
    const dragon = {
        name: '小龙',
        avatar: { form: form, style: 0, chosen: true },
        view: { fp: false, chosen: true },
        grow: { days: days, last: todayStr(), stage: days >= 9 ? 2 : days >= 4 ? 1 : 0, seen: days >= 9 ? 2 : days >= 4 ? 1 : 0, events: [] },
        egg: { hatched: true, laid: null, born: todayStr() }
    };
    const farm = { day: 3, harvest: 0, cells: {}, lastDate: todayStr() };
    return 'localStorage.setItem("ct2_dragon", ' + JSON.stringify(JSON.stringify(dragon)) + ');' +
           'localStorage.setItem("ct2_farm", ' + JSON.stringify(JSON.stringify(farm)) + ');';
}

async function main() {
    const chromePath = CHROME_CANDIDATES.find(p => fs.existsSync(p));
    if (!chromePath) { console.log(' FAIL: 找不到可用的 Chromium'); process.exit(1); }
    const PORT = 9900 + Math.floor(Math.random() * 90);
    const chrome = spawn(chromePath, [
        '--headless=new', '--no-sandbox', '--use-angle=swiftshader',
        `--remote-debugging-port=${PORT}`, '--window-size=1100,850', 'about:blank'
    ], { stdio: 'ignore' });
    const done = code => { try { chrome.kill(); } catch (e) {} process.exit(code); };
    try {
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
        if (!wsUrl) throw new Error('连不上无头浏览器调试口');
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

        /* 开一局：注入种子存档 → 导航 → 点「开始游玩」过日志/安全模式待命 → 等进世界 */
        async function bootScenario(form, days) {
            const s = await send('Page.addScriptToEvaluateOnNewDocument', { source: seedScript(form, days) });
            await send('Page.navigate', { url: PAGE });
            let entered = false;
            for (let i = 0; i < 90 && !entered; i++) {
                await sleep(1000);
                try {
                    entered = await ev("(typeof enteredWorld !== 'undefined' && enteredWorld && !!dragonAgent && dragonAgent.mode === 'player')");
                    if (!entered) {
                        await ev("(function(){ var m = document.getElementById('logMask'); var b = document.getElementById('logOk');" +
                                 " if (m && b && (m.classList.contains('on') || m.style.display !== 'none')) b.click();" +
                                 " if (typeof logOpen !== 'undefined' && logOpen && typeof closeLog === 'function') closeLog(); return 1; })()");
                    }
                } catch (e) {}
            }
            if (s.result && s.result.identifier)
                await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: s.result.identifier });
            return entered;
        }
        /* 把化身挪到农场东边一块能落脚的地上（站位在田边） */
        const toFarm = () => ev("(function(){ var c = houseLocal(-7.6, 4.5); dragonAgent.group.position.set(c[0], terrainH(c[0], c[1]), c[1]); return {x:c[0], z:c[1]}; })()");
        /* 造干地块：三块可玩格种上没浇水的苗（走农场既有存档口） */
        const plantDry = () => ev("(function(){ ['2,1','2,3','3,1'].forEach(function(k){ farmState.cells[k] = {crop:'corn', watered:false, mature:false}; }); saveFarm(); renderPlayCrops(); return __dragonHelp.dry(); })()");
        /* 同步泵游戏时间直到 cond（表达式串，h 指代 __dragonHelp.snap()）成立 */
        const pumpUntil = (cond, maxIter) => ev("(function(){ let h = null;" +
            " for (let i = 0; i < " + (maxIter || 4000) + "; i++) { AgentKit.update(0.1, 5000 + i * 0.1); h = __dragonHelp.snap(); if (" + cond + ") return {ok:true, h:h, iters:i}; }" +
            " return {ok:false, h:h}; })()");
        const toastText = () => ev("(function(){ var t = document.getElementById('huntToast'); return t ? t.textContent : ''; })()");

        /* ---------- A：本体·少年，全程浇水 ---------- */
        let ok = await bootScenario('dragon', 5);
        check('A 进世界：本体形态、玩家态', ok);
        if (ok) {
            await toFarm();
            const dry = await plantDry();
            check('A 造干地块：3 块待浇', Array.isArray(dry) && dry.length === 3, JSON.stringify(dry));
            await ev("__dragonHelp.start()");
            const h0 = await ev("__dragonHelp.snap()");
            check('A 使唤起步：进入浇水流程、队列 3 块', !!h0 && h0.n === 3, JSON.stringify(h0));
            // 轨迹取样：泵时间的同时记录每块地翻「已浇」瞬间化身与地块的距离
            const run = await ev("(function(){ const a = dragonAgent; const seen = {}; const order = []; const atDist = {}; let t = 6000;" +
                " const cellOf = {}; farmGrid.forEach(function(c){ cellOf[c.row + ',' + c.col] = c; });" +
                " for (let i = 0; i < 6000; i++) { AgentKit.update(0.1, t += 0.1);" +
                "   ['2,1','2,3','3,1'].forEach(function(k){ const st = farmState.cells[k]; if (st && st.watered && !seen[k]) { seen[k] = 1; order.push(k);" +
                "     atDist[k] = Math.hypot(a.group.position.x - cellOf[k].x, a.group.position.z - cellOf[k].z); } });" +
                "   if (!a.helpWater) return {done:true, order:order, atDist:atDist, iters:i}; }" +
                " return {done:false, order:order, atDist:atDist}; })()");
            check('A 全浇完自动停下（helpWater 清空）', run.done, JSON.stringify(run));
            check('A 湿度逐块回升：3 块按到达顺序依次浇上', run.order && run.order.length === 3, JSON.stringify(run.order));
            check('A 逐块到达：每块翻已浇时化身就在地块旁（≤5.2，西列地块离田边最近 3.5）',
                !!(run.atDist && run.order.every(k => typeof run.atDist[k] === 'number' && run.atDist[k] <= 5.2)),
                JSON.stringify(run.atDist));
            const saved = await ev("(function(){ var raw = JSON.parse(localStorage.getItem('ct2_farm')); return ['2,1','2,3','3,1'].map(function(k){ return raw.cells[k] && raw.cells[k].watered; }); })()");
            check('A 湿度落盘 ct2_farm（既有字段、零新键）', Array.isArray(saved) && saved.every(Boolean), JSON.stringify(saved));
            const dryAfter = await ev("__dragonHelp.dry()");
            check('A 浇完后干地块清零', Array.isArray(dryAfter) && dryAfter.length === 0, JSON.stringify(dryAfter));
        }

        /* ---------- B：无干地块 → 摇头提示 ---------- */
        ok = await bootScenario('dragon', 5);
        check('B 进世界', ok);
        if (ok) {
            await toFarm();
            await ev("__dragonHelp.start()");
            await sleep(300);
            const h = await ev("__dragonHelp.snap()");
            const tt = await toastText();
            check('B 无干地块：不进入浇水流程', h === null, JSON.stringify(h));
            check('B 无干地块：给「没有干着的作物」提示', tt.indexOf('没有干着的作物') >= 0, tt);
            const g = await ev("dragonAgent.gesture ? dragonAgent.gesture.kind : null");
            check('B 无干地块：播了摇头手势', g === 'no', String(g));
        }

        /* ---------- C：幼龙不可使唤 ---------- */
        ok = await bootScenario('dragon', 1);
        check('C 进世界（幼龙存档）', ok);
        if (ok) {
            await toFarm();
            await plantDry();
            await ev("__dragonHelp.start()");
            await sleep(300);
            const h = await ev("__dragonHelp.snap()");
            const tt = await toastText();
            check('C 幼龙：不进入浇水流程', h === null, JSON.stringify(h));
            check('C 幼龙：给「还是幼龙」萌系提示', tt.indexOf('还是幼龙') >= 0, tt);
            const dryC = await ev("__dragonHelp.dry()");
            check('C 幼龙：地块保持未浇', Array.isArray(dryC) && dryC.length === 3, JSON.stringify(dryC));
        }

        /* ---------- D：少女·少年，她自己浇 ---------- */
        ok = await bootScenario('girl', 5);
        check('D 进世界：少女形态', ok);
        if (ok) {
            const form = await ev("dragonCfg.avatar.form");
            check('D 化身确为少女形态', form === 'girl', String(form));
            await toFarm();
            await plantDry();
            await ev("__dragonHelp.start()");
            const r = await pumpUntil("h === null", 6000);
            check('D 少女：同入口浇完全部干地块并停下', r.ok, JSON.stringify(r.h));
            const dryD = await ev("__dragonHelp.dry()");
            check('D 少女：干地块清零', Array.isArray(dryD) && dryD.length === 0, JSON.stringify(dryD));
        }

        console.log(' 浇水专项验收：' + passed + ' passed, ' + failed + ' failed');
        ws.close();
        done(failed ? 1 : 0);
    } catch (e) {
        console.log(' FAIL: 浇水专项验收执行出错：' + e.message);
        done(1);
    }
}
main();
