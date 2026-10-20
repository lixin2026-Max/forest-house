// 探测 FormSubmit 是否需要来源头：分别用「无来源」「带 Origin/Referer」发一次，比较返回。
// 注意：每次成功都会真的往邮箱发一封信，这个脚本只在对接阶段跑。
const https = require('https');

const EMAIL = process.argv[2] || '2820575692@qq.com';
const HOST = 'formsubmit.co';
const PATH = '/ajax/' + encodeURIComponent(EMAIL);

function post(headers) {
    return new Promise((resolve) => {
        const body = JSON.stringify({
            _subject: '【森林小屋】优化意见（对接测试）',
            _captcha: 'false',
            _template: 'table',
            内容: '对接测试：收到这封就说明通道通了。',
            天气: '晴天', 画面: '1280x720', 手机: '否', 浏览器: 'probe'
        });
        const req = https.request({
            host: HOST, path: PATH, method: 'POST',
            headers: Object.assign({
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }, headers)
        }, res => {
            let buf = '';
            res.on('data', c => { buf += c; });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: buf }));
        });
        req.on('error', e => resolve({ status: 0, error: e.message }));
        req.write(body);
        req.end();
    });
}

(async () => {
    console.log('--- 无来源头 ---');
    const a = await post({});
    console.log('HTTP', a.status, a.body);

    console.log('\n--- 带 Origin + Referer（模拟本站页面） ---');
    const b = await post({
        'Origin': 'https://lixin2026-max.github.io',
        'Referer': 'https://lixin2026-max.github.io/forest-house/'
    });
    console.log('HTTP', b.status, b.body);
    console.log('\nCORS 响应头: access-control-allow-origin =',
        (b.headers && b.headers['access-control-allow-origin']) || '(无)');
})();
