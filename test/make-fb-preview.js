// 仅用于视觉验证：复制 index.html，注入「自动打开意见弹窗」，再用无头浏览器截图。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const inject = `
<script>
setTimeout(function(){
    openFeedback();
    var t = document.getElementById('fbText');
    t.value = '小屋屋顶想换成茅草；向日葵多一点；夜里太黑看不到路。';
    document.getElementById('fbCount').textContent = t.value.length + ' / 600';
}, 1400);
</script>
</body>`;

const out = src.replace('</body>', inject);
fs.writeFileSync(path.join(ROOT, '_fbtmp.html'), out, 'utf8');
console.log('已生成 _fbtmp.html（' + out.length + ' 字节）');
