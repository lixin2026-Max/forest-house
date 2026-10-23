// 技能期 Build 3 专项验收：治愈技能三件（滑翔／龙息／呼唤）
// 跑法：node test/trio-accept.js（已被 test/all.js 收编）
// 无头实测（四种子存档）：
//  A 本体·青年（stage 2）：三件全解锁；解锁提示排队世界之声；呼唤钮可见；
//    呼唤后小鸟飞来停角（距离单调收敛）；高空自由落体 vs 滑翔下沉对照
//    （钳速＋前飘＋落地自动收翼＋展翼姿态）；龙息四用——蒲公英吹散＋籽絮
//    ＋计时复原、河灯 boost 加速漂远、鱼群错峰跃水、夜里檐灯吹拂；
//    FEAT 关停整件失效；全程零新增存档键。
//  B 本体·少年（stage 1）：呼唤解锁（夜里唤不到＋白天可唤）、滑翔/龙息上锁
//    （空中按跳跃不展翼、无下沉钳制、上下文键无龙息项、直吹返回 false）。
//  C 本体·幼年（stage 0）：三件全锁、呼唤钮不出现。
//  D 少女·青年（stage 2）：同键位——滑翔钳速成立、呼唤成立（角尖契约通用）。
// 注：与 move/context 专项同例——进世界后用 AgentKit.update / 各系统 update
// 在页内同步「泵」时间再断言；蒲公英断言依赖非冬季（蒲公英季节量 >0）。
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
function seedScript(days, form) {
    const dragon = {
        name: '小龙',
        avatar: { form: form || 'dragon', style: 0, chosen: true },
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

        async function bootScenario(days, form) {
            const s = await send('Page.addScriptToEvaluateOnNewDocument', { source: seedScript(days, form) });
            await send('Page.navigate', { url: PAGE });
            let entered = false;
            for (let i = 0; i < 90 && !entered; i++) {
                await sleep(1000);
                try {
                    entered = await ev("(typeof enteredWorld !== 'undefined' && enteredWorld && !!dragonAgent && dragonAgent.mode === 'player' && !!window.__skillTrio)");
                    if (!entered) {
                        await ev("(function(){ var m = document.getElementById('logMask'); var b = document.getElementById('logOk');" +
                                 " if (m && b && (m.classList.contains('on') || m.style.display !== 'none')) b.click();" +
                                 " if (typeof logOpen !== 'undefined' && logOpen && typeof closeLog === 'function') closeLog(); return 1; })()");
                    }
                } catch (e) {}
            }
            if (s.result && s.result.identifier)
                await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: s.result.identifier });
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
        const snap = () => ev("__skillTrio.snap()");
        const tp = (x, z) => ev("(function(){ var p = dragonAgent.group.position; p.set(" + x + ", terrainH(" + x + "," + z + "), " + z + "); " +
            " if (typeof SkillMove !== 'undefined'){ SkillMove.air = false; SkillMove.y = p.y; SkillMove.vy = 0; } " +
            " scene.updateMatrixWorld(true); return 1; })()");   // 无头渲染帧跟不上瞬移：角尖等矩阵读取点手动刷新（实机每帧渲染无此问题）
        /* 每次上下文断言前：关顺延日志（#117 半路弹出会挡门控）＋泵满龙息冷却＋刷矩阵 */
        const prep = () => ev("(function(){ var m = document.getElementById('logMask'); var b = document.getElementById('logOk'); " +
            " if (typeof logOpen !== 'undefined' && logOpen && typeof closeLog === 'function') closeLog(); " +
            " if (m && b && m.classList.contains('on')) b.click(); " +
            " for (var i = 0; i < 30; i++) __skillTrio.pump(0.05); scene.updateMatrixWorld(true); return 1; })()");
        const ctxCur = () => ev("(function(){ __ctxKey.pump(); var s = __ctxKey.snap(); " +
            " return { cur: s.cur, blocked: s.blocked, logOpen: (typeof logOpen !== 'undefined') ? logOpen : null }; })()");
        /* 把化身抬到空中 h 米并可选地展翼，采样 n 帧的下落/漂移 */
        const airSeries = (h, glide) => ev("(function(){ var p = dragonAgent.group.position; " +
            " var g = __skillTrio.snap().ground; SkillMove.air = true; SkillMove.y = g + " + h + "; SkillMove.vy = 0; p.y = SkillMove.y; " +
            (glide ? " window.dispatchEvent(new KeyboardEvent('keydown', {key:' '})); AgentKit.update(0.05, 500); window.dispatchEvent(new KeyboardEvent('keyup', {key:' '})); " : "") +
            " var px = p.x, pz = p.z, py = p.y, minVy = 99, wasGliding = false; " +
            " for (var i = 0; i < 20; i++){ AgentKit.update(0.05, 600 + i * 0.05); var s = __skillTrio.snap(); if (s.vy < minVy) minVy = s.vy; if (s.gliding) wasGliding = true; } " +
            " return { drop: Math.round((py - p.y) * 100) / 100, drift: Math.round(Math.hypot(p.x - px, p.z - pz) * 100) / 100, " +
            " minVy: minVy, wasGliding: wasGliding, air: __skillTrio.snap().air }; })()");

        /* ---------- A：本体·青年 ---------- */
        let ok = await bootScenario(10);
        check('A 进世界：青年形态、玩家态、Build 3 在位', ok);
        if (ok) {
            const keys0 = await ev("Object.keys(localStorage).sort().join(',')");
            await ev("for (var i = 0; i < 10; i++) __skillTrio.pump(0.05);");
            const s0 = await snap();
            check('A 三件全解锁（stage=2）', s0.stage === 2 && s0.canGlide && s0.canBreath && s0.canCall, JSON.stringify(s0));
            check('A 呼唤钮可见（display 非 none）', s0.callBtn === '', JSON.stringify(s0.callBtn));
            /* 解锁提示：多泵一会让 _worldT 过线 */
            const tip = await ev("(function(){ for (var i = 0; i < 70; i++) __skillTrio.pump(0.05); " +
                " var v = __voice.snapshot(); return { tipped: __skillTrio.snap().tipped, pend: v.pending, showing: v.showing }; })()");
            check('A 首次解锁提示三件齐备（tipped）', ['call', 'glide', 'breath'].every(k => tip.tipped.indexOf(k) >= 0), JSON.stringify(tip));
            check('A 解锁提示已排进世界之声（pending 含 dragon 或正在播）', tip.pend.indexOf('dragon') >= 0 || tip.showing, JSON.stringify(tip));

            /* 展翼姿态：同 t 两帧对照（glidePose 1 vs 0 的翼角差） */
            const wing = await ev("(function(){ dragonAgent.glidePose = 1; AgentKit.update(0.05, 777); var zin = dragonAgent.parts.wingL.rotation.z; " +
                " dragonAgent.glidePose = 0; AgentKit.update(0.05, 777); var zout = dragonAgent.parts.wingL.rotation.z; " +
                " return { zin: Math.round(zin * 100) / 100, zout: Math.round(zout * 100) / 100 }; })()");
            check('A 展翼姿态：翼角显著张开（差 > 0.2）', wing.zin < wing.zout - 0.2, JSON.stringify(wing));

            /* 滑翔物理：先挪到开阔草甸上空 */
            await tp(10, 20);
            await ev("DragonCtl.yaw = 0;");
            const free = await airSeries(6, false);
            check('A 自由落体对照：1 秒下落 > 1.2m、无钳制（minVy < -3）', free.drop > 1.2 && free.minVy < -3, JSON.stringify(free));
            const gl = await airSeries(6, true);
            check('A 空中再按跳跃 → 展翼（gliding 出现）', gl.wasGliding === true, JSON.stringify(gl));
            check('A 滑翔下沉被钳（minVy ≥ -0.95）', gl.minVy >= -0.95, JSON.stringify(gl));
            check('A 滑翔下落显著变缓（0.45–1.2m/秒）', gl.drop >= 0.45 && gl.drop <= 1.2, JSON.stringify(gl));
            check('A 滑翔前飘（1 秒漂移 > 1.2m）', gl.drift > 1.2, JSON.stringify(gl));
            /* 落地自动收翼 */
            const land = await ev("(function(){ var n = 0; while (__skillTrio.snap().air && n < 300){ AgentKit.update(0.05, 900 + n * 0.05); n++; } " +
                " for (var i = 0; i < 12; i++) __skillTrio.pump(0.05); var s = __skillTrio.snap(); " +
                " return { air: s.air, gliding: s.gliding, pose: s.glidePose }; })()");
            check('A 落地自动收翼（air/gliding 归零、姿态混合退场）', land.air === false && land.gliding === false && land.pose < 0.25, JSON.stringify(land));

            /* 呼唤：白天唤鸟，距离单调收敛到角上 */
            const call = await ev("(function(){ var gi = CONFIG.daySeq.indexOf('sunny'); if (gi >= 0) GClock.seqAt = gi; " +
                " setWeather(weatherModes.indexOf('sunny')); scene.updateMatrixWorld(true); var r = __skillTrio.call(); " +
                " var seq = [], st = null; for (var i = 0; i < 260; i++){ AgentKit.update(0.05, 2000 + i * 0.05); " +
                "   if (i % 15 === 0){ var s = __skillTrio.snap(); if (s.bird) seq.push(s.bird.d); } " +
                "   var s2 = __skillTrio.snap(); if (s2.bird && s2.bird.state === 'callHorn'){ st = s2.bird; if (i > 30) break; } } " +
                " var mono = true; for (var j = 1; j < seq.length; j++) if (seq[j] > seq[j - 1] + 0.05) mono = false; " +
                " return { ret: r, seq: seq, final: st, mono: mono }; })()");
            check('A 呼唤成功（call() 返回 true）', call.ret === true, JSON.stringify(call));
            check('A 小鸟距离单调收敛', call.mono === true && call.seq.length >= 3 && call.seq[call.seq.length - 1] < call.seq[0] - 1, JSON.stringify(call.seq));
            check('A 小鸟停角（state=callHorn、水平距 < 1.0）', !!call.final && call.final.d < 1.0, JSON.stringify(call.final));
            const stay = await ev("(function(){ for (var i = 0; i < 40; i++) AgentKit.update(0.05, 3000 + i * 0.05); var s = __skillTrio.snap(); return s.bird; })()");
            check('A 停角驻留（2 秒后仍在角上）', !!stay && stay.state === 'callHorn' && stay.d < 1.0, JSON.stringify(stay));

            /* 龙息·蒲公英（季节前提：实例数 >0） */
            const dande = await ev("(function(){ var im = GrassSys._dandeIM; if (!im || !im.count) return { count: 0 }; " +
                " var m = new THREE.Matrix4(), v = new THREE.Vector3(); im.getMatrixAt(0, m); v.setFromMatrixPosition(m); " +
                " return { count: im.count, x: v.x, z: v.z }; })()");
            check('A 蒲公英在场（非冬季实例 >0）', dande.count > 0, JSON.stringify(dande));
            if (dande.count > 0) {
                await tp(dande.x + 0.7, dande.z + 0.7);
                await prep();
                const cur1w = await ctxCur();
                check('A 蒲公英旁上下文键＝龙息', !!cur1w.cur && cur1w.cur.id === 'breath:dande', JSON.stringify(cur1w));
                const blew = await ev("__ctxKey.fire(); (function(){ for (var i = 0; i < 4; i++) __skillTrio.pump(0.05); return __skillTrio.snap(); })()");
                check('A 吹散蒲公英（blown ≥1、籽絮粒子在飞）', blew.blown >= 1 && blew.seedsAlive >= 3, JSON.stringify(blew));
                const regrow = await ev("(function(){ for (var i = 0; i < 32; i++) __skillTrio.pump(1); return __skillTrio.snap().blown; })()");
                check('A 蒲公英计时复原（吹散登记清空）', regrow === 0, 'blown=' + regrow);
            }

            /* 龙息·河灯 */
            const lt = await ev("(function(){ clearLanterns(); spawnLantern('验收灯'); var L = lanterns[lanterns.length - 1]; " +
                " return { x: L.grp.position.x, z: L.grp.position.z }; })()");
            await tp(lt.x, lt.z);
            await prep();
            const cur2w = await ctxCur();
            check('A 河灯旁上下文键＝送河灯', !!cur2w.cur && cur2w.cur.id === 'breath:lantern', JSON.stringify(cur2w));
            const boost = await ev("__ctxKey.fire(); (function(){ var L = lanterns[lanterns.length - 1]; " +
                " var a0 = L.ang, k0 = L.k; for (var i = 0; i < 20; i++) updateLanterns(0.05, 4000 + i * 0.05); " +
                " var s = __skillTrio.snap(); return { boostT: s.lantern ? s.lantern.boostT : -1, boostK: s.lantern ? s.lantern.boostK : -1, " +
                " dAng: Math.round((L.ang - a0) * 100) / 100, dK: Math.round((k0 - L.k) * 1000) / 1000 }; })()");
            check('A 河灯被吹加速（boostT>0、boostK 累积）', boost.boostT > 0 && boost.boostK > 0.03, JSON.stringify(boost));
            check('A 河灯漂远加速（1 秒转角 > 0.15 且 k 降幅 > 0.04）', boost.dAng > 0.15 && boost.dK > 0.04, JSON.stringify(boost));

            /* 龙息·鱼群（先泵够冷却；站到鱼群质心一侧的岸边，落点确定） */
            await ev("clearLanterns(); for (var i = 0; i < 30; i++) __skillTrio.pump(0.05);");
            const shore = await ev("(function(){ var cx = 0, cz = 0; for (var i = 0; i < FishSys.fish.length; i++){ cx += FishSys.fish[i].x; cz += FishSys.fish[i].z; } " +
                " cx /= FishSys.fish.length; cz /= FishSys.fish.length; " +
                " var vx = (cx - LAKE_C.x) / LAKE_RX, vz = (cz - LAKE_C.z) / LAKE_RZ, m = Math.hypot(vx, vz) || 1; " +
                " return { x: LAKE_C.x + vx / m * 1.12 * LAKE_RX, z: LAKE_C.z + vz / m * 1.12 * LAKE_RZ }; })()");
            await tp(shore.x, shore.z);
            await prep();
            const cur3w = await ctxCur();
            check('A 湖岸上下文键＝惊鱼', !!cur3w.cur && cur3w.cur.id === 'breath:fish', JSON.stringify(cur3w));
            const fish = await ev("__ctxKey.fire(); (function(){ for (var i = 0; i < 4; i++) FishSys.update(0.05, 5000 + i * 0.05); " +
                " return __skillTrio.snap().fishLeaps; })()");
            check('A 惊起鱼群（≥3 条跃水/待跃）', fish >= 3, 'leaps=' + fish);

            /* 龙息·檐灯（夜；先泵够冷却） */
            await ev("for (var i = 0; i < 30; i++) __skillTrio.pump(0.05);");
            const lamp = await ev("(function(){ setWeather(weatherModes.indexOf('night'), true); " +
                " for (var i = 0; i < 4; i++) lerpWeather(0.05); " +
                " var v = new THREE.Vector3(); window.__house.userData.lamp.getWorldPosition(v); " +
                " return { x: v.x, z: v.z, inten: Math.round(lampLight.intensity * 100) / 100 }; })()");
            check('A 夜里檐灯点亮（lampLight 强度 > 0.25）', lamp.inten > 0.25, JSON.stringify(lamp));
            await tp(lamp.x, lamp.z);
            await prep();
            const cur4w = await ctxCur();
            check('A 檐灯旁上下文键＝吹檐灯', !!cur4w.cur && cur4w.cur.id === 'breath:lamp', JSON.stringify(cur4w));
            const flick = await ev("__ctxKey.fire(); (function(){ __skillTrio.pump(0.05); return __skillTrio.snap(); })()");
            check('A 吹拂檐灯（flicker 起来、当帧发光被摇曳系数压低）', flick.lampFlick > 0.5 && flick.lampEI < 0.9, JSON.stringify(flick));
            await ev("setWeather(weatherModes.indexOf('sunny'), true);");

            /* FEAT 关停：整件失效；开回来恢复 */
            const off = await ev("(function(){ toggleFeat('skillTrio', false); var s = __skillTrio.snap(); " +
                " var b = __skillTrio.breath('lamp'); toggleFeat('skillTrio', true); var s2 = __skillTrio.snap(); " +
                " return { on: s.on, btn: s.callBtn, breathRet: b, onBack: s2.on }; })()");
            check('A FEAT 关：呼唤钮隐藏、龙息直调返回 false', off.on === false && off.btn === 'none' && off.breathRet === false, JSON.stringify(off));
            check('A FEAT 开回来恢复', off.onBack === true, JSON.stringify(off));

            const keys1 = await ev("Object.keys(localStorage).sort().join(',')");
            check('A 零新增存档键（技能全程未写新键）', keys1 === keys0, 'before=' + keys0 + ' after=' + keys1);
        }

        /* ---------- B：本体·少年 ---------- */
        ok = await bootScenario(5);
        check('B 进世界：少年形态、玩家态', ok);
        if (ok) {
            await ev("for (var i = 0; i < 6; i++) __skillTrio.pump(0.05);");
            const sb = await snap();
            check('B 解锁分工：呼唤开、滑翔/龙息锁', sb.stage === 1 && sb.canCall === true && sb.canGlide === false && sb.canBreath === false, JSON.stringify(sb));
            check('B 呼唤钮可见', sb.callBtn === '', JSON.stringify(sb.callBtn));
            /* 夜里唤不到 */
            const nightCall = await ev("(function(){ var ni = CONFIG.daySeq.indexOf('night'); if (ni < 0) return { skip: true }; " +
                " GClock.seqAt = ni; var r = __skillTrio.call(); var v = __voice.snapshot(); " +
                " var di = CONFIG.daySeq.indexOf('sunny'); GClock.seqAt = di >= 0 ? di : 0; " +
                " return { ret: r, pend: v.pending }; })()");
            if (!nightCall.skip)
                check('B 夜里呼唤失败＋世界之声轻提示排队', nightCall.ret === false && nightCall.pend.indexOf('dragon') >= 0, JSON.stringify(nightCall));
            /* 白天可唤 */
            const dayCall = await ev("(function(){ setWeather(weatherModes.indexOf('sunny')); scene.updateMatrixWorld(true); var r = __skillTrio.call(); " +
                " for (var i = 0; i < 20; i++) AgentKit.update(0.05, 6000 + i * 0.05); var s = __skillTrio.snap(); " +
                " return { ret: r, bird: s.bird }; })()");
            check('B 白天呼唤成功（鸟起飞赶来）', dayCall.ret === true && !!dayCall.bird && (dayCall.bird.state === 'flyTo' || dayCall.bird.state === 'callHorn'), JSON.stringify(dayCall));
            /* 滑翔锁：空中按跳跃不展翼、无钳制 */
            await tp(10, 20); await ev("DragonCtl.yaw = 0;");
            const lockG = await airSeries(5, true);
            check('B 未解锁滑翔（gliding 不出现、下沉无钳制 minVy < -2）', lockG.wasGliding === false && lockG.minVy < -2, JSON.stringify(lockG));
            await ev("(function(){ var n = 0; while (__skillTrio.snap().air && n < 200){ AgentKit.update(0.05, 7000 + n * 0.05); n++; } return 1; })()");
            /* 龙息锁：蒲公英旁无龙息键、直调 false */
            await prep();
            const lockB = await ev("(function(){ var im = GrassSys._dandeIM; if (!im || !im.count) return { count: 0 }; " +
                " var m = new THREE.Matrix4(), v = new THREE.Vector3(); im.getMatrixAt(0, m); v.setFromMatrixPosition(m); " +
                " var p = dragonAgent.group.position; p.set(v.x + 0.7, terrainH(v.x + 0.7, v.z + 0.7), v.z + 0.7); " +
                " __ctxKey.pump(); var cur = __ctxKey.snap().cur; var r = __skillTrio.breath('dande'); " +
                " return { count: im.count, cur: cur, ret: r, blown: __skillTrio.snap().blown }; })()");
            if (lockB.count > 0)
                check('B 未解锁龙息（上下文无 breath 项、直调 false、零吹散）',
                    (!lockB.cur || lockB.cur.id !== 'breath:dande') && lockB.ret === false && lockB.blown === 0, JSON.stringify(lockB));
        }

        /* ---------- C：本体·幼年 ---------- */
        ok = await bootScenario(1);
        check('C 进世界：幼年形态、玩家态', ok);
        if (ok) {
            await ev("for (var i = 0; i < 6; i++) __skillTrio.pump(0.05);");
            const sc = await snap();
            check('C 三件全锁（stage=0）', sc.stage === 0 && !sc.canGlide && !sc.canBreath && !sc.canCall, JSON.stringify(sc));
            check('C 呼唤钮不出现', sc.callBtn === 'none', JSON.stringify(sc.callBtn));
            const rc = await ev("__skillTrio.call()");
            check('C 呼唤直调返回 false', rc === false, 'ret=' + rc);
        }

        /* ---------- D：少女·青年 ---------- */
        ok = await bootScenario(10, 'girl');
        check('D 进世界：少女青年形态、玩家态', ok);
        if (ok) {
            await ev("for (var i = 0; i < 6; i++) __skillTrio.pump(0.05);");
            const sd = await snap();
            check('D 少女三件全解锁、呼唤钮可见', sd.canGlide && sd.canBreath && sd.canCall && sd.callBtn === '', JSON.stringify(sd));
            await tp(10, 20); await ev("DragonCtl.yaw = 0;");
            const gd = await airSeries(6, true);
            check('D 少女滑翔（展翼＋下沉钳制）', gd.wasGliding === true && gd.minVy >= -0.95, JSON.stringify(gd));
            await ev("(function(){ var n = 0; while (__skillTrio.snap().air && n < 300){ AgentKit.update(0.05, 8000 + n * 0.05); n++; } return 1; })()");
            const callD = await ev("(function(){ var gi = CONFIG.daySeq.indexOf('sunny'); if (gi >= 0) GClock.seqAt = gi; " +
                " setWeather(weatherModes.indexOf('sunny')); scene.updateMatrixWorld(true); return __skillTrio.call(); })()");
            check('D 少女呼唤成功（角尖契约通用）', callD === true, 'ret=' + callD);
        }

        console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
        done(failed ? 1 : 0);
    } catch (e) {
        console.log(' FAIL: 异常 ' + (e && e.message || e));
        done(1);
    }
}

main();
