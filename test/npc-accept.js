// 活世界一期 · NPC 村民作息专项验收（Issue #112）
// 跑法：node test/npc-accept.js（已被 test/all.js 收编）
// 无头实测：①名册/锚点/路线逐点可走且不穿屋身 ②逐时段断言每位 NPC 的
// 去向/位置/可见性/自家窗灯 ③玩家在附近时步行到位（不是瞬移）
// ④FEAT 开关关掉全体回默认在家状态、再打开按当前时段落位。
//
// 注：无头 SwiftShader 只有约 1–2 FPS，而主循环 dt 钳在 0.05s，游戏内时间
// 比真实时间慢一到两个数量级——纯等真实秒数会误判。故时段切换后用
// __npc.update(dt) 在页内同步「泵」游戏时间再断言（与真机 60fps 下
// 每帧调用的正是同一个 update，口径一致）。
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

        const snap = () => ev("window.__npc ? __npc.snapshot() : null");
        const setMode = name => ev(`(function(){ const i = weatherModes.indexOf('${name}'); playerTakeover(); setWeather(i); return weatherModes[weatherIndex]; })()`);
        // 在页内同步泵游戏时间，直到 cond（JS 表达式串，用 s 指代 snapshot）成立或泵完
        const pumpUntil = (cond, maxIter) => ev(`(function(){
            let s = null;
            for (let i = 0; i < ${maxIter || 240}; i++) {
                __npc.update(0.15, 1000 + i * 0.15);
                s = __npc.snapshot();
                if (${cond}) return { ok:true, s:s, iters:i };
            }
            return { ok:false, s:s };
        })()`);
        const byId = (s, id) => s.find(n => n.id === id);

        /* ---------- ① 名册与锚点/路线合法性 ---------- */
        const s0 = await snap();
        check('NPC 系统已建：3 位村民在册', Array.isArray(s0) && s0.length === 3, JSON.stringify(s0));
        const routeAudit = await ev(`(function(){
            const bad = [];
            const inCottage = (x, z, m) => NPC_HOMES.some(h => {   // 点到屋身矩形的欧氏距离 < m 即算太近（转角处也按真实距离量）
                const dx = x - h.x, dz = z - h.z;
                const lx = dx * Math.cos(h.yaw) - dz * Math.sin(h.yaw);
                const lz = dx * Math.sin(h.yaw) + dz * Math.cos(h.yaw);
                const ex = Math.max(Math.abs(lx) - 2.3 * h.s, 0), ez = Math.max(Math.abs(lz) - 1.9 * h.s, 0);
                return Math.hypot(ex, ez) < m;
            });
            const probe = (x, z, tag) => {
                if (!WalkMap.isWalkable(x, z)) bad.push(tag + ' 不可走 @' + x.toFixed(1) + ',' + z.toFixed(1));
                if (inCottage(x, z, 0.45)) bad.push(tag + ' 穿屋身 @' + x.toFixed(1) + ',' + z.toFixed(1));
            };
            NPC_ROSTER.forEach(cfg => {
                const home = NPC_HOMES[cfg.home], door = npcDoorAnchor(home), w = NPC_WORKS[cfg.work];
                probe(door.x, door.z, cfg.id + ' 门口');
                probe(w.x, w.z, cfg.id + ' 劳作点');
                const mid = (NPC_ROUTES[cfg.home + '-' + cfg.work] || []);
                const line = [door].concat(mid, [w]);
                for (let i = 0; i < line.length - 1; i++) {
                    const a = line[i], b = line[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / 0.25));
                    for (let k = 0; k <= n; k++) probe(a.x + (b.x - a.x) * k / n, a.z + (b.z - a.z) * k / n, cfg.id + ' 路线');
                }
            });
            return bad.slice(0, 6);
        })()`);
        check('门口/劳作点/全程路线：可走且不穿屋身', Array.isArray(routeAudit) && routeAudit.length === 0, (routeAudit || []).join('；'));

        /* ---------- ② 逐时段断言（玩家在主屋核心区＝远方，切换应瞬移落位） ---------- */
        let r = await pumpUntil("s.every(n => n.at === 'work' && n.visible && n.glow < 0.1)");
        check('☀ 白天：三人都在劳作点、可见、窗灯灭', r.ok, JSON.stringify(r.s));
        {
            const anchors = await ev(`(function(){ const o = {}; __npc.list.forEach(n => { o[n.cfg.id] = __npc.anchorFor(n, 'work'); }); return o; })()`);
            const s = r.s;
            for (const id of ['ahe', 'ashan', 'ayun']) {
                const n = byId(s, id), a = anchors[id];
                check('☀ ' + id + ' 落在劳作点', Math.hypot(n.x - a.x, n.z - a.z) <= 0.7, JSON.stringify(n));
            }
        }

        await setMode('golden');
        r = await ev(`(function(){
            let s = null;
            for (let i = 0; i < 240; i++) {
                __npc.update(0.15, 2000 + i * 0.15);
                s = __npc.snapshot();
                const a = s.find(n => n.id === 'ahe'), b = s.find(n => n.id === 'ashan'), c = s.find(n => n.id === 'ayun');
                if (a.at === 'door' && b.at === 'door' && c.at === 'work') return { ok:true, s:s };
            }
            return { ok:false, s:s };
        })()`);
        check('🌇 傍晚：阿禾/阿山归家门口、阿云还在收衣服', r.ok, JSON.stringify(r.s));
        r = await pumpUntil("s.find(n => n.id === 'ahe').glow > 0.5 && s.find(n => n.id === 'ashan').glow > 0.5 && s.find(n => n.id === 'ayun').glow < 0.1");
        check('🌇 傍晚：归家两户窗灯亮起', r.ok, JSON.stringify(r.s));

        await setMode('night');
        r = await pumpUntil("s.every(n => n.at === 'home' && !n.visible && n.glow < 0.1)");
        check('🌙 夜晚：全体回屋隐身、窗灯全熄', r.ok, JSON.stringify(r.s));

        await setMode('mist');
        r = await pumpUntil("s.find(n => n.id === 'ahe').at === 'door' && s.find(n => n.id === 'ayun').at === 'door' && s.find(n => n.id === 'ashan').at === 'work'");
        check('🌫 清晨：阿禾/阿云在门口、阿山已去柴堆', r.ok, JSON.stringify(r.s));
        r = await pumpUntil("s.find(n => n.id === 'ahe').glow > 0.5 && s.find(n => n.id === 'ayun').glow > 0.5 && s.find(n => n.id === 'ashan').glow < 0.1");
        check('🌫 清晨：在家两户窗灯亮、出门户不亮', r.ok, JSON.stringify(r.s));

        await setMode('rain');
        r = await pumpUntil("s.find(n => n.id === 'ahe').at === 'door' && s.find(n => n.id === 'ashan').at === 'door' && s.find(n => n.id === 'ayun').at === 'home'");
        check('🌧 雨天：阿禾/阿山回门口避雨、阿云回屋', r.ok, JSON.stringify(r.s));
        r = await pumpUntil("s.find(n => n.id === 'ayun').glow > 0.5");
        check('🌧 雨天：阿云在家醒着，窗灯仍亮', r.ok, JSON.stringify(r.s));

        /* ---------- ③ 玩家在附近：必须步行到位 ---------- */
        await setMode('golden');
        r = await pumpUntil("s.find(n => n.id === 'ahe').at === 'door'");
        check('🚶 走路前置：阿禾已回门口', r.ok, JSON.stringify(r.s));
        // 定位玩家→切时段→泵时间，全程在一个同步 evaluate 里完成（不给 rAF 插队挪走化身的机会）。
        // 注：未进入世界时 dragonAgent 尚未生成（安全模式推迟初始化），而 NPC 的 playerFar
        // 只读 dragonAgent.group.position——这里给它一个同形状的替身专测「玩家在附近」分支。
        r = await ev(`(function(){
            dragonAgent = { group: { position: new THREE.Vector3(-58, terrainH(-58, 136), 136) } };
            const dp = dragonAgent.group.position;
            const nearVillage = Math.hypot(dp.x + 58, dp.z - 136) < 3;
            playerTakeover(); setWeather(weatherModes.indexOf('sunny'));
            let sawMoving = false, s = null;
            for (let i = 0; i < 400; i++) {
                __npc.update(0.1, 3000 + i * 0.1);
                s = __npc.snapshot();
                const a = s.find(n => n.id === 'ahe');
                if (a.moving) sawMoving = true;
                if (a.at === 'work' && !a.moving) return { ok:true, sawMoving:sawMoving, nearVillage:nearVillage, s:s };
            }
            return { ok:false, sawMoving:sawMoving, nearVillage:nearVillage, s:s };
        })()`);
        check('🚶 玩家在场：阿禾是走过去的（出现过步行状态）', r.ok && r.sawMoving && r.nearVillage, JSON.stringify(r.s));
        check('🚶 玩家在场：阿禾步行抵达井边劳作点', r.ok, JSON.stringify(r.s && r.s.find(n => n.id === 'ahe')));

        /* ---------- ④ FEAT 开关 ---------- */
        await ev("toggleFeat('npc', false)");
        let s = await snap();
        check('👥 开关关：全体回默认在家状态、窗灯灭',
            s.every(n => n.at === 'home' && !n.visible && n.glow < 0.1), JSON.stringify(s));
        await ev("setWeather(weatherModes.indexOf('golden'), true); toggleFeat('npc', true)");
        s = await snap();
        check('👥 开关开：按当前时段（傍晚）重新落位',
            byId(s, 'ahe').at === 'door' && byId(s, 'ashan').at === 'door' && byId(s, 'ayun').at === 'work', JSON.stringify(s));

        console.log(' NPC 专项验收：' + passed + ' passed, ' + failed + ' failed');
        ws.close();
        done(failed ? 1 : 0);
    } catch (e) {
        console.log(' FAIL: NPC 专项验收执行出错：' + e.message);
        done(1);
    }
}
main();
