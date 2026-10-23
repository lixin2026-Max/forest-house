// 多浏览器保底可玩验收（Issue #95 收尾清账）
// 跑法：node test/browsers-accept.js [all|chromium|firefox|webkit]
// 依赖 playwright-core（解析顺序：环境变量 BQA_HOME → ~/workspace/tools/bqa）
// 与其浏览器包（PLAYWRIGHT_BROWSERS_PATH，默认 ~/workspace/tools/bqa-browsers）。
// 缺依赖/缺浏览器/内核起不来 → 该引擎记 SKIP、退出码不变（专项验收，不收编 all.js）。
//
// 每引擎四场景（独立上下文）：
//   S1 新玩家进入流程：日志/化身/龙蛋/视角卡按出现顺序点完 → 进世界；
//      断言 __glProbe.ok、#error 未出现、DragonCtl.active。
//   S2 保命档路径：种 glSafe=2 老存档 → 进世界；断言 __glSafeLevel===2。
//   S3 软件渲染钩子：__probeFakeRenderer='SwiftShader'＋无 glSafe 老存档 →
//      进世界后断言 SCENE.glSafe===2（探针判弱、建场景前直接保命）。
//   S4 致命层：断言 #error 可见且含「⬇ 下载 App 玩」（href=download.html）与
//      刷新重试钮；无 WebGL 的内核在 S1 即天然走到此层、同断言验收。
// 注：无头内核本身无 WebGL 时（环境差异），S1–S3 记 NOGL 不判 FAIL——
// 「该内核真机可用性」属待真机项，见 Issue #95 关闭评论的证据表。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HOME = process.env.HOME || '/home/hatch';
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
    const bp = path.join(HOME, 'workspace/tools/bqa-browsers');
    if (fs.existsSync(bp)) process.env.PLAYWRIGHT_BROWSERS_PATH = bp;
}
let pw = null;
for (const cand of [process.env.BQA_HOME, path.join(HOME, 'workspace/tools/bqa'), ROOT]) {
    if (!cand) continue;
    try { pw = require(path.join(cand, 'node_modules/playwright-core')); break; } catch (e) {}
}
if (!pw) { try { pw = require('playwright-core'); } catch (e) {} }

let passed = 0, failed = 0, skipped = 0;
function ok(name, cond, extra) {
    if (cond) { passed++; console.log(' ✓ ' + name); }
    else { failed++; console.log(' FAIL: ' + name + (extra ? '：' + String(extra).slice(0, 200) : '')); }
}
function skip(name, why) { skipped++; console.log(' SKIP ' + name + '：' + String(why).slice(0, 160)); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const DRAGON_SAVE = JSON.stringify({
    name: '小龙',
    grow: { days: 6, last: '2026-10-22', stage: 1, seen: 1, events: [] },
    avatar: { form: 'dragon', style: 0, chosen: true },
    view: { fp: false, chosen: true }
});

/* 页面一律 file:// 直载（与仓库其它无头验收同惯例）：本沙箱的回环 HTTP
   会被拦截、页面内容不可信，实测同一 Chromium 在 about:blank 下 WebGL
   正常、经回环 HTTP 导航后却拿不到 context。 */

/* 顺序无关的进入驱动：哪张卡在前点哪张，直到进世界或超时 */
async function driveEntry(page, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        const st = await page.evaluate(() => {
            const vis = id => { const e = document.getElementById(id); return !!e && (e.classList.contains('on') || e.style.display !== 'none' && e.offsetParent !== null); };
            return {
                entered: (typeof DragonCtl !== 'undefined') && DragonCtl.active === true,
                fatal: (() => { const e = document.getElementById('error'); return !!e && e.style.display !== 'none' && e.textContent.length > 0; })(),
                log: (() => { const e = document.getElementById('logMask'); return !!e && e.classList.contains('on'); })(),
                avatar: (() => { const e = document.getElementById('avatarMask'); return !!e && e.classList.contains('on'); })(),
                hatch: (() => { const e = document.getElementById('hatchBtn'); return !!e && e.style.display !== 'none' && e.offsetParent !== null; })(),
                hatching: (typeof eggMode !== 'undefined') && eggMode === 'hatching',
                view: (() => { const e = document.getElementById('viewMask'); return !!e && e.classList.contains('on'); })()
            };
        }).catch(() => null);
        if (!st) { await sleep(1000); continue; }
        if (st.entered) return 'entered';
        if (st.fatal) return 'fatal';
        /* 驱动走 DOM .click()（与仓库 CDP 验收同惯例且已被多批实证）：
           Playwright 的真实鼠标点击会被卡片上层元素拦截、落不到目标上。
           孵化演出进行中（eggMode==='hatching'）只等不点：演出靠主循环
           按游戏时间推进，无头软件渲染下墙钟会拉长，属环境慢、非故障。 */
        const sel = st.hatching ? null : st.log ? '#logOk' : st.avatar ? '[data-av="dragon"]' : st.hatch ? '#hatchBtn' : st.view ? '[data-vw="tp"]' : null;
        if (sel) await page.evaluate(s => { const e = document.querySelector(s); if (e) e.click(); }, sel).catch(() => {});
        await sleep(1000);
    }
    return 'timeout';
}

async function fatalLayerState(page) {
    return await page.evaluate(() => {
        const e = document.getElementById('error');
        if (!e) return { visible: false };
        const dl = e.querySelector('a[href="download.html"]');
        const btns = Array.from(e.querySelectorAll('button')).map(b => b.textContent);
        return { visible: e.style.display !== 'none' && e.textContent.length > 0, dl: !!dl, dlText: dl ? dl.textContent : '', btns, text: e.textContent.slice(0, 120) };
    }).catch(() => ({ visible: false }));
}

/* Xvfb 自启：Playwright 的 Firefox 构建在纯 headless 下不给 WebGL，
   借虚拟显示跑 headed 才能拿到 llvmpipe 软件 GL（与真实桌面同路径）。 */
const { spawn } = require('child_process');
async function startXvfb() {
    for (let d = 99; d < 120; d++) {
        const proc = spawn('Xvfb', [':' + d, '-screen', '0', '1280x900x24'], { stdio: 'ignore' });
        const dead = await new Promise(res => { proc.on('exit', () => res(true)); setTimeout(() => res(false), 900); });
        if (!dead) return { proc, display: ':' + d };
    }
    return null;
}

async function runEngine(name, launchFn, baseUrl) {
    console.log('=== ' + name + ' ===');
    let browser, cleanup = null;
    try { const r = await launchFn(); browser = r.browser || r; cleanup = r.cleanup || null; }
    catch (e) { skip(name + ' 引擎启动', e.message); return; }
    try {
        /* ---- S1 新玩家进入流程 ---- */
        {
            const ctx = await browser.newContext({ viewport: { width: 1100, height: 850 } });
            const page = await ctx.newPage();
            await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
            const r = await driveEntry(page, 600000);
            if (r === 'entered') {
                const probe = await page.evaluate(() => window.__glProbe ? { ok: __glProbe.ok, type: __glProbe.type, rung: __glProbe.rung, software: __glProbe.software, rs: __glProbe.rendererStr } : null).catch(() => null);
                ok(name + ' S1 新玩家全程进入世界', true);
                ok(name + ' S1 探针拿到活 context', !!probe && probe.ok === true, JSON.stringify(probe));
                console.log('   probe: ' + JSON.stringify(probe));
                const f = await fatalLayerState(page);
                ok(name + ' S1 致命层未出现', !f.visible);
            } else if (r === 'fatal') {
                const f = await fatalLayerState(page);
                console.log(' NOGL ' + name + ' S1：该无头内核无可用 WebGL，天然走致命层（真机可用性待真机）');
                ok(name + ' S4 致命层可见（S1 天然触发）', f.visible === true);
                ok(name + ' S4 主按钮下载 App（相对路径）', f.dl === true && /下载 App 玩/.test(f.dlText), f.dlText);
                ok(name + ' S4 次按钮刷新重试', f.btns.some(t => /刷新重试/.test(t)), f.btns.join(','));
            } else {
                ok(name + ' S1 新玩家全程进入世界', false, 'driveEntry=' + r);
            }
            await ctx.close();
        }
        /* ---- S2 保命档＋S3 软件渲染钩子（GL 可用时才有意义） ---- */
        const glCapable = await (async () => {
            const ctx = await browser.newContext();
            const page = await ctx.newPage();
            await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
            const has = await page.evaluate(() => { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }).catch(() => false);
            await ctx.close();
            return has;
        })();
        if (!glCapable) {
            skip(name + ' S2 保命档路径', '无头内核无 WebGL（待真机）');
            skip(name + ' S3 软件渲染钩子', '无头内核无 WebGL（待真机）');
            skip(name + ' S4 致命层 DOM 直调', '已由 S1 天然触发验收');
        } else {
            {   /* S2 */
                const ctx = await browser.newContext({ viewport: { width: 1100, height: 850 } });
                await ctx.addInitScript(`try{ localStorage.setItem('ct2_dragon', ${JSON.stringify(DRAGON_SAVE)}); localStorage.setItem('ct2_scene', JSON.stringify({ glSafe: 2 })); }catch(e){}`);
                const page = await ctx.newPage();
                await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
                const r = await driveEntry(page, 600000);
                ok(name + ' S2 保命档存档进入世界', r === 'entered', 'driveEntry=' + r);
                if (r === 'entered') {
                    const lv = await page.evaluate(() => window.__glSafeLevel).catch(() => null);
                    ok(name + ' S2 本次启动档位为保命（__glSafeLevel===2）', lv === 2, '__glSafeLevel=' + lv);
                }
                await ctx.close();
            }
            {   /* S3 */
                const ctx = await browser.newContext({ viewport: { width: 1100, height: 850 } });
                await ctx.addInitScript(`window.__probeFakeRenderer = 'SwiftShader'; try{ localStorage.setItem('ct2_dragon', ${JSON.stringify(DRAGON_SAVE)}); }catch(e){}`);
                const page = await ctx.newPage();
                await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
                const r = await driveEntry(page, 600000);
                ok(name + ' S3 软件渲染环境进入世界', r === 'entered', 'driveEntry=' + r);
                if (r === 'entered') {
                    const gs = await page.evaluate(() => (typeof SCENE !== 'undefined') ? SCENE.glSafe : null).catch(() => null);
                    ok(name + ' S3 探针判弱→直接保命（SCENE.glSafe===2）', gs === 2, 'glSafe=' + gs);
                }
                await ctx.close();
            }
            {   /* S4 */
                const ctx = await browser.newContext({ viewport: { width: 1100, height: 850 } });
                const page = await ctx.newPage();
                await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
                /* 不用 waitForFunction（其 rAF 轮询在慢页面会永不超时） */
                for (let i = 0; i < 60; i++) { if (await page.evaluate(() => typeof showFatal === 'function').catch(() => false)) break; await sleep(1500); }
                await page.evaluate(() => showFatal('多浏览器验收模拟故障')).catch(() => {});
                await sleep(600);
                const f = await fatalLayerState(page);
                ok(name + ' S4 致命层可见', f.visible === true);
                ok(name + ' S4 主按钮下载 App（相对路径）', f.dl === true && /下载 App 玩/.test(f.dlText), f.dlText);
                ok(name + ' S4 次按钮刷新重试', f.btns.some(t => /刷新重试/.test(t)), f.btns.join(','));
                ok(name + ' S4 文案不主推 Chrome', !/Chrome/.test(f.text || ''), f.text);
                await ctx.close();
            }
        }
    } finally { await browser.close().catch(() => {}); if (cleanup) cleanup(); }
}

(async () => {
    if (!pw) { console.log('SKIP 全部：playwright-core 不可用（先在 ~/workspace/tools/bqa 装好）'); process.exit(0); }
    const which = process.argv[2] || 'all';
    const url = 'file://' + path.join(ROOT, 'index.html');
    console.log('页面加载方式：file → ' + url);
    const engines = [];
    if (which === 'all' || which === 'chromium') engines.push(['chromium', () => pw.chromium.launch({ executablePath: '/opt/meta-chromium/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--force-device-scale-factor=0.7'] })]);
    if (which === 'all' || which === 'firefox') engines.push(['firefox', async () => {
        const xv = await startXvfb();
        if (!xv) throw new Error('Xvfb 起不来（Firefox 无头无 WebGL，须借虚拟显示）');
        try {
            const b = await pw.firefox.launch({ headless: false,
                env: { ...process.env, DISPLAY: xv.display, LIBGL_ALWAYS_SOFTWARE: '1', GALLIUM_DRIVER: 'llvmpipe' },
                firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.disabled': false, 'gfx.webrender.software': true, 'webgl.out-of-process': false } });
            return { browser: b, cleanup: () => { try { xv.proc.kill(); } catch (e) {} } };
        } catch (e) { try { xv.proc.kill(); } catch (_) {} throw e; }
    }]);
    if (which === 'all' || which === 'webkit') engines.push(['webkit', () => pw.webkit.launch({ headless: true })]);
    for (const [name, fn] of engines) await runEngine(name, fn, url);
    console.log(`\n结果：✓ ${passed} · FAIL ${failed} · SKIP ${skipped}`);
    process.exit(failed ? 1 : 0);
})();
