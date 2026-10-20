/*
 * 真发一次意见，确认 FormSubmit 会把它转发到 2820575692@qq.com。
 * Origin/Referer 用激活时登记的那个表单地址。
 */
const https = require('https');

const ORIGIN = 'https://lixin2026-max.github.io';
const REFERER = ORIGIN + '/forest-house/';
const ENDPOINT = 'https://formsubmit.co/ajax/2820575692@qq.com';

const body = JSON.stringify({
    _subject: '【森林小屋】优化意见',
    _template: 'table',
    _captcha: 'false',
    内容: '这是一条通道测试：激活后你应当收到这封邮件。如果你看到了，说明意见回传已可用。',
    天气: 'sunny',
    画面: '1280x720',
    设备: '通道自检',
    时间: new Date().toISOString()
});

const u = new URL(ENDPOINT);
const req = https.request({
    hostname: u.hostname, path: u.pathname, method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Origin': ORIGIN,
        'Referer': REFERER,
        'User-Agent': 'forest-house-channel-check/1.0'
    }
}, res => {
    let out = '';
    res.on('data', d => out += d);
    res.on('end', () => {
        console.log('HTTP ' + res.statusCode);
        console.log(out);
        try {
            const j = JSON.parse(out);
            if (String(j.success) === 'true') {
                console.log('\n✓ 通道可用 —— 请查收 2820575692@qq.com');
                process.exit(0);
            }
        } catch {}
        console.log('\n✗ 未确认成功');
        process.exit(1);
    });
});
req.on('error', e => { console.log('请求失败: ' + e.message); process.exit(1); });
req.write(body);
req.end();
