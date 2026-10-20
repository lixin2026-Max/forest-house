/* 森林小屋场景验收测试 —— 对应 spec.md 的六条验收标准（v2 优化版） */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');   // forest-house-scene/
const indexPath = path.join(root, 'index.html');
const threePath = path.join(root, 'js', 'three.min.js');

let passed = 0, failed = 0;
function test(name, fn){
    try { fn(); console.log(`  PASS: ${name}`); passed++; }
    catch(e){ console.log(`  FAIL: ${name} — ${e.message}`); failed++; }
}
function must(cond, msg){ if(!cond) throw new Error(msg); }

// ---------- AC1/AC2: 离线交付 ----------
test('AC1 index.html 存在', ()=> must(fs.existsSync(indexPath), 'index.html not found'));
test('AC2 js/three.min.js 存在且完整(>500KB)', ()=>{
    must(fs.existsSync(threePath), 'three.min.js not found');
    must(fs.statSync(threePath).size > 500000, 'three.min.js too small');
});

// 只检查内联脚本内容（排除 <script src="..."> 标签本身）
const html = fs.readFileSync(indexPath,'utf8');
const inlineJs = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n;\n');

test('AC2 本地引用 three.min.js，内联脚本无远程资源', ()=>{
    must(html.includes('<script src="js/three.min.js">'), 'no local three.js script tag');
    must(!/src\s*=\s*["']https?:/.test(html), 'found remote script src (breaks offline)');
    must(!/url\(["']?https?:/i.test(inlineJs), 'inline JS fetches remote url');
});

// ---------- AC3: 场景元素齐全 ----------
test('AC3 小屋 createHouse()', ()=> must(/function createHouse\(/.test(inlineJs),'missing'));
test('AC3 树木（松树+白桦）', ()=>{
    must(/function buildPineGeo\(/.test(inlineJs),'missing pine builder');
    must(/function buildBirchGeo\(/.test(inlineJs),'missing birch builder');
    must(/function plantTree\(/.test(inlineJs),'missing planter');
});
test('AC3 树上动物（松鼠+鸟）', ()=>{
    must(/function attachSquirrel\(/.test(inlineJs),'missing squirrel');
    must(/function attachBird\(/.test(inlineJs),'missing bird');
});
test('AC3 向日葵 createSunflowers()', ()=> must(/function createSunflowers\(/.test(inlineJs),'missing'));
test('AC3 杂草 createGrass()', ()=> must(/function createGrass\(/.test(inlineJs),'missing'));
test('AC3 蝴蝶与蜜蜂', ()=>{
    must(/butterflies\.push/.test(inlineJs),'no butterflies');
    must(/bees\.push/.test(inlineJs),'no bees');
});

// ---------- AC4: 五种天气可切换 ----------
test('AC4 weatherModes 恰好 5 种', ()=>{
    const m = inlineJs.match(/weatherModes\s*=\s*\[([^\]]+)\]/);
    must(m,'no weatherModes array');
    const items = m[1].split(',').map(s=>s.trim().replace(/^['"]|['"]$/g,''));
    must(items.length===5, 'expected 5 modes, got '+items.length);
    ['sunny','mist','night','rain','golden'].forEach(k=>
        must(items.includes(k), 'missing mode: '+k));
});
test('AC4 SKY 表覆盖全部模式并带独立参数', ()=>{
    ['sunny','mist','night','rain','golden'].forEach(k=>
        must(new RegExp(k+"\\s*:\\s*\\{").test(inlineJs), 'SKY missing '+k));
    const dens=[...inlineJs.matchAll(/dens:\s*([\d.]+)/g)].map(m=>+m[1]);
    must(dens.length>=5,'fewer than 5 fog densities');
    must(new Set(dens).size>=5,'fog densities not differentiated');
});
test('AC4 cycleWeather + 动态按钮组 + T 键', ()=>{
    must(/function cycleWeather\(/.test(inlineJs),'no cycleWeather');
    must(/function buildWeatherButtons\(/.test(inlineJs),'no button builder');
    must(/key==='t'/.test(inlineJs),'no T key handler');
});

// ---------- AC5: 光照/雾随天气变化 ----------
test('AC5 lerpWeather 应用雾色/密度/环境光/太阳强度', ()=>{
    must(/function lerpWeather\(/.test(inlineJs),'no lerpWeather');
    must(/scene\.fog\.density=dens/.test(inlineJs),'fog density not applied');
    must(/ambient\.intensity=curSky\.amb/.test(inlineJs),'ambient not applied');
    must(/sun\.intensity=curSky\.sunI/.test(inlineJs),'sun intensity not applied');
});
test('AC5 夜间有星空、雨天有雨滴、晴天有日月', ()=>{
    must(/function addStars\(/.test(inlineJs),'no stars');
    must(/function addRain\(/.test(inlineJs),'no rain');
    must(/wantStars&&addStars|!wantStars&&starsGroup/.test(inlineJs),'stars toggle missing');
    must(/wantRain&&!rainPoints\)addRain/.test(inlineJs),'rain toggle missing');
    must(/moonMesh/.test(inlineJs),'no moon');
});

// ---------- AC6: 运行无报错（静态检查） ----------
test('AC6 所有被调用的函数都有定义', ()=>{
    const defined = new Set([...inlineJs.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]));
    // 方法简写 flyTo(theta,phi,radius){...} 也算定义
    [...inlineJs.matchAll(/^\s*([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)].forEach(m=>defined.add(m[1]));
    // const/let xxx = function(...) / (...) => ... / mulberry32(...) 等赋值即定义
    [...inlineJs.matchAll(/(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=/g)].forEach(m=>defined.add(m[1]));
    // 剥掉模板字符串（GLSL）与普通字符串（rgba(...) 等），避免误判
    const stripped = inlineJs
        .replace(/`[^`]*`/g,'""')
        .replace(/'[^'\n]*'/g,"''")
        .replace(/"[^"\n]*"/g,'""');
    // Promise 的 resolve/reject 是回调参数，不作为「未定义函数」处理
    const builtin = /^(if|for|while|switch|return|typeof|new|function|catch|try|do|else|Error|Number|String|Boolean|Array|Object|Set|Map|JSON|Math|Date|Promise|Float32Array|Float64Array|Int32Array|Uint8Array|requestAnimationFrame|cancelAnimationFrame|setTimeout|clearTimeout|setInterval|console|THREE|resolve|reject|fetch|AbortController)$/;
    const calls = [...stripped.matchAll(/(?:^|[^\w$.])([a-zA-Z_$][\w$]*)\s*\(/g)].map(m=>m[1]);
    const missing = [...new Set(calls)].filter(n=>!defined.has(n) && !builtin.test(n));
    must(missing.length===0, 'undefined function calls: '+missing.join(', '));
});
test('AC6 圆括号配对（JS 部分）', ()=>{
    let o=0; for(const c of inlineJs){ if(c==='(')o++; if(c===')')o--; }
    must(o===0, 'unmatched parens: '+o);
});
test('AC6 花括号配对（JS 部分）', ()=>{
    let o=0; for(const c of inlineJs){ if(c==='{')o++; if(c==='}')o--; }
    must(o===0, 'unmatched braces: '+o);
});
test('AC6 方括号配对（JS 部分）', ()=>{
    let o=0; for(const c of inlineJs){ if(c==='[')o++; if(c===']')o--; }
    must(o===0, 'unmatched brackets: '+o);
});
test('AC6 内联脚本语法合法（node --check）', ()=>{
    const tmp = path.join(__dirname,'_tmp_script.js');
    fs.writeFileSync(tmp, inlineJs);
    const r = require('child_process').spawnSync(process.execPath,['--check',tmp],{encoding:'utf8'});
    fs.unlinkSync(tmp);
    must(r.status===0, 'syntax error:\n'+r.stderr.slice(0,800));
});
test('AC6 启动保护：THREE 缺失时给出可读错误而非黑屏', ()=>{
    must(/typeof THREE\s*===\s*'undefined'/.test(inlineJs),'no THREE guard');
    must(/showFatal/.test(inlineJs),'no fatal error UI');
});

// ---------- 附加：性能结构检查 ----------
test('PERF 使用 InstancedMesh 合批花草', ()=>{
    must(/InstancedMesh/.test(inlineJs),'no instancing');
    const n=(inlineJs.match(/new THREE\.InstancedMesh/g)||[]).length;
    must(n>=3,'only '+n+' instanced meshes');
});
test('PERF sRGB + ACES 色调映射开启', ()=>{
    must(/sRGBEncoding/.test(inlineJs),'no sRGB output');
    must(/ACESFilmicToneMapping/.test(inlineJs),'no tone mapping');
});
test('PERF pixelRatio 有上限（桌面 2 / 移动 1.6）', ()=>{
    must(/setPixelRatio\(Math\.min\(window\.devicePixelRatio,\s*(IS_MOBILE\?1\.6:\s*)?2\)\)/.test(inlineJs),'uncapped pixel ratio');
});

/* ---------- 移动端适配 ---------- */
test('MOBILE 有 viewport meta（不是桌面宽度缩放）', ()=>{
    must(/<meta\s+name="viewport"[^>]*width=device-width/.test(html),'缺少 viewport meta');
});
test('MOBILE 相机控制用 Pointer Events 且支持双指捏合', ()=>{
    must(/addEventListener\('pointerdown'/.test(inlineJs),'缺少 pointerdown 监听');
    must(/addEventListener\('pointermove'/.test(inlineJs),'缺少 pointermove 监听');
    must(/pointers\.size===2/.test(inlineJs),'缺少双指处理');
    must(/pinchDist/.test(inlineJs),'缺少捏合缩放变量');
});
test('MOBILE 画布禁用浏览器手势（touch-action / gesturestart）', ()=>{
    must(/touchAction\s*=\s*'none'|touch-action:\s*none/.test(html),'未禁用 touch-action');
    must(/gesturestart/.test(inlineJs),'未拦截 iOS gesturestart');
});
test('MOBILE 有窄屏媒体查询', ()=>{
    must(/@media\s*\(max-width:600px\)/.test(html),'缺少窄屏媒体查询');
    must(/#ui\{[^}]*right:\d+px/.test(html),'面板未做通栏适配');
});
test('MOBILE 竖屏自动转横屏（CSS 旋转 + 尺寸交换）', ()=>{
    must(/body\.rot90\s+#app\{[^}]*rotate\(90deg\)/.test(html),'缺少 rot90 旋转规则');
    must(/ROT\s*=\s*IS_MOBILE\s*&&\s*ih\s*>\s*iw/.test(inlineJs),'缺少竖屏判定');
    must(/LAYOUT\.w\s*=\s*ROT\s*\?\s*ih\s*:\s*iw/.test(inlineJs),'缺少尺寸交换');
});
test('MOBILE 旋转后触摸拖动方向已补偿', ()=>{
    must(/if\(ROT\)\{\s*const t=dx;\s*dx=dy;\s*dy=-t;\s*\}/.test(inlineJs),'旋转后拖动方向未补偿');
});
test('MOBILE 性能降档生效（阴影/实例数量）', ()=>{
    must(/mapSize\.set\(IS_MOBILE\?1024:2048/.test(inlineJs),'阴影分辨率未降档');
    must(/IS_MOBILE\?140:260/.test(inlineJs),'草地实例未降档');
});

// ---------- AC8: 优化意见弹窗 ----------
test('FB 弹窗结构齐备（按钮/遮罩/输入框/操作）', ()=>{
    ['fbBtn','fbMask','fbBox','fbText','fbCopy','fbClear','fbClose','fbCount','fbMsg']
        .forEach(id => must(new RegExp('id="'+id+'"').test(html), '缺少 #'+id));
    must(/<textarea[^>]*id="fbText"[^>]*maxlength="\d+"/.test(html),'输入框缺 maxlength');
});
test('FB 弹窗可开关（点击按钮/关闭/Esc/点遮罩）', ()=>{
    must(/function openFeedback\(/.test(inlineJs),'缺少 openFeedback');
    must(/function closeFeedback\(/.test(inlineJs),'缺少 closeFeedback');
    must(/getElementById\('fbBtn'\)|fbEl\('fbBtn'\)/.test(inlineJs),'按钮未绑定');
    must(/e\.key==='Escape'/.test(inlineJs),'缺少 Esc 关闭');
    must(/e\.target===fbEl\('fbMask'\)/.test(inlineJs),'点遮罩未关闭');
});
test('FB 提交：先复制兜底，再只向同源 /api/feedback 回传', ()=>{
    must(/function copyToClipboard\(/.test(inlineJs),'缺少复制实现');
    must(/navigator\.clipboard[^;]*writeText/.test(inlineJs),'未使用 Clipboard API');
    must(/execCommand\('copy'\)/.test(inlineJs),'缺少 execCommand 降级');
    // 网络调用必须恰好一处，且目标是同源相对路径
    const fetchCalls = inlineJs.match(/\bfetch\s*\(/g) || [];
    must(fetchCalls.length===1,'应恰好一处 fetch，实际 '+fetchCalls.length);
    must(/const FB_ENDPOINT='\/api\/feedback'/.test(inlineJs),'回传地址必须是同源相对路径');
    must(/fetch\(FB_ENDPOINT,/.test(inlineJs),'fetch 未指向 FB_ENDPOINT');
    must(/keepalive:true/.test(inlineJs),'缺少 keepalive，关页时可能丢');
    must(/AbortController/.test(inlineJs)&&/abort\(\)/.test(inlineJs),'缺少 3 秒超时中断');
    // 禁止任何外发/持久化
    must(!/https?:\/\//.test(inlineJs),'出现绝对 URL，可能外发');
    must(!/XMLHttpRequest|sendBeacon|WebSocket/.test(inlineJs),'出现其他网络通道');
    must(!/localStorage|sessionStorage|document\.cookie/.test(inlineJs),'提交写了存储');
    // 顺序保证：先复制，后发送
    const iCopy = inlineJs.indexOf('copyToClipboard(text).then(');
    const iSend = inlineJs.indexOf('sendFeedback({');
    must(iCopy>0&&iSend>iCopy,'必须先复制再回传，否则没网时内容丢失');
});
test('FB 复制内容带上下文（时间/天气/分辨率）', ()=>{
    must(/function feedbackStamp\(/.test(inlineJs),'缺少上下文抬头');
    must(/weatherLabels\[weatherIndex\]/.test(inlineJs),'抬头缺天气');
    must(/LAYOUT\.w\+'x'\+LAYOUT\.h/.test(inlineJs),'抬头缺分辨率');
});
test('FB 移动端与旋转态有独立定位', ()=>{
    must(/#fbBtn\{[^}]*position:absolute/.test(html),'按钮未定位');
    must(/body\.rot90\s+#fbBtn\{/.test(html),'旋转态未调整按钮位置');
    must(/#fbMask\{[^}]*inset:0/.test(html),'遮罩未铺满');
});

console.log('\n====================');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed>0 ? 1 : 0);