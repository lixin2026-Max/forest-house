# 森林小屋 Three.js 场景 — 修复与优化报告

> 状态：**已可正常启动** ｜ verify 35/35 + smoke 全通过 + security 53/53 + feedback-e2e 17/17 ｜ 五种天气 + 手机竖屏/横屏已逐张实机渲染验证

## 交付物
```
forest-house-scene/
├── index.html            主场景（需 http 打开，见 手机上打开.md）
├── forest-house-single.html  单文件版（three.js 已内联，643KB）
├── js/three.min.js       本地 three.js r128（离线可用）
├── serve.js              本地静态服务器 + /api/feedback 收件接口
├── feedback.jsonl        收到的优化意见（一行一条，收到后才生成）
├── build-single.js       把 index.html + three.js 打包成单文件
├── report.md             本报告
├── 手机上打开.md          手机/微信打开的几种方式
└── test/
    ├── verify.js         静态验收（35 项）
    ├── smoke.js          运行时冒烟（真实执行 init + 120 帧 + 5 种天气 + 意见弹窗）
    ├── security-audit.js 安全审计（53 项，含真起服务器打恶意请求）
    ├── feedback-e2e.js   意见接口端到端（17 项）
    ├── make-fb-submit.js 生成「自动填写并点提交」的临时页
    ├── shadowprobe.html  阴影能力最小探针
    ├── w_*.png           五种天气实机截图
    ├── w_phone*.png      手机竖屏 / 横屏实机截图
    └── fb_*.png          意见弹窗实机截图（桌面 / 手机竖 / 手机横）
```

---

## 一、"没法启动"的真正原因（4 个崩溃级 bug）

静态检查全绿但页面白屏/报红，因为静态检查查不出运行时类型错误。用 `test/smoke.js`
（vm + DOM/Canvas/WebGL stub 真正跑 `init()`）逐层剥出了这 4 个：

| # | 报错 | 根因 | 修复 |
|---|---|---|---|
| 1 | `Cannot read properties of undefined (reading 'index')` | `mergeGeos()` 期望 `{geo, matrix}` 包装对象，而 `buildPineGeo/buildBirchGeo` 的 `leafParts` 推的是**裸 geometry** → `it.geo` 为 undefined | `mergeGeos` 归一化：裸 BufferGeometry 与 `{geo}` 两种形态都能吃 |
| 2 | `grassIM.getMatrix is not a function` | three.js 的 InstancedMesh API 是 `getMatrixAt(i, m)`，不存在 `getMatrix` | 改为创建时缓存每株草的基准参数，每帧从基准数据重算矩阵，不再读回 |
| 3 | 花头与花杆分离 | 摆动数据用 `h=1.5+(i*37%100)/100`、`rot=i*1.3` **另造随机数**，与创建时的真实 `rnd()` 不一致 | 创建时把 `x/y/z/h/rot/pitch/phase` 真实值存进 `fdata`，每帧原样还原 |
| 4 | 花杆不摆、只有花头乱飘 | 摆动只写了花头，杆子静止 | 杆以基部为轴弯折，花头用 `R·(0,h,0)` 精确跟到杆顶 |

> 教训：任何"每帧重算"的实例化变换，都必须复用创建时的参数，不能重新随机。

---

## 二、画质核心修复（这是画面发灰发白的元凶）

### 1. sRGB 色彩管线漏了两环
`renderer.outputEncoding = sRGBEncoding` 已开，但：
- 所有程序化 Canvas 贴图**没标 `encoding = sRGBEncoding`** → 贴图被当成线性值，亮度虚高约 4 倍；
- 所有材质十六进制颜色**没转线性空间**（r128 无颜色管理）。

结果就是整场"蒙一层白纱"。修复：
- `canvasTex()` / `glowTexture()` / `smokeTexture()` 统一加 `t.encoding = THREE.sRGBEncoding`；
- 新增 `C(hex)` = `new Color(hex).convertSRGBToLinear()`，天气色表 `SKY_LIN` 全部走它；
- 新增 `linearizeMaterials(scene)`，init 末尾一次性把所有材质的 `color` / `emissive` 转线性。

### 2. 阴影：改了视锥却没更新投影矩阵
```js
sun.shadow.camera.left/right/top/bottom = ±42;   // 但
sun.shadow.camera.updateProjectionMatrix();      // ← 缺这一行
```
three.js 的 `LightShadow.updateMatrices()` 不会重算投影矩阵，所以阴影相机实际一直是默认的 **±5**。
补上后并加 `normalBias = 0.03`，阴影才真正覆盖全场。

### 3. 光照配平
原来 `ambient 0.45 + hemi 0.55 + sun 1.35`，环境光几乎等于太阳光，阴影被彻底冲淡。
改为 `ambient 0.20 + hemi 0.30 + sun 2.60`（各天气独立预设 `ev` 曝光并平滑过渡），对比度和立体感立刻出来。

### 4. 隐藏最深的雾 bug
```js
const wx = { elev:45, fogMul:1, ... };   // 初值 1
dens = curSky.dens * (1 + wx.fogMul*4);  // → 实际密度 ×5，而滑杆显示 0%
```
雾天/雨天整个画面糊成一片白。改为 `fogMul:0`（`setWeather` 里重置也同样修正）。

### 5. 向日葵重做
原来花瓣是"斜插的盒子 + 绕 Z 转 + 绕 X 偏"，渲染出来像平躺的风车。重建为：
花盘朝 +Z、14 片压扁 4 边锥在 XY 平面放射，实例化时整体转向**花田外侧并向上仰 0.42 rad**，
现在是真的"向日葵朝着光"。

---

## 三、场景调整
- **栅栏**：原来从 x=-13 到 11 横穿花田中央（就是画面里那道细线）。移到后侧 `z≈-15.5` 的弧线，
  柱子加粗到 0.22、三层横杆。
- **夜间**：云压到 0.10 灰避免糊灰褐色天空；星点 1.25 大小；雾密度 0.014 让远山融进夜色。
- **雨天**：雾 0.010、`amb 0.35 / hemi 0.40 / sun 1.00`、曝光 1.18，不再闷成一团灰。
- **雾天**：雾 0.018（原来 0.030×5 倍 = 全白）。
- 状态面板 `物体:N draw calls` 改为 `draw calls:N`。
- 新增 **URL 天气直达**：`index.html#night`、`#mist`、`#rain`、`#golden`、`#sunny`。

---

## 六、移动端适配（手机可玩）

原来只有 `mousedown/mousemove/wheel`，手机上**完全不能操作**。本次补齐：

| 项 | 做法 |
|---|---|
| 手势 | 改用 **Pointer Events** 统一鼠标/触摸：`pointerdown/pointermove/pointerup/pointercancel/lostpointercapture` |
| 单指旋转 | 拖动改 `theta/phi`，`phi` 夹在 `[0.1, π/2-0.04]` 不翻底 |
| 双指缩放 | `pointers` 表存两指坐标，`fingerDist()` 取间距，`radius *= prevDist/dist`，夹在 `[9,130]` |
| 浏览器抢手势 | `#scene{touch-action:none}` + 拦截 iOS 私有 `gesturestart/gesturechange` + `contextmenu` |
| 竖屏自动横屏 | 竖屏时给 `body` 加 `rot90`，`#app` 用 `width:100vh;height:100vw` + `rotate(90deg)` 整体转 90°，无需任何点击 |
| 旋转后输入补偿 | 画布转了 90°，单指拖动增量交换：`if(ROT){const t=dx; dx=dy; dy=-t;}` |
| 尺寸交换 | `measureLayout()`：`LAYOUT.w = ROT ? ih : iw`，相机 `aspect`、`renderer.setSize` 全部走它 |
| 性能降档 | `IS_MOBILE` 时：像素比 1.6（桌面 2）、阴影贴图 1024（桌面 2048）、草 140（260）、向日葵 26（42）、云 10（16）、雨 700（1200） |
| 面板布局 | `@media (max-width:600px),(pointer:coarse)`：面板通栏 `max-width:420px`、5 个天气按钮 `grid` 等宽、滑杆 `grid` 三栏、状态栏移到底部；`rot90` 下面板收成 300px 贴角，不挡主体 |
| 横屏短高 | `@media (max-height:460px)` 隐藏操作提示与状态栏 |

实测截图：`test/w_phone.png`（390×844 竖屏，画面已转横屏）、`test/w_phone_ls.png`（844×390 横屏，5 个天气按钮一行排开）。

---

## 七、验证方式

### 自动化
```bash
node test/verify.js    # 静态验收 30 项（含 5 项移动端适配）
node test/smoke.js     # 运行时冒烟：init + 120 帧 + 5 种天气 + UI 路径 + 场景断言
```
冒烟输出示例：
```
✓ init() 完成
✓ 连续 30 帧无异常
✓ 切换到「晴天/雾天/夜间/雨天/黄金时刻」并过渡 24 帧
✓ UI 交互路径（太阳角/雾浓度/巡游/瞬时切换）正常
✓ 场景统计: 普通 Mesh 395 / InstancedMesh 5 / 灯光 4 / Points 1
SMOKE PASS — 全部通过
```

### 实机渲染（无头 Edge + SwiftShader）
```bash
msedge --headless=new --enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader \
       --window-size=1280,720 --virtual-time-budget=7000 \
       --screenshot=out.png "file:///<路径>/index.html#night"
```
五张 `test/w_*.png` 即由此产出，FPS 实测 160–350。

---

## 八、手机上打不开的原因与解法

**原因**：`index.html` 靠相对路径加载 `js/three.min.js`。把 html 单独发到手机（微信/QQ/附件）时，
多数手机不会渲染网页；即使能打开，`file://` 协议下浏览器也不允许读同目录 js。
**结论：必须用 http(s) 打开，不能用 `file://`。**

本次新增：

| 文件 | 作用 |
|---|---|
| `serve.js` | 零依赖 Node 静态服务器，启动即打印手机可访问的局域网地址 |
| `build-single.js` | 把 `index.html` + `three.min.js` 打成 **单文件** `forest-house-single.html`（643KB，无任何外链） |
| `手机上打开.md` | 三种方式的完整说明（局域网 / 静态托管 / 小程序） |

```bash
node serve.js                 # → 手机同 WiFi 打开 http://<局域网IP>:8000/
node build-single.js          # → forest-house-single.html，可直接拖到 Netlify Drop
```

`verify.js` 的静态检查已确认单文件 **无残留 `<script src=>` 外链**，并且无头 Edge 用 `file://`
直接渲染 `forest-house-single.html` 截图正常 —— 说明单文件本身是自包含的。

> 微信内打开需要 **HTTPS 公网地址**：把 `forest-house-single.html` 拖到 Netlify Drop / Vercel /
> GitHub Pages，拿到 `https://` 链接即可在微信里发给自己或别人。

---

## 九、美化

- **暗角**：`#app::after` 加 `radial-gradient`（中心透明 → 边缘 30% 黑），压住四角、聚焦主体。
  纯 CSS、零渲染开销。
- **花瓣配色**：`flowerHeadIM.setColorAt()` 按 `mulberry32` 给每株花一个色，
  68% 金黄 / 16% 橙 / 10% 奶油白 / 6% 红褐，远看更像真花田。
  注意材质底色必须留 `0xffffff`，否则 `color × instanceColor` 会**重复相乘变暗**。
- **试过但撤掉**：给 canvas 加 CSS `filter:saturate/contrast` 会强制额外合成一遍，
  FPS 从 891 掉到 75，且颜色走不同色彩空间导致发白 —— 已移除。

---

## 十、安全加固

目标：手机 / 微信里打开时，页面**不联网、不落数据、无注入面**。

### 10.1 页面本身

| 审计项 | 结果 |
|---|---|
| 外部链接（CDN/字体/统计） | 0 |
| `fetch` / `XHR` / `WebSocket` / `sendBeacon` | 0 |
| `localStorage` / `sessionStorage` / `cookie` | 0 |
| `eval` / `new Function` / `document.write` | 0 |
| `innerHTML` | 0（`updateStatus()` 已改为 `createElement` + `textContent`） |

`updateStatus()` 原本用 `innerHTML` 拼字符串。虽然插值全是数字与固定常量、
`location.hash` 也只做 `weatherModes.indexOf(_h)` 后索引固定数组、没有注入面，
但仍然改成了纯 DOM 构建，让「0 innerHTML」成为可断言的硬指标。

head 里新增：

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src data: blob:; connect-src 'self'; font-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
```

> `connect-src` 从 `'none'` 放宽到 `'self'`，只为放行唯一那个 `POST /api/feedback`（见 10.4）。
> 断言口径也相应收窄成「恰好一处 fetch，且必须是同源相对路径」，不是简单禁掉。

> **踩过的坑**：第一版 CSP 写成 `script-src 'unsafe-inline'`，漏了 `'self'` ——
> 结果外链的 `js/three.min.js` 被 CSP 直接拦下，页面白屏（`showFatal` 面板报
> 「THREE 库未加载」）。**当时只检查了截图文件是否存在，没有真的看画面**，险些把
> 一个坏版本交出去。现在 `security-audit.js` 里有专门一条
> `CSP 放行同源脚本 (script-src 'self')` 防止回归。

### 10.2 本地服务器 `serve.js`

| 加固点 | 说明 |
|---|---|
| 方法白名单 | 只放行 `GET`/`HEAD`，其余 405 |
| 路径穿越 | `path.resolve` 后比对 `ROOT + sep` 前缀；`%2e%2e`、反斜杠、双重编码均 403 |
| 坏编码 | `decodeURIComponent` 包 try/catch，`GET /%` 返回 400 而不是崩进程 |
| 扩展名白名单 | 非 `.html/.js/.css/.png/...` 一律 403 |
| 目录 | 不列清单（无 index.html 则 403） |
| CORS | 移除了 `Access-Control-Allow-Origin: *` |
| 安全响应头 | `nosniff` / `X-Frame-Options: DENY` / `Referrer-Policy` / CSP |
| 异常兜底 | 单个请求出错只影响该请求，`clientError` 也不崩 |

新增 `--localhost` 开关，只绑 `127.0.0.1`（不想让同 WiFi 的别人看到时用）。

### 10.3 回归测试 `test/security-audit.js`

静态断言 + **真起一个服务器用原始 socket 打恶意请求**，共 53 条：

```
node test/security-audit.js
→ 安全审计：53 passed, 0 failed / SAFE — 全部通过
```

覆盖：五类路径穿越（明文 / 编码 / 双编码 / 反斜杠 / 编码反斜杠）、坏编码存活、
POST/PUT 405、非白名单扩展名 403、目录不列清单、安全响应头齐全、无 CORS 通配、
`fetch` 恰好一处且同源。

### 10.4 「优化意见」回传（唯一的写入路径）

目标：**用户写的意见我能真收到，而且收不到时绝不打扰他。**

页面侧（`index.html`）：

```
点「提交意见」
  ├─ ① 先 copyToClipboard()  ← 不依赖网络，永远可用
  └─ ② 再 fetch('/api/feedback')  ← keepalive + AbortController 3 秒超时
        ├─ ok   → 「✅ 已收到，谢谢！」
        └─ 失败 → 「✅ 已复制到剪贴板 —— 这条链接没有回传通道，粘到聊天里发我即可。」
```

关键设计：
- **顺序不可颠倒**：先复制后发送。纯静态托管（GitHub Pages 等）没有后端，`fetch` 必然失败，
  但用户内容一定在剪贴板里，不会白写一场。
- **失败静默**：任何异常都在 `.catch()` 里转成 `false`，不弹错误框、不打断操作。
- **只发同源相对路径**：`const FB_ENDPOINT='/api/feedback';`，没有绝对 URL；CSP `connect-src 'self'` 兜底。
- **不带身份**：只带 `天气 / 画面尺寸 / 是否手机 / UA` 用于复现，不生成 ID、不写 cookie、不写 localStorage。

服务端（`serve.js`）：

| 闸门 | 值 |
|---|---|
| 单条上限 | 4096 字节 → 413 |
| 累计上限 | 2 MB → 507（收件箱满就拒收，不撑爆磁盘） |
| 限流 | 每 IP 每分钟 6 条 → 429 |
| JSON 非法 / 正文为空 | 400 |
| 正常 | 204，追加一行到 `feedback.jsonl` |
| `meta` 字段 | 逐个白名单 + 截断（`ua` 截到 160） |
| 下载 | `feedback.jsonl` 扩展名不在白名单 → 403，别人拿不到 |

> **踩坑**：413 分支原来直接 `req.destroy()`，客户端拿到的是 `ECONNRESET` 而不是 413。
> 改成先 `req.pause()` → 发完 413 → `res.on('finish')` 再断连接。测试里也因此
> 必须 `agent:false`，否则 Node 的 keep-alive 会复用刚被服务端关掉的 socket。

端到端测试 `test/feedback-e2e.js`（17 条）：真起服务器，用真实 HTTP 请求打 ——
204 / 落盘一行 / 正文与 meta 完整 / 400 / 413 / 429 / GET 不可读 / 静态资源不受影响 / 收件箱不可下载。

```
node test/feedback-e2e.js
→ 反馈接口测试：17 passed, 0 failed / FEEDBACK OK — 全部通过
```

再加一层「真人操作」验证 `test/make-fb-submit.js`：生成一个会自己填文案并点提交的临时页，
用无头 Edge 真跑一遍，然后检查 `feedback.jsonl`：

```json
{"ts":"2026-10-20T14:16:56.385Z","text":"【优化意见】2026-10-20 22:16 · 天气:晴天 · 画面:1254x627\n屋顶想换成茅草；向日葵再多一点；夜里加几盏路灯。","meta":{"weather":"晴天","screen":"1254x627","mobile":true,"ua":"…"}}
```

意见就存在项目根目录的 `feedback.jsonl`，一行一条，直接 `type feedback.jsonl` 看。

---

## 十一、已知边界
- 花草风摆每帧更新 `instanceMatrix`（移动端 140 草 + 26 花 ×3 组）。若低端机仍掉帧，
  把 `createGrass()` 的 `N` 再降到 80、`createSunflowers()` 的 `N` 降到 16。
- 阴影贴图 2048 / ±42 视锥，4K 全屏远景阴影边缘会略软，属预期。
- 无头 SwiftShader 是软件渲染，真实 GPU 上 FPS 会更高。
- **竖屏自动横屏是 CSS 旋转**，不是真的锁定屏幕方向：手机物理横过来后（`innerWidth > innerHeight`）
  会自动撤销旋转、回到正常横屏布局。若想真正锁定方向，可在用户点击后调用
  `requestFullscreen()` + `screen.orientation.lock('landscape')`（浏览器要求必须有用户手势）。
- iOS Safari 上 `backdrop-filter` 偶有闪烁，面板已用 `rgba` 底色兜底，不影响可读性。
