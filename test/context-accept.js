// 上下文互动键专项验收（技能期 Build 2）
// 跑法：node test/context-accept.js（已被 test/all.js 收编）
// 无头实测（种子存档开一局，化身逐个传送到目标跟前）：
//  ①远离一切目标时键隐形；②门前浮「🚪 敲敲门」，E 键触发＝敲门开门
//  （与直点门同一处理器 setDoor)，开后标签变「🚪 进屋看看」；
//  ③篝火前浮点燃键，点键钮＝setFire 点着；④农田干地块前浮「💧 给这
//  块地浇水」，触发后地块 watered（与 onFarmCellTap 同结果），空地是
//  播种、熟地是收获；⑤寻宝宝物前浮拾起键，触发后计入 huntState.found
//  （与 collectHuntItem 同结果）；⑥走开即隐；⑦面板打开即隐；⑧拍照
//  模式即隐；⑨FEAT.skillContext 关掉即隐且不再浮出。
// 注：无头 SwiftShader 约 1–2 FPS——CtxKey 轮询经 __ctxKey.pump() 在页
// 内同步推进（与真机每帧 updateModules 调的是同一个 CtxKey.update)。
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
function seedScript() {
    const dragon = {
        name: '小龙',
        avatar: { form: 'dragon', style: 0, chosen: true },
        view: { fp: false, chosen: true },
        grow: { days: 9, last: todayStr(), stage: 2, seen: 2, events: [] },
        egg: { hatched: true, laid: null, born: todayStr() }
    };
    const farm = { day: 3, harvest: 0, cells: {}, lastDate: todayStr() };
    return 'localStorage.setItem("ct2_dragon", ' + JSON.stringify(JSON.stringify(dragon)) + ');' +
           'localStorage.setItem("ct2_farm", ' + JSON.stringify(JSON.stringify(farm)) + ');';
}

async function main() {
    const chromePath = CHROME_CANDIDATES.find(p => fs.existsSync(p));
    if (!chromePath) { console.log(' FAIL: 找不到可用的 Chromium'); process.exit(1); }
    const PORT = 9700 + Math.floor(Math.random() * 250);
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

        /* ---------- 开局：种子存档 → 进世界 ---------- */
        const s = await send('Page.addScriptToEvaluateOnNewDocument', { source: seedScript() });
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
        check('进世界：玩家态、上下文键系统在位', entered && await ev("!!window.__ctxKey"));
        /* 更新日志会随版本指针 fetch 迟到弹出（logMask），而 CtxKey 门控含
           日志——不关稳它，后面每一步都会被 blocked 挡住（实测踩过）。 */
        for (let i = 0; i < 25; i++) {
            const lo = await ev("(typeof logOpen !== 'undefined' && logOpen)");
            if (!lo) break;
            await ev("(function(){ var b = document.getElementById('logOk'); if (b) b.click();" +
                     " if (typeof closeLog === 'function') closeLog(); return 1; })()");
            await sleep(400);
        }
        await sleep(800);   // 给迟到弹窗留出现形时间，再确认一次
        const logStill = await ev("(typeof logOpen !== 'undefined' && logOpen)");
        if (logStill) {
            await ev("(function(){ var b = document.getElementById('logOk'); if (b) b.click();" +
                     " if (typeof closeLog === 'function') closeLog(); return 1; })()");
            await sleep(400);
        }
        check('进世界后更新日志已关稳（门控前提）', !(await ev("(typeof logOpen !== 'undefined' && logOpen)")));

        const tp = (x, z) => ev("(function(){ dragonAgent.group.position.set(" + x + ", terrainH(" + x + "," + z + "), " + z + "); __ctxKey.pump(); return 1; })()");
        const snap = () => ev("__ctxKey.snap()");
        const btnShown = () => ev("(function(){ var b = document.getElementById('ctxBtn'); return !!b && b.style.display !== 'none'; })()");

        /* ---------- ① 荒野：无目标 ---------- */
        await tp(120, -120);
        let sn = await snap();
        check('① 荒野无目标：键不浮出', !sn.cur && !(await btnShown()), JSON.stringify(sn));

        /* ---------- ② 门：E 键敲门 ---------- */
        const door = await ev("(function(){ var v = new THREE.Vector3(); doorMesh.getWorldPosition(v); return {x:v.x, z:v.z}; })()");
        await ev("setDoor(false, true)");
        await tp(door.x, door.z);
        sn = await snap();
        check('② 门前浮键：id=door、文案「🚪 敲敲门」', !!sn.cur && sn.cur.id === 'door' && sn.cur.label === '🚪 敲敲门', JSON.stringify(sn.cur));
        check('② 键钮可见且文案一致', await btnShown() && (await ev("document.querySelector('#ctxBtn .ctxTxt').textContent")) === '🚪 敲敲门');
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'e', code: 'KeyE' });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'e', code: 'KeyE' });
        await sleep(150);
        check('② 按 E ＝敲门：门已开（setDoor 同路径）', await ev("doorOpen === true"));
        await ev("__ctxKey.pump()");
        sn = await snap();
        check('② 门开后标签变「🚪 进屋看看」', !!sn.cur && sn.cur.label === '🚪 进屋看看', JSON.stringify(sn.cur));
        await ev("setDoor(false, true)");

        /* ---------- ③ 篝火：点键钮点燃 ---------- */
        const fire = await ev("(function(){ return {x:campfire.position.x, z:campfire.position.z, on:fireOn}; })()");
        await tp(fire.x, fire.z);
        sn = await snap();
        check('③ 篝火前浮键：id=fire', !!sn.cur && sn.cur.id === 'fire', JSON.stringify(sn.cur));
        await ev("document.getElementById('ctxBtn').click()");
        await sleep(150);
        check('③ 点键钮＝点篝火：fireOn 已翻转（setFire 同路径）', (await ev("fireOn")) === !fire.on);
        await ev("setFire(false)");

        /* ---------- ④ 农田：浇水 / 播种 / 收获 ---------- */
        const cell = await ev("(function(){ var c = farmGrid.find(function(k){ return k.playable; }); return c ? {x:c.x, z:c.z, key:c.row + ',' + c.col} : null; })()");
        check('④ 找到可玩地块', !!cell);
        if (cell) {
            await ev("(function(){ farmState.cells['" + cell.key + "'] = {crop:'corn', watered:false, mature:false}; saveFarm(); renderPlayCrops(); return 1; })()");
            await tp(cell.x, cell.z);
            sn = await snap();
            check('④ 干地块前浮键：「💧 给这块地浇水」', !!sn.cur && sn.cur.id === 'farm' && sn.cur.label === '💧 给这块地浇水', JSON.stringify(sn.cur));
            await ev("__ctxKey.fire()");
            check('④ 触发后地块已浇水（onFarmCellTap 同结果）', await ev("farmState.cells['" + cell.key + "'].watered === true"));
            // 熟地：收获
            await ev("(function(){ farmState.cells['" + cell.key + "'].mature = true; saveFarm(); renderPlayCrops(); return 1; })()");
            const hv0 = await ev("farmState.harvest");
            await ev("__ctxKey.pump()");
            sn = await snap();
            check('④ 熟地块前浮键：收获文案', !!sn.cur && sn.cur.id === 'farm' && sn.cur.label.indexOf('收获') >= 0, JSON.stringify(sn.cur));
            await ev("__ctxKey.fire()");
            check('④ 触发后已收获：地块清空、计数 +1', await ev("!farmState.cells['" + cell.key + "'] && farmState.harvest === " + (hv0 + 1)));
            // 空地：播种
            await ev("__ctxKey.pump()");
            sn = await snap();
            check('④ 空地前浮键：「🌱 在这块地播种」', !!sn.cur && sn.cur.label === '🌱 在这块地播种', JSON.stringify(sn.cur));
            await ev("__ctxKey.fire()");
            check('④ 触发后已播种', await ev("!!(farmState.cells['" + cell.key + "'] && farmState.cells['" + cell.key + "'].crop)"));
        }

        /* ---------- ⑤ 寻宝：拾起 ---------- */
        const item = await ev("(function(){ var best = null, bd = -1;" +
            " huntItems.forEach(function(it){ if (!it.visible || it.userData.done) return;" +
            "   var md = 1e9; standeeList.forEach(function(m){ md = Math.min(md, Math.hypot(it.position.x - m.position.x, it.position.z - m.position.z)); });" +
            "   if (md > bd) { bd = md; best = it; } });" +
            " return best ? {x:best.position.x, z:best.position.z, id:best.userData.huntId, name:best.userData.huntName} : null; })()");
        check('⑤ 找到未拾宝物', !!item, JSON.stringify(item));
        if (item) {
            await tp(item.x, item.z);
            sn = await snap();
            check('⑤ 宝物前浮键：hunt 类、拾起文案', !!sn.cur && sn.cur.id === 'hunt:' + item.id && sn.cur.label === '✨ 拾起' + item.name, JSON.stringify(sn.cur));
            await ev("__ctxKey.fire()");
            check('⑤ 触发后已拾起（collectHuntItem 同结果）', await ev("huntState.found.indexOf('" + item.id + "') >= 0"));
        }

        /* ---------- ⑥ 走开即隐 ---------- */
        await tp(120, -120);
        sn = await snap();
        check('⑥ 离开目标：键收起', !sn.cur && !(await btnShown()));

        /* ---------- ⑦ 面板打开即隐 ---------- */
        await tp(door.x, door.z);
        sn = await snap();
        const hadDoor = !!sn.cur;
        await ev("document.getElementById('modPanel').classList.add('on'); __ctxKey.pump();");
        sn = await snap();
        check('⑦ 面板打开：键隐藏', hadDoor && !sn.cur && !(await btnShown()), JSON.stringify(sn));
        await ev("document.getElementById('modPanel').classList.remove('on'); __ctxKey.pump();");
        sn = await snap();
        check('⑦ 面板关闭：键恢复', !!sn.cur && sn.cur.id === 'door');

        /* ---------- ⑧ 拍照模式即隐 ---------- */
        await ev("document.getElementById('app').classList.add('photo-on'); __ctxKey.pump();");
        sn = await snap();
        check('⑧ 拍照模式：键隐藏（blocked）', !sn.cur && sn.blocked === true, JSON.stringify(sn));
        await ev("document.getElementById('app').classList.remove('photo-on'); __ctxKey.pump();");

        /* ---------- ⑨ FEAT 关 ---------- */
        await ev("toggleFeat('skillContext', false); __ctxKey.pump();");
        sn = await snap();
        check('⑨ FEAT.skillContext 关：键隐藏且 snap.on=false', !sn.cur && sn.on === false && !(await btnShown()), JSON.stringify(sn));
        await ev("toggleFeat('skillContext', true)");

        console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
        done(failed ? 1 : 0);
    } catch (e) {
        console.log(' FAIL: 异常 ' + (e && e.message));
        done(1);
    }
}
main();
