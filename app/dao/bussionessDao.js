let pomelo = require("pomelo");
let bussionessDao = module.exports;
let mysql = pomelo.app.get("sqlHelper");

// 按 userId 复制到目标群已有成员；一条 upsert 保证整批写入的原子性。
bussionessDao.copyGroupPersonalSetup = async function (msg = {}) {
    const source = typeof msg.source_desk === 'string' ? msg.source_desk.trim() : '';
    const target = typeof msg.target_desk === 'string' ? msg.target_desk.trim() : '';
    const scope = msg.scope || 'share';
    if (!source || !target || source.length > 50 || target.length > 50) {
        return { err: '请选择有效的源群和目标群', data: null };
    }
    if (source === target) return { err: '同群不能复制', data: null };
    if (scope !== 'share' && scope !== 'all') return { err: '无效的复制范围', data: null };

    try {
        const groups = await mysql.query('bjl', `
            SELECT group_nickname FROM group_chat_setup
            WHERE group_nickname IN (?, ?)
        `, [source, target]);
        // 也排除在数据库排序规则下等价的两个群名。
        if (!groups || groups.length !== 2) {
            return { err: '源群或目标群不存在，或两个群名实际相同', data: null };
        }

        const rows = await mysql.query('bjl', `
            SELECT COUNT(*) AS source_count,
                   COALESCE(SUM(EXISTS (
                       SELECT 1 FROM group_member gm
                       WHERE gm.group_nickname = ? AND gm.userId = src.userId
                   )), 0) AS eligible_count
            FROM finance_personal_setup src
            INNER JOIN user u ON u.Id = src.userId
            WHERE src.group_nickname = ?
        `, [target, source]);
        const sourceCount = Number(rows[0].source_count);
        const eligibleCount = Number(rows[0].eligible_count);
        if (!sourceCount) return { err: '源群没有可复制的个人设置', data: null };
        if (!eligibleCount) return { err: '目标群没有对应玩家，请先将玩家加入目标群', data: null };

        const fields = ['bp_personal_share', 'bp_personal_share_upperlimit', 'sb_personal_share'];
        if (scope === 'all') {
            fields.push('redemption_type', 'personal_points_redemption_ratio', 'redemption_start_time',
                'rebate_type', 'rebate_ratio', 'rebate_pair_start_time', 'start_exchange');
        }
        // 字段名只来自上面的固定白名单，群名全部使用占位符。
        const result = await mysql.query('bjl', `
            INSERT INTO finance_personal_setup (userId, playername, group_nickname, ${fields.join(', ')})
            SELECT src.userId, u.username, ?, ${fields.map(field => `src.${field}`).join(', ')}
            FROM finance_personal_setup src
            INNER JOIN user u ON u.Id = src.userId
            WHERE src.group_nickname = ?
              AND EXISTS (
                  SELECT 1 FROM group_member gm
                  WHERE gm.group_nickname = ? AND gm.userId = src.userId
              )
            ON DUPLICATE KEY UPDATE
                playername = VALUES(playername),
                ${fields.map(field => `${field} = VALUES(${field})`).join(',\n                ')}
        `, [target, source, target]);
        return { err: null, data: {
            scope, source_count: sourceCount, eligible_count: eligibleCount,
            skipped_count: sourceCount - eligibleCount, affected_rows: result.affectedRows
        } };
    } catch (err) {
        console.error('copyGroupPersonalSetup error:', err);
        return { err, data: null };
    }
};

bussionessDao.playerCopy = async function (msg) {
    let sql = `
        INSERT IGNORE INTO group_member (userId, group_nickname, playername)
        SELECT 
            userId,                    
            ? as group_nickname,
            playername                 
        FROM group_member
        WHERE FIND_IN_SET(playername, ?) > 0;
    `;

    let args = [msg.target_desk, msg.array_player_name.join(',')];
    try{
        res = await mysql.query("bjl", sql, args);
        return { err: null, data: res};
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return { err: err, data: null }
    }
};

bussionessDao.pointsEchangeRatio = async function (msg) {
  let sql = "select * from points_exchange_setup where group_nickname = ?";
  let args = [msg.group_nickname];
  try {
        let res = await mysql.query("bjl", sql, args);
        if(res.length > 0){
            sql = "update points_exchange_setup set points_reached = ?,points_exchange = ? where group_nickname = ?";
            args = [msg.points_reached,msg.points_exchange,msg.group_nickname];
        }else{
            sql = "insert into points_exchange_setup(points_reached,points_exchange,group_nickname) values(?,?,?)";
            args = [msg.points_reached,msg.points_exchange,msg.group_nickname];
        }
        res = await mysql.query("bjl", sql, args);
        return { err: null, data: res };
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return { err: err, data: null }
    }
};

bussionessDao.getPointsExchangeRatio = async function (msg) {
  let sql = "select * from points_exchange_setup where group_nickname = ?";
  let args = [msg.group_nickname];
  try {
        let res = await mysql.query("bjl", sql, args);
        res = await mysql.query("bjl", sql, args);
        return { err: null, data: res};
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return { err: err, data: null }
    }
};

bussionessDao.getPersionalEchangeRatio = async function (msg) {
    // ✅ 改用 userId 查询
    let sql = "SELECT * FROM finance_personal_setup WHERE group_nickname = ? AND userId = (SELECT Id FROM user WHERE username = ? LIMIT 1)";
    let args = [msg.group_nickname, msg.player_name];
    try {
        let res = await mysql.query("bjl", sql, args);
        return { err: null, data: res[0] };
    } catch (err) {
        console.log("err:", JSON.stringify(err));
        return { err: err, data: null };
    }
};

bussionessDao.persionalEchangeRatio = async function (msg) {
    try {
        if (!msg.player_name || msg.player_name === "") {
            return { err: "player_name 不能为空", data: null };
        }

        const now = new Date();

        // ✅ 先查出 userId，后续全部用 userId 操作
        const userRows = await mysql.query("bjl", "SELECT Id FROM user WHERE username = ? LIMIT 1", [msg.player_name]);
        if (!userRows || userRows.length === 0) {
            return { err: "用户不存在", data: null };
        }
        const userId = userRows[0].Id;

        async function getPlayerGroups(playername) {
            const rows = await mysql.query(
                "bjl",
                `SELECT DISTINCT gcs.group_nickname
                 FROM group_chat_setup gcs
                 INNER JOIN group_member gm ON gcs.group_nickname = gm.group_nickname
                 WHERE gm.playername = ?`,
                [playername]
            );
            return (rows || []).map(r => r.group_nickname).filter(Boolean);
        }

        const option = String(msg.option_type);

        // option_type = 1：保存所有参数，只更新指定 group_nickname + 指定 player_name
        if (option === "1") {
            if (!msg.group_nickname || msg.group_nickname === "") {
                return { err: "option_type=1 时必须提供 group_nickname", data: null };
            }

            const values = [[
                userId,                          // ✅ 直接用查到的 userId
                msg.player_name,
                msg.group_nickname,
                (typeof msg.bp_personal_share !== 'undefined') ? msg.bp_personal_share : null,
                (typeof msg.bp_personal_share_upperlimit !== 'undefined') ? msg.bp_personal_share_upperlimit : null,
                (typeof msg.sb_personal_share !== 'undefined') ? msg.sb_personal_share : null,
                (typeof msg.redemption_type !== 'undefined') ? msg.redemption_type : null,
                (typeof msg.personal_points_redemption_ratio !== 'undefined') ? msg.personal_points_redemption_ratio : null,
                msg.redemption_start_time || now,
                (typeof msg.rebate_type !== 'undefined') ? msg.rebate_type : null,
                (typeof msg.rebate_ratio !== 'undefined') ? msg.rebate_ratio : null,
                msg.rebate_pair_start_time || now,
                (typeof msg.start_exchange !== 'undefined') ? msg.start_exchange : null
            ]];

            const sql = `
                INSERT INTO finance_personal_setup (
                    userId, playername, group_nickname,
                    bp_personal_share, bp_personal_share_upperlimit, sb_personal_share,
                    redemption_type, personal_points_redemption_ratio, redemption_start_time,
                    rebate_type, rebate_ratio, rebate_pair_start_time, start_exchange
                ) VALUES ?
                ON DUPLICATE KEY UPDATE
                    userId = COALESCE(VALUES(userId), userId),
                    bp_personal_share = COALESCE(VALUES(bp_personal_share), bp_personal_share),
                    bp_personal_share_upperlimit = COALESCE(VALUES(bp_personal_share_upperlimit), bp_personal_share_upperlimit),
                    sb_personal_share = COALESCE(VALUES(sb_personal_share), sb_personal_share),
                    redemption_type = COALESCE(VALUES(redemption_type), redemption_type),
                    personal_points_redemption_ratio = COALESCE(VALUES(personal_points_redemption_ratio), personal_points_redemption_ratio),
                    redemption_start_time = COALESCE(VALUES(redemption_start_time), redemption_start_time),
                    rebate_type = COALESCE(VALUES(rebate_type), rebate_type),
                    rebate_ratio = COALESCE(VALUES(rebate_ratio), rebate_ratio),
                    rebate_pair_start_time = COALESCE(VALUES(rebate_pair_start_time), rebate_pair_start_time),
                    start_exchange = COALESCE(VALUES(start_exchange), start_exchange)
            `;
            const res = await mysql.query("bjl", sql, [values]);
            return { err: null, data: res };
        }

        // option_type = 2：只更新 bp_personal_share 相关，作用于所有群
        if (option === "2") {
            const targetGroups = await getPlayerGroups(msg.player_name);
            if (targetGroups.length === 0) {
                return { err: "该玩家在任何群中均未找到配置", data: null };
            }

            const results = [];
            for (const g of targetGroups) {
                // ✅ WHERE 改用 userId
                const updSql = `UPDATE finance_personal_setup
                                SET bp_personal_share = ?, bp_personal_share_upperlimit = ?, sb_personal_share = ?
                                WHERE userId = ? AND group_nickname = ?`;
                const updArgs = [
                    (typeof msg.bp_personal_share !== 'undefined') ? msg.bp_personal_share : null,
                    (typeof msg.bp_personal_share_upperlimit !== 'undefined') ? msg.bp_personal_share_upperlimit : null,
                    (typeof msg.sb_personal_share !== 'undefined') ? msg.sb_personal_share : null,
                    userId, g    // ✅ userId
                ];
                const updRes = await mysql.query("bjl", updSql, updArgs);
                if (!updRes || updRes.affectedRows === 0) {
                    const insSql = `
                        INSERT INTO finance_personal_setup (
                            userId, playername, group_nickname,
                            bp_personal_share, bp_personal_share_upperlimit, sb_personal_share,
                            redemption_type, personal_points_redemption_ratio, redemption_start_time,
                            rebate_type, rebate_ratio, rebate_pair_start_time, start_exchange
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;
                    const insArgs = [
                        userId,   // ✅ userId
                        msg.player_name, g,
                        (typeof msg.bp_personal_share !== 'undefined') ? msg.bp_personal_share : 0,
                        (typeof msg.bp_personal_share_upperlimit !== 'undefined') ? msg.bp_personal_share_upperlimit : 0,
                        (typeof msg.sb_personal_share !== 'undefined') ? msg.sb_personal_share : 0,
                        msg.redemption_type || '',
                        (typeof msg.personal_points_redemption_ratio !== 'undefined') ? msg.personal_points_redemption_ratio : 0,
                        msg.redemption_start_time || now,
                        msg.rebate_type || null,
                        (typeof msg.rebate_ratio !== 'undefined') ? msg.rebate_ratio : 0,
                        msg.rebate_pair_start_time || now,
                        (typeof msg.start_exchange !== 'undefined') ? msg.start_exchange : 0
                    ];
                    results.push(await mysql.query("bjl", insSql, insArgs));
                } else {
                    results.push(updRes);
                }
            }
            return { err: null, data: results };
        }

        // option_type = 3：只更新 redemption_type 相关，作用于所有群
        if (option === "3") {
            const targetGroups = await getPlayerGroups(msg.player_name);
            if (targetGroups.length === 0) {
                return { err: "该玩家在任何群中均未找到配置", data: null };
            }

            const results = [];
            for (const g of targetGroups) {
                // ✅ WHERE 改用 userId
                const updSql = `UPDATE finance_personal_setup
                                SET redemption_type = ?, personal_points_redemption_ratio = ?, redemption_start_time = ?
                                WHERE userId = ? AND group_nickname = ?`;
                const updArgs = [
                    (typeof msg.redemption_type !== 'undefined') ? msg.redemption_type : null,
                    (typeof msg.personal_points_redemption_ratio !== 'undefined') ? msg.personal_points_redemption_ratio : null,
                    msg.redemption_start_time || now,
                    userId, g    // ✅ userId
                ];
                const updRes = await mysql.query("bjl", updSql, updArgs);
                if (!updRes || updRes.affectedRows === 0) {
                    const insSql = `
                        INSERT INTO finance_personal_setup (
                            userId, playername, group_nickname,
                            bp_personal_share, bp_personal_share_upperlimit, sb_personal_share,
                            redemption_type, personal_points_redemption_ratio, redemption_start_time,
                            rebate_type, rebate_ratio, rebate_pair_start_time, start_exchange
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;
                    const insArgs = [
                        userId,   // ✅ userId
                        msg.player_name, g,
                        0, 0, 0,
                        (typeof msg.redemption_type !== 'undefined') ? msg.redemption_type : '',
                        (typeof msg.personal_points_redemption_ratio !== 'undefined') ? msg.personal_points_redemption_ratio : 0,
                        msg.redemption_start_time || now,
                        msg.rebate_type || null,
                        (typeof msg.rebate_ratio !== 'undefined') ? msg.rebate_ratio : 0,
                        msg.rebate_pair_start_time || now,
                        (typeof msg.start_exchange !== 'undefined') ? msg.start_exchange : 0
                    ];
                    results.push(await mysql.query("bjl", insSql, insArgs));
                } else {
                    results.push(updRes);
                }
            }
            return { err: null, data: results };
        }

        return { err: "未知的 option_type，支持 1/2/3", data: null };
    } catch (err) {
        console.log("err:", JSON.stringify(err));
        return { err: err, data: null };
    }
};
