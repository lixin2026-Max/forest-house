// 壳版本闸门专项验收（页面侧「退出更新」兜底：1.2.2 壳无自检，页面替它查 minShell）
// 跑法：node test/shellgate-accept.js（已被 test/all.js 收编）
// 环境口径：本机沙箱封死无头 Chromium 的回环 HTTP（实测 127.0.0.1 被 blocked），
// 故同 npc/voice 专项走 file:// 加载页面；version.json 这一次 fetch 用 CDP
// Fetch 域拦截供数——页面侧的真实 fetch/解析/比对代码全程原样执行，只替掉
// 传输层（供的内容就是仓库里待发布的 version.json 原文件）。场景：
//  ① UA 带 ChumenApp/1.2.2 → 必出全屏升级引导、__shellGateBlock 置位、enterWorldNow 被挡；
//  ② UA 带 ChumenApp/1.3.0 → 无引导，老玩家存档点「开始游玩」正常进世界；
//  ③ 无标记浏览器 UA → 无引导，同样正常进世界（绝不误拦浏览器玩家）；
//  ④ version.json 请求失败＋旧壳 UA → fail-open 放行，无引导；
//  ⑤ 无 UA 标记但壳注入 __CHUMEN_APP_VER__=1.2.2 → 兜底信号同样触发引导。
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAGE = 'file://' + path.join(ROOT, 'index.html');
const PTR_JSON = fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8');
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

const UA_OLD = 'Mozilla/5.0 (Linux; Android 16; Redmi K70 Ultra) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36; wv) ChumenApp/1.2.2';
const UA_NEW = UA_OLD.replace('1.2.2', '1.3.0');
const UA_BROWSER = 'Mozilla/5.0 (Linux; Android 16; Redmi K70 Ultra) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const OLD_PLAYER = `(function(){ try { localStorage.setItem('ct2_dragon', JSON.stringify({avatar:{form:'dragon',style:0,chosen:true},view:{fp:false,chosen:true}})); } catch(e){} })();`;

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

        /* 开一个隔离场景（独立浏览器上下文＋标签页） */
        async function openScene(opts) {
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
            handlers.push(m => {
                if (m.method === 'Fetch.requestPaused' && m.sessionId === sid) {
                    if (opts.failPtr) {
                        send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'Failed' });
                    } else {
                        send('Fetch.fulfillRequest', {
                            requestId: m.params.requestId, responseCode: 200,
                            responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
                            body: Buffer.from(PTR_JSON, 'utf8').toString('base64')
                        });
                    }
                }
            });
            await send('Fetch.enable', { patterns: [{ urlPattern: '*version.json*', requestStage: 'Request' }] });
            const ev = async expr => {
                const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
                if (r.result && r.result.exceptionDetails) throw new Error('页内异常：' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
                return r.result && r.result.result ? r.result.result.value : undefined;
            };
            await send('Page.navigate', { url: PAGE });
            return { ev, ctxId };
        }
        async function waitFor(ev, expr, timeoutMs) {
            const t0 = Date.now();
            while (Date.now() - t0 < timeoutMs) {
                try { if (await ev(expr)) return true; } catch (e) {}
                await sleep(400);
            }
            return false;
        }
        const GATE = `!!document.getElementById('shellGate')`;

        /* ---------- ① 旧壳 1.2.2：必拦 ---------- */
        {
            const s = await openScene({ ua: UA_OLD });
            const shown = await waitFor(s.ev, GATE, 12000);
            check('① 旧壳 1.2.2：全屏升级引导出现', shown);
            const info = await s.ev(`(function(){
                const el = document.getElementById('shellGate');
                return { block: window.__shellGateBlock === true,
                         txt: el ? el.textContent : '',
                         vis: el ? (el.getBoundingClientRect().height > 100) : false };
            })()`);
            check('① 闸门标记置位且引导可见', info.block && info.vis, JSON.stringify(info));
            check('① 文案口径：标题＋所需/现行版本＋下载地址纯文本',
                info.txt.indexOf('有新版本啦') >= 0 && info.txt.indexOf('需要 App v1.3.0 或更高') >= 0
                && info.txt.indexOf('你现在是 v1.2.2') >= 0 && /\/download\.html/.test(info.txt),
                info.txt.slice(0, 120));
            await s.ev(`(function(){ try { enterWorldNow(); } catch(e){} return true; })()`);
            await sleep(600);
            const entered = await s.ev(`(typeof enteredWorld !== 'undefined' && enteredWorld) === true`);
            check('① 闸门下 enterWorldNow 被挡，进不了世界', entered === false);
            await browserSend('Target.disposeBrowserContext', { browserContextId: s.ctxId });
        }

        /* ---------- ② 新壳 1.3.0 / ③ 浏览器：放行并能进世界 ---------- */
        for (const [label, ua] of [['② 新壳 1.3.0', UA_NEW], ['③ 浏览器（无标记）', UA_BROWSER]]) {
            const s = await openScene({ ua, seed: OLD_PLAYER });
            await sleep(4000);
            const gate = await s.ev(GATE);
            const block = await s.ev(`window.__shellGateBlock === true`);
            check(label + '：无引导、闸门未置位', gate === false && block === false);
            const logShown = await waitFor(s.ev, `!!document.querySelector('#logMask.on')`, 30000);
            check(label + '：更新日志正常开场（进入流程未被闸门干扰）', logShown);
            if (logShown) {
                await s.ev(`document.getElementById('logOk').click(); true`);
                const entered = await waitFor(s.ev, `(typeof enteredWorld !== 'undefined' && enteredWorld) === true`, 25000);
                check(label + '：点「开始游玩」正常进世界', entered === true);
            }
            await browserSend('Target.disposeBrowserContext', { browserContextId: s.ctxId });
        }

        /* ---------- ④ 断网＋旧壳 UA：fail-open ---------- */
        {
            const s = await openScene({ ua: UA_OLD, failPtr: true });
            await sleep(4500);
            const gate = await s.ev(GATE);
            const block = await s.ev(`window.__shellGateBlock === true`);
            check('④ version.json 拉取失败＋旧壳：放行无引导', gate === false && block === false);
            await browserSend('Target.disposeBrowserContext', { browserContextId: s.ctxId });
        }

        /* ---------- ⑤ 注入标记兜底 ---------- */
        {
            const s = await openScene({ ua: UA_BROWSER, seed: `(function(){ window.__CHUMEN_APP__ = true; window.__CHUMEN_APP_VER__ = '1.2.2'; })();` });
            const shown = await waitFor(s.ev, GATE, 12000);
            check('⑤ 无 UA 标记、仅注入 __CHUMEN_APP_VER__=1.2.2：兜底触发引导', shown);
            await browserSend('Target.disposeBrowserContext', { browserContextId: s.ctxId });
        }

        console.log(`\n[壳版本闸门] ${passed} 通过 / ${failed} 失败`);
        done(failed ? 1 : 0);
    } catch (e) {
        console.log(' FAIL: 专项异常：' + (e && e.message));
        done(1);
    }
}
main();
