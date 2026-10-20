/*
 * 验证「真浏览器 → FormSubmit」这条生产链路。
 *
 * 做法：复制 index.html，注入「打开弹窗 → 填字 → 点提交」，
 * 6 秒后把弹窗底部那句提示原样 POST 回本地 /api/feedback，
 * 于是结果直接落在 feedback.jsonl 里 —— 不依赖截图、不依赖 DOM dump。
 *
 * 用法：
 *   node test/make-fb-prod.js                 # 只生成 _fbprod.html
 *   node test/make-fb-prod.js --run <url>     # 生成 + 用无头 Edge 真跑一遍
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const inject = `
<script>
setTimeout(function(){
    try{
        openFeedback();
        var t=document.getElementById('fbText');
        t.value='生产链路自检：真浏览器直连 FormSubmit。';
        document.getElementById('fbCount').textContent=t.value.length+' / 600';
        document.getElementById('fbCopy').click();
    }catch(e){
        fetch('/api/feedback',{method:'POST',body:'{"text":"SELFTEST JS错误: '+String(e.message).replace(/"/g,'')+'"}'}).catch(function(){});
    }
}, 1200);
setTimeout(function(){
    var m=document.getElementById('fbMsg');
    var msg=(m && m.textContent || '(找不到 #fbMsg)').trim();
    fetch('/api/feedback',{method:'POST',body:JSON.stringify({
        text:'SELFTEST 浏览器看到的提示 → '+msg,
        meta:{weather:'selftest',screen:innerWidth+'x'+innerHeight,mobile:false,ua:'fbprod'}
    })}).catch(function(){});
}, 8000);
</script>
</body>`;

fs.writeFileSync(path.join(ROOT, '_fbprod.html'),
    fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace('</body>', inject), 'utf8');
console.log('已生成 _fbprod.html');

const i = process.argv.indexOf('--run');
if (i > -1) {
    const url = process.argv[i + 1] || 'http://127.0.0.1:8000/_fbprod.html';
    console.log('无头 Edge 打开：' + url);
    try {
        execFileSync(EDGE, [
            '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
            '--use-gl=angle', '--use-angle=swiftshader',
            '--window-size=1280,720', '--virtual-time-budget=14000',
            '--user-data-dir=' + path.join(process.env.TEMP || '/tmp', 'edgeprof_fbprod'),
            '--screenshot=' + path.join(ROOT, 'test', 'fb_prod.png'),
            url
        ], { stdio: 'ignore', timeout: 60000 });
    } catch (e) {
        console.log('Edge 退出异常（不影响结论，看 feedback.jsonl）');
    }
}
