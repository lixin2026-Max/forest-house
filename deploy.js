/*
 * 一键发布到 GitHub Pages。
 * 用法：node deploy.js
 *
 * 前提：已在 https://github.com/new 建好 public 仓库 forest-house（不要勾 README）。
 * 脚本会等仓库出现（最多 3 分钟），然后推送，并打印开启 Pages 的直达链接。
 */
const { execFileSync } = require('child_process');
const https = require('https');
const path = require('path');

const OWNER = 'lixin2026-Max';
const REPO = 'forest-house';
const ROOT = __dirname;

function apiJson(p) {
    return new Promise(resolve => {
        https.get({
            hostname: 'api.github.com', path: p, headers: {
                'User-Agent': 'forest-house-deploy',
                'Accept': 'application/vnd.github+json'
            }
        }, res => {
            let b = '';
            res.on('data', d => b += d);
            res.on('end', () => {
                try { resolve(JSON.parse(b)); } catch { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    console.log('检查仓库 ' + OWNER + '/' + REPO + ' …');
    let repo = null;
    for (let i = 0; i < 36; i++) {              // 3 分钟，每 5 秒一次
        repo = await apiJson('/repos/' + OWNER + '/' + REPO);
        if (repo && repo.full_name) break;
        if (i === 0) console.log('  还没找到，等你建好（最多等 3 分钟）…');
        await sleep(5000);
    }

    if (!repo || !repo.full_name) {
        console.log('\n✗ 没等到仓库。先去建：');
        console.log('   https://github.com/new?name=' + REPO + '&visibility=public');
        console.log('   名字填 ' + REPO + '，Public，其他都不要勾，点 Create repository。');
        console.log('   建好后重新运行：node deploy.js');
        process.exit(1);
    }

    console.log('  ✓ 仓库存在（私有的？' + (repo.private ? '是，Pages 需要 public' : '否') + '）');

    console.log('\n推送到 origin/main …');
    try {
        execFileSync('git', ['push', '-u', 'origin', 'main'], {
            cwd: ROOT, stdio: 'inherit'
        });
    } catch (e) {
        console.log('\n✗ 推送失败。若是认证问题，先在本机登录一次：');
        console.log('   git push -u origin main     （在弹出的窗口里用浏览器授权）');
        process.exit(1);
    }

    console.log('\n✓ 已推送。最后一步（只能你点，需要账号权限）：');
    console.log('   https://github.com/' + OWNER + '/' + REPO + '/settings/pages');
    console.log('   Source 选 "Deploy from a branch"，Branch 选 main、目录 /(root)，Save。');
    console.log('\n   约 1 分钟后上线：https://lixin2026-max.github.io/' + REPO + '/');
    console.log('   这个地址不会变，也是 FormSubmit 已登记的表单地址。');
})();
