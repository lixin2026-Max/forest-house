/*
 * 一条命令起「本地服务 + 公网 https 隧道」，并把当前可用地址打印出来。
 *
 *   node tunnel.js
 *
 * 为什么要这个脚本：localhost.run 每次重连都会**换一个域名**，
 * 把地址写死在文档里必然过期。所以地址以本脚本的输出为准，
 * 同时会写到 tunnel-url.txt（已在 .gitignore 里）。
 *
 * 注意：这条隧道绑在当前进程上，关掉窗口就断。要长期可用的链接请走 GitHub Pages。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8000;
const SSH = 'C:\\Windows\\System32\\OpenSSH\\ssh.exe';

// ---------- 1. 本地静态服务 ----------
const serve = spawn(process.execPath, [path.join(ROOT, 'serve.js'), String(PORT)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe']
});
serve.stderr.on('data', d => process.stderr.write('[serve] ' + d));

function waitPort(tries = 40) {
    return new Promise((resolve, reject) => {
        const tick = n => {
            const req = http.get({ host: '127.0.0.1', port: PORT, path: '/index.html', timeout: 800 }, res => {
                res.resume();
                res.statusCode === 200 ? resolve() : (n <= 0 ? reject(new Error('HTTP ' + res.statusCode)) : setTimeout(() => tick(n - 1), 150));
            });
            req.on('error', () => n <= 0 ? reject(new Error('端口未就绪')) : setTimeout(() => tick(n - 1), 150));
            req.on('timeout', () => { req.destroy(); });
        };
        tick(tries);
    });
}

// ---------- 2. SSH 反向隧道 ----------
function startTunnel() {
    return new Promise((resolve, reject) => {
        const tun = spawn(SSH, [
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'UserKnownHostsFile=' + (process.platform === 'win32' ? 'NUL' : '/dev/null'),
            '-o', 'ServerAliveInterval=30',
            '-R', `80:127.0.0.1:${PORT}`,
            'nokey@localhost.run'
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let buf = '';
        const onData = d => {
            buf += d.toString();
            const m = buf.match(/https:\/\/[a-z0-9]+\.lhr\.life/);
            if (m) {
                tun.stdout.off('data', onData);
                resolve({ tun, url: m[0] });
            }
        };
        tun.stdout.on('data', onData);
        tun.stderr.on('data', d => { buf += d.toString(); });
        tun.on('exit', code => reject(new Error('ssh 退出，code=' + code)));

        setTimeout(() => resolve({ tun, url: null }), 20000);
    });
}

(async () => {
    console.log('启动本地服务…');
    await waitPort();
    console.log(`  本地： http://127.0.0.1:${PORT}/`);

    console.log('建立公网隧道…');
    const { tun, url } = await startTunnel();

    if (!url) {
        console.error('  没能读到隧道地址，请看上面的 ssh 输出');
        process.exitCode = 1;
        tun.on('exit', () => serve.kill());
        return;
    }

    fs.writeFileSync(path.join(ROOT, 'tunnel-url.txt'), url + '\n', 'utf8');
    console.log('');
    console.log('  公网： ' + url + '/');
    console.log('  （已写入 tunnel-url.txt；该地址在隧道重连后会变）');
    console.log('');
    console.log('按 Ctrl+C 结束。');

    const stop = () => { try { tun.kill(); } catch {} try { serve.kill(); } catch {} process.exit(0); };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    tun.on('exit', () => { console.error('隧道断开，请重新运行 node tunnel.js'); serve.kill(); process.exit(1); });
})();
