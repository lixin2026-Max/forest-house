// 世界之声专项验收（Issue #71 · v4.3）
// 跑法：node test/voice-accept.js（已被 test/all.js 收编）
// 无头逐触发实测：①文案表六类齐全且 ≥24 条、开关在面板里 ②抵达新区域
// 弹对应句且与 ct2_codex 抵达记录同源、重复抵达不再弹 ③情境类全局
// 90 秒节流 ④时段句同段不重复 ⑤天气句 ⑥菜单/拍照流程中不弹（待播
// 保留、空窗补弹）⑦村民事件（阿山清晨出门，须玩家不在近旁）与季节句
// ⑧FEAT 关后字幕条即收、全哑。
//
// 口径同 npc-accept：无头约 1–2 FPS 且主循环 dt 钳 0.05，游戏时间远慢于
// 真实时间，故一律在页内同步泵 __voice.update(dt) 推进其内部时钟断言；
// 进入流程的门禁输入（enteredWorld/eggMode/logOpen/遮罩）按新玩家真实
// 初始态逐个清掉/置位，测的是门禁逻辑本身，不是绕过它。
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

async function main() {
    const chromePath = CHROME_CANDIDATES.find(p => fs.existsSync(p));
    if (!chromePath) { console.log(' FAIL: 找不到可用的 Chromium'); process.exit(1); }
    const PORT = 9800 + Math.floor(Math.random() * 180);
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
        await send('Page.navigate', { url: PAGE });
        let booted = false;
        for (let i = 0; i < 90 && !booted; i++) {
            await sleep(1000);
            try {
                const s = await ev("document.getElementById('status') ? document.getElementById('status').textContent : ''");
                if (s && s.indexOf('运行中') >= 0) booted = true;
            } catch (e) {}
        }
        if (!booted) throw new Error('页面 90 秒内未进入运行中状态');
        await sleep(1500);

        /* ---------- 页内泵：推进 VoiceSys 时钟并收集播过的句子 ---------- */
        await ev(`(function(){
            window.__vSeen = []; window.__vT = 9000;
            window.__vPump = function(total, withNpc){
                const step = 0.25, n = Math.ceil(total / step);
                for (let i = 0; i < n; i++) {
                    window.__vT += step;
                    if (withNpc && window.__npc) __npc.update(step, window.__vT);
                    __voice.update(step);
                    const s = __voice.snapshot();
                    if (s.showing && s.text && window.__vSeen[window.__vSeen.length - 1] !== s.text)
                        window.__vSeen.push(s.text);
                }
                return window.__vSeen.slice();
            };
            window.__vClear = function(){ window.__vSeen.length = 0; };
            return true;
        })()`);
        const linesOf = (cls, key) => ev(`JSON.stringify(VOICE_LINES['${cls}']${key ? `['${key}']` : ''})`).then(s => JSON.parse(s));
        const seenHas = arr => ev(`window.__vSeen.slice()`).then(s => arr.some(t => s.includes(t)));

        /* ---------- ① 文案表与开关 ---------- */
        const audit = await ev(`(function(){
            const cnt = {};
            let total = 0;
            for (const cls in VOICE_LINES) {
                cnt[cls] = 0;
                for (const k in VOICE_LINES[cls]) cnt[cls] += VOICE_LINES[cls][k].length;
                total += cnt[cls];
            }
            const cb = document.getElementById('feat_voice');
            return { cnt: cnt, total: total, cb: !!cb, cbOn: cb ? cb.checked : null,
                     label: (typeof FEAT !== 'undefined' && FEAT.voice) ? FEAT.voice.label : '' };
        })()`);
        check('文案表六类齐全（地点/时段/天气/季节/村民/小龙）',
            ['arrive','tod','wx','season','npc','dragon'].every(c => audit.cnt[c] > 0), JSON.stringify(audit.cnt));
        check('文案总数 ≥24 条', audit.total >= 24, '实际 ' + audit.total);
        check('面板 🧩 组有「🗣️ 世界之声」开关且默认开', audit.cb && audit.cbOn && audit.label.indexOf('世界之声') >= 0,
            JSON.stringify(audit));

        /* ---------- 门禁输入归位（模拟已进世界、无序章/无弹窗） ---------- */
        await ev(`(function(){
            playerTakeover();
            enteredWorld = true;
            if (typeof eggMode !== 'undefined') eggMode = 'hatched';
            if (typeof logOpen !== 'undefined') logOpen = false;
            document.querySelectorAll('[id$="Mask"].on').forEach(e => e.classList.remove('on'));
            const p = document.getElementById('modPanel'); if (p) p.classList.remove('on');
            const app = document.getElementById('app'); if (app) app.classList.remove('photo-on');
            __vPump(2);
            __vClear();
            return __voice.snapshot();
        })()`);

        /* ---------- ② 抵达：同源、一次性 ---------- */
        const wheat = await linesOf('arrive', 'wheat');
        await ev(`(function(){ const z = minimapZones().find(z => z.id === 'wheat'); minimapZoneCheck(z.x, z.z); return true; })()`);
        let seen = await ev(`__vPump(30)`);
        check('抵达麦田：弹出麦田句', wheat.some(t => seen.includes(t)), JSON.stringify(seen));
        const codexM = await ev(`(function(){ try { return (store.codex.json({u:[]}).m || []); } catch(e) { return []; } })()`);
        check('抵达与 ct2_codex.m 同源（麦田已落盘）', Array.isArray(codexM) && codexM.includes('wheat'), JSON.stringify(codexM));
        const pendAfter = await ev(`(function(){
            const z = minimapZones().find(z => z.id === 'wheat'); minimapZoneCheck(z.x, z.z);
            return __voice.snapshot().pending;
        })()`);
        check('重复抵达同一区域：不再排队（一次性）', !pendAfter.includes('arrive'), JSON.stringify(pendAfter));

        /* ---------- ③ 90 秒全局节流 ---------- */
        const orchard = await linesOf('arrive', 'orchard');
        await ev(`__vClear()`);
        await ev(`(function(){ const z = minimapZones().find(z => z.id === 'orchard'); minimapZoneCheck(z.x, z.z); return true; })()`);
        seen = await ev(`__vPump(30)`);
        check('节流：上一句后 30 秒内新句不弹', !orchard.some(t => seen.includes(t)), JSON.stringify(seen));
        seen = await ev(`__vPump(90)`);
        check('节流：满 90 秒后补弹', orchard.some(t => seen.includes(t)), JSON.stringify(seen));

        /* ---------- ④ 时段：进入弹句、同段不重复 ---------- */
        const mist = await linesOf('tod', 'mist');
        await ev(`__vClear()`);
        await ev(`(function(){ playerTakeover(); setWeather(weatherModes.indexOf('mist')); return true; })()`);
        seen = await ev(`__vPump(130)`);
        check('时段：进入清晨弹清晨句', mist.some(t => seen.includes(t)), JSON.stringify(seen));
        const before = seen.length;
        seen = await ev(`__vPump(130)`);
        check('时段：同段内不再重复弹', seen.length === before, JSON.stringify(seen));

        /* ---------- ⑤ 天气：雨 ---------- */
        const rain = await linesOf('wx', 'rain');
        await ev(`__vClear()`);
        await ev(`(function(){ playerTakeover(); setWeather(weatherModes.indexOf('rain')); return true; })()`);
        seen = await ev(`__vPump(130)`);
        check('天气：下雨弹雨句', rain.some(t => seen.includes(t)), JSON.stringify(seen));

        /* ---------- ⑥ 面板打开时不弹，关后补弹 ---------- */
        const pasture = await linesOf('arrive', 'pasture');
        await ev(`__vClear()`);
        await ev(`(function(){
            document.getElementById('modPanel').classList.add('on');
            const z = minimapZones().find(z => z.id === 'pasture'); minimapZoneCheck(z.x, z.z);
            return true;
        })()`);
        seen = await ev(`__vPump(200)`);
        check('门禁：面板打开时抵达句不弹', !pasture.some(t => seen.includes(t)), JSON.stringify(seen));
        await ev(`document.getElementById('modPanel').classList.remove('on')`);
        seen = await ev(`__vPump(40)`);
        check('门禁：面板关后待播补弹', pasture.some(t => seen.includes(t)), JSON.stringify(seen));

        /* ---------- ⑦ 拍照中不弹（小龙进食句） ---------- */
        const eat = await linesOf('dragon', 'eat');
        await ev(`__vClear()`);
        await ev(`(function(){
            dragonAgent = { state:'idle', group:{ position:new THREE.Vector3(80, 0, -80) } };
            __vPump(2);
            document.getElementById('app').classList.add('photo-on');
            dragonAgent.state = 'eat';
            return true;
        })()`);
        seen = await ev(`__vPump(200)`);
        check('门禁：拍照模式中小龙句不弹', !eat.some(t => seen.includes(t)), JSON.stringify(seen));
        await ev(`document.getElementById('app').classList.remove('photo-on')`);
        seen = await ev(`__vPump(40)`);
        check('门禁：退出拍照后补弹', eat.some(t => seen.includes(t)), JSON.stringify(seen));

        /* ---------- ⑧ 季节句＋村民事件（阿山清晨出门，玩家在远处） ---------- */
        // 目标季必须与当下真实季节不同（10 月当下就是秋，切「秋」没有边沿）
        const seasonTarget = await ev(`(function(){
            const cur = Season.name;
            const tgt = (cur === 'winter') ? 'spring' : 'winter';
            return { cur: cur, tgt: tgt };
        })()`);
        const seasonLines = await linesOf('season', seasonTarget.tgt);
        await ev(`__vClear()`);
        await ev(`Season.setTarget('${seasonTarget.tgt}')`);
        seen = await ev(`__vPump(150)`);
        check('季节：从' + seasonTarget.cur + '切到' + seasonTarget.tgt + '弹季节句', seasonLines.some(t => seen.includes(t)), JSON.stringify(seen));

        const ashanOut = await linesOf('npc', 'ashan_out');
        await ev(`__vClear()`);
        await ev(`(function(){ playerTakeover(); setWeather(weatherModes.indexOf('night')); return true; })()`);
        await ev(`__vPump(60, true)`);   // 夜里阿山归家， prevNpc 对齐到 home
        await ev(`(function(){ playerTakeover(); setWeather(weatherModes.indexOf('mist')); return true; })()`);
        seen = await ev(`__vPump(260, true)`);
        check('村民：清晨阿山出门劳作，远处旁白点名', ashanOut.some(t => seen.includes(t)), JSON.stringify(seen));

        /* ---------- ⑨ FEAT 关：即收、全哑 ---------- */
        await ev(`(function(){
            const z = minimapZones().find(z => z.id === 'village'); minimapZoneCheck(z.x, z.z);
            return true;
        })()`);
        const showingNow = await ev(`(function(){
            for (let i = 0; i < 900; i++) { __voice.update(0.25); if (__voice.snapshot().showing) return true; }
            return __voice.snapshot().showing;
        })()`);
        check('关闭前置：村舍群句已播出', showingNow === true);
        const offSnap = await ev(`(function(){
            toggleFeat('voice', false);
            return __voice.snapshot();
        })()`);
        check('FEAT 关：字幕条立即收起', offSnap.barOn === false && offSnap.showing === false, JSON.stringify(offSnap));
        check('FEAT 关：待播清零、开关状态为关', offSnap.pending.length === 0 && offSnap.on === false, JSON.stringify(offSnap));

        console.log(`\n世界之声专项验收：${passed} passed, ${failed} failed`);
        done(failed ? 1 : 0);
    } catch (e) {
        console.log(' FAIL: 专项异常：' + e.message);
        done(1);
    }
}
main();
