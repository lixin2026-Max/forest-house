/*
 * 把 index.html + js/three.min.js 打成**单文件** HTML。
 * 好处：可以整体拖到任意静态托管（Netlify Drop / Vercel / GitHub Pages），
 * 也能在手机、微信里直接用 https 链接打开 —— 不再依赖相对路径。
 *
 *   node build-single.js
 *   → 生成 forest-house-single.html
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const three = fs.readFileSync(path.join(ROOT, 'js', 'three.min.js'), 'utf8');

if (three.includes('</script')) {
    console.error('three.min.js 里出现了 </script，需要转义后再内联');
    process.exit(1);
}

const tag = /<script\s+src=["']js\/three\.min\.js["']\s*><\/script>/;
if (!tag.test(html)) {
    console.error('没找到 <script src="js/three.min.js"></script> 标签');
    process.exit(1);
}

const out = html.replace(tag, '<script>\n' + three + '\n</script>');
const dest = path.join(ROOT, 'forest-house-single.html');
fs.writeFileSync(dest, out, 'utf8');

const kb = (n) => (n / 1024).toFixed(0) + 'KB';
console.log('已生成 forest-house-single.html');
console.log('  原始 index.html        ' + kb(html.length));
console.log('  three.min.js           ' + kb(three.length));
console.log('  单文件                 ' + kb(out.length));
console.log('');
console.log('  自检：残留外链 ' + (/<script\s+src=/.test(out) ? '有（需检查）' : '无 ✅'));
