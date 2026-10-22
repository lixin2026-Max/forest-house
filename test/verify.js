/* 楚门的2.0世界 验收测试 —— 对应 spec.md 的六条验收标准（v2 优化版） */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');   // 楚门的2.0世界/
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
    const builtin = /^(if|for|while|switch|return|typeof|new|function|catch|try|do|else|Error|Number|String|Boolean|Array|Object|Set|Map|JSON|Math|Date|Promise|Float32Array|Float64Array|Int32Array|Uint8Array|requestAnimationFrame|cancelAnimationFrame|setTimeout|clearTimeout|setInterval|clearInterval|console|THREE|parseInt|parseFloat|isNaN|localStorage|resolve|reject|fetch|AbortController|URLSearchParams|FormData|Event|CustomEvent|performance|location|navigator)$/;
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
test('PERF pixelRatio 有上限（桌面 2 / 移动 1.5），并且统一走自适应变量', ()=>{
    must(/const DPR_CAP = IS_MOBILE \? 1\.5 : 2;/.test(inlineJs), '缺少像素比上限常量 DPR_CAP');
    must(/let dprCur = Math\.min\([^;]*DPR_CAP\)/.test(inlineJs), 'dprCur 未按上限初始化');
    must(/renderer\.setPixelRatio\(dprCur\)/.test(inlineJs), '未统一使用 dprCur');
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
test('MOBILE 竖屏走 9:16 原生竖构图（不再整体旋转）', ()=>{
    // v3 起：竖屏不做 CSS 旋转，改用相机视野补偿，避免界面被转 90°
    must(/ROT\s*=\s*false/.test(inlineJs),'竖屏不应再整体旋转成横屏');
    must(/function fitFov\(\)/.test(inlineJs),'缺少竖屏视野补偿 fitFov()');
    must(/camera\.fov=fitFov\(\)/.test(inlineJs),'onResize 未应用视野补偿');
    must(/new THREE\.PerspectiveCamera\(fitFov\(\)/.test(inlineJs),'相机初始 fov 未用 fitFov()');
});
test('MOBILE 旋转后触摸拖动方向已补偿', ()=>{
    // ROT 恒为 false，补偿代码保留以兼容旧链接；这里只要求它仍在位
    must(/if\(ROT\)\{\s*const t=dx;\s*dx=dy;\s*dy=-t;\s*\}/.test(inlineJs),'旋转后拖动方向未补偿');
});
test('MOBILE 性能降档生效（阴影/实例数量）', ()=>{
    must(/mapSize\.set\(IS_MOBILE\?1024:2048/.test(inlineJs),'阴影分辨率未降档');
    // #73 起草地降档走 GRASS_CFG 双档（grassTierAuto：移动端/低画质 → lite 档实例数）
    must(/function grassTierAuto\(\)\{\s*return \(IS_MOBILE \|\|/.test(inlineJs),'草地实例未降档');
});

// ---------- AC9: 部署与端侧判定 ----------
test('触屏判定独立于性能降档（IS_TOUCH 与 IS_MOBILE 分离）', ()=>{
    must(/const IS_TOUCH\s*=/.test(inlineJs), '缺少 IS_TOUCH');
    must(/pointer:coarse/.test(inlineJs), '缺少触屏媒体查询');
    must(/const IS_MOBILE\s*=\s*IS_TOUCH/.test(inlineJs), 'IS_MOBILE 应基于 IS_TOUCH 扩展');
});
test('资源用相对路径（GitHub Pages 子路径可用）', ()=>{
    must(/<script src="js\/three\.min\.js">/.test(html), 'three.js 不是相对路径');
    const abs = [...html.matchAll(/(?:src|href)\s*=\s*["'](\/[^/"'][^"']*)["']/g)].map(m=>m[1]);
    must(abs.length === 0, '存在以 / 开头的绝对路径：' + abs.join(', '));
});
test('GitHub Pages 需要的 .nojekyll 存在', ()=>{
    must(fs.existsSync(path.join(root, '.nojekyll')), '缺少 .nojekyll');
});

// ---------- AC10: 可插拔功能模块 ----------
test('功能注册表齐备（可独立开关的模块）', ()=>{
    ['bgm','ambience','particles','interact','daynight','tone','roam']
        .forEach(k => must(new RegExp(k + ':\\s*\\{\\s*on:(true|false)').test(inlineJs), '缺少功能开关 ' + k));
});
test('模块有统一挂载/更新钩子', ()=>{
    must(/function setupModules\(\)/.test(inlineJs), '缺少 setupModules()');
    must(/function updateModules\(dt, ?t\)/.test(inlineJs), '缺少 updateModules(dt,t)');
    must(/setupModules\(\);/.test(inlineJs), 'init() 未调用 setupModules()');
    must(/updateModules\(dt, ?t\);/.test(inlineJs), 'animate() 未调用 updateModules()');
});
test('BGM 按天气换音阶，音频文件只许站内内置主题曲一份', ()=>{
    must(/BGM_SCALE\s*=\s*\{/.test(inlineJs), '缺少按天气的音阶表');
    ['sunny','golden','mist','night','rain'].forEach(m =>
        must(new RegExp(m + '\\s*:\\s*\\[').test(inlineJs), '音阶表缺少 ' + m));
    // 程序化 BGM 本体仍不加载文件；全页只许引用内置主题曲这一份同源音频
    const audioRefs = html.match(/[\w./-]+\.(?:mp3|ogg|wav|m4a)/gi) || [];
    must(audioRefs.length > 0 && audioRefs.every(r => r === 'assets/audio/chumen-theme.mp3'),
        '引用了主题曲之外的音频文件：' + audioRefs.join(', '));
});
test('音频有总静音开关，且默认静音（不打扰打开者）', ()=>{
    must(/id="muteBtn"/.test(html), '缺少静音按钮');
    must(/let audioMuted=true/.test(inlineJs), '音频应默认静音');
    must(/function setMute\(v\)/.test(inlineJs), '缺少 setMute()');
});
test('门与篝火可点击（门有名字，可被 raycast 命中）', ()=>{
    must(/door\.name='houseDoor'/.test(inlineJs), '门没有 name，点不到');
    must(/scene\.getObjectByName\('houseDoor'\)/.test(inlineJs), '未通过名字查找门');
    must(/function onSceneTap\(ev\)/.test(inlineJs), '缺少点击命中处理');
    must(/function buildCampfire\(\)/.test(inlineJs), '缺少篝火');
});
test('自动漫游是可选彩蛋（默认关，移动输入即让位）', ()=>{
    must(/roam:\s*\{\s*on:false/.test(inlineJs), '漫游应默认关闭');
    must(/function updateAvatarRoam\(dt\)/.test(inlineJs), '缺少 updateAvatarRoam()（#100 化身漫游）');
    must(/updateAvatarRoam\(dt\);/.test(inlineJs), 'updateModules 未调用 updateAvatarRoam()');
    must(/function stopAvatarRoam\(\)/.test(inlineJs), '缺少 stopAvatarRoam()（玩家接管）');
    must(/stopAvatarRoam\(\);   \/\/ #100：玩家一动手/.test(inlineJs), '手动移动时应自动退出漫游');
});
test('自适应分辨率（掉帧降像素比、流畅再升回）', ()=>{
    must(/function perfTick\(dt\)/.test(inlineJs), '缺少 perfTick()');
    must(/fps < 38 && dprCur > 1/.test(inlineJs), '缺少掉帧降档');
    must(/renderer\.setPixelRatio\(dprCur\)/.test(inlineJs), '未用 dprCur 统一像素比');
    must(!/setPixelRatio\(Math\.min\(window\.devicePixelRatio/.test(inlineJs), '仍有写死的像素比，会与自适应冲突');
    must(/perfTick\(dt\);/.test(inlineJs), 'updateModules 未调用 perfTick()');
});
test('色调氛围包至少 6 套', ()=>{
    const n = (inlineJs.match(/\{\s*n:'[^']+',\s*f:'[^']*'\s*\}/g) || []).length;
    must(n >= 6, '色调包不足 6 套，当前 ' + n);
});
test('电脑端也自适应（窄窗/矮窗各有断点）', ()=>{
    must(/@media \(min-width:601px\) and \(max-width:1000px\)/.test(html), '缺少电脑端窄窗断点');
    must(/@media \(max-height:620px\) and \(min-width:601px\)/.test(html), '缺少电脑端矮窗断点');
    must(/#ui\{[^}]*max-width:calc\(100vw - 30px\)/.test(html), '#ui 没有视口上限，窄窗会溢出');
    must(/#status\{[^}]*max-width:calc\(100vw - 30px\)/.test(html), '#status 没有视口上限');
    must(/\.wbtns\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/.test(html), '天气按钮未用 5 列网格，窄窗会串行');
});
test('手机刘海/安全区适配（viewport-fit=cover + env 内边距）', ()=>{
    must(/name="viewport"[^>]*viewport-fit=cover/.test(html), 'viewport 缺 viewport-fit=cover，刘海屏会压边');
    must(/name="viewport"[^>]*user-scalable=no/.test(html), 'viewport 未禁双指缩放，会和相机缩放打架');
    must(/env\(safe-area-inset-top/.test(html), '缺少顶部安全区内边距');
    must(/env\(safe-area-inset-left/.test(html), '缺少左侧安全区内边距');
    must(/#fbBtn\{[^}]*env\(safe-area-inset-bottom/.test(html), '意见按钮没避开底部安全区');
    must(/#modBtn\{[^}]*env\(safe-area-inset-bottom/.test(html), '设置按钮没避开底部安全区');
});
test('触屏手感（无 300ms 延迟 / 不长按选中）', ()=>{
    must(/touch-action:manipulation/.test(html), '按钮未设 touch-action:manipulation，会有 300ms 点击延迟');
    must(/-webkit-tap-highlight-color:transparent/.test(html), '未去掉点击高亮块');
    must(/-webkit-touch-callout:none/.test(html), '长按仍会弹系统菜单');
});
test('留言弹窗有固定的共建文案（三行）', ()=>{    must(/楚门的2\.0世界正在生长。/.test(html), '缺少「正在生长」文案');
    must(/它不被固定场景束缚，一切都可以被重新想象。/.test(html), '缺少第二行文案');
    must(/写下你的构思，和大家一起共建属于我们的世界。/.test(html), '缺少第三行文案');
    must(/class="fbCreed"/.test(html), '文案未包在 .fbCreed 里');
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
test('FB 提交：先复制兜底，再只回传到白名单地址', ()=>{    must(/function copyToClipboard\(/.test(inlineJs),'缺少复制实现');
    must(/navigator\.clipboard[^;]*writeText/.test(inlineJs),'未使用 Clipboard API');
    must(/execCommand\('copy'\)/.test(inlineJs),'缺少 execCommand 降级');
    // 网络调用必须恰好一处
    const fetchCalls = inlineJs.match(/\bfetch\s*\(/g) || [];
    must(fetchCalls.length===1,'应恰好一处 fetch，实际 '+fetchCalls.length);
    // 地址只能来自 fbEndpoint()，且候选项只有两个：FormSubmit 或本站相对路径
    must(/function fbEndpoint\(/.test(inlineJs),'缺少 fbEndpoint()');
    must(/return fetch\(url,/.test(inlineJs),'fetch 未使用 fbEndpoint() 的结果');
    const relay = inlineJs.match(/const FB_RELAY='([^']*)'/);
    must(relay,'缺少 FB_RELAY 常量');
    if(relay) must(relay[1]===''||/^https:\/\/formsubmit\.co\/ajax\//.test(relay[1]),
        'FB_RELAY 只允许空串或 https://formsubmit.co/ajax/ 开头');
    must(/return '\/api\/feedback'/.test(inlineJs),'回退地址必须是同源相对路径');
    must(/keepalive:true/.test(inlineJs),'缺少 keepalive，关页时可能丢');
    must(/AbortController/.test(inlineJs)&&/abort\(\)/.test(inlineJs),'缺少 3 秒超时中断');
    // 除回传服务外不允许任何绝对 URL
    const abs = inlineJs.match(/https?:\/\/[^\s'"]+/g) || [];
    const outside = abs.filter(u => !/^https:\/\/formsubmit\.co\//.test(u));
    must(outside.length===0,'出现白名单外的绝对 URL：'+outside.join(', '));
    must(!/XMLHttpRequest|sendBeacon|WebSocket/.test(inlineJs),'出现其他网络通道');
    // 全页只允许十三个具名本地键：ct2_visits（访问计数）、ct2_hunt（寻宝进度）、ct2_help（帮助已提示标记）、ct2_farm（种田存档）、ct2_vote（投票已投标记）、ct2_theme（界面深浅主题偏好）、ct2_echo（建议回音回执）、ct2_bag（小龙背包与喂食计数）、ct2_dragon（小龙自定义外观与个性）、ct2_codex（图鉴解锁集合）、ct2_guest（留言上墙本机副本）、ct2_music（自定义音乐偏好与歌名）与 ct2_scene（场景中枢画质总档与渲染参数偏好），都不上传
    must(!/sessionStorage|document\.cookie/.test(inlineJs),'出现未授权的存储');
    const lsKeys = [...inlineJs.matchAll(/localStorage\.(?:getItem|setItem)\('([^']+)'/g)].map(m=>m[1]);
    const badKeys = lsKeys.filter(k => k !== 'ct2_visits' && k !== 'ct2_hunt' && k !== 'ct2_help' && k !== 'ct2_farm' && k !== 'ct2_vote' && k !== 'ct2_theme' && k !== 'ct2_echo' && k !== 'ct2_bag' && k !== 'ct2_dragon' && k !== 'ct2_codex' && k !== 'ct2_guest' && k !== 'ct2_music' && k !== 'ct2_scene');
    must(badKeys.length===0,'出现未授权的本地存储键：'+badKeys.join(', '));
    // 动态键只允许具名常量 HUNT_KEY / HELP_KEY / FARM_KEY / VOTE_KEY / THEME_KEY / ECHO_KEY / BAG_KEY / DRAGON_KEY / CODEX_KEY / GUEST_KEY / MUSIC_KEY，且它们的取值必须写死
    must(/const HUNT_KEY='ct2_hunt'/.test(inlineJs),'HUNT_KEY 必须写死为 ct2_hunt');
    must(/const HELP_KEY='ct2_help'/.test(inlineJs),'HELP_KEY 必须写死为 ct2_help');
    must(/const FARM_KEY='ct2_farm'/.test(inlineJs),'FARM_KEY 必须写死为 ct2_farm');
    must(/const VOTE_KEY='ct2_vote'/.test(inlineJs),'VOTE_KEY 必须写死为 ct2_vote');
    must(/const THEME_KEY='ct2_theme'/.test(inlineJs),'THEME_KEY 必须写死为 ct2_theme');
    must(/const DRAGON_KEY='ct2_dragon'/.test(inlineJs),'DRAGON_KEY 必须写死为 ct2_dragon');
    must(/const BAG_KEY='ct2_bag'/.test(inlineJs),'BAG_KEY 必须写死为 ct2_bag');
    must(/const ECHO_KEY='ct2_echo'/.test(inlineJs),'ECHO_KEY 必须写死为 ct2_echo');
    must(/const GUEST_KEY='ct2_guest'/.test(inlineJs),'GUEST_KEY 必须写死为 ct2_guest');
    must(/const CODEX_KEY='ct2_codex'/.test(inlineJs),'CODEX_KEY 必须写死为 ct2_codex');
    must(/const MUSIC_KEY='ct2_music'/.test(inlineJs),'MUSIC_KEY 必须写死为 ct2_music');
    must(/const SCENE_KEY='ct2_scene'/.test(inlineJs),'SCENE_KEY 必须写死为 ct2_scene');
    must(!/localStorage\.(?:getItem|setItem)\((?!'ct2_visits'|HUNT_KEY|HELP_KEY|FARM_KEY|VOTE_KEY|THEME_KEY|ECHO_KEY|BAG_KEY|DRAGON_KEY|CODEX_KEY|GUEST_KEY|MUSIC_KEY|SCENE_KEY)/.test(inlineJs),'存在动态拼接的存储键');
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
test('建议回音：回执码本机生成、署名三档、采纳匹配与隐私红线（Issue #39）', ()=>{
    must(/const ECHO_KEY='ct2_echo'/.test(inlineJs),'ECHO_KEY 必须写死为 ct2_echo');
    must(/const ECHO_ADOPTED\s*=\s*\[/.test(inlineJs),'缺少已采纳清单 ECHO_ADOPTED');
    must(/function echoGenCode\(/.test(inlineJs),'缺少回执码生成 echoGenCode');
    must(/function echoFindAdopted\(/.test(inlineJs),'缺少本机匹配 echoFindAdopted');
    must(/function setupEcho\(/.test(inlineJs),'缺少 setupEcho');
    must(/function openEchoLetter\(/.test(inlineJs),'缺少专属信 openEchoLetter');
    must(/function echoFlyTo\(/.test(inlineJs),'缺少「带我去看看」echoFlyTo');
    must(/function echoRenderCredits\(/.test(inlineJs),'缺少回音墙渲染 echoRenderCredits');
    // 署名三档齐全且默认「不公开」（隐私②）
    must(/name="fbName" value="codename"/.test(html),'缺署名档：代号公开');
    must(/name="fbName" value="anon"/.test(html),'缺署名档：一位热心玩家');
    must(/name="fbName" value="private" checked/.test(html),'缺署名档：不公开（须为默认）');
    must(/id="fbCodename"/.test(html),'缺代号输入框');
    // 零身份（隐私①）：意见弹窗内不得出现任何联系方式收集字段
    const fbBox = html.slice(html.indexOf('id="fbBox"'), html.indexOf('id="ltMask"'));
    must(!/(邮箱|手机|电话|微信|QQ|联系方式)/.test(fbBox.replace(/不绑任何身份|不绑定任何身份/g,'')),
        '意见表单出现联系方式相关字段');
    // 回执只经 store.echo 槽与具名常量进出
    must(/echo:\s+mkSlot\(\(\)=>localStorage\.getItem\(ECHO_KEY\)/.test(inlineJs),'store 缺 echo 槽');
    must(/id="echoMask"/.test(html) && /id="logCreditsBody"/.test(html) && /id="echoQuery"/.test(html),
        '专属信/回音墙/查状态入口缺一');
});
test('玩家立牌：审核制投稿入口 + 声明式呈现 + 气泡（Issue #19）', ()=>{
    // 投稿入口：意见表单新增「立牌投稿」类型与子表单，走既有分类白名单
    must(/<option value="立牌投稿">/.test(html),'分类缺「立牌投稿」选项');
    must(/'立牌投稿'/.test(inlineJs),'FB_CATS 缺「立牌投稿」');
    must(/id="sdForm"/.test(html) && /id="sdName"/.test(html) && /id="sdIntro"/.test(html)
        && /id="sdColor"/.test(html) && /id="sdAcc"/.test(html) && /name="sdKind"/.test(html),
        '立牌子表单字段缺一');
    // 不支持传图必须在投稿说明里写清，且表单内不得有文件上传控件（无后端、审核制）
    must(/不支持上传图片/.test(html),'投稿说明未写清「不支持上传图片」');
    // 立牌表单内不得有文件控件；全页文件控件只许是 #18 的音频导入（accept 限定 audio）
    const sdBlock = html.slice(html.indexOf('id="sdForm"'), html.indexOf('id="sdForm"')+3000);
    must(!/type="file"/.test(sdBlock),'立牌表单出现文件上传控件（立牌投稿不收图）');
    const fileInputs = html.match(/<input[^>]*type="file"[^>]*>/g) || [];
    must(fileInputs.every(t => /accept="audio/.test(t)),'出现非音频的文件上传控件：'+fileInputs.join(' '));
    must(/function submitStandeePost\(/.test(inlineJs),'缺少立牌投稿提交 submitStandeePost');
    must(/kind:'standee'/.test(inlineJs) && /meta\.kind==='standee'/.test(inlineJs),
        '立牌投稿未走 sendFeedback 的 standee 分支');
    must(/审核/.test(html.slice(html.indexOf('id="sdForm"'), html.indexOf('id="sdForm"')+400)),
        '投稿说明未写明审核制');
    // 世界呈现：声明式数据表 + 上限 + 程序建模 + 气泡；清单初期为空（未审不进场景）
    must(/const STANDEES\s*=\s*\[/.test(inlineJs),'缺少已过审立牌清单 STANDEES');
    must(/const STANDEE_MAX=6/.test(inlineJs),'缺少立牌数量上限 STANDEE_MAX=6');
    must(/function buildStandees\(/.test(inlineJs),'缺少 buildStandees');
    must(/function buildStandeeModel\(/.test(inlineJs),'缺少程序建模 buildStandeeModel');
    must(/id="sdBubble"/.test(html) && /function showStandeeBubble\(/.test(inlineJs),'缺少立牌气泡');
    const arr = inlineJs.slice(inlineJs.indexOf('const STANDEES=['), inlineJs.indexOf('];', inlineJs.indexOf('const STANDEES=[')));
    must(!/\{\s*name:/.test(arr.replace(/\/\*[\s\S]*?\*\//g,'')), 'STANDEES 正式清单必须为空（只有过审数据才能登记）');
});

test('墙面内容：留言上墙本机副本 + 精选清单 + 大事记编年（Issue #20 / #24）', ()=>{
    must(/const GUEST_KEY='ct2_guest'/.test(inlineJs),'GUEST_KEY 必须写死为 ct2_guest');
    must(/guest:\s+mkSlot\(\(\)=>localStorage\.getItem\(GUEST_KEY\)/.test(inlineJs),'store 缺 guest 槽');
    must(/const GUESTBOOK_FEATURED\s*=\s*\[/.test(inlineJs),'缺少精选留言清单 GUESTBOOK_FEATURED');
    must(/const CHRONICLE\s*=\s*\[/.test(inlineJs),'缺少大事记编年表 CHRONICLE');
    must(/function guestAddLocal\(/.test(inlineJs),'缺少本机副本写入 guestAddLocal');
    must(/function guestDeleteLocal\(/.test(inlineJs),'缺少本机副本删除 guestDeleteLocal');
    must(/function wallsRefresh\(/.test(inlineJs),'缺少墙面刷新 wallsRefresh');
    must(/function guestBoardTap\(/.test(inlineJs),'缺点纸条命中 guestBoardTap');
    must(/Interior\.setGuestbook\(/.test(inlineJs) && /Interior\.setChronicle\(/.test(inlineJs),
        '未把数据喂给 #40 的墙面容器');
    must(/guestAddLocal\(\(ta\.value\|\|''\)\.trim\(\), naming\)/.test(inlineJs),
        '提交意见时未留本机副本');
    must(/id="gbMask"/.test(html) && /id="gbDel"/.test(html),'纸条全文弹窗/删除入口缺一');
    must(/id="chronMask"/.test(html) && /id="chronOpenBtn"/.test(html),'大事记面板/户外入口缺一');
    // 大事记条目日期必须是真实日期格式（编年靠它排序呈现，不许编造占位）
    const chronBlock = inlineJs.slice(inlineJs.indexOf('const CHRONICLE'), inlineJs.indexOf('];', inlineJs.indexOf('const CHRONICLE')));
    const dates = [...chronBlock.matchAll(/date:'(\d{4}-\d{2}-\d{2})'/g)].map(m=>m[1]);
    must(dates.length >= 10, '大事记条目太少：' + dates.length);
});
test('世界图鉴：声明式条目、本机解锁存档与判定挂点（Issue #23）', ()=>{
    must(/const CODEX_KEY='ct2_codex'/.test(inlineJs),'CODEX_KEY 必须写死为 ct2_codex');
    must(/const CODEX_DEFS\s*=\s*\[/.test(inlineJs),'缺少声明式图鉴条目 CODEX_DEFS');
    must(/const CODEX_CATS\s*=\s*\[/.test(inlineJs),'缺少图鉴分类 CODEX_CATS');
    must(/function setupCodex\(/.test(inlineJs),'缺少 setupCodex');
    must(/function codexUnlock\(/.test(inlineJs),'缺少 codexUnlock');
    must(/function codexCheck\(/.test(inlineJs),'缺少发现判定 codexCheck');
    must(/codex:\s*mkSlot\(\(\)=>localStorage\.getItem\(CODEX_KEY\)/.test(inlineJs),'store 缺 codex 槽');
    must(/id="codexBtn"/.test(html) && /id="codexMask"/.test(html) && /id="codexBody"/.test(html),
        '图鉴入口/弹窗缺一');
    // 条目数与六大类齐全（植物/作物/宝物/天气/地点/动物）
    const defs = inlineJs.match(/cat:'(plant|crop|treasure|weather|place|animal)'/g) || [];
    must(defs.length>=30,'图鉴条目过少：'+defs.length);
});
test('FB 回传必须显式带 Referer（FormSubmit 靠它判来源）', ()=>{
    // 线上曾因 <meta name="referrer" content="no-referrer"> 被抹掉 Referer，
    // FormSubmit 回「not a web server」而拒收；修法是在 fetch 上单独指定。
    must(/referrer:FB_RELAY\?location\.href:undefined/.test(inlineJs), '未显式指定 referrer');
    must(/referrerPolicy:FB_RELAY\?'unsafe-url':undefined/.test(inlineJs), '未指定 referrerPolicy');
    must(/body:FB_RELAY\?new URLSearchParams\(payload\)/.test(inlineJs) ||
         /new URLSearchParams\(payload\)/.test(inlineJs), '未用 urlencoded 简单请求（会触发预检）');
});

test('自定义音乐：本地文件 BGM、独立通道、偏好只存歌名（Issue #18）', ()=>{
    must(/const MUSIC_KEY='ct2_music'/.test(inlineJs),'MUSIC_KEY 必须写死为 ct2_music');
    must(/music:\s+mkSlot/.test(inlineJs),'store 缺少 music 槽');
    must(/function setupMusic\(/.test(inlineJs),'缺少 setupMusic');
    must(/function musicAddFiles\(/.test(inlineJs),'缺少导入 musicAddFiles');
    must(/function musicCustomActive\(/.test(inlineJs),'缺少 musicCustomActive');
    // 面板入口与控件齐全
    must(/id="musPlay"/.test(html) && /id="musPrev"/.test(html) && /id="musNext"/.test(html),'缺播放/上一首/下一首按钮');
    must(/id="musVol" type="range"/.test(html),'缺音量滑杆');
    must(/id="musLoop"/.test(html),'缺循环模式按钮');
    must(/id="musFile" type="file" accept="audio\/\*" multiple/.test(html),'缺多选音频文件入口');
    must(/id="musList"/.test(html),'缺播放列表容器');
    // 文件只在本机内存里播：对象 URL 播放，偏好只存音量/循环/歌名
    must(/URL\.createObjectURL/.test(inlineJs),'未用对象 URL 本机播放');
    must(/media-src 'self' blob:;/.test(html),'CSP 未给同源主题曲与 blob 媒体开口子');
    must(/store\.music\.save\(\{\s*vol:/.test(inlineJs) && /names:/.test(inlineJs),'偏好未按 vol/loop/names 存');
    // 自选音乐在播时程序化 BGM 必须让行（不叠音打架）
    must(/FEAT\.bgm\.on && !musicCustomActive\(\)/.test(inlineJs),'audioTick 未给自选音乐让行');
    // 版权与浏览器限制提示在面板里写明
    must(/不上传、也不分发/.test(html),'面板缺版权提示');
    must(/刷新页面后需重新选一次文件/.test(html),'面板缺刷新重选提示');
});

// ---------- 迭代维护规范：模块隔离 ----------
test('模块隔离：每个功能都有独立生命周期钩子', ()=>{
    const featKeys = [...inlineJs.matchAll(/^\s{4}(\w+):\s*\{ on:(?:true|false), label:/gm)].map(m=>m[1]);
    must(featKeys.length >= 8, 'FEAT 项太少：' + featKeys.length);
    const hookBlock = inlineJs.slice(inlineJs.indexOf('const MODULE_HOOKS = {'));
    must(hookBlock.length > 0, '找不到 MODULE_HOOKS');
    featKeys.forEach(k=>{
        must(new RegExp('\\n\\s{4}' + k + ':\\s*\\{').test(hookBlock), '缺少模块钩子：' + k);
    });
});

test('模块隔离：开关只经钩子分发，不再写死分支', ()=>{
    const m = inlineJs.match(/function toggleFeat\(k, v\)\{[\s\S]*?\n\}/);
    must(m, '找不到 toggleFeat');
    must(/MODULE_HOOKS\[k\]/.test(m[0]), 'toggleFeat 未走模块钩子');
    must(!/k === '/.test(m[0]), 'toggleFeat 仍在写死模块分支（会退化成全局耦合）');
    must(/h\.setup/.test(m[0]) && /h\.teardown/.test(m[0]), '钩子未成对调用 setup/teardown');
});

test('模块隔离：每帧只驱动开着的模块', ()=>{
    const m = inlineJs.match(/function updateModules\(dt, t\)\{[\s\S]*?\n\}/);
    must(m, '找不到 updateModules');
    must(/FEAT\[k\]\.on && h && h\.update/.test(m[0]), 'updateModules 未按模块分发');
});

// ---------- 全局部署模块（与场景功能互不冲突） ----------
test('全局模块：加载兜底 + 进度数字 + 失败降级', ()=>{
    must(/<div id="boot"/.test(html), '缺少加载兜底层');
    must(/id="bootBar"/.test(html) && /id="bootPct"/.test(html), '缺少进度条/百分比数字');
    must(/function bootTo\(/.test(inlineJs) && /function bootDone\(/.test(inlineJs), '缺少 bootTo/bootDone');
    must(/function bootFail\(/.test(inlineJs), '缺少 bootFail 兜底');
    must(/bootDone\(\);/.test(inlineJs), 'init 成功后未收起加载层');
    // 资源加载失败降级：捕获 script/link/img 的 error
    must(/addEventListener\('error',\s*function\(ev\)/.test(inlineJs), '未监听资源 error');
    must(/tagName==='SCRIPT'\|\|t\.tagName==='LINK'/.test(inlineJs), '未识别 script/link 失败');
    must(/webglcontextlost/.test(inlineJs), '未处理 WebGL 上下文丢失');
});

test('全局模块：访问统计只存本地，不发网络请求', ()=>{
    must(/localStorage\.setItem\('ct2_visits'/.test(inlineJs), '缺少本地访问计数');
    // setupGlobal 里只要不出现 fetch/XHR 就算达标（全页 fetch 仍只允许回传意见那一处）
    const seg = inlineJs.slice(inlineJs.indexOf('function setupGlobal()'), inlineJs.indexOf('window.addEventListener(\'load\''));
    must(seg.length > 0, '找不到 setupGlobal');
    must(!/fetch\s*\(|XMLHttpRequest/.test(seg), '全局模块里出现了网络请求（统计应只存本地）');
});

test('全局模块：分享链接 / 弱网低画质 / 版本日志 / 免责声明', ()=>{
    must(/id="shareBtn"/.test(html), '缺分享按钮');
    must(/location\.href\.split\('#'\)\[0\]/.test(inlineJs), '分享的是带 hash 的地址');
    must(/id="lowqBtn"/.test(html) && /function applyLowQuality\(/.test(inlineJs), '缺弱网低画质开关');
    must(/dprCur=1;/.test(inlineJs), '低画质未降到 1 倍像素比');
    must(/const VERSIONS = \[/.test(inlineJs) && /id="mpVer"/.test(html), '缺版本日志');
    must(/class="mpDisclaimer"/.test(html), '缺共创免责声明');
});

// ---------- v5.1 网页版保底可玩 ----------
test('v5.1 裸探针：标准 getContext 阶梯＋逐格全新 canvas＋活 context 交接', ()=>{
    must(/function probeGL\(\)/.test(inlineJs), '缺少 probeGL');
    must(/'webgl2'/.test(inlineJs) && /'experimental-webgl'/.test(inlineJs), '探针类型阶梯不全（需 webgl2/webgl/experimental-webgl）');
    must(/document\.createElement\('canvas'\)/.test(inlineJs), '探针未逐格新建 canvas');
    must(/context:\s*probe\.ctx/.test(inlineJs), '未把探针的活 context 交给引擎');
    must(/__probeForceFail/.test(inlineJs) && /__probeFakeRenderer/.test(inlineJs), '缺少探针验收钩子');
    must(/UNMASKED_RENDERER_WEBGL/.test(inlineJs), '未读渲染器字符串做软件渲染识别');
});

test('v5.1 弱环境直接保命＋弱 UA 首访低配（有存档不覆盖）', ()=>{
    must(/probe\.weak && glSafeLv\(\) < 2/.test(inlineJs), '缺少探针弱判定直接保命起步');
    must(/__hadSceneSave/.test(inlineJs), '缺少新鲜档案标记 __hadSceneSave');
    must(/!window\.__hadSceneSave && weakWebUA\(\)/.test(inlineJs), '弱 UA 低配起步未以无存档为前提');
});

test('v5.1 致命层：下载 App 主按钮＋刷新重试，无 Chrome 主推', ()=>{
    must(/dl\.href='download\.html'/.test(inlineJs), '致命层缺下载 App 按钮（相对路径 download.html）');
    must(/下载 App 玩/.test(inlineJs), '致命层缺「下载 App 玩」文案');
    must(/刷新重试/.test(inlineJs), '致命层缺刷新重试按钮');
    must(!/建议用 Chrome/.test(inlineJs), '仍残留「建议用 Chrome」主推文案');
    must(/#error \.fbtns/.test(html), '缺致命层按钮区样式');
});

// ---------- v5.1 #100 视角体系改版 ----------
test('v5.1 #100 上帝/环绕观看入口已清除（巡游/锁定开关、预设视角面板）', ()=>{
    must(!/id="orbitChk"/.test(html), '仍残留自动巡游开关 orbitChk');
    must(!/id="lockChk"/.test(html), '仍残留视角锁定开关 lockChk');
    must(!/id="mpViews"/.test(html), '仍残留预设视角面板 mpViews');
    must(!/id="lockRow"/.test(html), '仍残留视角锁定行 lockRow');
    must(!/wx\.orbit/.test(inlineJs), '仍残留 wx.orbit 巡游状态引用');
    must(!/function setViewLock\(/.test(inlineJs), '仍残留 setViewLock 定义');
    must(!/views:\s*\{ on:/.test(inlineJs), '仍残留 FEAT.views 预设视角模块');
});

test('v5.1 #100 视角选择卡＋选择落盘 ct2_dragon.view（不新增键）', ()=>{
    must(/id="viewMask"/.test(html), '缺视角选择卡 viewMask');
    must(/data-vw="fp"/.test(html) && /data-vw="tp"/.test(html), '视角卡缺第一/第三人称两张卡');
    must(/function drgViewNormalize\(/.test(inlineJs), '缺视角字段规整 drgViewNormalize');
    must(/function openViewCard\(/.test(inlineJs) && /function chooseView\(/.test(inlineJs), '缺视角卡开关/选择函数');
    must(/c\.view = drgViewNormalize\(/.test(inlineJs), 'drgLoadCfg 未接入 view 字段');
});

test('v5.1 #100 探索者出生＋传送＋化身漫游', ()=>{
    must(/function setupEntryFlow\(/.test(inlineJs), '缺进入流程 setupEntryFlow');
    must(/function avatarTeleportTo\(/.test(inlineJs), '缺化身传送 avatarTeleportTo');
    must(/function avatarGoHome\(/.test(inlineJs), '缺回出生点 avatarGoHome');
    must(/function updateAvatarRoam\(/.test(inlineJs), '缺化身自动漫游 updateAvatarRoam');
    must(/function stopAvatarRoam\(/.test(inlineJs), '缺漫游接管 stopAvatarRoam');
    must(/avatarSpawnPoint\(\)/.test(inlineJs), '缺出生点 avatarSpawnPoint');
    must(/houseLocal\(-0\.65, 9\.5\)/.test(inlineJs), '出生点未锚在小屋门口（门前石板路、房子禁行圈外）');
});

test('v5.1 #100 回音传送＋拍照自由镜头为唯一例外', ()=>{
    must(/function echoFlyTo\(/.test(inlineJs) && /avatarTeleportTo\(pos\.x, pos\.z/.test(inlineJs), '回音未改化身传送');
    must(!/echoHomeView/.test(inlineJs), '仍残留旧镜头存档 echoHomeView');
    must(/function photoSuspendExplorer\(/.test(inlineJs), '拍照模式缺探索者让位');
    must(/function photoResumeExplorer\(/.test(inlineJs), '拍照模式缺探索者归位（人称还原）');
    must(/setView\(theta,phi,radius\)/.test(inlineJs), '轨道相机缺 setView（拍照接手用）');
});

console.log('\n====================');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed>0 ? 1 : 0);