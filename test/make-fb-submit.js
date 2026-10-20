// 端到端验证「用户点了提交，我真能收到」：
// 复制 index.html → 注入「打开弹窗、填写文案、点提交」→ 用无头浏览器真的跑一遍
// → 截图 + 由调用方检查 feedback.jsonl 是否落了这一条。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const TEXT = '屋顶想换成茅草；向日葵再多一点；夜里加几盏路灯。';

const inject = `
<script>
setTimeout(function(){
    openFeedback();
    var t = document.getElementById('fbText');
    t.value = ${JSON.stringify(TEXT)};
    document.getElementById('fbCount').textContent = t.value.length + ' / 600';
    setTimeout(function(){ document.getElementById('fbCopy').click(); }, 400);
}, 1200);
</script>
</body>`;

fs.writeFileSync(path.join(ROOT, '_fbsubmit.html'), src.replace('</body>', inject), 'utf8');
console.log('已生成 _fbsubmit.html，提交文案：' + TEXT);
