# 建模规范 · 楚门的 2.0 世界

本文件是场景建模的单一事实来源：色板、比例尺、构件清单、新模型接入步骤。
代码里的正式入口是 `index.html` 中的 **建模工具箱 `ModelKit`** 与 **色板 `PALETTE`**，
新模型一律从工具箱取件，不要在场景代码里散写几何拼装。

## 总原则

1. **合并优先**：同材质的小件先合并几何再建 mesh。静止物件目标是个位数 draw call；
   性能基线与守卫见 `test/perf-guard.js`（如上线后）。
2. **种子决定造型**：参数化构件用 `mulberry32(seed)` 掷骰子，同 seed 必同形，
   方便回归对照；不要在构件里用 `Math.random()`（布局会不可复现）。
3. **只产几何与材质**：工具箱不碰场景图、不碰浏览器接口。摆位、贴地（`terrainH`）、
   避让（`WalkMap`）由调用方负责。
4. **参数不散落**：颜色进 `PALETTE`、尺寸进本文件的比例尺、可调量进 `CONFIG` 配置区。

## 色板（PALETTE，与代码一一对应）

| 键 | 值 | 用途 |
|---|---|---|
| `stem` | `0x4f7a2e` | 花茎 / 藤蔓 / 灌木绿 |
| `leaf` | `0x5c8a38` | 叶片 / 草簇绿 |
| `stalk` | `0x55802f` | 作物茎绿（玉米 / 嫩芽） |
| `leafLt` | `0x63963a` | 亮叶绿 |
| `disk` | `0x5a3a15` | 花盘 / 花芯褐 |
| `petal` | `0xe8a81a` | 向日葵瓣金黄 |

树专用材质（代码里 `TREE_BARK` 等常量，粗糙度 1）：

| 常量 | 值 | 用途 |
|---|---|---|
| `TREE_BARK` | `0x6e4a26` | 松 / 通用树干 |
| `TREE_BIRCH` | `0xe6e1cf` | 桦树干（米白） |
| `NEEDLE_A/B` | `0x2e7d32` / `0x388e3c` | 松针两色（同棵相邻不用同色） |
| `LEAF_A/B` | `0x7ec850` / `0x66bb44` | 桦树叶两色 |

其它一次性颜色（果实、土壤、石材等）就近写在构件里即可，不必进色板；
但同一个颜色在三处以上重复出现时，必须收进 `PALETTE`。

## 比例尺（单位：米，全场统一）

| 对象 | 尺寸 | 备注 |
|---|---|---|
| 小屋 | 宽 6.4 × 深 4 × 高 5.2，中心在原点 | `HOUSE_POS=( -7, -4 )` 为锚点口径见代码 |
| 松树 | 干高 4.2（径 0.32–0.62），4 层树冠总高 ≈ 9–10 | 场景缩放 0.75–1.35（`plantTree`） |
| 桦树 | 干高 5.6（径 0.26–0.42），3 团树冠 | 同上 |
| 作物 | 向日葵 ≈ 1.5、玉米 ≈ 2.0、南瓜贴地 ≈ 0.3 | 一格一株，格 1.55 × 1.33 |
| 碎石 | 半径 0.13–0.30 | `ModelKit.rock(r)` |
| 岸边石 | 半径 0.26–0.90 | 同上 |
| 新角色（#27 小龙预留） | 身高建议 1.2–1.6，明显小于树、高于草丛 | 接入时以本表为准微调 |

地形 160×160、72×72 分段；所有贴地物件 y 由 `terrainH(x,z)` 给出，不要手填高度。

## 构件清单（ModelKit）

| 成员 | 签名 | 说明 |
|---|---|---|
| `merge` | `mergeGeos(list)` | 合并普通几何（元素可为裸几何或 `{geo, matrix}`） |
| `paint` | `paintGeo(geo, hex)` | 给几何刷统一顶点色，返回几何本身 |
| `mergePainted` | `mergePaintedGeos(geos)` | 合并已刷色几何（带 color 通道） |
| `pine` | `buildPineGeo(seed)` → `{bark:[], leaves:[]}` | 松树：干 + 4 层锥冠 |
| `birch` | `buildBirchGeo(seed)` → `{bark:[], leaves:[]}` | 桦树：干 + 3 团叶球 |
| `rock` | `rock(r)` | 正十二面体石头 |
| `crops.sunflower` | `farmSunflowerGeos()` | 向日葵一株（茎/叶/盘/瓣已刷色） |
| `crops.corn` | `farmCornGeos()` | 玉米一株 |
| `crops.pumpkin` | `farmPumpkinGeos(rnd)` | 南瓜一丛（藤/叶/2 果，位点由 rnd） |
| `crops.sprout` | `sproutGeos()` | 嫩芽（未成熟态） |

### 顶点色的坑（踩过，务必读）

普通合并 `concatGeos` 只搬 position/normal/uv，**不搬 color**。哪个零件漏了
`paintGeo` 刷色，它的 color 段就是全 0，渲染出来整片发黑——农田上线时踩过一次。
规矩：带色零件一律走 `paintGeo` + `mergePaintedGeos`，零件入列前必须先刷色，没有例外；
材质记得开 `vertexColors: true`。

## 新模型接入步骤

1. 在工具箱里加生成器：参数化（尺寸/seed），只返回几何（或 `{geo, matrix}` 零件表）；
   需要多色就逐件 `ModelKit.paint` 刷色。
2. 颜色先查 `PALETTE`：没有再新增键，并回填本文件色板表。
3. 场景侧摆位：位置先问 `WalkMap`（`clearOf` / `isWalkable`）避让，y 用 `terrainH` 贴地。
4. 同类数量 ≥ 5 的，考虑 InstancedMesh 或合并几何；加完跑 `node test/all.js`
   并看性能守卫是否报警。
5. 若是会动的角色：不要写进 `animate`，按行为框架 `AgentKit` 写一份 def
   （作息 + 状态 + 模型钩子），`spawn` 注册即可。
6. 截图对照白天/金色时刻两眼，确认色调与比例不违和，再提交。

## 可移植性原则（负责人定调：不把任何东西定死）

本网页将来可能移植到小程序或 App。原则是**薄接缝、不过度工程化**：
核心逻辑与平台接口之间只隔一层薄适配，换宿主时只换适配层。

**分层现状（从内到外）：**

| 层 | 内容 | 移植时 |
|---|---|---|
| 纯逻辑层 | `GClock` 时钟、`WalkMap` 可行走地图、`AgentKit` 行为框架、`Env` 环境状态、`mulberry32`、全部声明式数据（`SKY` 天气表、`CHANGELOG_NOTES`、`VOTE_OPTIONS`、农田布局表、`CODEX_DEFS` 图鉴条目表） | 直接复用，不依赖浏览器与 THREE 之外的宿主 API |
| 渲染层 | `ModelKit` 工具箱产出几何/材质，场景组装与 `animate` | 复用结构；换渲染引擎时按构件逐个翻译 |
| 平台适配层 | 存储适配层 `store`（8 个键收口一处）、唯一上报通道 `fbEndpoint`（FormSubmit）、输入（键鼠/触摸/OrbitControls 接缝）、DPR 与移动端判定 | 必须替换：小程序/App 各有自己的存储、网络与输入 API，只改这一层 |

**接缝规矩（新代码必须遵守）：**

- 本地存储只准经 `store` 进出，不许在别处直接出现存储 API；键名仍是现有 14 个白名单键（ct2_scene 为场景中枢画质总档与渲染参数偏好，#75 新增；ct2_bag 为小龙背包/喂食计数，#17 新增；ct2_echo 为建议回音回执，#39 新增；ct2_dragon 为小龙自定义外观与个性，#41 新增；ct2_codex 为图鉴解锁集合，#23 新增；ct2_guest 为留言上墙本机副本，#20 新增；ct2_music 为自定义音乐偏好与歌名，#18 新增；#68 扩 tags 天气标签映射与 wxLock 锁定开关字段，不新增键；ct2_ach 为成就徽章解锁集合与日期，#66 新增；登记规矩同前：新增键须同步登记 verify 与 security-audit 两处白名单）。
- 化身形态（#79）：`ct2_dragon` 内扩 `avatar:{form:'dragon'|'girl', style:0|1|2, chosen}` 字段（不新增键，老存档缺失即小龙本体）；建模入口 `ModelKit.dragon` 走 `buildAvatarModel` 分发，两种形态共用同一 parts 契约（body/head/eyes/fin/arm/leg/wing/tail/armBase/bodyBaseY/grow），`dragonAnimate` 与状态机零分叉。少女造型一期走 `GIRL_STYLES` 声明式数据；二期自由搭配（#80）已扩为部件库 `GIRL_PARTS`/`GIRL_PRESETS`：13 类（发型/发色/发饰/耳饰/项链/上装/下装/袜/鞋/角/耳鳍/翅膀/尾巴）独立可选，每件在库里声明挂点 `mount`、叠放 `layer` 与遮挡 `hides`（帽子藏发顶团、袜盖小腿、靴筒盖袜口），存档只存部件 id 组合于 `avatar.parts`（仍不新增键，坏/缺 id 经 `girlPartsNormalize` 回落预设），官方三款即 `GIRL_PRESETS` 一键套用，`hornTip` 随角型部件从库里取坐标。少女专属接入点都挂在 parts 上、缺失即走小龙默认值：`hornTip`（小鸟停角的角尖头局部坐标）、`lieCal`（侧躺支点校准，Box3 实测贴地）、`walkFreq/legSwing/armSwing`（按腿长调的步频摆幅）；节日穿戴件挂少女时经 `girlFestAdapt` 适配组重映射锚点，换形态后 `refitFestivalWear` 整批重挂。
- 探索者视角（#100）：`ct2_dragon` 内扩 `view:{fp, chosen}` 字段存人称偏好（不新增键，老存档缺失即第三人称未选）；进世界无观看态——出生点为小屋门口，化身传送走 `avatarTeleportTo`，自动巡游已改化身漫游（`updateAvatarRoam`）；轨道相机只在拍照模式内作自由镜头（`photoSuspendExplorer`/`photoResumeExplorer` 存/还原人称）。
- 龙蛋开局（#67）：`ct2_dragon` 内扩 `egg:{hatched, laid, born}` 字段（不新增键）：全新存档（无 ct2_dragon）＝未孵化，老存档缺 egg 字段一律视为已孵化；未孵化时只建蛋不建 dragonAgent（蛋在小屋门前 `houseLocal(1.15, 4.55)`），全站读龙钩子靠 null 守卫天然跳过，能碰到的入口（互动/定制/回小屋）另给 `EGG_HINT` 提示；成长在蛋里冻结（grow 恒为「蛋里第 1 天」），孵化当天正式起算。选少女化身不走序章（`chooseAvatar` 内账面静默破壳）；面板「🥚 再孵一颗蛋」二次确认后可变回蛋（只动龙与成长，名字/外观/其它进度不动），`enteredWorld` 后再孵的孵化完成在破壳处 `dragonTakeover` 重新接管。
- 网络上报只准经现有唯一通道函数，不许新增请求出口（安全审计会拦）。
- 可调参数（时间间隔、阈值、色板、比例）集中在 `CONFIG` / `PALETTE` / 性能守卫常量区，
  不散落魔法数字；新参数先问一句「将来要不要调」——要，就进配置区。
- 内容数据（文案、更新日志、投票选项、天气数值）保持声明式数据结构，不写死进逻辑。
- 输入与逻辑解耦：玩法逻辑只认「意图」（如选中某格、切到某天气），不认具体按键/手势，
  换端时只重写输入映射。

## 模型管线（GLB 高模轨，Issue #87）

自 #87 起场景模型双轨并行：**代码模型轨**（ModelKit 程序建模，即单文件版与一切
回落的本体）与 **GLB 高模轨**（Blender/Tripo 生产的外部资产，经管线按档位热替换）。
管线本体在 index.html 的 `ModelPipe` 段，资产放仓库 `assets/models/`。

### 注册表 MODELS（声明式，双版本强制）

每条资产必须按双版本登记，两档槽位先行、文件可后产：

```js
{ id: 'pine_outer', fallback: 'code',
  versions: {
    hi: { src: 'assets/models/pine_outer.hi.glb',          // PC 高配：高面数＋完整 PBR
          textures: { basecolor, normal, roughness, metalness, ao } },
    lo: { src: null,                                       // 移动精简：同贴图减面＋压缩；null＝该档回落代码模型
          textures: { basecolor, normal, roughness, metalness, ao } } } }
```

- `src` 只准相对路径（见下方 Capacitor 约束）；贴图内嵌 GLB 时五槽填所用贴图的
  仓库相对路径作登记账目，未产/未用填 `null`，不许省略槽位。
- **PBR 贴图组强制规范**：hi 版交付必须备齐五槽——基础色 basecolor、法线 normal、
  粗糙度 roughness、金属度 metalness、环境遮蔽 AO（可烘焙进 GLB 或外置登记）；
  lo 版用同一套贴图减面＋压缩，不另起画风。本批评审模型为程序材质＋顶点色，
  五槽按规范登记为 null（待产），属合规的首件豁免，后续批次不得援引。
- 节点命名即契约：`_build` 按 GLB 内节点名取件（如松树 `PineTrunk`/`PineFoliage`），
  改名等于改契约，须同步改代码并在 PR 说明。

### 档位判定与手动切档

自动分级 `ModelPipe.autoTier()`，下列任一成立判 **lo**，否则 **hi**：
① file: 协议 ② 移动设备 `IS_MOBILE` ③ 玩家已开「弱网低画质」④ 设备内存 <4GB
（浏览器肯报时）⑤ CPU 逻辑核 <4（同上）。只读设备能力，不采集、不上传。
手动切档钩子预留给设置面板（#75）：`window.__modelTier('hi'|'lo'|null)`，
null 恢复自动；加载进度经 `ModelPipe.onProgress(fn)` 订阅，默认汇入开页进度条
94→100 段，`window.__modelProgress()` 可读。

### 加载器

three r128 官方 GLTFLoader 以独立文件 `js/GLTFLoader.js` 随仓库走（出处与版本
见文件头注），运行时由管线动态注入同源脚本加载——index.html 静态脚本仍只有
three.min.js 一个，CSP 与安全审计口径不变。加载全程异步，渲染主循环不感知。

### 回落与热替换纪律（验收项，逐条核）

1. **分批热替换、一次一类**：一个 build 只替换一类物体，替换在世界建成后发生，
   玩家无感、不白屏、不阻塞进场。
2. **失败必回落**：加载器缺失、资源 404、解析失败、节点契约不符，任一发生即回
   代码模型并保持其可见；失败条目在下一次 `apply()`（切档/画质开关/重试）时可
   重新尝试，不做静默死锁。
3. **替换不改变交互与存档语义**：GLB 实例的位姿必须与代码模型同源同表
   （如松树共用 `__outerPineSpots`），语义锚（`__treeTops` 等玩法坐标）一律不动；
   显隐切换只许动该类物体自己的代码件与 GLB 组，不碰其他对象；不新增存储键、
   不改变任何既有存档字段含义。
4. **季节/天气同步**：代码模型靠材质色跟随四季的部件，GLB 版须以同源色对齐
   （松树冠即以 `NEEDLE_A.color` 为基色、顶点色只作相对变化量，并定时对齐）。

### 体积纪律

单个模型 GLB **≤ 1MB**（本批评审松树 53,940 字节 / 1,076 面）；贴图优先程序
材质与顶点色，必须用位图时压缩并计入体积；大批量同类物体必须实例化
（InstancedMesh）绘制，draw calls 不因换高模明显上涨，性能守卫照常把关。

### 单文件轨关系

`build-single.js` 产物（单文件版）不内嵌 GLTFLoader 与 GLB：file: 协议下管线
永不发起加载，单文件永远走代码模型——这就是低模保底轨的定义，高模轨的任何
故障都不许波及它。

### 批次记录

- **第一批「房子附近」（2026-10-22）**：主屋外壳 `house`、栅栏 `fence_seg`、核心区
  松 `pine_a/pine_b`、阔叶 `broadleaf_a/broadleaf_b`，hi/lo 双档齐备（仓库
  `assets/models/`，合计约 11.2MB；单件上限口径以环境包为准：hi ≤3MB、lo ≤800KB，
  本批最大 house.hi 2.87MB）。主屋只换外壳（`__houseShell` 23 件），门/窗/门牌/
  檐灯/烟等功能件保留代码版；生产侧 house 已改无门板版（门洞与代码门对齐），游戏内
  继续用可开合的代码门。核心树干冠一体单材质，四季染色按「代码冠材当前色 ÷ 基线
  色」比例同步；树干 IM 按 variant 沉降/整份隐藏与冠显隐联动。**glSafe 安全模式
  设备一律不加载 GLB**（apply 闸门）。前置条件：带内嵌贴图的 GLB 依赖 CSP
  `connect-src` 放行 `blob:`（GLTFLoader 以 ImageBitmapLoader fetch blob: 贴图），
  index.html 与 serve.js 已同步放行，安全审计口径不变。

### Capacitor 适配约束（永久规则，管线与新模型代码必须遵守）

1. 所有资源路径只用相对路径，禁止写死任何域名/GitHub 绝对路径（注册表 src、
   贴图路径、加载器路径皆然）。
2. 模型加载与新代码禁止使用浏览器独占 API，须在移动 WebView 环境可降级运行：
   一切能力探测（内存、核数等）只作档位提示，缺失即按保守档处理，不作必需依赖。
3. 档位判定与加载逻辑不依赖桌面专属能力；WebView 下加载失败走既定回落，
   不许出现白屏或未捕获异常。

## 网页版保底可玩：探针与软件渲染判定口径（#95，定版）

铁律：**网页版必须保证能打开能玩**，画质与性能可让步。判定全在
`index.html` 的 `probeGL()` 与 `init()` 入口完成，本节为唯一成文口径，
改判定先改这里再改代码。

### 裸探针阶梯（不让 THREE 自己撞参数）

- 类型外层 `webgl2 → webgl → experimental-webgl`，属性内层 6 格（全配
  `antialias+high-performance` 一路剥到裸 `{}`）；**每一格用全新 canvas**
  走原生 `getContext`，拿到非 null 即停（同 canvas 换属性重试在部分
  内核必失败）。安全模式起步（`glSafeBoot`）从第 3 格起，跳过激进档。
- 硬上限 **10 次尝试**（全阶梯最坏 18 格）：防弱内核上反复折腾。
- 探针卫生：交接失败或不采用的活 context 必须经 `glReleaseCtx()`
  （`WEBGL_lose_context`）显式释放——WebView 对同时存活的 WebGL
  context 有配额（约 8–16），僵尸 context 会把真正的渲染器挤死。
  计数钩子 `window.__glProbeStats{created,released,attempts}`，
  验收口径：成功交接后 `created-released===1`（只剩渲染器那一个）。
- 交接：`new THREE.WebGLRenderer({canvas, context, antialias,
  powerPreference})` 把活 context 给引擎；引擎侧再失败 → 释放探针
  context 后回落老配置阶梯（正常 4 档／安全模式 2 档），全灭才致命。

### 软件渲染与弱环境判定

- 渲染器字符串经 `WEBGL_debug_renderer_info` 读
  `UNMASKED_RENDERER_WEBGL`；读不到记 `''`、**不判软件**（不冤枉）。
- **软件渲染**：字符串命中 `/swiftshader|llvmpipe|softpipe|software|
  basic render/i` 或含 `angle (google`（ANGLE 的 Google 软件路径）。
- **弱环境 weak**：`software===true`，或探针只在第 4 格（0 基）起
  才成功（属性已被剥到很素）。
- **弱 WebView 名单**（仅用于无存档首访）：移动端且 UA 命中
  `MicroMessenger|MQQBrowser|QQBrowser|TBS|Qzone|UCBrowser`。

### 定档动作（init 建场景前执行，先定档再建场景，保命全套自动生效）

| 条件 | 动作 |
|---|---|
| `probe.weak` 且当前档 <2 且非试升启动 | `SCENE.glSafe=2` 保命起步，DPR 压 1.25，`SceneHub.save()` 落盘（下次直接保命进） |
| 弱 WebView 名单命中 且 **无存档**（`__hadSceneSave===false`）且当前档 <1 | `SCENE.glSafe=1` 低配起步，DPR 压 1.25，落盘 |
| 有存档 | 弱 UA 路径**一律不覆盖**玩家档位；探针 weak 判的是本机实时能力，与存档无关，仍按上一行升 2 |
| 聪明自适应试升启动（`GL_TIER.trial>=0`） | 探针弱判定**让位**：先按试升档建渲染器，失败立即记失败并回落可信档以最稳参数重试，不直接进致命层 |

### 致命层口径（showFatal）

- 网页版：主按钮「⬇ 下载 App 玩」（相对路径 `download.html`），次按钮
  「↻ 刷新重试」；**全站不再主推 Chrome**。
- App 内（`chumenInApp()` 三路并查，UA 优先）：已在 App 里的人不渲染
  下载按钮，主按钮改「↻ 重试进入」（清档位嫌疑计数后重走进入流程），
  文案走「完全关闭 App 后重新打开（重启 App）」口径。
- 资源类错误保留文件完整性提示，两类按钮同上。

### 验收钩子与覆盖

- 钩子：`window.__probeForceFail`（探针全灭）、`window.__probeFakeRenderer`
  （覆盖渲染器字符串）、`window.__glProbe`（探针结论）。
- 专项：`test/browsers-accept.js`（playwright-core 驱动 Chromium／
  Firefox／WebKit 三内核，各跑新玩家进入流程、保命档路径、软件渲染
  钩子、致命层四场景；缺浏览器包时 SKIP 不红）。覆盖现状见 Issue #95
  关闭评论的证据表：桌面 Chrome 与主流安卓 WebView（真机）已验；
  Firefox／WebKit 无头已验的范围与「待真机」项以该表为准。
