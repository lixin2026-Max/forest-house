// 一键跑全部回归：node test/all.js
// 任何一套红了就整体红（退出码 1），适合提交前跑。
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SUITES = [
    ['verify.js', '静态验收'],
    ['smoke.js', '运行时冒烟'],
    ['security-audit.js', '安全审计'],
    ['feedback-e2e.js', '意见接口端到端'],
    ['subpath-check.js', '子路径部署（GitHub Pages）'],
    ['perf-guard.js', '性能守卫（draw calls / 三角面）']
];

let failed = 0;

// 先检查编码：被错误工具改坏成非 UTF-8 的文件，后面所有测试都没意义
console.log('\n[0/' + SUITES.length + '] 编码自检');
{
    const fs = require('fs');
    const targets = ['index.html', 'serve.js', 'report.md', '手机上打开.md'];
    let bad = 0;
    for (const f of targets) {
        const p = path.join(ROOT, f);
        if (!fs.existsSync(p)) continue;
        const s = fs.readFileSync(p, 'utf8');
        if (s.includes('\uFFFD')) {
            console.log('  FAIL: ' + f + ' 含非法 UTF-8（编码被破坏）');
            bad++;
        }
    }
    if (bad === 0) console.log('  PASS: 四个文本文件均为合法 UTF-8');
    else failed++;
}

SUITES.forEach(([file, label], i) => {
    console.log('\n[' + (i + 1) + '/' + SUITES.length + '] ' + label + '（' + file + '）');
    const r = spawnSync(process.execPath, [path.join(__dirname, file)], {
        cwd: ROOT, encoding: 'utf8'
    });
    const out = (r.stdout || '') + (r.stderr || '');
    // 只回显结论行，避免刷屏
    out.split('\n')
        .filter(l => /Results:|passed|SMOKE|SAFE|UNSAFE|FEEDBACK OK|FAIL/.test(l))
        .forEach(l => console.log('  ' + l.trim()));
    if (r.status !== 0) failed++;
});

console.log('\n' + '='.repeat(52));
if (failed) {
    console.log('✗ 有 ' + failed + ' 处未通过');
    process.exit(1);
}
console.log('✓ 全部通过 — 可以提交');
process.exit(0);
