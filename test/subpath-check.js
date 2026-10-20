/*
 * 子路径部署验证：GitHub Pages 会把站点放在 https://user.github.io/<repo>/ 下。
 * 这里本地模拟一个 /forest-house/ 前缀，确认页面里的相对路径全都能解析，
 * 尤其是 js/three.min.js —— 它一旦 404，整页就只剩错误面板。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PREFIX = '/forest-house';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8' };
const requests = [];

// 把站点复制到一个带前缀的临时目录，像 Pages 那样布出去
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-pages-'));
const siteDir = path.join(tmp, 'forest-house');
fs.mkdirSync(siteDir, { recursive: true });
for (const rel of ['index.html', path.join('js','three.min.js'), '.nojekyll']) {
    fs.mkdirSync(path.dirname(path.join(siteDir, rel)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), path.join(siteDir, rel));
}

function serve(req, res){
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    requests.push(url);
    if (!url.startsWith(PREFIX + '/')) { res.writeHead(404); return res.end('no'); }
    const rel = url.slice(PREFIX.length);
    const file = path.join(siteDir, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(siteDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404); return res.end('404');
    }
    const body = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
}

const server = http.createServer(serve);
server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}${PREFIX}/index.html`;
    const shot = path.join(ROOT, 'test', 'subpath.png');
    try { fs.unlinkSync(shot); } catch {}

    const child = spawn(EDGE, [
        '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
        '--use-gl=angle', '--use-angle=swiftshader',
        '--window-size=1280,720', '--virtual-time-budget=9000',
        `--user-data-dir=${path.join(os.tmpdir(), 'edgeprof-subpath')}`,
        `--screenshot=${shot}`, url
    ], { stdio: 'ignore' });

    child.on('exit', () => {
        let passed = 0, failed = 0;
        const ok = (name, cond, extra) => {
            if (cond) { console.log('  PASS: ' + name); passed++; }
            else { console.log('  FAIL: ' + name + (extra ? ' — ' + extra : '')); failed++; }
        };

        ok('主页在子路径下被请求', requests.includes(PREFIX + '/index.html'));
        ok('three.min.js 在子路径下解析到（200）',
            requests.includes(PREFIX + '/js/three.min.js'),
            '实际请求：' + requests.join(' , '));
        ok('没有打到站点根目录（说明无绝对路径）',
            !requests.some(u => u === '/index.html' || u === '/js/three.min.js'));

        const size = fs.existsSync(shot) ? fs.statSync(shot).size : 0;
        ok('页面渲染出非空画面（>80KB）', size > 80000, size + 'B');

        server.close();
        fs.rmSync(tmp, { recursive: true, force: true });
        console.log('\n====================');
        console.log(`Results: ${passed} passed, ${failed} failed`);
        process.exit(failed ? 1 : 0);
    });
});
