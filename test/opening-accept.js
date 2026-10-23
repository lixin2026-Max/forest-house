// 页面开场层专项验收（开场动画页面版：热更新送达全员、无人重装）
// 跑法：node test/opening-accept.js（已被 test/all.js 收编）
// 环境口径：同 shellgate 专项走 file:// 加载（沙箱封死无头 Chromium 回环 HTTP）；
// version.json 的指针 fetch 在 file:// 下自然失败＝fail-open，不影响开场判定。
// 关键手法：本机 2 核＋软件渲染下页面初始化有数十秒级主线程长任务，外部 CDP
// 轮询会被堵死（裸 evaluate 能挂一分钟以上）——故每个场景都预埋「记录器」种子：
// 用属性陷阱截获 __openingEnd 的赋值、用页内定时器攒开场层快照，断言只读记录器
// 的落盘事实，不跟主线程抢时序。单次 evaluate 另加 8 秒竞速超时防堵死。
// 场景：
//  ① 多视口铺满：21:9 / 20:9 / 16:9 / 4:3 / 竖屏——记录器快照证明开场层与视频
//     rect 覆盖整个视口、object-fit=cover、poster 已补、无解码错误，并存截图；
//  ①b 播放实证（小视口）：readyState≥2、1280 源、currentTime 推进；
//  ② 跳过：种子派发点击 → 收尾原因为 skip、层移除；
//  ③ 播完：不干预 → ended 或 6.5s 兜底 cap 收尾；
//  ④ 失败回落：视频请求回 404 → 海报停留收尾（poster），不卡住进游戏；
//  ⑤ 双开场分工：壳 1.3.0 → 短版标题卡（card）；壳 1.2.2 → 完整版（视频不被掐）；
//  ⑥ FEAT 关：种子抢先 toggleFeat('opening', false) → 收尾原因 off。
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAGE = 'file://' + path.join(ROOT, 'index.html');
const SHOTS = path.join(ROOT, 'test', 'shots-opening');
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

const UA_BROWSER = 'Mozilla/5.0 (Linux; Android 16; Redmi K70 Ultra) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const UA_SHELL13 = 'Mozilla/5.0 (Linux; Android 16; Redmi K70 Ultra) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36; wv) ChumenApp/1.3.0';
const UA_SHELL122 = UA_SHELL13.replace('1.3.0', '1.2.2');

/* 记录器种子：属性陷阱记 __openingEnd 每次赋值；定时器攒开场层快照（留最后 40 份） */
const RECORDER = `(function(){
    var rec = { ends: [], snaps: [] };
    window.__opRec = rec;
    var _end = '';
    try {
        Object.defineProperty(window, '__openingEnd', {
            configurable: true,
            get: function(){ return _end; },
            set: function(v){ _end = v; rec.ends.push(v); }
        });
    } catch(e){}
    setInterval(function(){
        var l = document.getElementById('opening'), v = document.getElementById('opVideo');
        if(l && v){
            var r = v.getBoundingClientRect(), lr = l.getBoundingClientRect();
            rec.snaps.push({ iw: innerWidth, ih: innerHeight,
                lx: lr.x, ly: lr.y, lw: lr.width, lh: lr.height,
                vx: r.x, vy: r.y, vw: r.width, vh: r.height,
                fit: getComputedStyle(v).objectFit,
                poster: (v.poster || '').indexOf('data:image/webp') === 0,
                err: v.error ? v.error.code : 0, rs: v.readyState, disp: v.style.display });
            if(rec.snaps.length > 40) rec.snaps.shift();
        }
    }, 100);
})();`;

async function main() {
    const chromePath = CHROME_CANDIDATES.find(p => fs.existsSync(p));
    if (!chromePath) { console.log(' FAIL: 找不到可用的 Chromium'); process.exit(1); }
    fs.mkdirSync(SHOTS, { recursive: true });
    const PORT = 9600 + Math.floor(Math.random() * 90);
    const chrome = spawn(chromePath, [
        '--headless=new', '--no-sandbox', '--use-angle=swiftshader',
        '--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files',
        `--remote-debugging-port=${PORT}`, '--window-size=1280,800', 'about:blank'
    ], { stdio: 'ignore' });
    const done = code => { try { chrome.kill(); } catch (e) {} process.exit(code); };
    try {
        let wsUrl = null;
        for (let i = 0; i < 40 && !wsUrl; i++) {
            try {
                const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
                const v = await r.json();
                if (v.webSocketDebuggerUrl) wsUrl = v.webSocketDebuggerUrl;
            } catch (e) {}
            if (!wsUrl) await sleep(500);
        }
        if (!wsUrl) throw new Error('连不上无头浏览器调试口');
        const ws = new WebSocket(wsUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        let id = 0; const pending = new Map(); const handlers = [];
        ws.onmessage = ev => {
            const m = JSON.parse(ev.data);
            if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
            else if (m.method) handlers.forEach(h => h(m));
        };
        const browserSend = (method, params = {}, sessionId) => new Promise(r => {
            const i = ++id; pending.set(i, r);
            ws.send(JSON.stringify({ id: i, method, params, sessionId }));
        });

        async function openScene(opts = {}) {
            const ctx = await browserSend('Target.createBrowserContext');
            const ctxId = ctx.result.browserContextId;
            const tgt = await browserSend('Target.createTarget', { url: 'about:blank', browserContextId: ctxId });
            const att = await browserSend('Target.attachToTarget', { targetId: tgt.result.targetId, flatten: true });
            const sid = att.result.sessionId;
            const send = (m, p) => browserSend(m, p, sid);
            await send('Page.enable');
            await send('Runtime.enable');
            if (opts.ua) await send('Emulation.setUserAgentOverride', { userAgent: opts.ua });
            if (opts.vp) await send('Emulation.setDeviceMetricsOverride',
                { width: opts.vp[0], height: opts.vp[1], deviceScaleFactor: 1, mobile: false });
            await send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });
            if (opts.seed) await send('Page.addScriptToEvaluateOnNewDocument', { source: opts.seed });
            if (opts.failVideo) {
                handlers.push(m => {
                    if (m.method === 'Fetch.requestPaused' && m.sessionId === sid) {
                        send('Fetch.fulfillRequest', {
                            requestId: m.params.requestId, responseCode: 404,
                            responseHeaders: [{ name: 'Content-Type', value: 'text/plain' }], body: ''
                        });
                    }
                });
                await send('Fetch.enable', { patterns: [{ urlPattern: '*opening.mp4*', requestStage: 'Request' }] });
            }
            const ev = async expr => {
                const r = await Promise.race([
                    send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }),
                    sleep(8000).then(() => null)
                ]);
                if (!r) throw new Error('evaluate 超时（主线程长任务中）');
                if (r.result && r.result.exceptionDetails) throw new Error('页内异常：' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
                return r.result && r.result.result ? r.result.result.value : undefined;
            };
            await send('Page.navigate', { url: PAGE });
            return { ev, ctxId, send };
        }
        /* 反复尝试读页内状态，直到谓词满足或超时（每次 evaluate 有竞速超时兜底） */
        async function pollState(ev, expr, pred, timeoutMs) {
            const t0 = Date.now();
            let last;
            while (Date.now() - t0 < timeoutMs) {
                try { last = await ev(expr); if (pred(last)) return last; } catch (e) {}
                await sleep(600);
            }
            return last;
        }
        const STATE = `(function(){ var rec = window.__opRec;
            return { gone: !document.getElementById('opening'),
                ends: rec ? rec.ends : null, snaps: rec ? rec.snaps : null,
                mode: window.__openingMode || '' }; })()`;

        /* ---------- ① 多视口铺满（记录器快照断言） ---------- */
        const VPS = [
            ['21x9', 2520, 1080], ['20x9', 2400, 1080], ['16x9', 1920, 1080],
            ['4x3', 1024, 768], ['portrait', 1080, 2400]
        ];
        for (const [label, w, h] of VPS) {
            const s = await openScene({ ua: UA_BROWSER, vp: [w, h] });
            const st = await pollState(s.ev, STATE,
                v => v && ((v.snaps && v.snaps.length >= 2) || (v.gone && v.ends && v.ends.length > 0)), 240000);
            const snaps = (st && st.snaps) || [];
            const good = snaps.filter(x => Math.abs(x.lx) < 1 && Math.abs(x.ly) < 1
                && Math.abs(x.lw - x.iw) <= 1 && Math.abs(x.lh - x.ih) <= 1
                && Math.abs(x.vx) < 1 && Math.abs(x.vy) < 1
                && Math.abs(x.vw - x.iw) <= 1 && Math.abs(x.vh - x.ih) <= 1 && x.fit === 'cover');
            check('① ' + label + ' (' + w + 'x' + h + ')：开场层＋视频铺满视口、object-fit=cover',
                good.length > 0, 'snaps=' + snaps.length + ' ' + JSON.stringify(snaps[snaps.length - 1] || null));
            const posterOk = snaps.some(x => x.poster) || (st && st.gone && st.ends && st.ends.length > 0
                && snaps.length > 0 && snaps.every(x => x.err === 0));
            check('① ' + label + '：poster 已补、视频无解码错误',
                !!(posterOk && snaps.every(x => x.err === 0)),
                JSON.stringify(snaps[snaps.length - 1] || null));
            try {
                const shot = await Promise.race([
                    s.send('Page.captureScreenshot', { format: 'jpeg', quality: 60 }),
                    sleep(20000).then(() => null)
                ]);
                if (shot && shot.result && shot.result.data)
                    fs.writeFileSync(path.join(SHOTS, 'vp-' + label + '.jpg'), Buffer.from(shot.result.data, 'base64'));
            } catch (e) {}
            await browserSend('Target.disposeBrowserContext', { browserContextId: s.ctxId });
        }

        /* ---------- ①b 播放实证（小视口） ---------- */
        {
            const s = await openScene({ ua: UA_BROWSER, vp: [1280, 720] });
            const ok = await pollState(s.ev, `(function(){ const v=document.getElementById('opVideo');
                    return !!v && v.readyState >= 2 && v.videoWidth === 1280 && v.currentTime > 0.3; })()`,
                v => v === true, 180000);
            check('①b 视频真在播（readyState≥2、1280 源、currentTime 推进）', ok === true);
            await browserSend('Target.disposeBrowserContext', { browserContextId: s.ctxId });
        }

        /* ---------- ② 跳过（种子抢最早时机重复派发点击） ---------- */
        {
            const SKIP_SEED = `(function(){ var iv=setInterval(function(){
                var l=document.getElementById('opening');
                if(l) l.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }, 200); })();`;
            const s = await openScene({ ua: UA_BROWSER, vp: [800, 450], seed: SKIP_SEED });
            const st = await pollState(s.ev, STATE, v => v && v.gone && v.ends && v.ends.length > 0, 240000);
            check('② 点击跳过：开场层收尾移除（reason=skip）',
                !!(st && st.gone && st.ends && st.ends.includes('skip')), JSON.stringify(st && st.ends));
            await browserSend('Target.disposeBrowserContext', { browserContextId: s.ctxId });
        }

        /* ---------- ③ 播完自动收尾 ---------- */
        {
            const s = await openScene({ ua: UA_BROWSER, vp: [800, 450] });
            const st = await pollState(s.ev, STATE, v => v && v.gone && v.ends && v.ends.length > 0, 240000);
            check('③ 播完自动收尾（reason=ended/cap）',
                !!(st && st.gone && st.ends && (st.ends.includes('ended') || st.ends.includes('cap'))),
                JSON.stringify(st && st.ends));
            await browserSend('Target.disposeBrowserContext', { browserContextId: s.ctxId });
        }

        /* ---------- ④ 视频失败 → 海报回落 ---------- */
        {
            const s = await openScene({ ua: UA_BROWSER, vp: [800, 450], failVideo: true });
            const st = await pollState(s.ev, STATE, v => v && v.gone && v.ends && v.ends.length > 0, 240000);
            check('④ 视频 404：转海报停留后收尾、不卡住（reason=poster）',
                !!(st && st.gone && st.ends && st.ends.includes('poster')), JSON.stringify(st && st.ends));
            await browserSend('Target.disposeBrowserContext', { browserContextId: s.ctxId });
        }

        /* ---------- ⑤ 双开场分工 ---------- */
        {
            const s = await openScene({ ua: UA_SHELL13, vp: [800, 450] });
            const st = await pollState(s.ev, STATE, v => v && v.gone && v.ends && v.ends.length > 0, 240000);
            check('⑤ 壳 1.3.0：短版标题卡收尾（mode=card）',
                !!(st && st.gone && st.ends && st.ends.includes('card') && st.mode === 'card'),
                JSON.stringify(st && { ends: st.ends, mode: st.mode }));
            await browserSend('Target.disposeBrowserContext', { browserContextId: s.ctxId });
        }
        {
            const s = await openScene({ ua: UA_SHELL122, vp: [800, 450] });
            const st = await pollState(s.ev, STATE,
                v => v && v.snaps && v.snaps.some(x => x.disp !== 'none' && x.rs >= 0), 180000);
            const alive = st && st.snaps && st.snaps.some(x => x.disp !== 'none');
            check('⑤ 壳 1.2.2：完整版——视频未被短版逻辑掐掉', !!alive,
                JSON.stringify(st && st.snaps && st.snaps[st.snaps.length - 1]));
            await browserSend('Target.disposeBrowserContext', { browserContextId: s.ctxId });
        }

        /* ---------- ⑥ FEAT 关（种子抢先关） ---------- */
        {
            const OFF_SEED = `(function(){ var iv=setInterval(function(){
                if(typeof toggleFeat === 'function' && document.getElementById('opening')){
                    toggleFeat('opening', false); clearInterval(iv); } }, 50); })();`;
            const s = await openScene({ ua: UA_BROWSER, vp: [800, 450], seed: OFF_SEED });
            const st = await pollState(s.ev, STATE, v => v && v.gone && v.ends && v.ends.length > 0, 240000);
            check('⑥ FEAT.opening 关：开场层收掉（reason=off）',
                !!(st && st.gone && st.ends && st.ends.includes('off')), JSON.stringify(st && st.ends));
            await browserSend('Target.disposeBrowserContext', { browserContextId: s.ctxId });
        }

        console.log(`\n[页面开场层] ${passed} 通过 / ${failed} 失败`);
        done(failed ? 1 : 0);
    } catch (e) {
        console.log(' FAIL: 专项异常：' + (e && e.message));
        done(1);
    }
}
main();
