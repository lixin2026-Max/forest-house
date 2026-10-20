// 打开功能面板并截图，验证开关 / 视角 / 色调 / 静音按钮都在位。
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const inject = `
<script>
setTimeout(function(){
    var p = document.getElementById('modPanel');
    if (p) p.classList.add('on');
    var b = document.getElementById('modBtn');
    if (b) b.style.outline = '2px solid #ff0';
}, 1500);
</script>
</body>`;

fs.writeFileSync(path.join(ROOT, 'paneltest.html'), src.replace('</body>', inject), 'utf8');
console.log('ok');
