// 打开功能面板 + 调试层：把 #modBtn / #fbBtn 的实际几何与计算样式打到大字浮层上。
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const inject = `
<div id="dbg" style="position:fixed;left:0;bottom:0;z-index:9999;background:#000;color:#0f0;
 font:12px/1.45 ui-monospace,monospace;padding:6px;white-space:pre;max-width:100%"></div>
<script>
setTimeout(function(){
    var p = document.getElementById('modPanel');
    if (p) p.classList.add('on');
    function info(id){
        var el = document.getElementById(id);
        if (!el) return id + ': 不存在';
        var r = el.getBoundingClientRect();
        var cs = getComputedStyle(el);
        return id + ': x=' + Math.round(r.left) + ' y=' + Math.round(r.top) +
               ' w=' + Math.round(r.width) + ' h=' + Math.round(r.height) +
               ' | pos=' + cs.position + ' disp=' + cs.display +
               ' L=' + cs.left + ' R=' + cs.right + ' B=' + cs.bottom + ' T=' + cs.top +
               ' z=' + cs.zIndex + ' op=' + cs.opacity + ' vis=' + cs.visibility;
    }
    var app = document.getElementById('app');
    var ar = app.getBoundingClientRect();
    document.getElementById('dbg').textContent =
        'vw=' + innerWidth + ' vh=' + innerHeight + '\\n' +
        'body.class="' + document.body.className + '"\\n' +
        'app: x=' + Math.round(ar.left) + ' y=' + Math.round(ar.top) +
        ' w=' + Math.round(ar.width) + ' h=' + Math.round(ar.height) +
        ' tr=' + getComputedStyle(app).transform + ' pos=' + getComputedStyle(app).position + '\\n' +
        info('modBtn') + '\\n' + info('fbBtn');
}, 1600);
</script>
</body>`;

fs.writeFileSync(path.join(ROOT, 'paneldbg.html'), src.replace('</body>', inject), 'utf8');
console.log('ok');
