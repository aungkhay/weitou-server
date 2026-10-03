const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const parse = require('../util/parseMessageResponse');

function setup(send) {
    const source = fs.readFileSync(path.join(__dirname, '../domain/sx/sxRoom.js'), 'utf8');
    const begin = source.indexOf('sxRoom.prototype.stopBet =');
    const end = source.indexOf('sxRoom.prototype.pushResult =', begin);
    function Room() {}
    const calls = [];
    vm.runInNewContext(source.slice(begin, end), {
        sxRoom: Room, GAMESTATE: { BET: 1, STOP_BET: 2 },
        GMResponse: require('../domain/GMResponse'), CODE: { STOP_BET2: { code: '90', msg: '停止下注' } },
        config: { imgPath: { curSystem: 'test', test: '/images' } },
        sendChat: { sendImageMessage: async (...args) => { calls.push(args); return send(); } },
        console: { log() {}, error() {} }
    });
    const room = new Room();
    room.roomInfo = { cc: 1, jc: 2, startMsgId: '10', gameState: 1, chat_id: 'group', img2_after_start: '/stop.png' };
    room.updateLastStopMsgId = id => { room.roomInfo.lastStopMsgId = id; };
    room.doStopBet = () => { room.roomInfo.gameState = 2; };
    room.updateGame = () => {};
    const run = (msg = {}) => new Promise(resolve => room.stopBet({ server_send_stop_image: true, ...msg }, resolve));
    return { room, calls, run };
}
const success = () => ({ data: { data: { msgId: '676216923775565801' } } });

test('发送接口保留大整数精度，不修改字符串内容', () => {
    const result = parse('{"code":200,"data":{"msgId":676216923775565801},"text":"数字 676216923775565801"}');
    assert.equal(result.code, 200);
    assert.equal(result.data.msgId, '676216923775565801');
    assert.equal(result.text, '数字 676216923775565801');
});
test('服务器发送配置的截止图，忽略客户端旧消息ID', async () => {
    const { room, calls, run } = setup(success);
    const result = await run({ msgId: '99' });
    assert.equal(result.code, '90');
    assert.deepEqual(calls[0], ['/images/stop.png', 'stop.png', 'group']);
    assert.equal(result.data.msgId, '676216923775565801');
    assert.equal(room.roomInfo.gameState, 2);
});
test('失败、缺少ID和不安全数字均不截止，并允许重试', async () => {
    for (const send of [() => ({ err: 'failed' }), () => ({}), () => ({ data: { data: { msgId: 676216923775565800 } } }), () => { throw Error('network'); }]) {
        const { room, run } = setup(send);
        assert.equal((await run()).code, 500);
        assert.equal(room.roomInfo.gameState, 1);
        assert.equal(room.roomInfo.lastStopMsgId, undefined);
        assert.equal(room._sendingToolStopImage, false);
    }
});
test('并发请求不重复发送，跨局返回不更新截止线', async () => {
    let finish;
    const { room, calls, run } = setup(() => new Promise(resolve => { finish = resolve; }));
    const first = run();
    assert.equal((await run()).code, 500);
    assert.equal(calls.length, 1);
    room.roomInfo.jc++;
    finish(success());
    assert.equal((await first).code, 500);
    assert.equal(room.roomInfo.lastStopMsgId, undefined);
});
test('其他停止入口仍可使用已发送的消息ID', async () => {
    const { calls, run } = setup(success);
    const result = await run({ server_send_stop_image: false, msgId: '123' });
    assert.equal(result.code, '90');
    assert.equal(result.data.msgId, '123');
    assert.equal(calls.length, 0);
});
