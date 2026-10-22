/*
 * 手机预览用的极简静态服务器（零依赖，用 Node 内置 http）
 *
 *   node serve.js              # 默认 8000 端口，绑定所有网卡（手机可访问）
 *   node serve.js 8080         # 指定端口
 *   node serve.js --localhost  # 只绑定 127.0.0.1（只有本机可访问）
 *
 * 安全措施（详见 report.md「安全」一节）：
 *   · 只允许 GET/HEAD，其它方法一律 405
 *   · 解码后的路径必须落在项目根目录内（resolve 后按分隔符前缀比对，防 ../ 与编码绕过）
 *   · 扩展名白名单，非白名单一律 403
 *   · 不发送 CORS 头（默认同源），并附带 nosniff / DENY / no-referrer / CSP
 *   · 任何异常都在请求内消化，不会让进程崩掉
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname);
const ROOT_PREFIX = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;

const argv = process.argv.slice(2);
const LOCAL_ONLY = argv.includes('--localhost');
let PORT = parseInt(argv.find(a => /^\d+$/.test(a)) || process.env.PORT || '8000', 10);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.glb': 'model/gltf-binary',
    '.md': 'text/markdown; charset=utf-8'
};
const ALLOWED_EXT = new Set(Object.keys(MIME));

// 页面自包含、不联网，所以这里的 CSP 只用最保守的一组。
// 注意：CSP 的 frame-ancestors 在 header 里生效，因此这里用 X-Frame-Options 兜底。
const SEC_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline'; img-src data: blob:; connect-src 'self' https://formsubmit.co blob:; " +
        "font-src 'none'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'"
};

function lanAddresses() {
    const out = [];
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const ni of nets[name] || []) {
            if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
        }
    }
    return out;
}

function send(res, code, headers, body) {
    res.writeHead(code, Object.assign({}, SEC_HEADERS, headers));
    res.end(body);
}

const server = http.createServer((req, res) => {
    try {
        const method = (req.method || 'GET').toUpperCase();

        // 唯一的写入入口：优化意见。必须先于方法白名单判断。
        if (method === 'POST' && (req.url || '').split('?')[0] === '/api/feedback') {
            handleFeedback(req, res);
            return;
        }

        if (method !== 'GET' && method !== 'HEAD') {
            send(res, 405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' }, '405');
            return;
        }

        // decodeURIComponent 遇到坏的 % 序列会抛 URIError —— 必须接住，否则整个进程崩
        let rawPath;
        try {
            rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
        } catch (e) {
            send(res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, '400 地址编码非法');
            return;
        }

        // 反斜杠统一成正斜杠，再去掉开头的 /
        const cleaned = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
        let filePath = path.resolve(ROOT, cleaned);

        // 严格前缀比对：必须等于根目录，或以「根目录 + 分隔符」开头
        const inRoot = filePath === ROOT || filePath.startsWith(ROOT_PREFIX);
        if (!inRoot) {
            send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, '403 越界');
            console.log('  403 ' + rawPath);
            return;
        }

        if (!fs.existsSync(filePath)) {
            send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, '404 找不到');
            console.log('  404 ' + rawPath);
            return;
        }

        const st = fs.statSync(filePath);
        if (st.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
            if (!fs.existsSync(filePath)) {
                send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, '403 目录不可列出');
                return;
            }
        }

        const ext = path.extname(filePath).toLowerCase();
        if (!ALLOWED_EXT.has(ext)) {
            send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, '403 文件类型不允许');
            console.log('  403 ' + rawPath + ' (ext ' + ext + ')');
            return;
        }

        const buf = fs.readFileSync(filePath);
        res.writeHead(200, Object.assign({}, SEC_HEADERS, {
            'Content-Type': MIME[ext],
            'Content-Length': buf.length,
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        }));
        res.end(method === 'HEAD' ? undefined : buf);
        console.log('  200 ' + rawPath + ' (' + Math.round(buf.length / 1024) + 'KB)');
    } catch (err) {
        // 兜底：任何未预料的异常都只影响当前这一个请求
        try {
            send(res, 500, { 'Content-Type': 'text/plain; charset=utf-8' }, '500');
        } catch (e) { /* 响应已发出，忽略 */ }
        console.error('  500 ' + (req.url || '') + ' → ' + err.message);
    }
});

server.on('clientError', (err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && PORT < 8100) {
        console.log('端口 ' + PORT + ' 被占用，换 ' + (PORT + 1) + ' 试试…');
        PORT += 1;
        setTimeout(() => server.listen(PORT, HOST), 50);
    } else {
        console.error('启动失败：', err.message);
        process.exit(1);
    }
});

const HOST = LOCAL_ONLY ? '127.0.0.1' : '0.0.0.0';

/* ───────── 优化意见收集（唯一接受写入的接口） ─────────
 * 设计原则：页面本体只在用户主动点「提交」时才发一次 POST，
 * 打开页面、拖动、切天气全程零网络，不影响体验。
 */
const FEEDBACK_FILE = process.env.FEEDBACK_FILE || path.join(ROOT, 'feedback.jsonl');
const FEEDBACK_MAX_BODY = 4096;       // 单条上限 4KB
const FEEDBACK_MAX_FILE = 2 * 1024 * 1024; // 累计上限 2MB，满了就拒收
const FEEDBACK_RATE = { windowMs: 60000, max: 6 }; // 每 IP 每分钟 6 条
const rateBuckets = new Map();

function rateLimited(ip) {
    const now = Date.now();
    let b = rateBuckets.get(ip);
    if (!b || now > b.resetAt) {
        b = { count: 0, resetAt: now + FEEDBACK_RATE.windowMs };
        rateBuckets.set(ip, b);
    }
    b.count += 1;
    // 顺手清理过期桶，避免 Map 无限增长
    if (rateBuckets.size > 500) {
        for (const [k, v] of rateBuckets) if (now > v.resetAt) rateBuckets.delete(k);
    }
    return b.count > FEEDBACK_RATE.max;
}

function handleFeedback(req, res) {
    const ip = (req.socket && req.socket.remoteAddress) || 'unknown';

    if (rateLimited(ip)) {
        send(res, 429, { 'Content-Type': 'text/plain; charset=utf-8' }, '429 太频繁');
        return;
    }

    let size = 0;
    const chunks = [];
    let aborted = false;

    req.on('data', (c) => {
        if (aborted) return;
        size += c.length;
        if (size > FEEDBACK_MAX_BODY) {
            aborted = true;
            // 先停收、把 413 发完再断连接；直接 destroy 会让客户端收到 ECONNRESET 而不是 413
            try { req.pause(); } catch (e) { /* ignore */ }
            send(res, 413, { 'Content-Type': 'text/plain; charset=utf-8' }, '413 内容太大');
            res.on('finish', () => { try { req.destroy(); } catch (e) { /* ignore */ } });
            return;
        }
        chunks.push(c);
    });

    req.on('end', () => {
        if (aborted) return;
        try {
            if (fs.existsSync(FEEDBACK_FILE) && fs.statSync(FEEDBACK_FILE).size > FEEDBACK_MAX_FILE) {
                send(res, 507, { 'Content-Type': 'text/plain; charset=utf-8' }, '507 收件箱已满');
                return;
            }

            const raw = Buffer.concat(chunks).toString('utf8');
            let data;
            try { data = JSON.parse(raw); } catch (e) {
                send(res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, '400 不是合法 JSON');
                return;
            }

            const text = typeof data.text === 'string' ? data.text.trim() : '';
            if (!text) {
                send(res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, '400 内容为空');
                return;
            }

            const meta = (data.meta && typeof data.meta === 'object') ? data.meta : {};
            const safeMeta = {
                weather: typeof meta.weather === 'string' ? meta.weather.slice(0, 24) : '',
                screen: typeof meta.screen === 'string' ? meta.screen.slice(0, 24) : '',
                mobile: !!meta.mobile,
                ua: typeof meta.ua === 'string' ? meta.ua.slice(0, 160) : ''
            };

            const line = JSON.stringify({
                ts: new Date().toISOString(),
                text: text.slice(0, 3000),
                meta: safeMeta
            }) + '\n';

            fs.appendFileSync(FEEDBACK_FILE, line, 'utf8');
            send(res, 204, {}, '');
            console.log('  📨 收到优化意见 ' + text.length + ' 字：' + text.replace(/\s+/g, ' ').slice(0, 40));
        } catch (err) {
            send(res, 500, { 'Content-Type': 'text/plain; charset=utf-8' }, '500');
            console.error('  意见写入失败：' + err.message);
        }
    });

    req.on('error', () => { /* 连接断了就算了 */ });
}

server.listen(PORT, HOST, () => {
    const ips = lanAddresses();
    console.log('');
    console.log('  楚门的2.0世界 · 手机预览服务器已启动');
    console.log('  ────────────────────────────────────────────');
    console.log('  电脑本机：  http://localhost:' + PORT + '/');
    if (LOCAL_ONLY) {
        console.log('  只监听 127.0.0.1 —— 手机访问不到（这是 --localhost 模式）');
    } else if (ips.length === 0) {
        console.log('  未检测到局域网 IP（手机可能连不上，确认已连 WiFi）');
    } else {
        ips.forEach(ip => {
            console.log('  手  机：  http://' + ip + ':' + PORT + '/   ← 同一 WiFi 下打开这个');
        });
        console.log('');
        console.log('  注意：绑定 0.0.0.0 意味着同一 WiFi 下的其他设备也能打开。');
        console.log('        只想自己看就加 --localhost（那样手机也打不开了）。');
    }
    console.log('  ────────────────────────────────────────────');
    console.log('  手机要连同一个 WiFi。停止服务按 Ctrl+C。');
    console.log('');
});
