// 生成 paneltest.html：打开功能面板并把面板放开（不裁切），用于截图核对全局区。
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const inject = `
<script>
setTimeout(function(){
    var p = document.getElementById('modPanel');
    if(!p) return;
    p.classList.add('on');
    // 放开面板高度限制，把整块内容一次性摊开（仅截图用）
    p.style.maxHeight = 'none';
    p.style.bottom = '6px';
    p.style.top = '6px';
    p.style.overflow = 'visible';
}, 1500);
</script>
</body>`;

fs.writeFileSync(path.join(ROOT, 'paneltest.html'), src.replace('</body>', inject), 'utf8');
console.log('paneltest.html 已生成');
