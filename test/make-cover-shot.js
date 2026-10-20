// 生成封面用的干净场景图：隐藏所有 UI，切到黄昏，等一帧再截。
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const inject = `
<style>
  #ui,#status,#modBtn,#modPanel,#fbBtn,#boot{display:none !important}
</style>
<script>
setTimeout(function(){
    var btns = document.querySelectorAll('#wbtns button');
    if(btns[4]) btns[4].click();          // 金色时刻
    var fog = document.getElementById('fogAmt');
    if(fog){ fog.value = 8; fog.dispatchEvent(new Event('input')); }
}, 1800);
</script>
</body>`;

fs.writeFileSync(path.join(ROOT, 'coverscene.html'), src.replace('</body>', inject), 'utf8');
console.log('coverscene.html 已生成');
