/* 冒烟测试：用 stub 替代 WebGL/浏览器 API，真正执行 init() + 120 帧动画 + 5 种天气切换 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const threeSrc = fs.readFileSync(path.join(root, 'js', 'three.min.js'), 'utf8');
const inlineJs = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n;\n')
  // vm 里 let/const 只产生词法绑定，不会挂到 globalThis；追加探针让测试能读到内部状态
  + `\n;(globalThis.__probe = function(){
        return {
          scene: (typeof scene !== 'undefined') ? scene : null,
          renderer: (typeof renderer !== 'undefined') ? renderer : null,
          camera: (typeof camera !== 'undefined') ? camera : null,
          weatherIndex: (typeof weatherIndex !== 'undefined') ? weatherIndex : -1,
          weatherModes: (typeof weatherModes !== 'undefined') ? weatherModes : null,
          treeCount: (typeof treeList !== 'undefined' && treeList) ? treeList.length : -1,
          fb: function(){
            openFeedback();
            var opened = fbOpen === true;
            var box = document.getElementById('fbText');
            box.value = '测试意见：小屋屋顶想换茅草';
            var text = feedbackText();
            closeFeedback();
            var closed = fbOpen === false;
            return { opened: opened, closed: closed, text: text };
          }
        };
      })();\n`;

// ---------------- DOM / Canvas stubs ----------------
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'canvas') return { width: 512, height: 512, style: {} };
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(512 * 512 * 4) });
    if (k === 'createLinearGradient' || k === 'createRadialGradient')
      return () => ({ addColorStop() {} });
    if (k === 'measureText') return () => ({ width: 10 });
    return () => ctxStub;
  },
  set() { return true; }
});

function makeEl(tag) {
  const base = {
    tagName: (tag || 'div').toUpperCase(), style: {}, dataset: {}, children: [],
    width: 512, height: 512, textContent: '', innerHTML: '', value: '0', checked: false,
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    getContext: () => ctxStub,
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    append(...cs) { cs.forEach(c => this.children.push(c)); },
    setAttribute() {}, getAttribute() { return null; }, remove() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }),
    setPointerCapture() {}, releasePointerCapture() {}
  };
  return new Proxy(base, {
    get(t, k) { if (k in t) return t[k]; return () => undefined; },
    set(t, k, v) { t[k] = v; return true; }
  });
}

const elements = {};
const el = id => (elements[id] || (elements[id] = makeEl('div')));

const documentStub = {
  getElementById: el,
  createElement: makeEl,
  createTextNode: t => ({ nodeType: 3, textContent: String(t), style: {}, appendChild() {}, remove() {} }),
  createDocumentFragment: () => makeEl('fragment'),
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener() {},
  body: makeEl('body')
};

// rAF 队列，用于多帧推进
let rafQueue = [];
let vtime = 0;

const windowStub = {
  innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 2,
  addEventListener(ev, fn) { if (ev === 'load' || ev === 'DOMContentLoaded') windowStub.__onload = fn; },
  removeEventListener() {},
  THREE: null
};
const locationStub = { hash: '', href: 'file:///index.html', search: '', pathname: '/index.html' };

const logs = [];
const sandboxObj = {
  document: documentStub, window: windowStub, location: locationStub,
  console: {
    log: (...a) => logs.push(a.join(' ')),
    warn: (...a) => logs.push('WARN ' + a.join(' ')),
    error: (...a) => logs.push('ERROR ' + a.join(' '))
  },
  performance: { now: () => vtime },
  requestAnimationFrame: fn => { rafQueue.push(fn); return rafQueue.length; },
  cancelAnimationFrame() {},
  setTimeout: fn => { if (typeof fn === 'function') fn(); return 0; },
  clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
  Math, String, Number, Object, Array, JSON, Date, Error, TypeError, RangeError,
  Set, Map, WeakMap, Promise, Symbol, Boolean, RegExp, isFinite, isNaN, parseInt, parseFloat,
  Float32Array, Float64Array, Int8Array, Uint8Array, Uint8ClampedArray, Uint16Array,
  Int32Array, Uint32Array, ArrayBuffer, DataView
};
sandboxObj.globalThis = sandboxObj;
const sandbox = vm.createContext(sandboxObj);

try { vm.runInContext(threeSrc, sandbox, { filename: 'three.min.js' }); }
catch (e) { console.log('FATAL three load:', e.message); process.exit(1); }

// 替换 WebGLRenderer（无真实 GL 上下文）
vm.runInContext(`
  THREE.WebGLRenderer = function(){
    this.domElement = document.createElement('canvas');
    this.domElement.style = {};
    this.shadowMap = { enabled:false, type:0 };
    this.info = { render:{ calls:0, triangles:0 } };
    this.capabilities = { isWebGL2:true, getMaxAnisotropy:()=>8 };
    this.setSize = ()=>{}; this.setPixelRatio = ()=>{}; this.setClearColor = ()=>{};
    this.render = ()=>{}; this.getContext = ()=>null; this.dispose = ()=>{};
    this.compile = ()=>{}; this.getRenderTarget = ()=>null;
    this.toneMappingExposure = 1;
    this.outputEncoding = 3001;
  };
`, sandbox);

try { vm.runInContext(inlineJs, sandbox, { filename: 'scene-inline.js' }); }
catch (e) {
  console.log('FATAL inline script:', e.message);
  console.log((e.stack || '').split('\n').slice(0, 6).join('\n'));
  process.exit(1);
}

// ---------------- 阶段 1：init() ----------------
try {
  if (!windowStub.__onload) { console.log('FATAL: 未注册 load 处理器'); process.exit(1); }
  windowStub.__onload();
  console.log('✓ init() 完成');
} catch (e) {
  console.log('✗ init() 抛异常:', e.message);
  console.log((e.stack || '').split('\n').slice(0, 8).join('\n'));
  process.exit(1);
}

// ---------------- 阶段 2：推进帧 ----------------
function step(frames, label) {
  for (let f = 0; f < frames; f++) {
    vtime += 16.7;
    const q = rafQueue; rafQueue = [];
    if (!q.length) return `帧循环在第 ${f} 帧中断（无 rAF 回调）`;
    for (const fn of q) fn(vtime);
  }
  return null;
}

let err = step(30, '首帧');
if (err) { console.log('✗ ' + err); process.exit(1); }
console.log(`✓ 连续 30 帧无异常`);

// ---------------- 阶段 3：五种天气全切换 ----------------
const modes = ['晴天', '雾天', '夜间', '雨天', '黄金时刻'];
for (let i = 0; i < 5; i++) {
  try {
    sandbox.setWeather(i, false);
    const e2 = step(24, modes[i]);
    if (e2) throw new Error(e2);
    console.log(`✓ 切换到「${modes[i]}」并过渡 24 帧`);
  } catch (e) {
    console.log(`✗ 天气「${modes[i]}」失败:`, e.message);
    console.log((e.stack || '').split('\n').slice(0, 6).join('\n'));
    process.exit(1);
  }
}

// ---------------- 阶段 4：UI 交互路径 ----------------
try {
  if (typeof sandbox.applySunElev === 'function') sandbox.applySunElev(70);
  if (typeof sandbox.applyFogAmt === 'function') sandbox.applyFogAmt(80);
  if (typeof sandbox.toggleOrbit === 'function') { sandbox.toggleOrbit(); step(10); sandbox.toggleOrbit(); }
  if (typeof sandbox.setWeather === 'function') sandbox.setWeather(0, true); // 强制瞬时
  const e3 = step(20);
  if (e3) throw new Error(e3);
  console.log('✓ UI 交互路径（太阳角/雾浓度/巡游/瞬时切换）正常');
} catch (e) {
  console.log('✗ UI 交互失败:', e.message);
  console.log((e.stack || '').split('\n').slice(0, 6).join('\n'));
  process.exit(1);
}

// ---------------- 阶段 5：场景内容断言 ----------------
try {
  const p = sandbox.__probe ? sandbox.__probe() : null;
  if (!p || !p.scene) throw new Error('探针拿不到 scene（__probe 未注入或 scene 未定义）');
  const scene = p.scene;
  let meshes = 0, instanced = 0, lights = 0, points = 0;
  scene.traverse(o => {
    if (o.isInstancedMesh) instanced++;
    else if (o.isMesh) meshes++;
    if (o.isLight) lights++;
    if (o.isPoints) points++;
  });
  console.log(`✓ 场景统计: 普通 Mesh ${meshes} / InstancedMesh ${instanced} / 灯光 ${lights} / Points ${points}`);
  if (meshes + instanced < 3) throw new Error('场景物体过少，可能未构建');
  if (lights < 2) throw new Error('灯光数量异常');
  const errLogs = logs.filter(l => l.startsWith('ERROR'));
  if (errLogs.length) throw new Error('出现 console.error: ' + errLogs[0]);

  // 优化意见弹窗：真的开关一次，并生成带上下文的文本
  const fb = p.fb();
  if (!fb.opened) throw new Error('弹窗未能打开');
  if (!fb.closed) throw new Error('弹窗未能关闭');
  if (!fb.text.includes('【优化意见】')) throw new Error('意见抬头缺失: ' + fb.text);
  if (!fb.text.includes('测试意见：小屋屋顶想换茅草')) throw new Error('用户输入丢失');
  if (!/天气:/.test(fb.text) || !/画面:\d+x\d+/.test(fb.text)) throw new Error('缺少天气/分辨率上下文: ' + fb.text);
  console.log('✓ 优化意见弹窗可开关，文本带上下文：' + fb.text.split('\n')[0]);
} catch (e) {
  console.log('✗ 场景断言失败:', e.message);
  process.exit(1);
}

console.log('\n====================\nSMOKE PASS — 全部通过\n====================');
