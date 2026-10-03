const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const createTransfers = require('../dao/bankTransferService');
const createOffice = require('../dao/bankOfficeService');

// 仅在明确开启时访问专用本地实例；不读取项目里的线上连接配置。
test('银行卡事务集成验证', { skip: process.env.BANK_LEDGER_TEST !== '1' }, async t => {
    const driver = require('mysql2');
    const options = { host: '127.0.0.1', port: 33379, user: 'root', password: '',
        dateStrings: true, decimalNumbers: true, connectionLimit: 12 };
    const admin = driver.createConnection(options);
    const adminQuery = sql => new Promise((resolve, reject) => admin.query(sql, (e, r) => e ? reject(e) : resolve(r)));
    await adminQuery('CREATE DATABASE IF NOT EXISTS bank_ledger_regression CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
    await new Promise(resolve => admin.end(resolve));
    const pool = driver.createPool({ ...options, database: 'bank_ledger_regression' });
    const query = (sql, args = []) => new Promise((resolve, reject) => pool.query(sql, args, (err, rows) => err ? reject(err) : resolve(rows)));
    const helper = { beginTransaction: cb => pool.getConnection(cb), query: (db, sql, args) => query(sql, args) };
    const transfers = createTransfers(helper);
    const office = createOffice(helper);
    const date = '2026-09-04';
    const transfer = (extra = {}) => ({ transfer_out_card_name: 'A', transfer_in_card_name: 'B', amount: 150,
        statistics_date: date, userId: 10, ...extra });
    async function reset() {
        for (const table of ['bank_card_transaction_details', 'card_transfer_registration', 'office_expense_registration', 'bank_list']) {
            await query(`DELETE FROM ${table}`);
        }
        await query(`INSERT INTO bank_list (card_name,card_code,remaining_amount,initial_amount)
            VALUES ('A','a',100,100),('B','b',0,0),('C','c',0,0)`);
    }
    async function balance(name) { return (await query('SELECT * FROM bank_list WHERE card_name = ?', [name]))[0]; }
    try {
        for (const sql of fs.readFileSync(path.join(__dirname, 'fixtures/bank-ledger.sql'), 'utf8').split(';').filter(s => s.trim())) await query(sql);

        await t.test('允许透支，重复请求不重复入账，修改后可撤销且前余额准确', async () => {
            await reset();
            const original = await transfers.create(transfer({ request_id: 'negative-001' }));
            assert.equal((await balance('A')).remaining_amount, -50);
            const repeat = await transfers.create(transfer({ request_id: 'negative-001' }));
            assert.equal(repeat.duplicate, true);
            assert.equal((await query('SELECT * FROM card_transfer_registration')).length, 1);
            await assert.rejects(() => transfers.create(transfer({ request_id: 'negative-001', amount: 999 })), /request_id/);
            await transfers.edit(transfer({ id: original.id, amount: 200 }));
            assert.equal((await balance('A')).remaining_amount, -100);
            assert.equal((await balance('B')).remaining_amount, 200);
            const rows = await query('SELECT * FROM bank_card_transaction_details ORDER BY Id');
            assert.deepEqual(rows.map(r => r.option_amount), [150, 150, -150, -150, 200, 200]);
            assert.deepEqual(rows.map(r => r.before_option_amount), [100, 0, -50, 150, 100, 0]);
            assert.equal(rows.filter(r => !r.is_revoke && r.revoke_of_id === null).length, 2);
            assert.ok(rows.every(r => r.optioner === '大红'));
            // 模拟其他支出已用掉转入金额；撤销必须允许转入卡为负数。
            await query("UPDATE bank_list SET remaining_amount = remaining_amount - 300 WHERE card_name = 'B'");
            await transfers.revoke({ id: original.id, statistics_date: date });
            assert.equal((await balance('A')).remaining_amount, 100);
            assert.equal((await balance('B')).remaining_amount, -300);
            assert.equal((await balance('A')).transfer_out_amount, 0);
            assert.equal((await balance('B')).transfer_in_amount, 0);
            assert.equal((await transfers.revoke({ id: original.id, statistics_date: date })).already_revoked, true);
            assert.equal((await query('SELECT * FROM bank_card_transaction_details')).length, 8);
        });

        await t.test('同一幂等编号并发只生成一次转账', async () => {
            await reset();
            const results = await Promise.all(Array.from({ length: 8 }, () => transfers.create(transfer({ request_id: 'concurrent-001' }))));
            assert.equal(results.filter(r => !r.duplicate).length, 1);
            assert.equal((await balance('A')).remaining_amount, -50);
            assert.equal((await query('SELECT * FROM bank_card_transaction_details')).length, 2);
        });

        await t.test('同卡多笔并发保持流水前余额链，金额精确到分', async () => {
            await reset();
            await Promise.all(Array.from({ length: 20 }, (_, i) => transfers.create(transfer({ amount: '1.23', request_id: `parallel-${i}` }))));
            assert.equal((await balance('A')).remaining_amount, 75.4);
            assert.equal((await balance('B')).remaining_amount, 24.6);
            const rows = await query("SELECT * FROM bank_card_transaction_details WHERE card_name = 'A' ORDER BY Id");
            rows.forEach((r, i) => assert.equal(Math.round(r.before_option_amount * 100), 10000 - i * 123));
        });

        await t.test('并发修改与撤销不重复冲销', async () => {
            await reset();
            const original = await transfers.create(transfer());
            await Promise.all([
                transfers.edit(transfer({ id: original.id, amount: 220 })),
                transfers.edit(transfer({ id: original.id, amount: 330, transfer_in_card_name: 'C' }))
            ]);
            const record = (await query('SELECT * FROM card_transfer_registration WHERE Id = ?', [original.id]))[0];
            assert.equal((await balance('A')).remaining_amount, 100 - record.option_amount);
            assert.equal((await balance('B')).remaining_amount + (await balance('C')).remaining_amount, record.option_amount);
            const results = await Promise.allSettled([
                transfers.edit(transfer({ id: original.id, amount: 444 })),
                transfers.revoke({ id: original.id, statistics_date: date })
            ]);
            assert.equal(results[1].status, 'fulfilled');
            assert.equal((await balance('A')).remaining_amount, 100);
            assert.equal((await balance('B')).remaining_amount, 0);
            assert.equal((await balance('C')).remaining_amount, 0);
        });

        await t.test('第二条流水失败时，登记、余额和第一条流水全部回滚', async () => {
            await reset();
            const broken = createTransfers({ ...helper, beginTransaction: cb => pool.getConnection((err, conn) => {
                if (err) return cb(err);
                let entries = 0;
                const original = conn.query.bind(conn);
                const originalRelease = conn.release.bind(conn);
                conn.query = (sql, args, done) => {
                    if (/INSERT INTO bank_card_transaction_details/.test(sql) && ++entries === 2) return done(new Error('injected failure'));
                    original(sql, args, done);
                };
                conn.release = () => { conn.query = original; conn.release = originalRelease; originalRelease(); };
                cb(null, conn);
            }) });
            await assert.rejects(() => broken.create(transfer()), /injected failure/);
            assert.equal((await balance('A')).remaining_amount, 100);
            assert.equal((await balance('B')).remaining_amount, 0);
            assert.equal((await query('SELECT * FROM bank_card_transaction_details')).length, 0);
            assert.equal((await query('SELECT * FROM card_transfer_registration')).length, 0);
        });

        await t.test('同卡别名、无效小数、缺少关联的历史转账均拒绝写入', async () => {
            await reset();
            await assert.rejects(() => transfers.create(transfer({ transfer_in_card_name: 'a' })), /同一张/);
            await assert.rejects(() => transfers.create(transfer({ amount: 0.001 })), /两位小数/);
            const legacy = await query(`INSERT INTO card_transfer_registration
                (transfer_out_card_name,transfer_in_card_name,option_amount) VALUES ('A','B',100)`);
            await assert.rejects(() => transfers.edit(transfer({ id: legacy.insertId })), /没有关联号/);
            assert.equal((await balance('A')).remaining_amount, 100);
            assert.equal((await query('SELECT * FROM bank_card_transaction_details')).length, 0);
        });

        await t.test('办公支出改金额、换卡、删除允许负余额，记录前余额准确', async () => {
            await reset();
            const base = { card_name: 'A', project_name: '房租', amount: 150, statistics_date: date };
            const record = await office.add(base);
            await office.edit({ ...base, id: record.id, card_name: 'B', amount: 200 });
            assert.equal((await balance('A')).remaining_amount, 100);
            assert.equal((await balance('B')).remaining_amount, -200);
            const logs = await query('SELECT * FROM bank_card_transaction_details ORDER BY Id');
            assert.deepEqual(logs.map(r => r.before_option_amount), [100, -50, 0]);
            assert.deepEqual(logs.map(r => r.option_amount), [150, -150, 200]);
            await Promise.all([office.remove({ id: record.id, statistics_date: date }), office.remove({ id: record.id, statistics_date: date })]);
            assert.equal((await balance('B')).remaining_amount, 0);
            assert.equal((await query('SELECT * FROM bank_card_transaction_details')).length, 4);
        });

        await t.test('其它收入已花掉后仍可修改和撤销，旧办公登记兼容', async () => {
            await reset();
            const base = { card_name: 'B', project_name: '其它收入', amount: 100, statistics_date: date };
            const record = await office.add(base);
            await query("UPDATE bank_list SET remaining_amount = -50 WHERE card_name = 'B'");
            await office.edit({ ...base, amount: 30, id: record.id });
            assert.equal((await balance('B')).remaining_amount, -120);
            await office.remove({ id: record.id, statistics_date: date });
            assert.equal((await balance('B')).remaining_amount, -150);
            const old = await query(`INSERT INTO office_expense_registration (project_name,option_money,card_name)
                VALUES ('其它收入',10,'A')`);
            await office.edit({ ...base, card_name: 'A', amount: 20, id: old.insertId });
            await office.remove({ id: old.insertId, statistics_date: date });
            assert.equal((await balance('A')).remaining_amount, 90);
        });

        await t.test('银行卡改名拦截、原余额公式保留、流水排序及净变化统计', async () => {
            await reset();
            const daoPath = path.join(__dirname, '../dao/bankBussionessDao.js');
            const localRequire = createRequire(daoPath);
            const context = { module: { exports: {} }, require: name => name === 'pomelo' ? { app: { get: () => helper } } : localRequire(name), console };
            vm.runInNewContext(fs.readFileSync(daoPath, 'utf8'), context);
            const dao = context.module.exports;
            const a = await balance('A');
            const edit = { id: a.Id, card_name: 'A', card_type: '测试卡', card_code: 'a', initial_amount: 100,
                initial_office_amount: 0, bonus_amount: 20, deduction_amount: 5, transfer_in_amount: 99,
                transfer_out_amount: 30, office_amount: 0, card_status: '正常' };
            assert.ok((await dao.editBankCard({ ...edit, card_name: '改名' })).err);
            assert.equal((await dao.editBankCard(edit)).err, null);
            assert.equal((await balance('A')).remaining_amount, 115); // 明确保留用户指定的旧公式。
            await reset();
            await transfers.create(transfer());
            const result = await dao.cardDetailsInquiry({ card_name: 'A', currentPage: 1, pageSize: 20 });
            assert.equal(result.data.summary.option_amount, 150);
            assert.equal(result.data.summary.net_change_amount, -150);
            const registered = await dao.getInterBanktransfer({ startTime: date, endTime: date });
            assert.equal(registered.data.count, 1);
            const ordered = await dao.cardDetailsInquiry({ currentPage: 1, pageSize: 1 });
            assert.equal(ordered.data.rows[0].option_type, '转入');
        });
    } finally {
        await new Promise(resolve => pool.end(resolve));
    }
});
