const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function loadDao({ groups = [{ group_nickname: '源群' }, { group_nickname: '目标群' }],
    sourceCount = 3, eligibleCount = 2, writeError = null } = {}) {
    const calls = [];
    const mysql = { query: async (db, sql, args) => {
        calls.push({ db, sql, args });
        if (sql.includes('INSERT INTO')) {
            if (writeError) throw writeError;
            return { affectedRows: 0 }; // 相同设置再次复制，也必须成功。
        }
        if (sql.includes('COUNT(*)')) return [{ source_count: sourceCount, eligible_count: eligibleCount }];
        return groups;
    } };
    const context = { module: { exports: {} }, require: () => ({ app: { get: () => mysql } }),
        console: { error() {}, log() {} } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dao/bussionessDao.js'), 'utf8'), context);
    return { dao: context.module.exports, calls };
}

test('默认仅复制占成；保留目标群其他设置，重复复制成功', async () => {
    const { dao, calls } = loadDao();
    const result = await dao.copyGroupPersonalSetup({ source_desk: '源群', target_desk: '目标群' });
    assert.equal(result.err, null);
    assert.equal(result.data.skipped_count, 1);
    assert.equal(result.data.affected_rows, 0);
    const write = calls[2];
    assert.deepEqual(Array.from(write.args), ['目标群', '源群', '目标群']);
    assert.match(write.sql, /gm\.userId = src\.userId/);
    assert.match(write.sql, /bp_personal_share = VALUES\(bp_personal_share\)/);
    assert.doesNotMatch(write.sql, /redemption_type|rebate_ratio|start_exchange|DELETE/);
});

test('全部复制使用源值覆盖，包括零值和 NULL，不复制行主键或时间戳', async () => {
    const { dao, calls } = loadDao();
    await dao.copyGroupPersonalSetup({ source_desk: '源群', target_desk: '目标群', scope: 'all' });
    const sql = calls[2].sql;
    assert.match(sql, /redemption_start_time = VALUES\(redemption_start_time\)/);
    assert.match(sql, /rebate_ratio = VALUES\(rebate_ratio\)/);
    assert.doesNotMatch(sql, /COALESCE|create_time|update_time|src\.Id/);
});

test('无效输入不访问数据库', async () => {
    for (const msg of [{}, { source_desk: '群', target_desk: '群' },
        { source_desk: '源群', target_desk: '目标群', scope: 'bad' }]) {
        const { dao, calls } = loadDao();
        assert.ok((await dao.copyGroupPersonalSetup(msg)).err);
        assert.equal(calls.length, 0);
    }
});

test('群不存在、无源配置或目标没有成员时不写入', async () => {
    for (const fixture of [{ groups: [] }, { groups: [{ group_nickname: '同一群' }] },
        { sourceCount: 0, eligibleCount: 0 }, { eligibleCount: 0 }]) {
        const { dao, calls } = loadDao(fixture);
        assert.ok((await dao.copyGroupPersonalSetup({ source_desk: '源群', target_desk: '目标群' })).err);
        assert.ok(calls.every(call => !call.sql.includes('INSERT INTO')));
    }
});

test('整批写入错误不会返回复制成功', async () => {
    const { dao, calls } = loadDao({ writeError: new Error('write failed') });
    const result = await dao.copyGroupPersonalSetup({ source_desk: '源群', target_desk: '目标群' });
    assert.ok(result.err);
    assert.equal(result.data, null);
    assert.equal(calls.filter(call => call.sql.includes('INSERT INTO')).length, 1);
});
