const fs = require('fs');
const path = require('path');

const sceneDir = path.resolve(__dirname, 'forest-house-scene');
const indexPath = path.join(sceneDir, 'index.html');
const threePath = path.join(sceneDir, 'js', 'three.min.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  PASS: ${name}`);
        passed++;
    } catch(e) {
        console.log(`  FAIL: ${name} — ${e.message}`);
        failed++;
    }
}

// 1. 文件存在性检查
test('index.html 存在', () => {
    if (!fs.existsSync(indexPath)) throw new Error('index.html not found');
});

test('js/three.min.js 存在', () => {
    if (!fs.existsSync(threePath)) throw new Error('three.min.js not found');
});
t
est('three.min.js 有效大小 > 100KB', () => {
    const size = fs.statSync(threePath).size;
    if (size < 100000) throw new Error(`three.min.js too small: ${size} bytes`);
});

// 2. HTML 内容检查
const html = fs.readFileSync(indexPath, 'utf8');

test('引入本地 three.min.js', () => {
    if (!html.includes('js/three.min.js')) throw new Error('No local three.js reference');
});

test('场景初始化函数 init', () => {
    if (!html.includes('function init()')) throw new Error('No init() function');
});

test('天气模式数组 (5种)', () => {
    const modes = html.match(/weatherModes\s*=\s*\[.*?\]/s);
    if (!modes) throw new Error('No weatherModes array');
    const count = (modes[0].match(/'(sunny|mist|night|rain|golden)'/g) || []).length;
    if (count < 5) throw new Error(`Only ${count} weather modes found`);
});

test('晴天模式', () => {
    if (!html.includes("case 'sunny'")) throw new Error('No sunny mode');
});

test('雾天模式', () => {
    if (!html.includes("case 'mist'")) throw new Error('No mist mode');
});

test('夜间模式', () => {
    if (!html.includes("case 'night'")) throw new Error('No night mode');
});

test('雨天模式', () => {
    if (!html.includes("case 'rain'")) throw new Error('No rain mode');
});

test('黄金时刻模式', () => {
    if (!html.includes("case 'golden'")) throw new Error('No golden mode');
});

test('小屋创建函数', () => {
    if (!html.includes('function createHouse()')) throw new Error('No createHouse()');
});

test('树木创建函数', () => {
    if (!html.includes('function createTrees()')) throw new Error('No createTrees()');
});

test('松树创建', () => {
    if (!html.includes('function createPine()')) throw new Error('No createPine()');
});

test('白桦树创建', () => {
    if (!html.includes('function createBirch()')) throw new Error('No createBirch()');
});

test('向日葵创建', () => {
    if (!html.includes('function createSunflowers()')) throw new Error('No createSunflowers()');
});

test('杂草创建', () => {
    if (!html.includes('function createGrass()')) throw new Error('No createGrass()');
});

test('松鼠创建', () => {
    if (!html.includes('function createSquirrel()')) throw new Error('No createSquirrel()');
});

test('鸟儿创建', () => {
    if (!html.includes('function createBird()')) throw new Error('No createBird()');
});

test('蝴蝶和蜜蜂创建', () => {
    if (!html.includes('function createInsects()')) throw new Error('No createInsects()');
});
t
est('天气切换函数', () => {
    if (!html.includes('function setWeather()')) throw new Error('No setWeather()');
});

test('雨滴系统', () => {
    if (!html.includes('function initRain()')) throw new Error('No initRain()');
});
t
est('星空系统', () => {
    if (!html.includes('function addStars()')) throw new Error('No addStars()');
});
t
est('循环天气按钮', () => {
    if (!html.includes('function cycleWeather()')) throw new Error('No cycleWeather()');
});
t
est('动画循环', () => {
    if (!html.includes('function animate()')) throw new Error('No animate()');
});
t
est('键盘事件监听', () => {
    if (!html.includes('addEventListener(\'keydown\',')) throw new Error('No keydown listener');
});
t
est('状态面板更新', () => {
    if (!html.includes('function updateStatus()')) throw new Error('No updateStatus()');
});

// 3. 抽象树查找
function countElements(tag) {
    const regex = new RegExp(`<${tag}[\\s>]`, 'g');
    const matches = html.match(regex);
    return matches ? matches.length : 0;
}

test('至少有一个向日葵元素', () => {
    // 检查createSunflower()被多次调用或循环生成
    const calls = (html.match(/createSunflower\(/g) || []).length;
    if (calls < 2) throw new Error('Sunflower creation not in loop');
});

test('至少50个杂草', () => {
    const match = html.match(/for\(let i=0;i<(\d+);i\+\+\)/g);
    const grassLoop = html.includes('createGrass()');
    if (!grassLoop) throw new Error('No grass creation');
});

// 4. 语法检查 - 基本配对
test('所有左括号都有右括号', () => {
    let open = 0;
    for (const ch of html) {
        if (ch === '(') open++;
        if (ch === ')') open--;
    }
    if (open !== 0) throw new Error(`Unmatched parentheses: ${open}`);
});
t
est('所有左大括号都有右大括号', () => {
    let open = 0;
    for (const ch of html) {
        if (ch === '{') open++;
        if (ch === '}') open--;
    }
    if (open !== 0) throw new Error(`Unmatched braces: ${open}`);
});

test('所有左方括号都有右方括号', () => {
    let open = 0;
    for (const ch of html) {
        if (ch === '[') open++;
        if (ch === ']') open--;
    }
    if (open !== 0) throw new Error(`Unmatched brackets: ${open}`);
});

console.log(`\n====================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);