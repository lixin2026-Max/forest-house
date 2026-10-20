const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const s = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const lines = s.split('\n');
let count = 0;
lines.forEach((ln, i) => {
    if (ln.includes('\uFFFD')) {
        count++;
        console.log('L' + (i + 1) + ': ' + ln.trim().slice(0, 160));
    }
});
console.log('total lines with U+FFFD =', count);
