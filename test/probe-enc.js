const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function probe(name) {
    const p = path.join(ROOT, name);
    if (!fs.existsSync(p)) return console.log(name, 'MISSING');
    const buf = fs.readFileSync(p);
    const s = buf.toString('utf8');
    const bad = s.includes('\uFFFD');
    const marks = {
        '复制意见': s.includes('复制意见'),
        '提交意见': s.includes('提交意见'),
        "connect-src 'self'": s.includes("connect-src 'self'"),
        '✅': s.includes('✅'),
        '⚠': s.includes('⚠'),
        '💬': s.includes('💬'),
        '🌲': s.includes('🌲'),
        'sendFeedback': s.includes('sendFeedback'),
        'inject': s.includes('setTimeout(function(){\n    openFeedback'),
    };
    console.log('---', name, 'bytes=' + buf.length, 'invalidUTF8=' + bad);
    console.log(Object.entries(marks).map(([k, v]) => k + '=' + (v ? 'Y' : 'n')).join('  '));
}

['index.html', '_fbtmp.html', '楚门的2.0世界.html'].forEach(probe);
