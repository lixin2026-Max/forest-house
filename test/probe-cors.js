/*
 * 诊断 FormSubmit 从浏览器发起时到底卡在哪：
 *   1) CORS 预检（OPTIONS）是否被正确应答
 *   2) 简单请求（不预检）是否被接受
 * 用原始 http 请求，不依赖浏览器，结果确定。
 */
const https = require('https');

const EP = 'https://formsubmit.co/ajax/2820575692@qq.com';
const ORIGIN = 'https://lixin2026-max.github.io';

function req(method, headers, body, label) {
    return new Promise((resolve) => {
        const t0 = Date.now();
        const u = new URL(EP);
        const r = https.request({
            hostname: u.hostname, path: u.pathname, method,
            headers: Object.assign({ Host: u.hostname }, headers)
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                const keep = ['access-control-allow-origin', 'access-control-allow-headers',
                    'access-control-allow-methods', 'content-type', 'vary'];
                const h = {};
                keep.forEach(k => { if (res.headers[k]) h[k] = res.headers[k]; });
                console.log('\n===== ' + label + ' =====');
                console.log('  ' + method + ' → ' + res.statusCode + '  ' + (Date.now() - t0) + 'ms');
                console.log('  CORS 头: ' + (Object.keys(h).length ? JSON.stringify(h) : '(一个都没有 → 浏览器会拦)'));
                console.log('  body: ' + data.slice(0, 240).replace(/\s+/g, ' '));
                resolve();
            });
        });
        r.on('error', e => { console.log('\n===== ' + label + ' =====\n  抛错: ' + e.message); resolve(); });
        r.setTimeout(15000, () => { r.destroy(new Error('超时 15s')); });
        if (body) r.write(body);
        r.end();
    });
}

(async () => {
    // 1. 模拟浏览器对 application/json 的预检
    await req('OPTIONS', {
        'Origin': ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type'
    }, null, '① 预检 OPTIONS（application/json 必走这一步）');

    // 2. 简单请求：urlencoded（不预检）
    const form = '内容=' + encodeURIComponent('诊断-urlencoded') + '&_subject=' + encodeURIComponent('【楚门2.0】诊断');
    await req('POST', {
        'Origin': ORIGIN,
        'Referer': ORIGIN + '/forest-house/',
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Content-Length': Buffer.byteLength(form)
    }, form, '② 简单请求 x-www-form-urlencoded');

    // 3. 简单请求：text/plain（不预检）
    const raw = JSON.stringify({ '内容': '诊断-textplain', '_subject': '【楚门2.0】诊断' });
    await req('POST', {
        'Origin': ORIGIN,
        'Referer': ORIGIN + '/forest-house/',
        'Accept': 'application/json',
        'Content-Type': 'text/plain;charset=UTF-8',
        'Content-Length': Buffer.byteLength(raw)
    }, raw, '③ 简单请求 text/plain');

    // 4. 对照：application/json（浏览器会预检，这里直发看服务端态度）
    await req('POST', {
        'Origin': ORIGIN,
        'Referer': ORIGIN + '/forest-house/',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(raw)
    }, raw, '④ 直发 application/json（对照）');
})();
