// 把宣发素材包的清单发到 QQ 邮箱。
// 说明：FormSubmit 是表单转发，只能带文本，不能带附件 —— 附件以本地 zip 交付，邮件里给清单与线上链接。
const https = require('https');

const TO = '2820575692@qq.com';
const ORIGIN = 'https://lixin2026-max.github.io';
const REFERER = 'https://lixin2026-max.github.io/forest-house/';

const body = [
    '【楚门 2.0 世界 · 宣发素材包】',
    '',
    '一、这一包里有',
    '1. 宣发方案.md —— 定位句、卖点排序、三条内容主线、七天节奏、朋友圈/小红书/短视频文案',
    '2. 需求清单.md —— 共创闭环四态（待评估/待开发/已上线/否决），每条附两套方案与耗时、性能、冲突',
    '3. 01-分层架构.png —— 工程图：表现/装配/功能/场景/底座 五层',
    '4. 02-数据流.png —— 工程图：渲染链、回传链、共创闭环（人工闸门）',
    '5. 03-文件与测试.png —— 工程图：一个页面、五套测试、一条提交闸门',
    '6. 04-竖屏封面.png —— 1080×1920 宣发封面，可直接当小红书首图',
    '',
    '二、线上地址（可直接发给别人）',
    'https://lixin2026-max.github.io/forest-house/',
    '',
    '三、文档在线版（仓库里，点开即读）',
    '宣发方案：https://github.com/lixin2026-Max/forest-house/blob/main/docs/%E5%AE%A3%E5%8F%91%E6%96%B9%E6%A1%88.md',
    '需求清单：https://github.com/lixin2026-Max/forest-house/blob/main/docs/%E9%9C%80%E6%B1%82%E6%B8%85%E5%8D%95.md',
    '维护规范：https://github.com/lixin2026-Max/forest-house/blob/main/docs/%E7%BB%B4%E6%8A%A4%E8%A7%84%E8%8C%83.md',
    '',
    '四、当前版本：v3.3',
    '全局模块已上线：加载兜底与进度、资源失败降级、本地访问计数、一键分享、弱网低画质、版本日志、共创免责声明。',
    '回归：verify 55 / security 55 / feedback 17 / subpath 4 / smoke 全绿。',
    '',
    '（本邮件由站内表单通道发出，无附件；zip 请从工作目录取）'
].join('\n');

const payload = JSON.stringify({
    name: '楚门2.0 素材包',
    内容: body,
    _subject: '【楚门2.0】宣发方案 + 需求清单 + 4 张图',
    _template: 'box',
    _captcha: 'false'
});

function send() {
    return new Promise((resolve) => {
        const req = https.request('https://formsubmit.co/ajax/' + encodeURIComponent(TO), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': ORIGIN,
                'Referer': REFERER,
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
    console.log((ok ? 'MAIL OK' : 'MAIL FAIL') + ' / HTTP ' + r.status + ' / ' + r.raw.slice(0, 220));
    process.exit(ok ? 0 : 1);
})();
