const crypto = require('crypto');
const { cents, decimal, transaction, lockCards } = require('./bankTransaction');

function id(value) {
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result <= 0) throw new Error('必须指定有效的转账登记id');
    return result;
}

function day(value) {
    const result = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result) ||
        !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) {
        throw new Error('营业日无效');
    }
    return result;
}

function payload(msg) {
    const source = String(msg.transfer_out_card_name || '').trim();
    const target = String(msg.transfer_in_card_name || '').trim();
    if (!source || !target) throw new Error('必须指定转出卡和转入卡');
    if (source === target) throw new Error('同一张银行卡不能互相转账');
    return { source, target, amount: cents(msg.amount, true), date: day(msg.statistics_date) };
}

async function activeTransfer(query, transferId) {
    const rows = await query('SELECT * FROM card_transfer_registration WHERE Id = ? FOR UPDATE', [id(transferId)]);
    if (!rows.length) throw new Error('转账登记记录不存在');
    const record = rows[0];
    if (Number(record.is_revoke)) return { record, logs: [] };
    if (!record.transfer_id) throw new Error('该历史转账没有关联号，无法安全修改或撤销');
    const logs = await query(`SELECT * FROM bank_card_transaction_details
        WHERE transfer_id = ? AND revoke_of_id IS NULL AND is_revoke = 0 ORDER BY Id FOR UPDATE`, [record.transfer_id]);
    const out = logs.find(row => row.option_type === '转出');
    const into = logs.find(row => row.option_type === '转入');
    if (logs.length !== 2 || !out || !into ||
        cents(out.option_amount, true) !== cents(record.option_amount, true) ||
        cents(into.option_amount, true) !== cents(record.option_amount, true) ||
        out.card_name !== record.transfer_out_card_name || into.card_name !== record.transfer_in_card_name) {
        throw new Error('转账流水与登记不一致，请先核对历史记录');
    }
    return { record, logs };
}

async function leg(query, card, type, amount, date, transferId, revokeOf = null) {
    const counter = type === '转出' ? 'transfer_out_amount' : 'transfer_in_amount';
    const total = cents(card[counter] || 0) + amount;
    if (total < 0n) throw new Error('累计转入或转出金额异常，不能冲销');
    const before = cents(card.remaining_amount);
    const after = before + (type === '转出' ? -amount : amount);
    // 验证字段范围；负余额合法。
    cents(decimal(after));
    cents(decimal(total));
    await query(`INSERT INTO bank_card_transaction_details
        (card_type,card_name,card_code,option_amount,before_option_amount,desk_number,
         optioner,option_type,statistics_date,transfer_id,revoke_of_id)
        VALUES (?,?,?,?,?,'','大红',?,?,?,?)`,
    [card.card_type, card.card_name, card.card_code, decimal(amount), decimal(before), type, date, transferId, revokeOf]);
    await query(`UPDATE bank_list SET ${counter} = ?, remaining_amount = ? WHERE Id = ?`,
        [decimal(total), decimal(after), card.Id]);
    card[counter] = decimal(total);
    card.remaining_amount = decimal(after);
}

async function reverse(query, record, logs, cards, date) {
    for (const log of logs) {
        await leg(query, cards.get(log.card_name), log.option_type, -cents(log.option_amount, true),
            date, record.transfer_id, log.Id);
    }
    await query(`UPDATE bank_card_transaction_details SET is_revoke = 1
        WHERE transfer_id = ? AND revoke_of_id IS NULL AND is_revoke = 0`, [record.transfer_id]);
}

async function apply(query, recordId, transferId, details, cards) {
    const out = cards.get(details.source);
    const into = cards.get(details.target);
    if (Number(out.Id) === Number(into.Id)) throw new Error('同一张银行卡不能互相转账');
    const beforeOut = out.remaining_amount;
    const beforeIn = into.remaining_amount;
    await leg(query, out, '转出', details.amount, details.date, transferId);
    await leg(query, into, '转入', details.amount, details.date, transferId);
    await query(`UPDATE card_transfer_registration SET optioner = '大红',
        transfer_out_card_name = ?, transfer_out_card_type = ?, option_amount = ?,
        before_transfer_out_amount = ?, transfer_out_card_current_amount = ?,
        transfer_in_card_name = ?, transfer_in_card_type = ?, transfer_in_amount = ?,
        transfer_in_card_current_amount = ?, working_day = ? WHERE Id = ?`,
    [out.card_name, out.card_type, decimal(details.amount), beforeOut, out.remaining_amount,
        into.card_name, into.card_type, beforeIn, into.remaining_amount, details.date, recordId]);
    return { id: recordId, transfer_id: transferId, amount: Number(decimal(details.amount)),
        transfer_out_card_name: out.card_name, transfer_in_card_name: into.card_name };
}

module.exports = function createBankTransferService(mysql) {
    return {
        async create(msg) {
            const details = payload(msg);
            const requestId = msg.request_id === undefined ? '' : String(msg.request_id).trim();
            if (msg.request_id !== undefined && (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId))) {
                throw new Error('request_id 必须是8至100位字母、数字、下划线或短横线');
            }
            // 沿用现有 transfer_id 唯一键，不需要新增数据库字段。
            const transferId = requestId
                ? 'BT' + crypto.createHash('sha256').update(JSON.stringify([String(msg.userId || ''), requestId])).digest('hex').slice(0, 60)
                : 'BT' + crypto.randomBytes(24).toString('hex');
            try {
                return await transaction(mysql, async query => {
                    // 唯一登记先占位，同一请求并发时由数据库唯一键串行判定。
                    const inserted = await query(`INSERT INTO card_transfer_registration
                        (optioner,transfer_out_card_name,transfer_in_card_name,option_amount,working_day,transfer_id)
                        VALUES ('大红',?,?,?,?,?)`,
                    [details.source, details.target, decimal(details.amount), details.date, transferId]);
                    const cards = await lockCards(query, [details.source, details.target]);
                    return apply(query, inserted.insertId, transferId, details, cards);
                });
            } catch (err) {
                if (!requestId || err.code !== 'ER_DUP_ENTRY') throw err;
                const rows = await mysql.query('bjl', `SELECT * FROM card_transfer_registration
                    WHERE transfer_id = ? AND transfer_out_card_name = ? AND transfer_in_card_name = ? AND option_amount = ?`,
                [transferId, details.source, details.target, decimal(details.amount)]);
                const previous = rows && rows[0];
                if (!previous) {
                    throw new Error('该request_id已用于其他转账内容，不能重复使用');
                }
                return { id: previous.Id, transfer_id: transferId, duplicate: true,
                    is_revoke: Number(previous.is_revoke), amount: Number(decimal(details.amount)) };
            }
        },
        async edit(msg) {
            const details = payload(msg);
            return transaction(mysql, async query => {
                const { record, logs } = await activeTransfer(query, msg.id || msg.Id);
                if (Number(record.is_revoke)) throw new Error('该笔转账已撤销，不能修改');
                const cards = await lockCards(query, [record.transfer_out_card_name, record.transfer_in_card_name,
                    details.source, details.target]);
                if (cards.get(details.source).Id === cards.get(details.target).Id) throw new Error('同一张银行卡不能互相转账');
                await reverse(query, record, logs, cards, details.date);
                return apply(query, record.Id, record.transfer_id, details, cards);
            });
        },
        async revoke(msg) {
            const date = day(msg.statistics_date);
            return transaction(mysql, async query => {
                const { record, logs } = await activeTransfer(query, msg.id || msg.Id);
                if (Number(record.is_revoke)) return { id: record.Id, transfer_id: record.transfer_id, already_revoked: true };
                const cards = await lockCards(query, [record.transfer_out_card_name, record.transfer_in_card_name]);
                await reverse(query, record, logs, cards, date);
                await query('UPDATE card_transfer_registration SET is_revoke = 1 WHERE Id = ?', [record.Id]);
                return { id: record.Id, transfer_id: record.transfer_id, amount: Number(record.option_amount),
                    transfer_out_card_name: record.transfer_out_card_name, transfer_in_card_name: record.transfer_in_card_name };
            });
        }
    };
};
