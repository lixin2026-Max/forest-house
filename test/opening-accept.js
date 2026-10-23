// 页面开场层专项验收（开场动画页面版：热更新送达全员、无人重装）
// 跑法：node test/opening-accept.js（已被 test/all.js 收编）
// 环境口径：同 shellgate 专项走 file:// 加载（沙箱封死无头 Chromium 回环 HTTP）；
// version.json 的指针 fetch 在 file:// 下自然失败＝fail-open，不影响开场判定。
// 场景：
//  ① 多视口铺满：21:9 / 20:9 / 16:9 / 4:3 / 竖屏 20:9——开场层与视频 rect 覆盖
//     整个视口、object-fit=cover、视频真在播（readyState/currentTime），并存截图；
//  ② 跳过：点开场层 → 立即收尾（__openingEnd='skip'、层移除）；
//  ③ 播完：不干预 → 视频播完自动收尾（'ended' 或 6.5s 兜底 'cap'）；
//  ④ 失败回落：视频请求回 404 → 转海报停留再收尾（'poster'），不卡住进游戏；
//  ⑤ 双开场分工：壳 1.3.0 → 短版标题卡（'card'、视频不播、1.5 秒收）；
//     壳 1.2.2 → 完整版（视频在播、非 card）；
//  ⑥ FEAT 关：toggleFeat('opening', false) → 开场层立即收掉（'off'）。
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
            if (opts.seed) await send('Page.addScriptToEvaluateOnNewDocument', { source: opts.seed });
            if (opts.vp) await send('Emulation.setDeviceMetricsOverride',
                { width: opts.vp[0], height: opts.vp[1], deviceScaleFactor: 1, mobile: false });
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
                const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
                if (r.result && r.result.exceptionDetails) throw new Error('页内异常：' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
                return r.result && r.result.result ? r.result.result.value : undefined;
            };
            await send('Page.navigate', { url: PAGE });
            return { ev, ctxId, send };
        }
        async function waitFor(ev, expr, timeoutMs) {
            const t0 = Date.now();
            while (Date.now() - t0 < timeoutMs) {
                try { if (await ev(expr)) return true; } catch (e) {}
                await sleep(350);
            }
            return false;
        }
        const GONE = `!document.getElementById('opening')`;

        /* ---------- ① 多视口铺满 ---------- */
        const VPS = [
            ['21x9', 2520, 1080], ['20x9', 2400, 1080], ['16x9', 1920, 1080],
            ['4x3', 1024, 768], ['portrait', 1080, 2400]
        ];
        for (const [label, w, h] of VPS) {
            const s = await openScene({ ua: UA_BROWSER, vp: [w, h] });
            await sleep(1500);
            const info = await s.ev(`(function(){
                const layer = document.getElementById('opening'), v = document.getElementById('opVideo');
                if(!layer || !v) return { miss: true };
                const lr = layer.getBoundingClientRect(), vr = v.getBoundingClientRect();
                return { iw: innerWidth, ih: innerHeight,
                    lx: lr.x, ly: lr.y, lw: lr.width, lh: lr.height,
                    vx: vr.x, vy: vr.y, vw: vr.width, vh: vr.height,
                    fit: getComputedStyle(v).objectFit, rs: v.readyState,
                    err: v.error ? v.error.code : 0,
                    poster: (v.poster || '').indexOf('data:image/webp') === 0 };
            })()`);
            const cover = info && !info.miss
                && Math.abs(info.lx) < 1 && Math.abs(info.ly) < 1
                && Math.abs(info.lw - info.iw) <= 1 && Math.abs(info.lh - info.ih) <= 1
                && Math.abs(info.vx) < 1 && Math.abs(info.vy) < 1
                && Math.abs(info.vw - info.iw) <= 1 && Math.abs(info.vh - info.ih) <= 1;
            check('① ' + label + ' (' + w + 'x' + h + ')：开场层＋视频铺满视口、object-fit=cover',
                !!(cover && info.fit === 'cover'), JSON.stringify(info));
            check('① ' + label + '：poster 已补、视频无解码错误',
                !!(info.poster && info.err === 0), JSON.stringify(info));
            const shot = await s.send('Page.captureScreenshot', { format: 'jpeg', quality: 60 });
            if (shot.result && shot.result.data)
                fs.writeFileSync(path.join(SHOTS, 'vp-' + label + '.jpg'), Buffer.from(shot.result.data, 'base64'));
            await browserSend('Target.disposeBrowserContext', { browserContextId: s.ctxId });
        }

        /* ---------- ①b 播放实证（小视口，避开大屏软件渲染饥饿） ---------- */
        {
            const s = await openScene({ ua: UA_BROWSER, vp: [1280, 720] });
            const playing = await waitFor(s.ev, `(function(){ const v=document.getElementById('opVideo');
                return !!v && v.readyState >= 2 && v.videoWidth === 1280 && v.currentTime > 0.3; })()`, 45000);
            check('①b 视频真在播（readyState≥2、1280 源、currentTime 推进）', playing);
            await browserSend('Target.disposeBrowserContext', { browserContextId: s.ctxId });
        }

        /* ---------- ② 跳过（页内种子抢最早时机派发点击，避开主线程饥饿竞态） ---------- */
        {
            const SKIP_SEED = `(function(){ var n=0; var iv=setInterval(function(){
                var l=document.getElementById('opening');
                if(l) l.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                if(++n>300) clearInterval(iv); }, 200); })();`;
            const s = await openScene({ ua: UA_BROWSER, vp: [800, 450], seed: SKIP_SEED });
            const gone = await waitFor(s.ev, GONE, 60000);
            const end = await s.ev(`window.__openingEnd || ''`);
            check('② 点击跳过：开场层立即收尾移除（reason=skip）', gone && end === 'skip', 'end=' + end);
            await browserSend('Target.disposeBrowserContext', { browserContextId: s.ctxId });
        }

        /* ---------- ③ 播完自动收尾 ---------- */
        {
            const s = await openScene({ ua: UA_BROWSER, vp: [800, 450] });
            const gone = await waitFor(s.ev, GONE, 90000);
            const end = await s.ev(`window.__openingEnd || ''`);
            check('③ 播完自动收尾（reason=ended/cap）', gone && (end === 'ended' || end === 'cap'), 'end=' + end);
            await browserSend('Target.disposeBrowserContext', { browserContextId: s.ctxId });
        }

        /* ---------- ④ 视频失败 → 海报回落 ---------- */
        {
            const s = await openScene({ ua: UA_BROWSER, vp: [800, 450], failVideo: true });
            const gone = await waitFor(s.ev, GONE, 40000);
            const end = await s.ev(`window.__openingEnd || ''`);
            check('④ 视频 404：转海报停留后收尾、不卡住（reason=poster）', gone && end === 'poster', 'end=' + end);
            await browserSend('Target.disposeBrowserContext', { browserContextId: s.ctxId });
        }

        /* ---------- ⑤ 双开场分工 ---------- */
        {
            const s = await openScene({ ua: UA_SHELL13, vp: [800, 450] });
            const gone = await waitFor(s.ev, GONE, 60000);
            const end = await s.ev(`window.__openingEnd || ''`);
            const mode = await s.ev(`window.__openingMode || ''`);
            check('⑤ 壳 1.3.0：短版标题卡 1.5 秒收尾（mode=card）', gone && end === 'card' && mode === 'card',
                'end=' + end + ' mode=' + mode);
            await browserSend('Target.disposeBrowserContext', { browserContextId: s.ctxId });
        }
        {
            const s = await openScene({ ua: UA_SHELL122, vp: [800, 450] });
            await sleep(1200);
            const info = await s.ev(`(function(){ const v = document.getElementById('opVideo');
                return { layer: !!document.getElementById('opening'),
                         disp: v ? v.style.display : 'gone', rs: v ? v.readyState : -1 }; })()`);
            check('⑤ 壳 1.2.2：完整版——视频未被短版逻辑掐掉', !!(info.layer && info.disp !== 'none' && info.rs >= 0),
                JSON.stringify(info));
            await s.ev(`(function(){ const l = document.getElementById('opening');
                if(l) l.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return true; })()`);
            await browserSend('Target.disposeBrowserContext', { browserContextId: s.ctxId });
        }

        /* ---------- ⑥ FEAT 关（种子抢在 6.5s 兜底前关，避开竞态） ---------- */
        {
            const OFF_SEED = `(function(){ var n=0; var iv=setInterval(function(){
                if(typeof toggleFeat === 'function' && document.getElementById('opening')){
                    toggleFeat('opening', false); clearInterval(iv); }
                if(++n>240) clearInterval(iv); }, 50); })();`;
            const s = await openScene({ ua: UA_BROWSER, vp: [800, 450], seed: OFF_SEED });
            const gone = await waitFor(s.ev, GONE, 60000);
            const end = await s.ev(`window.__openingEnd || ''`);
            check('⑥ FEAT.opening 关：开场层立即收掉（reason=off）', gone && end === 'off', 'end=' + end);
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
