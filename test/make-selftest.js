/*
 * 生成 _selftest.html：index.html + 一段「自己点提交、把结果铺满全屏」的驱动脚本。
 * 部署到 GitHub Pages 后，用真实 origin 打开它，就能完整走一遍生产链路
 * （真实页面、真实按钮、真实 FormSubmit），结果用截图读。
 * 验完把 _selftest.html 删掉即可，它不参与正常使用。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const driver = String.raw`
<script>
/* ===== 上线自检驱动（仅 _selftest.html 内出现） ===== */
(function () {
    const log = (t) => {
        let p = document.getElementById('selftestOut');
        if (!p) {
            p = document.createElement('pre');
            p.id = 'selftestOut';
            p.style.cssText = 'position:fixed;inset:0;z-index:99999;margin:0;padding:24px;' +
                'background:#0b0f14;color:#7CFF9E;font:600 22px/1.6 ui-monospace,Consolas,monospace;' +
                'white-space:pre-wrap;overflow:auto';
            document.body.appendChild(p);
        }
        p.style.color = t.startsWith('OK') ? '#7CFF9E' : (t.startsWith('BAD') ? '#FF8A8A' : '#cfd8e3');
        p.textContent = t;
    };

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    window.addEventListener('load', async () => {
        try {
            await sleep(2500);
            if (!window.openFeedback) { log('BAD 找不到 openFeedback，页面没起来'); return; }
            openFeedback();
            await sleep(300);

            const box = document.getElementById('fbText');
            box.value = '【上线自检】GitHub Pages 真实 origin 提交 · ' + new Date().toISOString();
            box.dispatchEvent(new Event('input', { bubbles: true }));

            log('OO 已填好，点击「提交意见」…\norigin: ' + location.origin + '\nrelay: ' + (typeof FB_RELAY === 'string' ? FB_RELAY : '(局部变量)'));
            document.getElementById('fbCopy').click();

            const msg = document.getElementById('fbMsg');
            let last = '';
            for (let i = 0; i < 60; i++) {
                await sleep(250);
                const t = (msg.textContent || '').trim();
                if (t && t !== last) { last = t; log('OO 回执：' + t); }
                if (/已收到|没发出去|失败|出错/.test(t)) break;
            }
            await sleep(800);
            const final = (msg.textContent || '').trim();
            const ok = /已收到/.test(final);
            log((ok ? 'OK  生产链路通' : 'BAD 生产链路未通') +
                '\n\n回执：' + (final || '(空)') +
                '\norigin：' + location.origin +
                '\n时间：' + new Date().toLocaleString('zh-CN'));
        } catch (e) {
            log('BAD 自检异常：' + e.message);
        }
    });
})();
</script>
</body>`;

if (!src.includes('</body>')) throw new Error('index.html 里没有 </body>');
fs.writeFileSync(path.join(ROOT, '_selftest.html'), src.replace('</body>', driver), 'utf8');
console.log('已生成 _selftest.html');
