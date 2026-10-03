const assert = require('assert');
const path = require('path');
const pomelo = require('pomelo');

// result.js 的依赖在加载时从 pomelo.app 读取服务；计算测试只需要占位对象。
const app = pomelo.createApp({ base: path.resolve(__dirname, '../../..') });
app.set('sqlHelper', {});
app.set('redlock', {});
app.set('redis', { on() {} });

const result = require('./result');

const parameterSetup = {
    banker_odds: 95,
    player_odds: 100,
    tie_odds: 800,
    pair_odds: 1100,
    lucky_6_2_odds: 1200,
    lucky_6_3_odds: 2000,
    perfect_pair: 2500,
    lucky7_4_odds: 3000,
    lucky7_5_odds: 4000,
    lucky7_6_odds: 5000
};

function bet(overrides) {
    return Object.assign({
        z: 1000, x: 0, h: 0, zd: 0, xd: 0,
        l: 0, k: 0, m: 0, q: 0,
        g_z: 200, g_x: 0, d_z: 80, d_x: 0,
        zxdc: 0, lt: 20, sp: 700, spm: '庄'
    }, overrides);
}

// 闲对返还必须包含本金：100本金 + 1100盈利。
assert.strictEqual(
    result.do_settlement_jc_bjl(2 | 16, parameterSetup, bet({ xd: 100 })).t_yl,
    -1100
);

// 小老虎、大老虎和幸运7都必须按“本金 + 盈利”返还。
assert.strictEqual(
    result.do_settlement_jc_bjl(1 | 32, parameterSetup, bet({ l: 100 })).t_yl,
    -1200
);
assert.strictEqual(
    result.do_settlement_jc_bjl(1 | 64, parameterSetup, bet({ k: 100 })).t_yl,
    -2000
);
assert.strictEqual(
    result.do_settlement_jc_bjl(1 | 256, parameterSetup, bet({ q: 100 })).t_yl,
    -3000
);

// 大老虎未中奖时仍属于总下注，平台盈利100。
assert.strictEqual(
    result.do_settlement_jc_bjl(2, parameterSetup, bet({ k: '100' })).t_yl,
    100
);

// 台占盈亏使用平台视角。台占庄80：庄赢亏76、闲赢赚80、和局不输不赢。
assert.strictEqual(
    result.do_settlement_jc_bjl(1, parameterSetup, bet({ d_z: 80 })).t_xztyl,
    -76
);
assert.strictEqual(
    result.do_settlement_jc_bjl(2, parameterSetup, bet({ d_z: 80 })).t_xztyl,
    80
);
assert.strictEqual(
    result.do_settlement_jc_bjl(4, parameterSetup, bet({ d_z: 80 })).t_xztyl,
    0
);

console.log('result settlement tests passed');
