// 性能守卫（Issue #35 · 地基加固）：无头浏览器实测 draw calls 与三角面，超红线即红。
// 跑法：node test/perf-guard.js（已被 test/all.js 收编）
//
// ============================== 基线与阈值 ==============================
// 这道守卫是「防失控红线」，不是紧箍咒（负责人 2026-10-21 定版口径）：
// 阈值按现行基线留了约 +50% 的余量，因为 v4.0 已规划场景大优化、室内与
// 小龙（#36 / #40 / #27），draw calls 与三角面会合理增长。守卫只拦
// 「没规划的暴涨」——例如某次改动让绘制次数悄悄翻倍。
//
// 现行实测基线（2026-10-22，v5.0 封版按规程重订；本机无头 Chromium + SwiftShader
// ＝保底档口径，每视角采样 8 次取中位数；飞鸟入画会让屋后视角有 ± 几的尖峰，中位数免疫）：
// 默认视角 draw calls 161 · 屋后视角 draw calls 162 · 三角面 191,452 / 191,311
// （桌面拉满档全景三角面约 313k，为 v5.0 双档预算内的计划值，不走本守卫口径。）
// 阈值 = 基线 × 约 1.5 取整：frontCalls 240 / backCalls 240 / triangles 290000
// 旧基线（2026-10-21）：calls 124 / 111 · 三角面 75,582，caps 190 / 170 / 150000。
// 计划内大优化落地后绘制必然上涨，届时：
// 1) 先重跑本测试，记下新的实测中位数；
// 2) 经负责人确认属于计划内增长后，按「新实测 × 1.5 取整」上调 PERF_CAPS，
// 并同步更新本段注释里的基线数值与日期；
// 3) 非计划内的暴涨不许抬基线——先定位是哪次提交带进来的。
// ========================================================================
const PERF_BASELINE = { frontCalls: 161, backCalls: 162, triangles: 191452, date: '2026-10-22'};
const PERF_CAPS = { frontCalls: 240, backCalls: 240, triangles: 290000};

const { spawn} = require('child_process');
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
const median = arr => {
const s = [...arr].sort((a, b) => a - b);
return s[Math.floor(s.length / 2)];
};

let passed = 0, failed = 0;
function check(name, actual, cap) {
const ok = actual <= cap;
if (ok) { passed++; console.log(' ✓ ' + name + '：' + actual + ' ≤ 上限 ' + cap);}
else { failed++; console.log(' FAIL: ' + name + '：' + actual + ' > 上限 ' + cap + '（基线 ' + PERF_BASELINE.date + ' 实测见文件头）');}
}

async function main() {
const chromePath = CHROME_CANDIDATES.find(p => fs.existsSync(p));
if (!chromePath) {
console.log(' FAIL: 找不到可用的 Chromium（候选路径都不存在），性能守卫无法实测');
process.exit(1);
}
const PORT = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(chromePath, [
'--headless=new', '--no-sandbox', '--use-angle=swiftshader',
`--remote-debugging-port=${PORT}`, '--window-size=1100,850', 'about:blank'
], { stdio: 'ignore'});
const done = code => { try { chrome.kill();} catch (e) {} process.exit(code);};
try {
let wsUrl = null;
for (let i = 0; i < 40 &&!wsUrl; i++) {
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
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej;});
let id = 0; const pending = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id);}};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params}));});
const ev = async expr => {
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true});
if (r.result && r.result.exceptionDetails) throw new Error('页面 JS 报错: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
return r.result && r.result.result? r.result.result.value: undefined;
};
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: PAGE});
let booted = false;
for (let i = 0; i < 90 &&!booted; i++) {
await sleep(1000);
try {
const s = await ev("document.getElementById('status')? document.getElementById('status').textContent: ''");
if (s && s.indexOf('运行中') >= 0) booted = true;
} catch (e) {}
}
if (!booted) throw new Error('页面 90 秒内未进入运行中状态');
await sleep(1500);

async function sample(n) {
const calls = [], tris = [];
for (let i = 0; i < n; i++) {
await sleep(450);
const v = await ev("({calls:renderer.info.render.calls, tris:renderer.info.render.triangles})");
calls.push(v.calls); tris.push(v.tris);
}
return { calls: median(calls), tris: median(tris)};
}
const front = await sample(8);
await ev("controls.flyTo(Math.PI*0.22+Math.PI, Math.PI*0.30, 38)"); // 与基线同一机位：屋后视角
await sleep(3200);
const back = await sample(8);

console.log('[性能守卫] 中位数采样（每视角 8 次）');
check('默认视角 draw calls', front.calls, PERF_CAPS.frontCalls);
check('屋后视角 draw calls', back.calls, PERF_CAPS.backCalls);
check('默认视角三角面', front.tris, PERF_CAPS.triangles);
check('屋后视角三角面', back.tris, PERF_CAPS.triangles);
console.log(' 性能守卫：' + passed + ' passed, ' + failed + ' failed');
ws.close();
done(failed? 1: 0);
} catch (e) {
console.log(' FAIL: 性能守卫执行出错：' + e.message);
done(1);
}
}
main();
