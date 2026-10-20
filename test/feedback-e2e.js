// /api/feedback 端到端测试：真起一个 serve.js，用 http 打真实请求，检查状态码与落盘。
// 覆盖：正常 204 / 空内容 400 / 坏 JSON 400 / 超大 413 / 限流 429 / GET 405 / 不污染静态路由。
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8123;
const TMP = path.join(os.tmpdir(), 'fb-test-' + Date.now() + '.jsonl');

let pass = 0;
const fails = [];
function check(name, ok, detail) {
    if (ok) { pass++; console.log('  PASS: ' + name); }
    else { fails.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL: ' + name + (detail ? ' — ' + detail : '')); }
}

function request(method, p, body, headers) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const req = http.request({
            host: '127.0.0.1', port: PORT, method, path: p,
            agent: false,   // 每个请求独立连接：服务端在 413 后会主动断开，复用 socket 会误报 ECONNRESET
            headers: Object.assign({ 'Content-Length': body ? Buffer.byteLength(body) : 0 }, headers || {})
        }, res => {
            let buf = '';
            res.on('data', c => { buf += c; });
            res.on('end', () => {
                settled = true;
                resolve({ status: res.statusCode, body: buf, headers: res.headers });
            });
        });
        req.on('error', (e) => {
            // 413 之后服务端主动断开是预期行为，只要不是「没收到响应就断」
            if (settled) return;
            resolve({ status: 0, body: '', headers: {}, error: e.code });
        });
        if (body) req.write(body);
        req.end();
    });
}

(async () => {
    const child = spawn(process.execPath, [path.join(ROOT, 'serve.js'), String(PORT)], {
        env: Object.assign({}, process.env, { FEEDBACK_FILE: TMP }),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let log = '';
    child.stdout.on('data', d => { log += d; });
    child.stderr.on('data', d => { log += d; });

    // 等端口起来
    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (/http:\/\/localhost/.test(log)) break;
    }
    if (!/http:\/\/localhost/.test(log)) {
        console.error('服务器没起来：\n' + log);
        child.kill();
        process.exit(1);
    }

    console.log('\n== 正常提交 ==');
    const good = JSON.stringify({
        text: '屋顶换成茅草，向日葵多一点。',
        meta: { weather: '夜间', screen: '844x390 横屏', mobile: true, ua: 'x'.repeat(300) }
    });
    const r1 = await request('POST', '/api/feedback', good, { 'Content-Type': 'application/json' });
    check('正常提交返回 204', r1.status === 204, '实际 ' + r1.status);
    check('响应体为空', r1.body === '', JSON.stringify(r1.body));

    await new Promise(r => setTimeout(r, 120));
    const lines = fs.existsSync(TMP)
        ? fs.readFileSync(TMP, 'utf8').trim().split('\n').filter(Boolean) : [];
    check('落盘恰好一行', lines.length === 1, '实际 ' + lines.length);
    if (lines.length) {
        let rec = null;
        try { rec = JSON.parse(lines[0]); } catch (e) { /* 下面断言会失败 */ }
        check('落盘是合法 JSON', !!rec);
        if (rec) {
            check('正文完整保留', rec.text === '屋顶换成茅草，向日葵多一点。', JSON.stringify(rec.text));
            check('meta.weather 保留', rec.meta.weather === '夜间');
            check('meta.ua 被截断到 160', rec.meta.ua.length === 160, '实际 ' + rec.meta.ua.length);
            check('含 ISO 时间戳', /^\d{4}-\d{2}-\d{2}T/.test(rec.ts));
        }
    }

    console.log('\n== 拒绝非法输入 ==');
    const r2 = await request('POST', '/api/feedback', JSON.stringify({ text: '   ' }), { 'Content-Type': 'application/json' });
    check('空内容返回 400', r2.status === 400, '实际 ' + r2.status);

    const r3 = await request('POST', '/api/feedback', 'not-json-at-all', { 'Content-Type': 'application/json' });
    check('坏 JSON 返回 400', r3.status === 400, '实际 ' + r3.status);

    const big = JSON.stringify({ text: 'x'.repeat(9000) });
    const r4 = await request('POST', '/api/feedback', big, { 'Content-Type': 'application/json' });
    check('超大正文返回 413', r4.status === 413, '实际 ' + r4.status);

    const r5 = await request('GET', '/api/feedback');
    // 只写接口对 GET 一律不可读：404（静态里没有这个文件）或 405 都算正确
    check('GET 该接口不可读（404/405）', r5.status === 404 || r5.status === 405, '实际 ' + r5.status);

    console.log('\n== 限流（每 IP 每分钟 6 条）==');
    let last = 0, sawLimit = false;
    for (let i = 0; i < 10; i++) {
        const r = await request('POST', '/api/feedback',
            JSON.stringify({ text: 'rate probe ' + i }), { 'Content-Type': 'application/json' });
        last = r.status;
        if (r.status === 429) { sawLimit = true; break; }
    }
    check('连续提交触发 429', sawLimit, '最后一次 ' + last);

    console.log('\n== 不影响静态资源 ==');
    const home = await request('GET', '/');
    check('首页仍 200', home.status === 200, '实际 ' + home.status);
    check('首页带 CSP', /content-security-policy/i.test(Object.keys(home.headers).join(',')));
    const trav = await request('GET', '/../serve.js');
    check('路径穿越仍被拦', trav.status === 403 || trav.status === 404, '实际 ' + trav.status);

    console.log('\n== 收件箱不可被下载 ==');
    const f = await request('GET', '/feedback.jsonl');
    check('feedback.jsonl 不可访问', f.status === 403 || f.status === 404, '实际 ' + f.status);

    child.kill();
    try { fs.unlinkSync(TMP); } catch (e) { /* ignore */ }

    console.log('\n' + '='.repeat(52));
    console.log('反馈接口测试：' + pass + ' passed, ' + fails.length + ' failed');
    if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
    console.log('FEEDBACK OK — 全部通过');
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
