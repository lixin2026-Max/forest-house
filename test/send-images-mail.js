// 发「图片包」到 QQ 邮箱：正文给 zip 直链 + 四张图各自直链（手机点开即可保存）。
const https = require('https');

const TO = '2820575692@qq.com';
const ORIGIN = 'https://lixin2026-max.github.io';
const REFERER = 'https://lixin2026-max.github.io/forest-house/';
const BASE = 'https://lixin2026-max.github.io/forest-house/docs/%E5%AE%A3%E5%8F%91/';

const enc = (s) => encodeURIComponent(s);

const body = [
    '【楚门 2.0 世界 · 图片包】',
    '',
    '一、打包下载（手机点开即存）',
    BASE + enc('楚门2.0-图片包.zip'),
    '（2168KB，含下面四张 PNG 原图）',
    '',
    '二、单张直链（长按保存 / 直接转发）',
    '1. 竖屏封面 1080×1920（小红书首图、朋友圈）',
    BASE + enc('04-竖屏封面.png'),
    '2. 工程图 · 分层架构',
    BASE + enc('01-分层架构.png'),
    '3. 工程图 · 数据流（渲染链 / 回传链 / 共创闭环）',
    BASE + enc('02-数据流.png'),
    '4. 工程图 · 文件与测试',
    BASE + enc('03-文件与测试.png'),
    '',
    '三、说明',
    '这个邮箱通道是表单转发，只能带文字，无法附加文件，所以附件用直链给出——点开就是原图，右键/长按即可保存。',
    '想要真正的邮件附件，给我一个邮箱 SMTP 授权码，我可以改成真发附件。',
    '',
    '四、素材怎么用',
    '· 封面：小红书首图、朋友圈配图，竖版字大，右上留白可裁',
    '· 三张工程图：适合发技术帖（即刻/掘金/B站专栏），深色背景配正文好看',
    '',
    '网页地址：https://lixin2026-max.github.io/forest-house/'
].join('\n');

const payload = JSON.stringify({
    name: '楚门2.0 图片包',
    内容: body,
    _subject: '【楚门2.0】图片包（zip + 四张直链）',
    _template: 'box',
    _captcha: 'false'
});

function send() {
    return new Promise((resolve) => {
        const req = https.request('https://formsubmit.co/ajax/' + enc(TO), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                Origin: ORIGIN,
                Referer: REFERER,
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 25000
        }, (res) => {
            let raw = '';
            res.on('data', (c) => { raw += c; });
            res.on('end', () => resolve({ status: res.statusCode, raw }));
        });
        req.on('error', (e) => resolve({ status: 0, raw: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ status: 0, raw: 'timeout' }); });
        req.write(payload);
        req.end();
    });
}

(async () => {
    const r = await send();
    let ok = false;
    try { ok = String(JSON.parse(r.raw).success) === 'true'; } catch (e) { ok = false; }
    console.log((ok ? 'MAIL OK' : 'MAIL FAIL') + ' / HTTP ' + r.status + ' / ' + r.raw.slice(0, 200));
    process.exit(ok ? 0 : 1);
})();
