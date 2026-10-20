// 部署后实探：拿线上地址的主页与关键资源，确认没有白屏、没有 404。
// 不放进 all.js（需要联网，会拖慢本地回归），单独跑：node test/live-check.js
const https = require('https');

const BASE = process.env.LIVE_BASE || 'https://lixin2026-max.github.io/forest-house/';
const PATHS = ['', 'js/three.min.js', '.nojekyll'];

function head(url) {
    return new Promise((resolve) => {
        const req = https.get(url, { timeout: 20000 }, (res) => {
            let n = 0;
            res.on('data', (c) => { n += c.length; });
            res.on('end', () => resolve({ status: res.statusCode, bytes: n }));
        });
        req.on('error', (e) => resolve({ status: 0, err: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ status: 0, err: 'timeout' }); });
    });
}

(async () => {
    let bad = 0;
    console.log('线上实探：' + BASE);
    for (const p of PATHS) {
        const r = await head(BASE + p);
        // .nojekyll 本来就是 0 字节的标记文件，不能用字节数判
        const ok = r.status === 200 && (r.bytes > 0 || p === '.nojekyll');
        if (!ok) bad++;
        console.log((ok ? '  ✓ ' : '  ✗ ') + (p || '(主页)') + ' → ' + (r.err || (r.status + ' / ' + r.bytes + 'B')));
    }
    console.log(bad === 0 ? '\nLIVE OK — 线上可用' : '\nLIVE FAIL — ' + bad + ' 项异常');
    process.exit(bad === 0 ? 0 : 1);
})();
