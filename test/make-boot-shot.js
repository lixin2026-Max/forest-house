// 生成 bootsafe.html：故意把 three.js 指向不存在的文件，
// 用来验证「资源加载失败降级 + 加载兜底」不会白屏。
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const MISSING = 'js/__missing_for_fallback_test__.js';
const out = src.replace(/(<script src=")js\/three\.min\.js(")/, '$1' + MISSING + '$2');

if (out === src) {
    console.error('没找到 three.js 的 script 标签，脚本需要更新');
    process.exit(1);
}

fs.writeFileSync(path.join(ROOT, 'bootsafe.html'), out, 'utf8');
console.log('bootsafe.html 已生成（three.js 指向缺失文件）');
