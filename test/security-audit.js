/*
 * 安全审计（可重复运行的回归测试）
 *
 *   node test/security-audit.js
 *
 * 分三部分：
 *   A. 静态审计 index.html —— 无外链、无 eval、无存储、无网络 API、无 HTML 字符串注入
 *   B. 静态审计单文件版 —— 完全自包含
 *   C. 起一个真实的 serve.js，用原始 socket 打各种恶意请求（穿越 / 坏编码 / 非法方法 / 非法类型）
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const results = [];
function check(name, ok, detail) {
    results.push({ name, ok: !!ok, detail: detail || '' });
    console.log((ok ? '  PASS: ' : '  FAIL: ') + name + (ok || !detail ? '' : '  → ' + detail));
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const html = read('index.html');

/* ───────────── A. index.html 静态审计 ───────────── */
console.log('\n[A] index.html 静态审计');

const dangers = {
    '白名单外的 http(s) 链接': /https?:\/\/(?!formsubmit\.co\b)(?!www\.w3\.org\b)/i,
    'innerHTML/outerHTML': /(inner|outer)HTML/,
    'eval': /\beval\s*\(/,
    'new Function': /new\s+Function\s*\(/,
    // 只允许九个具名本地键：ct2_visits 字面量、寻宝的 HUNT_KEY、帮助的 HELP_KEY、种田的 FARM_KEY、投票的 VOTE_KEY、主题的 THEME_KEY、回执的 ECHO_KEY、背包的 BAG_KEY 与小龙自定义的 DRAGON_KEY 常量（下方另有钉死检查）；其余一律不许
    'localStorage（非授权键）': /localStorage\.(?:getItem|setItem)\((?!'ct2_visits'|HUNT_KEY|HELP_KEY|FARM_KEY|VOTE_KEY|THEME_KEY|ECHO_KEY|BAG_KEY|DRAGON_KEY)/,
    'sessionStorage': /sessionStorage/,
    'document.cookie': /document\.cookie/,
    'XMLHttpRequest': /XMLHttpRequest/,
    'WebSocket': /new\s+WebSocket/,
    'sendBeacon': /sendBeacon/,
    'importScripts': /importScripts/,
    'document.write': /document\.write/,
    '外部样式表': /<link[^>]+href=["']https?:/i,
    'iframe': /<iframe/i,
    'target=_blank': /target\s*=\s*["']_blank/i
};
for (const [label, re] of Object.entries(dangers)) {
    const m = html.match(re);
    check('无 ' + label, !m, m ? '出现：' + m[0] : '');
}

// 寻宝进度键只能经具名常量使用，且常量取值被钉死（防动态拼键绕过上面的正则）
check('寻宝存储键 HUNT_KEY 写死为 ct2_hunt', /const HUNT_KEY='ct2_hunt'/.test(html));
// 帮助已提示标记同理：只能经具名常量 HELP_KEY 使用，取值钉死
check('帮助存储键 HELP_KEY 写死为 ct2_help', /const HELP_KEY='ct2_help'/.test(html));
// 种田存档同理：只能经具名常量 FARM_KEY 使用，取值钉死
check('种田存储键 FARM_KEY 写死为 ct2_farm', /const FARM_KEY='ct2_farm'/.test(html));
// 投票已投标记同理：只能经具名常量 VOTE_KEY 使用，取值钉死
check('投票存储键 VOTE_KEY 写死为 ct2_vote', /const VOTE_KEY='ct2_vote'/.test(html));
// 界面主题偏好同理：只能经具名常量 THEME_KEY 使用，取值钉死
check('主题存储键 THEME_KEY 写死为 ct2_theme', /const THEME_KEY='ct2_theme'/.test(html));
// 小龙自定义外观同理：只能经具名常量 DRAGON_KEY 使用，取值钉死
check('小龙存储键 DRAGON_KEY 写死为 ct2_dragon', /const DRAGON_KEY='ct2_dragon'/.test(html));
// 小龙背包与喂食计数同理：只能经具名常量 BAG_KEY 使用，取值钉死
check('背包存储键 BAG_KEY 写死为 ct2_bag', /const BAG_KEY='ct2_bag'/.test(html));
// 建议回音回执同理：只能经具名常量 ECHO_KEY 使用，取值钉死
check('回执存储键 ECHO_KEY 写死为 ct2_echo', /const ECHO_KEY='ct2_echo'/.test(html));

// fetch 是唯一例外：只允许恰好一处、且地址来自 fbEndpoint() 的白名单。
{
    const calls = html.match(/\bfetch\s*\(/g) || [];
    check('fetch 恰好一处（仅意见回传）', calls.length === 1, '实际 ' + calls.length + ' 处');
    const relay = html.match(/const FB_RELAY='([^']*)'/);
    check('回传地址在白名单内',
        /return fetch\(url,/.test(html) && !!relay &&
        (relay[1] === '' || /^https:\/\/formsubmit\.co\/ajax\//.test(relay[1])),
        relay ? 'FB_RELAY=' + relay[1] : '缺少 FB_RELAY');
    check('回退地址是同源相对路径', /return '\/api\/feedback'/.test(html));
    check('CSP 只额外放行回传服务',
        /connect-src\s+'self'\s+https:\/\/formsubmit\.co/.test(html));
}

check('声明 CSP meta', /http-equiv=["']Content-Security-Policy["']/i.test(html));
check('CSP 默认全部拒绝 (default-src none)',
    /default-src\s+'none'/.test(html));
check('CSP 联网仅限同源 (connect-src self)',
    /connect-src\s+'self'/.test(html) && !/connect-src[^;]*\*/.test(html),
    '必须恰好是 \'self\'，不能出现通配符');
// 关键：script-src 必须放行 'self'，否则外链的 js/three.min.js 会被 CSP 拦掉、整页白屏
check("CSP 放行同源脚本 (script-src 'self')",
    /script-src[^;]*'self'/.test(html),
    '缺少 \'self\' 会让 js/three.min.js 加载失败');
check('CSP 禁止被嵌框/表单外发 (object-src none + form-action none)',
    /object-src\s+'none'/.test(html) && /form-action\s+'none'/.test(html));
check('无 referrer 泄露 (no-referrer)',
    /<meta\s+name=["']referrer["']\s+content=["']no-referrer["']/i.test(html));

// 唯一允许的外部资源：同项目内的本地 three.js
const scriptSrcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
check('脚本引用仅限本地相对路径',
    scriptSrcs.every(s => !/^(https?:)?\/\//.test(s) && !/^[a-z]+:/i.test(s)),
    scriptSrcs.join(', '));
check('three.js 走本地文件',
    scriptSrcs.length === 1 && scriptSrcs[0] === 'js/three.min.js',
    scriptSrcs.join(', '));

// location.hash 只用于匹配固定天气名，不参与任何 DOM/URL 拼接
check('location.hash 只做白名单匹配',
    /weatherModes\.indexOf\(\s*_h\s*\)/.test(html) &&
    !/innerHTML[\s\S]{0,80}location\.hash/.test(html));

/* ───────────── B. 单文件版静态审计 ───────────── */
console.log('\n[B] 楚门的2.0世界.html 静态审计');
const singlePath = path.join(ROOT, '楚门的2.0世界.html');
const hasSingle = fs.existsSync(singlePath);
check('单文件版存在', hasSingle);
if (hasSingle) {
    const single = fs.readFileSync(singlePath, 'utf8');
    check('单文件无任何 <script src=>',
        !/<script[^>]+src=/i.test(single));
    check('单文件无 <link href>',
        !/<link[^>]+href=/i.test(single));
    check('单文件同样声明 CSP',
        /http-equiv=["']Content-Security-Policy["']/i.test(single));
    check('单文件内联了 three.js',
        single.length > 500000 && single.includes('THREE'));
}

/* ───────────── C. serve.js 实弹测试 ───────────── */
const PORT = 8099;

function rawRequest(requestLine, timeoutMs) {
    return new Promise((resolve) => {
        const sock = net.connect(PORT, '127.0.0.1');
        let buf = '';
        const done = (v) => { try { sock.destroy(); } catch (e) {} resolve(buf + (v || '')); };
        sock.setTimeout(timeoutMs || 3000, () => done('\n[TIMEOUT]'));
        sock.on('connect', () => sock.write(requestLine + '\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n'));
        sock.on('data', (d) => { buf += d.toString('latin1'); });
        sock.on('end', () => done());
        sock.on('error', (e) => done('\n[ERROR ' + e.code + ']'));
    });
}
const statusOf = (resp) => {
    const m = resp.match(/^HTTP\/1\.[01]\s+(\d{3})/);
    return m ? parseInt(m[1], 10) : 0;
};
const headerOf = (resp, name) => {
    const re = new RegExp('\\n' + name + ':\\s*([^\\r]*)', 'i');
    const m = resp.match(re);
    return m ? m[1].trim() : null;
};

async function liveTests() {
    console.log('\n[C] serve.js 实弹测试（端口 ' + PORT + '）');

    // 造一个「存在但类型不允许」的文件，用来验证扩展名白名单
    const baitName = '__audit_bait.exe';
    const baitPath = path.join(ROOT, baitName);
    fs.writeFileSync(baitPath, 'AUDIT');

    const srv = spawn(process.execPath, [path.join(ROOT, 'serve.js'), String(PORT)], {
        cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe']
    });
    let srvLog = '';
    srv.stdout.on('data', d => { srvLog += d.toString(); });
    srv.stderr.on('data', d => { srvLog += d.toString(); });

    const waitUp = (ms) => new Promise((resolve, reject) => {
        const t0 = Date.now();
        const tick = () => {
            const s = net.connect(PORT, '127.0.0.1');
            s.on('connect', () => { s.destroy(); resolve(); });
            s.on('error', () => {
                s.destroy();
                if (Date.now() - t0 > ms) reject(new Error('服务器没起来：' + srvLog));
                else setTimeout(tick, 120);
            });
        };
        tick();
    });

    try {
        await waitUp(6000);

        // 1. 正常请求 + 安全响应头
        const ok = await rawRequest('GET / HTTP/1.1');
        check('正常请求 200', statusOf(ok) === 200, 'got ' + statusOf(ok));
        check('带 X-Content-Type-Options: nosniff',
            (headerOf(ok, 'X-Content-Type-Options') || '') === 'nosniff');
        check('带 X-Frame-Options: DENY',
            (headerOf(ok, 'X-Frame-Options') || '') === 'DENY');
        check('带 Referrer-Policy: no-referrer',
            (headerOf(ok, 'Referrer-Policy') || '') === 'no-referrer');
        check('带 CSP header',
            /default-src 'none'/.test(headerOf(ok, 'Content-Security-Policy') || ''));
        check('不再下发 CORS 通配头',
            headerOf(ok, 'Access-Control-Allow-Origin') === null);

        // 2. 目录穿越（明文 / 编码 / 反斜杠）
        const trav = [
            ['明文 ../', 'GET /../../../../etc/passwd HTTP/1.1'],
            ['编码 %2e%2e', 'GET /%2e%2e%2f%2e%2e%2fetc%2fpasswd HTTP/1.1'],
            ['双编码', 'GET /%252e%252e%252fetc%252fpasswd HTTP/1.1'],
            ['反斜杠', 'GET /..\\..\\windows\\win.ini HTTP/1.1'],
            ['编码反斜杠', 'GET /%2e%2e%5c%2e%2e%5cwindows%5cwin.ini HTTP/1.1']
        ];
        for (const [label, line] of trav) {
            const r = await rawRequest(line);
            const st = statusOf(r);
            check('拒绝路径穿越（' + label + '）',
                st === 403 || st === 404 || st === 400,
                'got ' + st);
            check('穿越响应里没有系统文件内容（' + label + '）',
                !/root:x:|\[extensions\]|\[fonts\]/i.test(r));
        }

        // 3. 坏编码不能让进程崩
        const bad = await rawRequest('GET /% HTTP/1.1');
        check('坏百分号编码返回 400 而不是崩溃',
            statusOf(bad) === 400, 'got ' + statusOf(bad));
        const afterBad = await rawRequest('GET / HTTP/1.1');
        check('坏编码之后服务器仍然存活',
            statusOf(afterBad) === 200, 'got ' + statusOf(afterBad));

        // 4. 非法方法
        const post = await rawRequest('POST / HTTP/1.1');
        check('POST 被拒 405', statusOf(post) === 405, 'got ' + statusOf(post));
        const put = await rawRequest('PUT / HTTP/1.1');
        check('PUT 被拒 405', statusOf(put) === 405, 'got ' + statusOf(put));

        // 5. 扩展名白名单
        const bait = await rawRequest('GET /' + baitName + ' HTTP/1.1');
        check('非白名单扩展名被拒 403', statusOf(bait) === 403, 'got ' + statusOf(bait));

        // 6. 目录不可列出
        const dir = await rawRequest('GET /js/ HTTP/1.1');
        check('目录不列清单（无 index.html 则非 200）',
            statusOf(dir) !== 200 || !/three\.min\.js/i.test(dir),
            'got ' + statusOf(dir));
    } finally {
        try { srv.kill(); } catch (e) {}
        try { fs.unlinkSync(baitPath); } catch (e) {}
    }
}

/* ───────────── 汇总 ───────────── */
liveTests().then(() => {
    const failed = results.filter(r => !r.ok);
    console.log('\n' + '='.repeat(48));
    console.log('安全审计：' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed');
    if (failed.length) {
        failed.forEach(f => console.log('  ✗ ' + f.name + (f.detail ? ' → ' + f.detail : '')));
        process.exitCode = 1;
    } else {
        console.log('SAFE — 全部通过');
    }
    console.log('='.repeat(48));
}).catch(e => {
    console.error('审计脚本自身出错：', e);
    process.exitCode = 1;
});
