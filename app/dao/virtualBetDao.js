let pomelo = require('pomelo');
let dao = module.exports;
let mysql = pomelo.app.get('sqlHelper');

const ALLOWED_OTHER_TYPES = ['h', 'zd', 'xd', 'l', 'k', 'm', 'q'];
const ALLOWED_SIDE_MODES = ['random', 'z', 'x'];

function normalizeSideMode(value) {
    const raw = String(value === undefined || value === null ? 'random' : value)
        .trim()
        .toLowerCase();
    const aliases = {
        random: 'random',
        '随机': 'random',
        z: 'z',
        '庄': 'z',
        x: 'x',
        '闲': 'x'
    };
    const mode = aliases[raw];
    if (!mode || !ALLOWED_SIDE_MODES.includes(mode)) {
        throw new Error('庄闲下注方向只能设置为随机、庄或闲');
    }
    return mode;
}

function normalizeOtherTypes(value) {
    const values = Array.isArray(value)
        ? value
        : String(value || '').split(',');

    return Array.from(new Set(values
        .map(item => String(item).trim().toLowerCase())
        .filter(item => ALLOWED_OTHER_TYPES.includes(item))));
}

function toInteger(value, fieldName, minimum) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < minimum) {
        throw new Error(`${fieldName}必须是不小于${minimum}的数字`);
    }
    return Math.floor(number);
}

async function resolveVirtualMember(msg) {
    const groupNickname = String(msg.group_nickname || '').trim();
    if (!groupNickname) throw new Error('必须提供群昵称');

    let where = '';
    let args = [groupNickname];

    if (msg.player_name) {
        where = 'gm.playername = ?';
        args.push(String(msg.player_name).trim());
    } else {
        throw new Error('必须提供机器人userId或player_name');
    }

    const rows = await mysql.query('bjl', `
        SELECT gm.userId, gm.playername
        FROM group_member gm
        INNER JOIN user u ON u.Id = gm.userId
        WHERE gm.group_nickname = ?
          AND ${where}
          AND gm.is_virtual = 1
          AND u.is_virtual = 1
        LIMIT 1
    `, args);

    console.log("where:", where);
    
    if (!rows || rows.length === 0) {
        throw new Error('该玩家不是当前群的虚拟机器人');
    }
    return rows[0];
}

dao.getBotConfigList = async function(msg) {
    try {
        const groupNickname = String(msg.group_nickname || '').trim();
        if (!groupNickname) return { err: '必须提供群昵称', data: null };

        const rows = await mysql.query('bjl', `
            SELECT
                gm.userId,
                gm.playername AS player_name,
                CASE WHEN config.Id IS NULL THEN 0 ELSE 1 END AS configured,
                IFNULL(config.enabled, 0) AS enabled,
                IFNULL(config.start_delay_seconds, 0) AS start_delay_seconds,
                IFNULL(config.all_in_below_score, 0) AS all_in_below_score,
                IFNULL(config.zx_min, 50) AS zx_min,
                IFNULL(config.zx_max, 1000) AS zx_max,
                IFNULL(config.other_min, 20) AS other_min,
                IFNULL(config.other_max, 150) AS other_max,
                IFNULL(config.other_types, '') AS other_types,
                IFNULL(config.other_probability, 15) AS other_probability,
                IFNULL(config.bet_side_mode, 'random') AS bet_side_mode
            FROM group_member gm
            INNER JOIN user u
                ON u.Id = gm.userId AND u.is_virtual = 1
            LEFT JOIN virtual_bet_bot_config config
                ON config.group_nickname = gm.group_nickname
               AND config.userId = gm.userId
            WHERE gm.group_nickname = ?
              AND gm.is_virtual = 1
            ORDER BY gm.playername ASC
        `, [groupNickname]);

        return { err: null, data: rows || [] };
    } catch (err) {
        console.error('getBotConfigList error:', err);
        return { err: err, data: null };
    }
};

dao.getEnabledBots = async function(msg) {
    try {
        const groupNickname = String(msg.group_nickname || '').trim();
        if (!groupNickname) return { err: '必须提供群昵称', data: null };

        const rows = await mysql.query('bjl', `
            SELECT
                config.userId,
                gm.playername,
                config.start_delay_seconds,
                config.all_in_below_score,
                config.zx_min,
                config.zx_max,
                config.other_enabled,
                config.other_min,
                config.other_max,
                config.other_probability,
                config.other_types,
                config.bet_side_mode,
                COALESCE(u.score, 0) AS score,
                config.updated_at
            FROM virtual_bet_bot_config config
            INNER JOIN group_member gm
                ON gm.group_nickname = config.group_nickname
               AND gm.userId = config.userId
               AND gm.is_virtual = 1
            INNER JOIN user u
                ON u.Id = config.userId
               AND u.is_virtual = 1
            WHERE config.group_nickname = ?
              AND config.enabled = 1
            ORDER BY config.Id ASC
        `, [groupNickname]);

        return { err: null, data: rows || [] };
    } catch (err) {
        console.error('getEnabledBots error:', err);
        return { err: err, data: null };
    }
};

dao.saveBotConfig = async function(msg) {
    //try {
        const member = await resolveVirtualMember(msg);
        const groupNickname = String(msg.group_nickname).trim();
        const enabled = Number(msg.enabled) === 1 ? 1 : 0;
        // 新接口以秒为单位；暂时兼容旧字段名，但数值同样按秒解释。
        const rawStartDelaySeconds = msg.start_delay_seconds !== undefined
            ? msg.start_delay_seconds
            : (msg.start_delay_minutes !== undefined ? msg.start_delay_minutes : 0);
        const startDelaySeconds = toInteger(rawStartDelaySeconds, '开始押分延迟秒数', 0);
        // 0 表示关闭低分梭哈。兼容旧调用方：未传该字段时，更新已有配置不覆盖原值。
        const hasAllInBelowScore =
            msg.all_in_below_score !== undefined &&
            msg.all_in_below_score !== null &&
            msg.all_in_below_score !== '';
        const allInBelowScore = hasAllInBelowScore
            ? toInteger(msg.all_in_below_score, '低于此分数自动梭哈', 0)
            : 0;
        const zxMin = toInteger(msg.zx_min, '庄闲下注下限', 1);
        const zxMax = toInteger(msg.zx_max, '庄闲下注上限', 1);
        const otherTypes = normalizeOtherTypes(msg.other_types);
        // 空数组表示关闭其它玩法；选择至少一种玩法时自动启用。
        const otherEnabled = otherTypes.length > 0 ? 1 : 0;
        const otherMin = toInteger(msg.other_min, '其它下注下限', 1);
        const otherMax = toInteger(msg.other_max, '其它下注上限', 1);
        const otherProbability = Number(msg.other_probability);
        const sideMode = normalizeSideMode(msg.bet_side_mode);
        const operator = String(msg.userName || msg.operator || '').trim();

        console.log("otherTypes:",otherTypes)

        if (zxMin > zxMax) throw new Error('庄闲下注下限不能大于上限');
        if (otherMin > otherMax) throw new Error('其它下注下限不能大于上限');
        if (!Number.isFinite(otherProbability) || otherProbability < 0 || otherProbability > 100) {
            throw new Error('其它下注概率必须在0至100之间');
        }
        const sql = `
            INSERT INTO virtual_bet_bot_config (
                group_nickname, userId, enabled,
                start_delay_seconds,
                all_in_below_score,
                zx_min, zx_max,
                other_enabled, other_min, other_max,
                other_probability, other_types,
                bet_side_mode,
                created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                enabled = VALUES(enabled),
                start_delay_seconds = VALUES(start_delay_seconds),
                all_in_below_score = IF(? = 1, VALUES(all_in_below_score), all_in_below_score),
                zx_min = VALUES(zx_min),
                zx_max = VALUES(zx_max),
                other_enabled = VALUES(other_enabled),
                other_min = VALUES(other_min),
                other_max = VALUES(other_max),
                other_probability = VALUES(other_probability),
                other_types = VALUES(other_types),
                bet_side_mode = VALUES(bet_side_mode),
                updated_by = VALUES(updated_by),
                updated_at = CURRENT_TIMESTAMP
        `;
        const args = [
            groupNickname, member.userId, enabled,
            startDelaySeconds,
            allInBelowScore,
            zxMin, zxMax,
            otherEnabled, otherMin, otherMax,
            otherProbability, otherTypes.join(','),
            sideMode,
            operator, operator,
            hasAllInBelowScore ? 1 : 0
        ];
        const result = await mysql.query('bjl', sql, args);

        return {
            err: null,
            data: {
                affectedRows: result.affectedRows,
                group_nickname: groupNickname,
                userId: member.userId,
                player_name: member.playername,
                start_delay_seconds: startDelaySeconds,
                all_in_below_score: hasAllInBelowScore ? allInBelowScore : null,
                other_enabled: otherEnabled,
                other_types: otherTypes,
                bet_side_mode: sideMode
            }
        };
    // } catch (err) {
    //     console.error('saveBotConfig error:', JSON.stringify(err));
    //     return { err: err.message || err, data: null };
    // }
};

dao.setBotEnabled = async function(msg) {
    try {
        const member = await resolveVirtualMember(msg);
        const groupNickname = String(msg.group_nickname).trim();
        const enabled = Number(msg.enabled) === 1 ? 1 : 0;
        const operator = String(msg.userName || msg.operator || '').trim();
        const result = await mysql.query('bjl', `
            INSERT INTO virtual_bet_bot_config (
                group_nickname, userId, enabled, created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                enabled = VALUES(enabled),
                updated_by = VALUES(updated_by),
                updated_at = CURRENT_TIMESTAMP
        `, [groupNickname, member.userId, enabled, operator, operator]);

        return {
            err: null,
            data: {
                affectedRows: result.affectedRows,
                group_nickname: groupNickname,
                userId: member.userId,
                player_name: member.playername,
                enabled: enabled
            }
        };
    } catch (err) {
        console.error('setBotEnabled error:', err);
        return { err: err.message || err, data: null };
    }
};
