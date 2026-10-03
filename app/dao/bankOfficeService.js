const { cents, decimal, transaction, lockCards } = require('./bankTransaction');

function details(msg) {
    const amount = cents(msg.amount, true);
    if (!msg.card_name || !String(msg.project_name || '').trim()) throw new Error('必须指定银行卡和费用项目');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(msg.statistics_date || ''))) throw new Error('营业日无效');
    return { amount, income: String(msg.project_name).trim() === '其它收入' };
}

async function entry(query, card, amount, income, reverse, date, link, originalId = null, initial = false) {
    const direction = reverse ? -1n : 1n;
    const balance = cents(card.remaining_amount) + (income ? amount : -amount) * direction;
    const office = cents(card.office_amount || 0) + (income ? 0n : amount * direction);
    if (office < 0n) throw new Error('累计办公金额异常，不能冲销');
    cents(decimal(balance));
    cents(decimal(office));
    await query(`INSERT INTO bank_card_transaction_details
        (card_type,card_name,card_code,option_amount,before_option_amount,desk_number,
         optioner,option_type,statistics_date,transfer_id,revoke_of_id)
        VALUES (?,?,?,?,?,'','大红','办公费用',?,?,?)`,
    [card.card_type, card.card_name, card.card_code, decimal((income ? -amount : amount) * direction),
        card.remaining_amount, date, link, originalId]);
    await query(`UPDATE bank_list SET remaining_amount = ?, office_amount = ?${initial ? ', initial_amount = 0' : ''} WHERE Id = ?`,
        [decimal(balance), decimal(office), card.Id]);
    card.remaining_amount = decimal(balance);
    card.office_amount = decimal(office);
}

async function restore(query, record, card, date) {
    const link = `OE${record.Id}`;
    const logs = await query(`SELECT * FROM bank_card_transaction_details
        WHERE transfer_id = ? AND revoke_of_id IS NULL AND is_revoke = 0 ORDER BY Id FOR UPDATE`, [link]);
    // 旧办公登记没有关联号，不猜测绑定旧流水；仍在登记行锁下按原登记金额冲销。
    if (logs.length > 1) throw new Error('办公费用关联流水异常');
    const amount = cents(record.option_money, true);
    const income = String(record.project_name || '').trim() === '其它收入';
    if (logs.length && (logs[0].card_name !== record.card_name ||
        cents(logs[0].option_amount) !== (income ? -amount : amount))) throw new Error('办公费用流水与登记不一致');
    await entry(query, card, amount, income, true, date, link, logs.length ? logs[0].Id : null);
    // 旧数据冲销无 revoke_of_id，明确只标记读取到的原记录及刚写入的旧冲销，避免当作新的有效流水。
    await query(`UPDATE bank_card_transaction_details SET is_revoke = 1
        WHERE transfer_id = ? AND revoke_of_id IS NULL AND is_revoke = 0`, [link]);
}

module.exports = function createBankOfficeService(mysql) {
    async function change(msg, editing) {
        const data = details(msg);
        return transaction(mysql, async query => {
            let previous;
            if (editing) {
                if (!Number.isSafeInteger(Number(msg.id)) || Number(msg.id) <= 0) throw new Error('办公费用编号无效');
                const rows = await query('SELECT * FROM office_expense_registration WHERE Id = ? FOR UPDATE', [msg.id]);
                if (!rows.length) throw new Error('查无办公费用记录');
                previous = rows[0];
            }
            const cards = await lockCards(query, previous ? [previous.card_name, msg.card_name] : [msg.card_name]);
            if (previous) await restore(query, previous, cards.get(previous.card_name), msg.statistics_date);
            const card = cards.get(msg.card_name);
            const before = card.remaining_amount;
            const after = decimal(cents(before) + (data.income ? data.amount : -data.amount));
            const values = [msg.project_name, decimal(data.amount), decimal(data.amount), msg.optioner || '',
                '大红', card.card_name, card.card_type, before, after, msg.remark || ''];
            let recordId;
            if (previous) {
                recordId = previous.Id;
                await query(`UPDATE office_expense_registration SET project_name = ?, money = ?, option_money = ?,
                    handler = ?, optioner = ?, card_name = ?, card_type = ?, befor_opton_money = ?,
                    left_money = ?, remark = ? WHERE Id = ?`, values.concat(recordId));
            } else {
                const result = await query(`INSERT INTO office_expense_registration
                    (project_name,money,option_money,handler,optioner,card_name,card_type,befor_opton_money,left_money,remark)
                    VALUES (?,?,?,?,?,?,?,?,?,?)`, values);
                recordId = result.insertId;
            }
            await entry(query, card, data.amount, data.income, false, msg.statistics_date, `OE${recordId}`, null,
                msg.is_initial_card === true || msg.is_initial_card === 1 || msg.is_initial_card === '1');
            return { id: recordId };
        });
    }
    return {
        add: msg => change(msg, false),
        edit: msg => change(msg, true),
        async remove(msg) {
            if (!Number.isSafeInteger(Number(msg.id)) || Number(msg.id) <= 0) throw new Error('办公费用编号无效');
            return transaction(mysql, async query => {
                const rows = await query('SELECT * FROM office_expense_registration WHERE Id = ? FOR UPDATE', [msg.id]);
                if (!rows.length) return { id: Number(msg.id), already_deleted: true };
                const record = rows[0];
                const cards = await lockCards(query, [record.card_name]);
                await restore(query, record, cards.get(record.card_name), msg.statistics_date);
                await query('DELETE FROM office_expense_registration WHERE Id = ?', [record.Id]);
                return { id: record.Id };
            });
        }
    };
};
