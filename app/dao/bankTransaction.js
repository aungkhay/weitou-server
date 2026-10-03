// 银行流水的事务工具。金额用整数分运算，SQL 参数仍为 DECIMAL 字符串。
function cents(value, positive = false) {
    const text = String(value === null || value === undefined ? '' : value).trim();
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('金额必须是最多两位小数的有效数字');
    const negative = text.startsWith('-');
    const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
    const result = (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * (negative ? -1n : 1n);
    if (result > 9999999999n || result < -9999999999n || (positive && result <= 0n)) {
        throw new Error('金额必须大于0且不超过99999999.99');
    }
    return result;
}

function decimal(value) {
    const magnitude = value < 0n ? -value : value;
    return `${value < 0n ? '-' : ''}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, '0')}`;
}

async function transaction(mysql, work) {
    const connection = await new Promise((resolve, reject) => {
        mysql.beginTransaction((err, conn) => err ? reject(err) : resolve(conn));
    });
    const query = (sql, args = []) => new Promise((resolve, reject) => {
        connection.query(sql, args, (err, result) => err ? reject(err) : resolve(result));
    });
    try {
        await new Promise((resolve, reject) => connection.beginTransaction(err => err ? reject(err) : resolve()));
        const data = await work(query);
        await new Promise((resolve, reject) => connection.commit(err => err ? reject(err) : resolve()));
        return data;
    } catch (err) {
        await new Promise(resolve => connection.rollback(() => resolve()));
        throw err;
    } finally {
        connection.release();
    }
}

async function lockCards(query, names) {
    // 先解析唯一 Id，再按 Id 顺序逐张加锁；避免 A->B 与 B->A 的反向锁顺序。
    const aliases = new Map();
    for (const name of new Set(names)) {
        if (typeof name !== 'string' || !name.trim()) throw new Error('必须指定银行卡');
        const rows = await query('SELECT Id FROM bank_list WHERE card_name = ?', [name]);
        if (rows.length !== 1) throw new Error(`银行卡不存在：${name}`);
        aliases.set(name, Number(rows[0].Id));
    }
    const cards = new Map();
    for (const id of [...new Set(aliases.values())].sort((a, b) => a - b)) {
        const rows = await query('SELECT * FROM bank_list WHERE Id = ? FOR UPDATE', [id]);
        if (rows.length !== 1) throw new Error('银行卡已不存在');
        cards.set(id, rows[0]);
    }
    return new Map([...aliases].map(([name, id]) => [name, cards.get(id)]));
}

module.exports = { cents, decimal, transaction, lockCards };
