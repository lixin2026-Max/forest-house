// 生成宣发用的工程图（分层架构 / 数据流 / 文件与测试关系）与一张竖屏封面。
// 输出 HTML 到 docs/diagrams/，随后用无头浏览器截图成 PNG。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'diagrams');
fs.mkdirSync(OUT, { recursive: true });

const HEAD = (w, h, title) => `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>${title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${w}px;height:${h}px;overflow:hidden;
    background:#0b1310;color:#dff0e2;
    font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif}
  .wrap{width:100%;height:100%;padding:38px 44px;display:flex;flex-direction:column}
  .cap{font-size:15px;letter-spacing:.5px;opacity:.55;margin-bottom:10px}
  h1{font-size:27px;font-weight:800;letter-spacing:1px;margin-bottom:6px}
  .sub{font-size:14px;opacity:.62;margin-bottom:22px}
  .foot{margin-top:auto;font-size:12px;opacity:.38;letter-spacing:.5px}
  svg{display:block}
</style></head><body><div class="wrap">`;

const FOOT = (t) => `<div class="foot">${t}</div></div></body></html>`;

/* ---------- 1. 分层架构 ---------- */
function arch() {
    const W = 1240, H = 880;
    const layer = (y, name, desc, items, color) => {
        const boxes = items.map((it, i) => {
            const bw = 196, gap = 14;
            const x = 210 + i * (bw + gap);
            return `<rect x="${x}" y="${y + 30}" width="${bw}" height="42" rx="9"
                        fill="${color}22" stroke="${color}" stroke-width="1.4"/>
                    <text x="${x + bw / 2}" y="${y + 56}" text-anchor="middle"
                          font-size="14" fill="#dff0e2">${it}</text>`;
        }).join('');
        return `<rect x="34" y="${y}" width="150" height="86" rx="12"
                    fill="${color}18" stroke="${color}" stroke-width="1.8"/>
                <text x="109" y="${y + 34}" text-anchor="middle" font-size="16"
                      font-weight="700" fill="${color}">${name}</text>
                <text x="109" y="${y + 58}" text-anchor="middle" font-size="11.5"
                      opacity=".7" fill="#dff0e2">${desc}</text>
                ${boxes}`;
    };
    return HEAD(W, H, '分层架构')
        + `<div class="cap">ENGINEERING DIAGRAM 01</div>
           <h1>分层架构：一层坏了不影响另一层</h1>
           <div class="sub">每一层只依赖下一层的接口；功能模块挂在「功能层」的注册表上，可以单独关掉</div>
           <svg width="${W - 88}" height="680" viewBox="0 0 1200 680">
             ${layer(18, '表现层', 'HTML / CSS', ['状态栏', '天气按钮', '面板', '留言弹窗'], '#7ed08a')}
             ${layer(136, '装配层', 'init / animate', ['装配场景', '每帧循环', '窗口自适应'], '#9ad8a6')}
             ${layer(254, '功能层', 'FEAT + HOOKS', ['BGM', '环境音', '粒子', '视角'], '#4fa8d8')}
             ${layer(372, '场景层', '几何与光照', ['地形天空', '树木小屋', '花草水塘', '动物昆虫'], '#e8c06a')}
             ${layer(490, '底座层', 'three r128', ['渲染器', '相机', '材质贴图', '阴影'], '#b7a8f0')}
             <path d="M109 104 V136" stroke="#7ed08a" stroke-width="1.2" opacity=".45"/>
             <path d="M109 222 V254" stroke="#9ad8a6" stroke-width="1.2" opacity=".45"/>
             <path d="M109 340 V372" stroke="#4fa8d8" stroke-width="1.2" opacity=".45"/>
             <path d="M109 458 V490" stroke="#e8c06a" stroke-width="1.2" opacity=".45"/>
           </svg>`
        + FOOT('楚门的2.0世界 · 工程图 · 分层架构');
}

/* ---------- 2. 数据流 ---------- */
function flow() {
    const W = 1240, H = 720;
    const box = (x, y, w, h, t, sub, color) => `
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="11"
              fill="${color}1c" stroke="${color}" stroke-width="1.5"/>
        <text x="${x + w / 2}" y="${y + (sub ? 26 : h / 2 + 5)}" text-anchor="middle"
              font-size="14.5" font-weight="700" fill="#eaf6ec">${t}</text>
        ${sub ? `<text x="${x + w / 2}" y="${y + 45}" text-anchor="middle"
              font-size="11.5" opacity=".62" fill="#dff0e2">${sub}</text>` : ''}`;
    const arrow = (x1, y1, x2, y2, c = '#5f8f6a', d = '') => `
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}"
              stroke-width="1.6" marker-end="url(#ah)"/>
        ${d ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 6}" text-anchor="middle"
              font-size="11" fill="#9fb8a4">${d}</text>` : ''}`;
    return HEAD(W, H, '数据流')
        + `<div class="cap">ENGINEERING DIAGRAM 02</div>
           <h1>两条主链路：看的那条、说的那条</h1>
           <div class="sub">上面一行是每帧都在跑的渲染链，下面一行是只有提交时才走的回传链（且一定会先落地到剪贴板）</div>
           <svg width="1140" height="560" viewBox="0 0 1140 560">
             <defs><marker id="ah" markerWidth="9" markerHeight="9" refX="7" refY="4.5"
                orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#5f8f6a"/></marker></defs>

             <text x="10" y="20" font-size="13" fill="#7ed08a" font-weight="700">① 渲染链（每帧）</text>
             ${box(10, 34, 168, 66, '你的操作', '拖拽 / 缩放 / 切天气', '#7ed08a')}
             ${box(214, 34, 168, 66, '状态变量', 'weatherIndex / 相机', '#9ad8a6')}
             ${box(418, 34, 168, 66, 'lerpWeather', '线性插值过渡', '#9ad8a6')}
             ${box(622, 34, 168, 66, '光照 · 雾 · 材质', '颜色与强度', '#e8c06a')}
             ${box(826, 34, 168, 66, 'renderer', '合成一帧', '#4fa8d8')}
             ${arrow(178, 67, 212, 67)} ${arrow(382, 67, 416, 67)}
             ${arrow(586, 67, 620, 67)} ${arrow(790, 67, 824, 67)}
             <path d="M910 100 C910 132, 94 132, 94 104" fill="none" stroke="#5f8f6a"
                   stroke-width="1.4" stroke-dasharray="5 4" marker-end="url(#ah)"/>
             <text x="500" y="128" font-size="11" fill="#9fb8a4">下一帧继续</text>

             <line x1="10" y1="168" x2="1130" y2="168" stroke="#2b3d31" stroke-width="1"/>

             <text x="10" y="196" font-size="13" fill="#4fa8d8" font-weight="700">② 回传链（仅提交时）</text>
             ${box(10, 210, 156, 66, '写下构想', '最多 600 字', '#4fa8d8')}
             ${box(198, 210, 156, 66, '本地生成抬头', '时间·天气·画面', '#8ec8e8')}
             ${box(386, 210, 156, 66, '复制到剪贴板', '离线也能用', '#8ec8e8')}
             ${box(574, 210, 156, 66, '静默发送', 'urlencoded', '#e8c06a')}
             ${box(762, 210, 168, 66, 'FormSubmit', '带 Referer', '#e8c06a')}
             ${box(962, 210, 158, 66, 'QQ 邮箱', '人工归类', '#7ed08a')}
             ${arrow(166, 243, 196, 243)} ${arrow(354, 243, 384, 243)}
             ${arrow(542, 243, 572, 243)} ${arrow(730, 243, 760, 243)}
             ${arrow(930, 243, 960, 243)}
             <text x="386" y="292" font-size="11" fill="#9fb8a4">先复制：网络差 / 被拦 / 关掉浏览器都不丢</text>

             <line x1="10" y1="330" x2="1130" y2="330" stroke="#2b3d31" stroke-width="1"/>

             <text x="10" y="358" font-size="13" fill="#e8c06a" font-weight="700">③ 共创闭环（人工闸门）</text>
             ${box(10, 372, 168, 66, '归类', '画面/玩法/声音', '#e8c06a')}
             ${box(214, 372, 180, 66, '出两套方案', '耗时·性能·冲突', '#e8c06a')}
             ${box(430, 372, 168, 66, '负责人拍板', '唯一决策点', '#7ed08a')}
             ${box(634, 372, 168, 66, '开发', '按模块改', '#9ad8a6')}
             ${box(838, 372, 168, 66, '上线', '打 tag + 推送', '#4fa8d8')}
             ${arrow(178, 405, 212, 405)} ${arrow(394, 405, 428, 405)}
             ${arrow(598, 405, 632, 405)} ${arrow(802, 405, 836, 405)}
             <text x="430" y="462" font-size="11" fill="#9fb8a4">未拍板 = 不动代码、不推送</text>
           </svg>`
        + FOOT('楚门的2.0世界 · 工程图 · 数据流');
}

/* ---------- 3. 文件与测试 ---------- */
function files() {
    const W = 1240, H = 780;
    const item = (x, y, w, t, sub, color, dash) => `
        <rect x="${x}" y="${y}" width="${w}" height="58" rx="9"
              fill="${color}16" stroke="${color}" stroke-width="1.4"
              ${dash ? 'stroke-dasharray="5 4"' : ''}/>
        <text x="${x + 14}" y="${y + 25}" font-size="13.5" font-weight="700" fill="#eaf6ec">${t}</text>
        <text x="${x + 14}" y="${y + 44}" font-size="11.5" opacity=".6" fill="#dff0e2">${sub}</text>`;
    return HEAD(W, H, '文件与测试')
        + `<div class="cap">ENGINEERING DIAGRAM 03</div>
           <h1>一个页面，五套测试，一条提交闸门</h1>
           <div class="sub">改完不用记得该跑什么：pre-commit 会替你跑全套，红的不让提交</div>
           <svg width="1140" height="620" viewBox="0 0 1140 620">
             <text x="6" y="18" font-size="13" fill="#7ed08a" font-weight="700">交付物</text>
             ${item(6, 30, 268, 'index.html', '单页：场景 + 交互 + 模块钩子', '#7ed08a')}
             ${item(300, 30, 220, 'js/three.min.js', 'r128 · 603KB · 本地', '#9ad8a6')}
             ${item(546, 30, 268, '单文件离线版.html', '整页内联 · 674KB', '#9ad8a6')}

             <text x="6" y="128" font-size="13" fill="#4fa8d8" font-weight="700">五套测试</text>
             ${item(6, 140, 206, 'verify.js', '55 条静态验收', '#4fa8d8')}
             ${item(228, 140, 206, 'smoke.js', '真跑 init 全流程', '#4fa8d8')}
             ${item(450, 140, 206, 'security-audit.js', '55 条安全审计', '#4fa8d8')}
             ${item(672, 140, 206, 'feedback-e2e.js', '17 条通道测试', '#4fa8d8')}
             ${item(894, 140, 206, 'subpath-check.js', '子路径真渲染 4 条', '#4fa8d8')}

             <rect x="6" y="238" width="1094" height="52" rx="9"
                   fill="#7ed08a18" stroke="#7ed08a" stroke-width="1.6"/>
             <text x="553" y="262" text-anchor="middle" font-size="14" font-weight="700" fill="#bfe8c6">node test/all.js —— 一条命令跑完全部五套</text>
             <text x="553" y="280" text-anchor="middle" font-size="11.5" opacity=".6" fill="#dff0e2">先做编码自检（不许出现乱码字符），再依次 spawn 五套</text>

             <text x="6" y="330" font-size="13" fill="#e8c06a" font-weight="700">闸门与留档</text>
             ${item(6, 342, 250, '.git/hooks/pre-commit', '每次提交自动跑 all.js', '#e8c06a')}
             ${item(272, 342, 250, 'git tag v3.1-stable', '稳定基线，可回退', '#e8c06a')}
             ${item(538, 342, 250, 'CHANGELOG.md', '只记能感知的变化', '#e8c06a')}
             ${item(804, 342, 296, 'docs/维护规范.md', '五条规范 → 具体机制', '#e8c06a')}

             <text x="6" y="440" font-size="13" fill="#b7a8f0" font-weight="700">上线</text>
             ${item(6, 452, 268, 'GitHub Pages', '整仓 branch deploy', '#b7a8f0')}
             ${item(300, 452, 300, 'test/live-check.js', '部署后实探主页与资源', '#b7a8f0')}
             ${item(626, 452, 300, '.nojekyll', '禁用 Jekyll，保证子路径', '#b7a8f0')}
             ${item(950, 452, 150, '在线地址', '可直接扫码', '#b7a8f0')}
           </svg>`
        + FOOT('楚门的2.0世界 · 工程图 · 文件与测试');
}

/* ---------- 4. 竖屏封面 ---------- */
function cover() {
    const W = 1080, H = 1920;
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>封面</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;overflow:hidden;background:#0b1310}
  .shot{position:absolute;inset:0;background:url("../screenshots/cover-scene.png") center/cover no-repeat}
  .veil{position:absolute;inset:0;
    background:linear-gradient(180deg,rgba(8,16,12,.86) 0%,rgba(8,16,12,.10) 34%,rgba(8,16,12,.18) 62%,rgba(8,16,12,.92) 100%)}
  .top{position:absolute;top:120px;left:76px;right:76px;color:#eaf6ec;font-family:"Microsoft YaHei",sans-serif}
  .tag{display:inline-block;font-size:26px;letter-spacing:4px;padding:10px 20px;border-radius:999px;
    background:rgba(126,208,138,.16);border:1px solid rgba(126,208,138,.5);color:#bfe8c6}
  h1{font-size:96px;line-height:1.12;font-weight:900;letter-spacing:6px;margin-top:34px;
    text-shadow:0 6px 30px rgba(0,0,0,.55)}
  h1 em{font-style:normal;color:#a8e8b4}
  .sub{font-size:38px;line-height:1.5;margin-top:26px;opacity:.9;letter-spacing:1px}
  .bot{position:absolute;bottom:110px;left:76px;right:76px;color:#eaf6ec;font-family:"Microsoft YaHei",sans-serif}
  .line{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:26px}
  .chip{font-size:26px;padding:12px 22px;border-radius:12px;background:rgba(255,255,255,.10);
    border:1px solid rgba(200,240,210,.28)}
  .url{font-size:27px;opacity:.82;letter-spacing:.5px;word-break:break-all}
</style></head><body>
  <div class="shot"></div><div class="veil"></div>
  <div class="top">
    <span class="tag">手机点开就玩</span>
    <h1>楚门的<br><em>2.0 世界</em></h1>
    <div class="sub">不用下载<br>不用注册<br>还能留言让我改</div>
  </div>
  <div class="bot">
    <div class="line">
      <span class="chip">五种天气</span><span class="chip">雨声鸟鸣</span>
      <span class="chip">萤火虫</span><span class="chip">不到 1MB</span>
    </div>
    <div class="url">lixin2026-max.github.io/forest-house</div>
  </div>
</body></html>`;
}

fs.writeFileSync(path.join(OUT, 'arch.html'), arch(), 'utf8');
fs.writeFileSync(path.join(OUT, 'flow.html'), flow(), 'utf8');
fs.writeFileSync(path.join(OUT, 'files.html'), files(), 'utf8');
fs.writeFileSync(path.join(OUT, 'cover.html'), cover(), 'utf8');
console.log('已生成 4 个图页：arch / flow / files / cover');
