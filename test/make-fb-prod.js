/*
 * 验证「真浏览器 → FormSubmit」这条生产链路是否真的走通。
 * 做法：拿 index.html 复制一份，注入「打开弹窗 → 填字 → 点提交」，
 * 5 秒后把弹窗底部那句提示写进 <body data-fbmsg="…">，
 * 再用 Edge --dump-dom 把 DOM 抓出来读这个属性。
 *
 * 注意：浏览器发出的 Origin 是真实来源（127.0.0.1:8000），
 * 和 FormSubmit 登记的 ...github.io 不一致 —— 这正好能看出它是否校验来源。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const inject = `
<script>
function _msg(){ var m=document.getElementById('fbMsg'); return m ? (m.textContent||'').trim() : '(找不到 #fbMsg)'; }
setTimeout(function(){
    try{
        openFeedback();
        var t=document.getElementById('fbText');
        t.value='生产链路测试：浏览器直连 FormSubmit 是否走通。';
        document.getElementById('fbCount').textContent=t.value.length+' / 600';
        document.getElementById('fbCopy').click();
    }catch(e){ document.body.setAttribute('data-fbmsg','JS错误: '+e.message); }
}, 1200);
setTimeout(function(){ document.body.setAttribute('data-fbmsg', _msg()); }, 6000);
</script>
</body>`;

fs.writeFileSync(path.join(ROOT, '_fbprod.html'), src.replace('</body>', inject), 'utf8');
console.log('已生成 _fbprod.html');
