// 从 _fbtmp.html（node 生成、编码完好）重建 index.html，并补上「提交意见」的三处改动。
// 背景：之前用 pwsh 的 Get-Content/Set-Content 替换中文文案，把 UTF-8 写坏成 mojibake，
// 76 行出现非法字节。本脚本一次性重建，之后文本改动一律走 edit/write 工具。
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let s = fs.readFileSync(path.join(ROOT, '_fbtmp.html'), 'utf8');

// ---- 1. 去掉预览注入脚本 ----
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
if (!s.includes(inject)) {
    console.error('找不到预览注入块，终止（避免误改）');
    process.exit(1);
}
s = s.replace(inject, '</body>');

// ---- 2. CSP：connect-src 放宽到 'self'，只为 /api/feedback ----
const oldComment = '<!-- 安全基线：整页自包含，不允许任何外部加载；不联网、不读存储、不嵌框 -->';
const newComment = '<!-- 安全基线：除「同源」外不允许任何外部加载；connect-src 仅放行本站的 /api/feedback -->';
if (!s.includes(oldComment)) { console.error('CSP 注释未找到'); process.exit(1); }
s = s.replace(oldComment, newComment);

if (!s.includes("connect-src 'none'; font-src")) { console.error("connect-src 未找到"); process.exit(1); }
s = s.replace("connect-src 'none'; font-src", "connect-src 'self'; font-src");

// ---- 3. 按钮文案与小字说明 ----
s = s.replace('id="fbCopy">复制意见</button>', 'id="fbCopy">提交意见</button>');
s = s.replace('点「复制意见」会自动带上当前时间和天气，粘到聊天里发给我就行。',
              '点「提交意见」会先复制一份、同时静默发给我；没有回传通道时也能粘到聊天里发我。');

// ---- 4. 反馈逻辑：复制兜底 + 同源静默回传 ----
const startMark = '/* ==================== 优化意见弹窗 ==================== */';
const endMark = '/* ==================== 初始化 ==================== */';
const i0 = s.indexOf(startMark);
const i1 = s.indexOf(endMark);
if (i0 < 0 || i1 < 0 || i1 < i0) { console.error('反馈代码块边界未找到'); process.exit(1); }

const fbBlock = String.raw`/* ==================== 优化意见弹窗 ==================== */
// 提交策略：先本地复制（永不丢），再向**同源** /api/feedback 静默回传一条。
// 回传失败不影响任何人体验 —— 用户看到的只是「已复制」，粘给我就行。
const FB_MAX=600;
const FB_ENDPOINT='/api/feedback';
function fbEl(id){ return document.getElementById(id); }
function pad2(n){ return n<10?'0'+n:''+n; }
function feedbackStamp(){
    const d=new Date();
    return '【优化意见】'+d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())+' '+
        pad2(d.getHours())+':'+pad2(d.getMinutes())+
        ' · 天气:'+(weatherLabels[weatherIndex]||'-')+
        ' · 画面:'+LAYOUT.w+'x'+LAYOUT.h+(ROT?'(横屏)':'');
}
function feedbackText(){
    const body=(fbEl('fbText').value||'').trim();
    return feedbackStamp()+'\n'+body;
}
function setFbMsg(msg,isErr){
    const m=fbEl('fbMsg');
    m.textContent=msg||'';
    m.className=isErr?'err':'';
}
// 剪贴板：优先异步 API（https/localhost 才有），否则退回 execCommand
function copyToClipboard(text){
    if(navigator.clipboard && navigator.clipboard.writeText){
        return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve,reject)=>{
        const ta=document.createElement('textarea');
        ta.value=text;
        ta.style.position='fixed';
        ta.style.top='0';
        ta.style.opacity='0';
        ta.setAttribute('readonly','readonly');
        document.body.appendChild(ta);
        ta.select();
        let ok=false;
        try{ ok=document.execCommand('copy'); }catch(err){ ok=false; }
        document.body.removeChild(ta);
        if(ok) resolve(); else reject(new Error('浏览器不允许复制'));
    });
}
// 静默回传：只发往同源 /api/feedback，3 秒超时，任何失败都不抛错、不弹窗
function sendFeedback(body){
    if(typeof fetch!=='function') return Promise.resolve(false);
    let timer=null;
    try{
        const ctrl=(typeof AbortController==='function')?new AbortController():null;
        if(ctrl) timer=setTimeout(()=>ctrl.abort(),3000);
        return fetch(FB_ENDPOINT,{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(body),
            credentials:'omit',
            keepalive:true,
            signal:ctrl?ctrl.signal:undefined
        }).then(r=>{
            if(timer) clearTimeout(timer);
            return r.ok;
        }).catch(()=>{
            if(timer) clearTimeout(timer);
            return false;
        });
    }catch(err){
        if(timer) clearTimeout(timer);
        return Promise.resolve(false);
    }
}
let fbOpen=false;
function openFeedback(){
    if(fbOpen) return;
    fbOpen=true;
    fbEl('fbMask').classList.add('on');
    setFbMsg('');
    const t=fbEl('fbText');
    try{ t.focus({preventScroll:true}); }catch(err){ t.focus(); }
}
function closeFeedback(){
    if(!fbOpen) return;
    fbOpen=false;
    fbEl('fbMask').classList.remove('on');
    setFbMsg('');
}
function setupFeedback(){
    const ta=fbEl('fbText'), cnt=fbEl('fbCount');
    fbEl('fbBtn').addEventListener('click',openFeedback);
    fbEl('fbClose').addEventListener('click',closeFeedback);
    fbEl('fbMask').addEventListener('click',e=>{
        if(e.target===fbEl('fbMask')) closeFeedback();
    });
    ta.addEventListener('input',()=>{
        cnt.textContent=ta.value.length+' / '+FB_MAX;
        if(fbEl('fbMsg').className==='err') setFbMsg('');
    });
    fbEl('fbClear').addEventListener('click',()=>{
        ta.value='';
        cnt.textContent='0 / '+FB_MAX;
        setFbMsg('');
        ta.focus();
    });
    fbEl('fbCopy').addEventListener('click',()=>{
        const text=feedbackText();
        if((ta.value||'').trim().length===0){
            setFbMsg('还没写内容呢，先写两句再提交。',true);
            ta.focus();
            return;
        }
        // ① 先复制 —— 这一步不依赖网络，永远可用
        copyToClipboard(text).then(()=>{
            setFbMsg('已复制。正在发送…');
        }).catch(()=>{
            ta.value=text;
            cnt.textContent=ta.value.length+' / '+FB_MAX;
            try{ ta.focus(); ta.setSelectionRange(0,text.length); }catch(err){}
            setFbMsg('这个浏览器不让自动复制，文本已全选，长按「复制」。正在发送…',true);
        }).then(()=>{
            // ② 再静默回传（可能不可用：静态托管 / 离线打开）
            return sendFeedback({
                text:text,
                meta:{
                    weather:(weatherLabels[weatherIndex]||''),
                    screen:LAYOUT.w+'x'+LAYOUT.h+(ROT?' 横屏':''),
                    mobile:IS_MOBILE,
                    ua:(typeof navigator!=='undefined'&&navigator.userAgent)?navigator.userAgent:''
                }
            });
        }).then(ok=>{
            if(ok){
                setFbMsg('✅ 已收到，谢谢！已复制到剪贴板，想补充可以直接粘给我。');
            }else{
                setFbMsg('✅ 已复制到剪贴板 —— 这条链接没有回传通道，粘到聊天里发我即可。');
            }
            fbEl('fbText').value='';
            cnt.textContent='0 / '+FB_MAX;
        });
    });
    // Esc 关闭：挂在 document 上，但不阻断原有 T/P 快捷键
    document.addEventListener('keydown',e=>{
        if(e.key==='Escape' && fbOpen){
            closeFeedback();
            e.stopPropagation();
        }
    },true);
}

`;

s = s.slice(0, i0) + fbBlock + s.slice(i1);

fs.writeFileSync(path.join(ROOT, 'index.html'), s, 'utf8');
console.log('已重建 index.html：' + Buffer.byteLength(s, 'utf8') + ' 字节');
console.log('非法 UTF-8 残留: ' + (s.includes('\uFFFD') ? '有 ✗' : '无 ✅'));
