const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

test('下注明细查询只读取实际存在的字段，两个分支列一致', async () => {
    let captured;
    const mysql = { query: async (db, sql, args) => {
        captured = { db, sql, args };
        return [];
    } };
    const context = {
        module: { exports: {} },
        require: name => name === 'pomelo' ? { app: { get: () => mysql } } : {},
        console
    };
    const source = fs.readFileSync(path.join(__dirname, '../dao/playerDao.js'), 'utf8');
    const start = source.indexOf('playerDao.betDetailsQueryByName =');
    const end = source.indexOf('playerDao.PlayerDetailsQuery =', start);
    assert.ok(start >= 0 && end > start);
    vm.runInNewContext(`let playerDao = module.exports; let mysql = require('pomelo').app.get('sqlHelper');\n${source.slice(start, end)}`, context);

    const result = await context.module.exports.betDetailsQueryByName({
        group_nickname: '测试群', name: '测试玩家',
        startTime: '2026-09-03 00:00:00', endTime: '2026-09-05 23:59:59'
    });
    assert.equal(result.err, null);
    assert.equal(captured.db, 'bjl');
    assert.equal((captured.sql.match(/\b0 AS d\b/g) || []).length, 2);
    assert.equal((captured.sql.match(/\bg\.d\b|\bh\.d\b/g) || []).length, 0);
    assert.equal((captured.sql.match(/\bg\.k\b|\bh\.k\b/g) || []).length, 2);
    assert.equal((captured.sql.match(/\bg\.q\b|\bh\.q\b/g) || []).length, 2);
    assert.deepEqual(Array.from(captured.args), [
        '测试群', '测试玩家', '2026-09-03 00:00:00', '2026-09-05 23:59:59',
        '测试群', '测试玩家', '2026-09-03 00:00:00', '2026-09-05 23:59:59'
    ]);
});
