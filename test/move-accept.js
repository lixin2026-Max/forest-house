// 技能期 Build 1 专项验收：移动基础（跳跃＋疾跑/体力条）
// 跑法：node test/move-accept.js（已被 test/all.js 收编）
// 无头实测（两种子存档）：
//  A 本体·少年（stage 1）：空格跳跃全程高度曲线（起跳→顶点→落回地面）、
//    跳跃钮存在/可见/点按可跳、Shift 疾跑体力按 20/s 下降、耗尽锁＋降速、
//    停跑延迟回复＋回满解锁、体力条显隐、面板打开时跳跃/疾跑不触发、
//    FEAT 关停后钮隐藏且跳跃失效、全程零新增存档键；
//  B 本体·幼年（stage 0）：可跳但跳高约成年一半、不可疾跑（体力不动、
//    体力条不出现）。
// 注：与 help/npc 专项同例——进世界后用 AgentKit.update(dt) 在页内同步
// 「泵」游戏时间再断言；按键经 KeyboardEvent 派发到 window（与真实键盘
// 走同一监听），单次 evaluate 内泵帧保证曲线采样不被无头 RAF 抢拍。
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
function seedScript(days) {
    const dragon = {
        name: '小龙',
        avatar: { form: 'dragon', style: 0, chosen: true },
        view: { fp: false, chosen: true },
        grow: { days: days, last: todayStr(), stage: days >= 9 ? 2 : days >= 4 ? 1 : 0, seen: days >= 9 ? 2 : days >= 4 ? 1 : 0, events: [] },
        egg: { hatched: true, laid: null, born: todayStr() }
    };
    return 'localStorage.setItem("ct2_dragon", ' + JSON.stringify(JSON.stringify(dragon)) + ');';
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

        async function bootScenario(days) {
            const s = await send('Page.addScriptToEvaluateOnNewDocument', { source: seedScript(days) });
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
            /* 进世界后更新日志是顺延弹出的（#117），它开着时技能按规格被挡——
               等它弹出并替玩家关掉（真机由玩家点掉），再开始测技能本体 */
            if (entered) {
                for (let j = 0; j < 8; j++) {
                    const still = await ev("(function(){ var m = document.getElementById('logMask'); var b = document.getElementById('logOk');" +
                        " if (typeof logOpen !== 'undefined' && logOpen && typeof closeLog === 'function') closeLog();" +
                        " if (m && b && m.classList.contains('on')) b.click();" +
                        " return !!((typeof logOpen !== 'undefined' && logOpen) || (m && m.classList.contains('on'))); })()");
                    if (!still) break;
                    await sleep(700);
                }
            }
            return entered;
        }
        /* 单次 evaluate 内：触发起跳（mode: 'space'|'btn'|'hook'）→ 泵 34 帧采样高度 */
        const jumpSeries = mode => ev("(function(){ " +
            (mode === 'btn' ? "document.getElementById('jumpBtn').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true})); "
             : mode === 'hook' ? "__skillMove.jump(); "
             : "window.dispatchEvent(new KeyboardEvent('keydown', {key:' '})); ") +
            " var out = []; for (var i = 0; i < 34; i++) { AgentKit.update(0.05, 2000 + i * 0.05); var s = __skillMove.snap(); out.push({h: Math.round((s.y - s.ground) * 1000) / 1000, air: s.air}); } " +
            " window.dispatchEvent(new KeyboardEvent('keyup', {key:' '})); return out; })()");
        const peakOf = series => Math.max.apply(null, series.map(s => s.h));

        /* ---------- A：本体·少年 ---------- */
        let ok = await bootScenario(5);
        check('A 进世界：少年形态、玩家态', ok);
        if (ok) {
            const keys0 = await ev("Object.keys(localStorage).sort().join(',')");
            const s0 = await ev("__skillMove.snap()");
            check('A 跳跃钮：玩家态可见（display 非 none）', s0.jumpBtn === '', JSON.stringify(s0));
            check('A 初始体力满格、体力条隐藏', s0.stam === 100 && s0.barOn === false, JSON.stringify(s0));

            /* 空格跳跃：高度曲线 */
            const ser = await jumpSeries('space');
            const peak = peakOf(ser);
            check('A 跳跃顶点高度合理（0.5–1.0）', peak >= 0.5 && peak <= 1.0, 'peak=' + peak);
            const peakIdx = ser.findIndex(s => s.h === peak);
            check('A 曲线先升后落（顶点不在首尾）', peakIdx > 1 && peakIdx < ser.length - 3, 'idx=' + peakIdx + '/' + ser.length);
            const last = ser[ser.length - 1];
            check('A 落回地面高度（末帧贴地且 air=false）', Math.abs(last.h) < 0.01 && last.air === false, JSON.stringify(last));

            /* 跳跃钮点按起跳 */
            const ser2 = await jumpSeries('btn');
            check('A 跳跃钮点按可起跳（顶点 > 0.4）', peakOf(ser2) > 0.4, 'peak=' + peakOf(ser2));

            /* 速度位移实测：单步位移/时长取多次最大（避开被挡步） */
            const spd = await ev("(function(){ function one(shift){ var p = dragonAgent.group.position; " +
                " window.dispatchEvent(new KeyboardEvent('keydown', {key:'w'})); if (shift) window.dispatchEvent(new KeyboardEvent('keydown', {key:'Shift'})); " +
                " var best = 0; for (var i = 0; i < 6; i++) { var px = p.x, pz = p.z; AgentKit.update(0.05, 9500 + i * 0.05); best = Math.max(best, Math.hypot(p.x - px, p.z - pz) / 0.05); } " +
                " window.dispatchEvent(new KeyboardEvent('keyup', {key:'w'})); window.dispatchEvent(new KeyboardEvent('keyup', {key:'Shift'})); return Math.round(best * 100) / 100; } " +
                " return {walk: one(false), sprint: one(true)}; })()");
            check('A 步行速度不变（≈3.6）', spd.walk >= 3.2 && spd.walk <= 4.0, JSON.stringify(spd));
            check('A 疾跑速度 ≈5.4（步行 ×1.5）', spd.sprint >= 4.9 && spd.sprint <= 5.9, JSON.stringify(spd));

            /* 疾跑：2 秒体力下降 ≈ 40、体力条亮起 */
            const run1 = await ev("(function(){ window.dispatchEvent(new KeyboardEvent('keydown', {key:'w'})); window.dispatchEvent(new KeyboardEvent('keydown', {key:'Shift'})); " +
                " var mid = null; for (var i = 0; i < 40; i++) { AgentKit.update(0.05, 3000 + i * 0.05); if (i === 20) mid = __skillMove.snap(); } " +
                " var e = __skillMove.snap(); return {stam: e.stam, sprinting: e.sprinting, midBar: mid ? mid.barOn : null, midSprint: mid ? mid.sprinting : null}; })()");
            check('A 疾跑中（sprinting=true）', run1.sprinting === true && run1.midSprint === true, JSON.stringify(run1));
            check('A 体力按 20/s 下降（2s ≈ 40，容差 ±6）', run1.stam >= 54 && run1.stam <= 66, 'stam=' + run1.stam);
            check('A 体力条在疾跑消耗时亮起', run1.midBar === true, JSON.stringify(run1));

            /* 压到耗尽：锁生效、降为步行 */
            const run2 = await ev("(function(){ __skillMove.setStam(5); var sawSprint = false; " +
                " for (var i = 0; i < 20; i++) { AgentKit.update(0.05, 4000 + i * 0.05); if (__skillMove.snap().sprinting) sawSprint = true; } " +
                " var e = __skillMove.snap(); return {stam: e.stam, exhausted: e.exhausted, sprinting: e.sprinting, sawSprint: sawSprint}; })()");
            check('A 体力耗尽（stam=0、exhausted=true）', run2.stam === 0 && run2.exhausted === true, JSON.stringify(run2));
            check('A 耗尽后降为步行（仍按住 Shift 也不疾跑）', run2.sprinting === false, JSON.stringify(run2));

            /* 松开：延迟后回复、回够 30 解锁、回满体力条隐去 */
            const rec = await ev("(function(){ window.dispatchEvent(new KeyboardEvent('keyup', {key:'w'})); window.dispatchEvent(new KeyboardEvent('keyup', {key:'Shift'})); " +
                " for (var i = 0; i < 120; i++) AgentKit.update(0.05, 5000 + i * 0.05); var e = __skillMove.snap(); return e; })()");
            check('A 停跑后体力回复（>60）', rec.stam > 60, 'stam=' + rec.stam);
            check('A 回够 stamWake 后耗尽锁解除', rec.exhausted === false, JSON.stringify(rec));
            const rec2 = await ev("(function(){ for (var i = 0; i < 120; i++) AgentKit.update(0.05, 6000 + i * 0.05); return __skillMove.snap(); })()");
            check('A 体力回满且体力条自动隐去', rec2.stam === 100 && rec2.barOn === false, JSON.stringify(rec2));

            /* 面板打开：跳跃/疾跑不触发 */
            const guard = await ev("(function(){ document.getElementById('modPanel').classList.add('on'); " +
                " window.dispatchEvent(new KeyboardEvent('keydown', {key:' '})); window.dispatchEvent(new KeyboardEvent('keydown', {key:'w'})); window.dispatchEvent(new KeyboardEvent('keydown', {key:'Shift'})); " +
                " var peak = 0, sprint = false; for (var i = 0; i < 24; i++) { AgentKit.update(0.05, 7000 + i * 0.05); var s = __skillMove.snap(); peak = Math.max(peak, s.y - s.ground); if (s.sprinting) sprint = true; } " +
                " window.dispatchEvent(new KeyboardEvent('keyup', {key:' '})); window.dispatchEvent(new KeyboardEvent('keyup', {key:'w'})); window.dispatchEvent(new KeyboardEvent('keyup', {key:'Shift'})); " +
                " document.getElementById('modPanel').classList.remove('on'); return {peak: peak, sprint: sprint, stam: __skillMove.snap().stam}; })()");
            check('A 面板打开时不跳（peak < 0.05）', guard.peak < 0.05, JSON.stringify(guard));
            check('A 面板打开时不疾跑、体力不消耗', guard.sprint === false && guard.stam === 100, JSON.stringify(guard));

            /* FEAT 关：钮隐藏、跳跃失效；开回来恢复 */
            const off = await ev("(function(){ toggleFeat('skillMove', false); var b = __skillMove.snap().jumpBtn; " +
                " window.dispatchEvent(new KeyboardEvent('keydown', {key:' '})); var peak = 0; " +
                " for (var i = 0; i < 24; i++) { AgentKit.update(0.05, 8000 + i * 0.05); var s = __skillMove.snap(); peak = Math.max(peak, s.y - s.ground); } " +
                " window.dispatchEvent(new KeyboardEvent('keyup', {key:' '})); toggleFeat('skillMove', true); " +
                " return {btn: b, peak: peak, btnBack: __skillMove.snap().jumpBtn}; })()");
            check('A FEAT 关：跳跃钮隐藏且空格不跳', off.btn === 'none' && off.peak < 0.05, JSON.stringify(off));
            check('A FEAT 开回来：跳跃钮恢复可见', off.btnBack === '', JSON.stringify(off));

            const keys1 = await ev("Object.keys(localStorage).sort().join(',')");
            check('A 零新增存档键（技能全程未写新键）', keys1 === keys0, 'before=' + keys0 + ' after=' + keys1);
        }

        /* ---------- B：本体·幼年 ---------- */
        ok = await bootScenario(1);
        check('B 进世界：幼年形态、玩家态', ok);
        if (ok) {
            const sb = await ev("__skillMove.snap()");
            check('B 幼年判定成立（juv=true）', sb.juv === true, JSON.stringify(sb));
            const serB = await jumpSeries('space');
            const peakB = peakOf(serB);
            check('B 幼年可跳但跳高约成年一半（0.2–0.55）', peakB >= 0.2 && peakB <= 0.55, 'peak=' + peakB);
            const runB = await ev("(function(){ window.dispatchEvent(new KeyboardEvent('keydown', {key:'w'})); window.dispatchEvent(new KeyboardEvent('keydown', {key:'Shift'})); " +
                " var bar = false; for (var i = 0; i < 30; i++) { AgentKit.update(0.05, 9000 + i * 0.05); if (__skillMove.snap().barOn) bar = true; } " +
                " var e = __skillMove.snap(); window.dispatchEvent(new KeyboardEvent('keyup', {key:'w'})); window.dispatchEvent(new KeyboardEvent('keyup', {key:'Shift'})); " +
                " return {sprinting: e.sprinting, stam: e.stam, bar: bar}; })()");
            check('B 幼年不可疾跑（sprinting=false、体力不动、体力条不出现）',
                runB.sprinting === false && runB.stam === 100 && runB.bar === false, JSON.stringify(runB));
        }

        console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
        done(failed ? 1 : 0);
    } catch (e) {
        console.log(' FAIL: 异常 ' + (e && e.message || e));
        done(1);
    }
}

main();
