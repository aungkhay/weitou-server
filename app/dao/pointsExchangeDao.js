let pomelo = require("pomelo");
let dao = module.exports;
let mysql = pomelo.app.get("sqlHelper");
const crypto = require("crypto");
const uuidv4 = crypto.randomUUID
    ? () => crypto.randomUUID()
    : () => {
        const bytes = crypto.randomBytes(16);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = bytes.toString("hex");
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    };
const sendToFront = require("../domain/sx/sendToFrontEnd");

dao.getExchangeRate = async function (msg) {
    let sql = "SELECT default_exchange FROM group_parameter_setup WHERE group_nickname = ? LIMIT 1";
    let rows = await mysql.query("bjl", sql, [msg.group_nickname]);
    let defaultExchange = 1;
    if (rows && rows[0] && rows[0].default_exchange != null) {
        defaultExchange = Number(rows[0].default_exchange) || 1;
    }

    // ✅ finance_personal_setup 改用 userId
    sql = "SELECT personal_points_redemption_ratio FROM finance_personal_setup WHERE group_nickname = ? AND userId = (SELECT Id FROM user WHERE username = ?) LIMIT 1";
    rows = await mysql.query("bjl", sql, [msg.group_nickname, msg.player_name]);
    let personalRatio = 0;
    if (rows && rows[0] && rows[0].personal_points_redemption_ratio != null) {
        personalRatio = Number(rows[0].personal_points_redemption_ratio) || 0;
    }

    const multiplier = (personalRatio > 0) ? personalRatio : defaultExchange;
    return multiplier;
};

dao.getAllExchangeRate = async function (records) {
    let groupNicknames = [...new Set(records.map(r => r.group_nickname))];
    let configSql = `
        SELECT group_nickname, Integral_statistics_method, points_exchange_ratio, default_exchange
        FROM group_parameter_setup
        WHERE group_nickname IN (?)
    `;
    let configs = await mysql.query("bjl", configSql, [groupNicknames]);
    let groupConfigMap = {};
    configs.forEach(c => { groupConfigMap[c.group_nickname] = c; });

    // ✅ finance_personal_setup 改用 userId 批量查询
    const userIds = [...new Set(records.map(r => r.userId).filter(Boolean))];
    let personalRows = [];
    if (userIds.length > 0) {
        personalRows = await mysql.query(
            "bjl",
            `SELECT f.group_nickname, f.userId, u.username, f.personal_points_redemption_ratio
             FROM finance_personal_setup f
             INNER JOIN user u ON u.Id = f.userId
             WHERE f.userId IN (?) AND f.group_nickname IN (?)`,
            [userIds, groupNicknames]
        );
    }
    let personalRatioMap = {};
    personalRows.forEach(r => {
        // key 保持原格式兼容调用方
        personalRatioMap[`${r.group_nickname}_${r.username}`] = r.personal_points_redemption_ratio;
        personalRatioMap[`${r.group_nickname}_${r.userId}`] = r.personal_points_redemption_ratio;
    });
    return { groupConfigMap, personalRatioMap };
};

dao.getUserScoreByRecords = async function (records) {
        // 2️⃣ 批量查询群组配置
        let playernames = [...new Set(records.map(r => r.player_name))];
        let configSql = `
            SELECT username,score
            FROM user
            WHERE username IN (?)
        `;
        let configs = await mysql.query("bjl", configSql, [playernames]);
        let playerMap = {};
        configs.forEach(c => {
            playerMap[c.username] = c.score;
        });
        return  playerMap;
};

/**
 * 查询某玩家在所有群的可兑换积分及兑换比例预览
 * msg: { player_name }
 */
dao.getPlayerExchangePoints = async function (msg) {
    if (!msg.player_name) {
        return { err: "player_name 不能为空", data: null };
    }

    // ✅ points_group_user 改用 userId 关联
    let sql = `
        SELECT pgu.group_nickname, u.username AS player_name, pgu.points, pgu.userId
        FROM points_group_user pgu
        INNER JOIN user u ON u.Id = pgu.userId
        WHERE u.username = ? AND pgu.points > 0
    `;
    let rows = await mysql.query("bjl", sql, [msg.player_name]);

    if (!rows || rows.length === 0) {
        return { err: null, data: { total_points: 0, total_score: 0, current_score: 0, default_ratio: 0 } };
    }

    let ratioBase = await dao.getAllExchangeRate(rows);

    // ✅ user 表用 Id 查询
    let userRows = await mysql.query("bjl", "SELECT Id, score FROM user WHERE username = ? LIMIT 1", [msg.player_name]);
    let currentScore = userRows && userRows[0] ? Number(userRows[0].score) : 0;

    let firstGroup = rows[0].group_nickname;
    let firstConfig = ratioBase.groupConfigMap[firstGroup] || {};
    let firstDefaultRatio = Number(firstConfig.default_exchange) || 0;
    let firstPersonalRatio = Number(ratioBase.personalRatioMap[`${firstGroup}_${msg.player_name}`]) || 0;
    let default_ratio = firstPersonalRatio > 0 ? firstPersonalRatio : firstDefaultRatio;

    let total_points = 0;
    let total_score = 0;
    for (let item of rows) {
        let config = ratioBase.groupConfigMap[item.group_nickname] || {};
        let defaultRatio = Number(config.default_exchange) || 0;
        let personalRatio = Number(ratioBase.personalRatioMap[`${item.group_nickname}_${item.player_name}`]) || 0;
        let ratio = personalRatio > 0 ? personalRatio : defaultRatio;
        total_points += Number(item.points);
        total_score += Number(item.points) * ratio;
    }

    return {
        err: null,
        data: { player_name: msg.player_name, current_score: currentScore, total_points, total_score, default_ratio, default_group: firstGroup }
    };
};

dao.singlePlayerAllGroupExchange = async function (msg) {
    try {
        if (!msg.player_name || String(msg.player_name).trim() === "") {
            return {
                err: "player_name 不能为空",
                data: null
            };
        }

        const playerName = String(msg.player_name).trim();

        // 只在入口通过当前用户名找 userId
        let userRows = await mysql.query(
            "bjl",
            `
                SELECT Id, username, score
                FROM user
                WHERE username = ?
                LIMIT 1
            `,
            [playerName]
        );

        if (!userRows || userRows.length === 0) {
            return {
                err: "用户不存在",
                data: null
            };
        }

        const user = userRows[0];

        // 后续积分查询只按 userId
        const rows = await mysql.query(
            "bjl",
            `
                SELECT
                GROUP BY pgu.group_nickname, pgu.userId
                HAVING SUM(pgu.points) > 0
            `,
            [user.Id]
        );

        if (!rows || rows.length === 0) {
            return {
                err: null,
                data: {
                    player_name: user.username,
                    userId: user.Id,
                    total_points: 0,
                    total_score: 0,
                    current_score: Number(user.score) || 0,
                    default_ratio: 0
                }
            };
        }

        const ratioBase = await dao.getAllExchangeRate(rows);

        let totalPoints = 0;
        let totalScore = 0;
        let defaultRatio = 0;
        let defaultGroup = "";

        for (let i = 0; i < rows.length; i++) {
            const item = rows[i];

            const config =
                ratioBase.groupConfigMap[item.group_nickname] || {};

            const groupDefaultRatio =
                Number(config.default_exchange) || 0;

            const personalRatio = Number(
                ratioBase.personalRatioMap[
                    `${item.group_nickname}_${item.userId}`
                ]
            ) || 0;

            const ratio =
                personalRatio > 0
                    ? personalRatio
                    : groupDefaultRatio;

            const points = Number(item.points) || 0;

            totalPoints += points;
            totalScore += points * ratio;

            if (i === 0) {
                defaultRatio = ratio;
                defaultGroup = item.group_nickname;
            }
        }

        return {
            err: null,
            data: {
                player_name: user.username,
                userId: user.Id,
                current_score: Number(user.score) || 0,
                total_points: totalPoints,
                total_score: totalScore,
                default_ratio: defaultRatio,
                default_group: defaultGroup
            }
        };
    } catch (err) {
        console.error("getPlayerExchangePoints err:", err);

        return {
            err: err.message || err,
            data: null
        };
    }
};

dao.singlePlayerAllGroupExchange = async function (msg) {
    try {
        if (!msg.player_name || String(msg.player_name).trim() === "") {
            return {
                err: "player_name 不能为空",
                data: null
            };
        }

        const playerName = String(msg.player_name).trim();

        // 只在入口通过当前用户名找 userId
        let userRows = await mysql.query(
            "bjl",
            `
                SELECT Id, username, score
                FROM user
                WHERE username = ?
                LIMIT 1
            `,
            [playerName]
        );

        if (!userRows || userRows.length === 0) {
            return {
                err: "用户不存在",
                data: null
            };
        }

        const user = userRows[0];

        // 后续积分查询只按 userId
        const rows = await mysql.query(
            "bjl",
            `
                SELECT
                    pgu.group_nickname,
                    pgu.userId,
                    pgu.points,
                    u.username AS player_name
                FROM points_group_user pgu
                INNER JOIN user u
                    ON u.Id = pgu.userId
                WHERE pgu.userId = ?
                  AND pgu.points > 0
            `,
            [user.Id]
        );

        console.log("singlePlayerAllGroupExchange rows:", rows);    
        if (!rows || rows.length === 0) {
            return {
                err: null,
                data: {
                    player_name: user.username,
                    userId: user.Id,
                    total_points: 0,
                    total_score: 0,
                    current_score: Number(user.score) || 0,
                    default_ratio: 0
                }
            };
        }

        const ratioBase = await dao.getAllExchangeRate(rows);

        let totalPoints = 0;
        let totalScore = 0;
        let defaultRatio = 0;
        let defaultGroup = "";

        for (let i = 0; i < rows.length; i++) {
            const item = rows[i];

            const config =
                ratioBase.groupConfigMap[item.group_nickname] || {};

            const groupDefaultRatio =
                Number(config.default_exchange) || 0;

            const personalRatio = Number(
                ratioBase.personalRatioMap[
                    `${item.group_nickname}_${item.userId}`
                ]
            ) || 0;

            const ratio =
                personalRatio > 0
                    ? personalRatio
                    : groupDefaultRatio;

            const points = Number(item.points) || 0;

            totalPoints += points;
            totalScore += points * ratio;

            if (i === 0) {
                defaultRatio = ratio;
                defaultGroup = item.group_nickname;
            }
        }

        return {
            err: null,
            data: {
                player_name: user.username,
                userId: user.Id,
                current_score: Number(user.score) || 0,
                total_points: totalPoints,
                total_score: totalScore,
                default_ratio: defaultRatio,
                default_group: defaultGroup
            }
        };
    } catch (err) {
        console.error("getPlayerExchangePoints err:", err);

        return {
            err: err.message || err,
            data: null
        };
    }
};

dao.singlePlayerAllGroupExchange = async function (msg) {
    try {
        if (!msg.player_name || String(msg.player_name).trim() === "") {
            return {
                err: "player_name 不能为空",
                data: null
            };
        }

        const playerName = String(msg.player_name).trim();

        // 只在入口通过当前用户名找 userId
        let userRows = await mysql.query(
            "bjl",
            `
                SELECT Id, username, score
                FROM user
                WHERE username = ?
                LIMIT 1
            `,
            [playerName]
        );

        if (!userRows || userRows.length === 0) {
            return {
                err: "用户不存在",
                data: null
            };
        }

        const user = userRows[0];

        // 后续积分查询只按 userId
        const rows = await mysql.query(
            "bjl",
            `
                SELECT
                    pgu.group_nickname,
                    pgu.userId,
                    pgu.points,
                    u.username AS player_name
                FROM points_group_user pgu
                INNER JOIN user u
                    ON u.Id = pgu.userId
                WHERE pgu.userId = ?
                  AND pgu.points > 0
            `,
            [user.Id]
        );

        console.log("singlePlayerAllGroupExchange rows:", rows);    
        if (!rows || rows.length === 0) {
            return {
                err: null,
                data: {
                    player_name: user.username,
                    userId: user.Id,
                    total_points: 0,
                    total_score: 0,
                    current_score: Number(user.score) || 0,
                    default_ratio: 0
                }
            };
        }

        const ratioBase = await dao.getAllExchangeRate(rows);

        const sqlParamsEntity = [];
        const batchId = "B" + uuidv4();
        const now = new Date();

        let sumPoints = 0;
        let sumScore = 0;

        for (const item of rows) {
            const points = Number(item.points) || 0;

            if (points <= 0) {
                continue;
            }

            const config =
                ratioBase.groupConfigMap[item.group_nickname] || {};

            const groupDefaultRatio =
                Number(config.default_exchange) || 0;

            const personalRatio = Number(
                ratioBase.personalRatioMap[
                    `${item.group_nickname}_${user.Id}`
                ]
            ) || 0;

            const ratio =
                personalRatio > 0
                    ? personalRatio
                    : groupDefaultRatio;

            const resultScore = points * ratio;

            sqlParamsEntity.push(
                mysql._getNewSqlParamEntity(
                    `
                        INSERT INTO points_log
                        (
                            group_nickname,
                            userId,
                            player_name,
                            type,
                            points_change,
                            score_change,
                            source_id,
                            stime,
                            operator,
                            exchange_type,
                            exchange_date,
                            batch_id
                        )
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                    `,
                    [
                        item.group_nickname,
                        user.Id,
                        user.username,
                        "exchange",
                        -points,
                        resultScore,
                        uuidv4(),
                        now,
                        msg.userName,
                        "按有效流水",
                        msg.statistics_date,
                        batchId
                    ]
                )
            );

            sqlParamsEntity.push(
                mysql._getNewSqlParamEntity(
                    `
                        INSERT INTO score_operation_record
                        (
                            group_nickname,
                            userId,
                            playername,
                            score,
                            before_option_score,
                            option_type,
                            option_time,
                            working_date,
                            optioner,
                            is_add
                        )
                        VALUES (?,?,?,?,?,?,?,?,?,?)
                    `,
                    [
                        item.group_nickname,
                        user.Id,
                        user.username,
                        resultScore,
                        Number(user.score) + sumScore,
                        "积分充值",
                        now,
                        msg.statistics_date,
                        msg.userName || "大红",
                        1
                    ]
                )
            );

            sumPoints += points;
            sumScore += resultScore;
        }

        if (sumPoints <= 0) {
            return {
                err: "没有可兑换的积分",
                data: null
            };
        }

        sqlParamsEntity.push(
            mysql._getNewSqlParamEntity(
                `
                    UPDATE user
                    SET
                        score = COALESCE(score, 0) + ?,
                        raw_score = COALESCE(raw_score, 0) + ?,
                        daily_points = GREATEST(
                            COALESCE(daily_points, 0) - ?,
                            0
                        ),
                        total_points = GREATEST(
                            COALESCE(total_points, 0) - ?,
                            0
                        )
                    WHERE Id = ?
                `,
                [
                    sumScore,
                    sumScore,
                    sumPoints,
                    sumPoints,
                    user.Id
                ]
            )
        );

        // 只按 userId 清零，完全不依赖旧名字
        sqlParamsEntity.push(
            mysql._getNewSqlParamEntity(
                `
                    UPDATE points_group_user
                    SET points = 0
                    WHERE userId = ?
                      AND points > 0
                `,
                [user.Id]
            )
        );

        const result = await mysql.tranExecSync(
            "bjl",
            sqlParamsEntity
        );

        if (!result) {
            return {
                err: "兑换失败",
                data: null
            };
        }

        sendToGameFront("all#", { type: "9" });

        sendToClientFront("all#", {
            type: 1,
            msg:
                user.username +
                "兑换积分上分" +
                sumScore +
                "分,成功, 余额: " +
                (Number(user.score) + sumScore)
        });

        return {
            err: null,
            data: {
                res: result,
                userId: user.Id,
                player_name: user.username,
                points: sumPoints,
                score: sumScore
            }
        };
    } catch (err) {
        console.error(
            "singlePlayerAllGroupExchange err:",
            err
        );

        return {
            err: err.message || err,
            data: null
        };
    }
};

dao.singleGroupExchange = async function (msg) {
    let sqlParamsEntity = [];

    // ✅ points_group_user 改用 userId
    let sql = `
        SELECT pgu.*, u.Id AS userId, u.username AS player_name
        FROM points_group_user pgu
        INNER JOIN user u ON u.Id = pgu.userId
        WHERE pgu.group_nickname = ? AND pgu.points > 0
    `;
    console.log("sql,args:",sql,[msg.group_nickname]);
    let r = await mysql.query("bjl", sql, [msg.group_nickname]);
    if (!r || r.length === 0) return { err: "没有可兑换的积分", data: null };

    let playerMap = await dao.getUserScoreByRecords(r);
    let batch_id = "B" + uuidv4();
    let now = new Date();
    let ratioBase = await dao.getAllExchangeRate(r);
    let add_score = {};
    let arrAddPoint = [];

    for (let item of r) {
        let config = ratioBase.groupConfigMap[item.group_nickname] || {};
        let defaultRatio = config.default_exchange || 0;
        let ratio = ratioBase.personalRatioMap[`${item.group_nickname}_${item.player_name}`] || defaultRatio;
        let result_score = item.points * ratio;
        add_score[item.player_name] = result_score;

        // ✅ points_log 补充 userId
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(
            `INSERT INTO points_log(group_nickname, userId, player_name, type, points_change, score_change, source_id, stime, operator, exchange_type, exchange_date, batch_id)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [msg.group_nickname, item.userId, item.player_name, "exchange", -item.points, result_score, uuidv4(), now, msg.userName, "按有效流水", msg.statistics_date, batch_id]
        ));

        // ✅ user 表改用 Id 更新
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(
            "UPDATE user SET score = score + ?, raw_score = raw_score + ?, daily_points = GREATEST(daily_points - ?, 0), total_points = GREATEST(total_points - ?, 0) WHERE Id = ?",
            [result_score, result_score, item.points, item.points, item.userId]
        ));

        // ✅ score_operation_record 补充 userId
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(
            `INSERT INTO score_operation_record(group_nickname, userId, playername, score, before_option_score, option_type, option_time, working_date, optioner, is_add)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [msg.group_nickname, item.userId, item.player_name, result_score, playerMap[item.player_name], "积分充值", now, msg.statistics_date, "大红", 1]
        ));

        arrAddPoint.push({ score: result_score, player_name: item.player_name });
    }

    // ✅ points_group_user 改用 group_nickname + userId 清零
    for (let item of r) {
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(
            "UPDATE points_group_user SET points = 0 WHERE group_nickname = ? AND userId = ? AND points > 0",
            [msg.group_nickname, item.userId]
        ));
    }

    let res = await mysql.tranExecSync("bjl", sqlParamsEntity);
    if (res) {
        sendToGameFront("all#", { type: "9" });
        for (let item of r) {
            let ye = (Number(playerMap[item.player_name]) + Number(add_score[item.player_name]));
            sendToClientFront("all#", { type: 1, msg: item.player_name + "兑换积分上分" + add_score[item.player_name] + "分,成功, 余额: " + ye });
        }
    }
    return { err: null, data: { res, data: arrAddPoint } };
};

dao.allGroupExchange = async function (msg) {
    let sqlParamsEntity = [];

    // ✅ points_group_user 改用 userId
    let sql = `
        SELECT pgu.*, u.Id AS userId, u.username AS player_name
        FROM points_group_user pgu
        INNER JOIN user u ON u.Id = pgu.userId
        WHERE pgu.points > 0
    `;
    let r = await mysql.query("bjl", sql, []);
    if (!r || r.length === 0) return { err: "没有可兑换的积分", data: null };

    let playerMap = await dao.getUserScoreByRecords(r);
    let batch_id = "B" + uuidv4();
    let now = new Date();
    let ratioBase = await dao.getAllExchangeRate(r);
    let add_score = {};

    for (let item of r) {
        let config = ratioBase.groupConfigMap[item.group_nickname] || {};
        let defaultRatio = config.default_exchange || 0;
        let ratio = ratioBase.personalRatioMap[`${item.group_nickname}_${item.player_name}`] || defaultRatio;
        let result_score = item.points * ratio;
        add_score[item.player_name] = result_score;

        // ✅ points_log 补充 userId
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(
            `INSERT INTO points_log(group_nickname, userId, player_name, type, points_change, score_change, source_id, stime, operator, exchange_type, exchange_date, batch_id)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [item.group_nickname, item.userId, item.player_name, "exchange", -item.points, result_score, uuidv4(), now, msg.userName, "按有效流水", msg.statistics_date, batch_id]
        ));

        // ✅ user 表改用 Id 更新
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(
            "UPDATE user SET score = score + ?, raw_score = raw_score + ?, daily_points = GREATEST(daily_points - ?, 0), total_points = GREATEST(total_points - ?, 0) WHERE Id = ?",
            [result_score, result_score, item.points, item.points, item.userId]
        ));

        // ✅ score_operation_record 补充 userId
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(
            `INSERT INTO score_operation_record(group_nickname, userId, playername, score, before_option_score, option_type, option_time, working_date, optioner, is_add)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [item.group_nickname, item.userId, item.player_name, result_score, playerMap[item.player_name], "积分充值", now, msg.statistics_date, "大红", 1]
        ));
    }

    // ✅ points_group_user 全部清零（直接按 userId 已在循环上方处理，这里统一清零）
    sqlParamsEntity.push(mysql._getNewSqlParamEntity(
        "UPDATE points_group_user SET points = 0 WHERE points > 0", []
    ));

    let res = await mysql.tranExecSync("bjl", sqlParamsEntity);
    if (res) {
        sendToGameFront("all#", { type: "9" });
        for (let item of r) {
            let ye = (Number(playerMap[item.player_name]) + Number(add_score[item.player_name]));
            sendToClientFront("all#", { type: 1, msg: item.player_name + "兑换积分上分" + add_score[item.player_name] + "分,成功, 余额: " + ye });
        }
    }
    return { err: null, data: res };
};

// 撤销最后一次兑换积分(作废)
dao.cancelExchange = async function (msg) {
    let sqlParamsEntity = [];

    let sql = "SELECT * FROM points_log WHERE type = ? ORDER BY Id DESC LIMIT 1";
    let r = await mysql.query("bjl", sql, ['exchange']);
    if (!r || r.length === 0) return { err: "没有可撤销的操作", data: null };
    if (r[0].is_revoke) return { err: "已经撤销,不能再撤销", data: null };

    let invoke_batch_id = r[0].batch_id;
    let row = await mysql.query("bjl", "SELECT * FROM points_log WHERE batch_id = ?", [invoke_batch_id]);

    let playerMap = await dao.getUserScoreByRecords(row);
    let batch_id = "B" + uuidv4();
    let now = new Date();
    let add_score = {};

    for (let item of row) {
        let points = Math.abs(item.points_change);
        add_score[item.player_name] = item.score_change;

        // ✅ points_log 撤销日志补充 userId
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(
            `INSERT INTO points_log(group_nickname, userId, player_name, type, points_change, score_change, source_id, stime, operator, exchange_type, exchange_date, memo, batch_id)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [item.group_nickname, item.userId, item.player_name, "cancel", points, -item.score_change, uuidv4(), now, msg.userName, "按有效流水", msg.statistics_date, "撤销操作", batch_id]
        ));

        // ✅ user 表改用 userId 更新
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(
            "UPDATE user SET score = score - ?, raw_score = raw_score + ?, daily_points = daily_points + ?, total_points = total_points + ? WHERE Id = ? AND score >= ?",
            [item.score_change, item.score_change, points, points, item.userId, item.score_change]
        ));

        // ✅ points_group_user 改用 userId 还原
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(
            "UPDATE points_group_user SET points = points + ? WHERE group_nickname = ? AND userId = ?",
            [points, item.group_nickname, item.userId]
        ));

        sqlParamsEntity.push(mysql._getNewSqlParamEntity(
            "UPDATE points_log SET is_revoke = 1 WHERE batch_id = ?", [invoke_batch_id]
        ));

        // ✅ score_operation_record 补充 userId
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(
            `INSERT INTO score_operation_record(group_nickname, userId, playername, score, before_option_score, option_type, option_time, working_date, optioner, is_add, memo)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [item.group_nickname, item.userId, item.player_name, item.score_change, playerMap[item.player_name], "积分充值", now, msg.statistics_date, "大红", 1, "积分充值"]
        ));
    }

    let res = await mysql.tranExecSync("bjl", sqlParamsEntity);
    if (res) {
        sendToGameFront("all#", { type: "9" });
        for (let item of r) {
            let ye = (Number(playerMap[item.player_name]) - Number(add_score[item.player_name]));
            sendToClientFront("all#", { type: 1, msg: item.player_name + "撤销兑换积分下分" + add_score[item.player_name] + "分,成功, 余额: " + ye });
        }
    }
    return { err: null, data: res };
};

dao.getExchangeInfo = async function (msg) {
    let conditions = [];
    let args = [];

    if (Number(msg.is_virtual) === 0) {
        // 只判断真实成员是否存在，避免 group_member 重复行放大 points_log。
        conditions.push(`
            EXISTS (
                SELECT 1
                FROM group_member gm
                WHERE gm.userId = pl.userId
                  AND gm.group_nickname = pl.group_nickname
                  AND gm.is_virtual = 0
            )
        `);
    }

    // 个人兑换比例使用标量子查询，保证每条 points_log 最多返回一行。
    const personalRatioSelect = `
        (
            SELECT MAX(fps.personal_points_redemption_ratio)
            FROM finance_personal_setup fps
            WHERE fps.group_nickname = pl.group_nickname
              AND fps.userId = pl.userId
        ) AS personal_points_redemption_ratio
    `;

    if (msg.startTime && msg.endTime) {
        conditions.push('pl.stime BETWEEN ? AND ?');
        args.push(msg.startTime, msg.endTime);
    }

    if (msg.group_nickname && msg.group_nickname !== '全部' && msg.group_nickname !== '') {
        conditions.push('pl.group_nickname = ?');
        args.push(msg.group_nickname);
    }

    if (msg.player_name && msg.player_name !== '') {
        // ✅ 通过 userId 过滤玩家
        conditions.push('pl.userId = (SELECT Id FROM user WHERE username = ?)');
        args.push(msg.player_name);
    }
    
    if (msg.option_type && msg.option_type !== "") {
        if (msg.option_type === "兑换") {
            conditions.push('(pl.type = ? OR pl.type = ?)');
            args.push("exchange", "cancel");
        }
        if (msg.option_type === "清零") {
            conditions.push('pl.type = ?');
            args.push("reset");
        }
    }

    let whereSql = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    let pageSize = Math.max(1, Math.min(Number(msg.pageSize) || 20, 100));
    let currentPage = Math.max(1, Number(msg.currentPage) || 1);
    let offset = (currentPage - 1) * pageSize;

    let countSql = `
        SELECT COUNT(*) AS total,
               IFNULL(SUM(pl.points_change), 0) AS points_change,
               IFNULL(SUM(pl.score_change), 0) AS score_change
        FROM points_log pl
        ${whereSql}
    `;
    let countRes = await mysql.query("bjl", countSql, args);
    let total = countRes[0]?.total || 0;
    let points_change = Number(countRes[0]?.points_change || 0);
    let score_change = Number(countRes[0]?.score_change || 0);

    let sql = `
        SELECT pl.*, u.username AS player_name_real,
               ${personalRatioSelect}
        FROM points_log pl
        INNER JOIN user u ON u.Id = pl.userId   -- ✅ 实时取 username
        ${whereSql}
        ORDER BY pl.stime DESC, pl.Id DESC
        LIMIT ?, ?
    `;
    let list = await mysql.query("bjl", sql, [...args, offset, pageSize]);
    //console.log("sql2:", sql, [...args, offset, pageSize]);

    const summary = { total_count: total, total_points_change: points_change, total_score_change: score_change };
    const summaryRow = {
        Id: null, group_nickname: '', player_name: '合计', type: '',
        points_change, score_change, source_id: null, stime: null,
        operator: null, exchange_type: null, exchange_date: null,
        batch_id: null, personal_points_redemption_ratio: null
    };
    const returnedList = Array.isArray(list) ? [...list, summaryRow] : [summaryRow];
    return { err: null, data: { list: returnedList, total, summary, currentPage, pageSize } };
};

dao.pointsClear = async function (msg) {
    try {
        const selectConditions = ["pgu.points > 0"];
        const updateConditions = ["pgu.points > 0"];
        const args = [];

        if (
            msg.group_nickname &&
            msg.group_nickname !== "全部" &&
            msg.group_nickname !== ""
        ) {
            selectConditions.push("pgu.group_nickname = ?");
            updateConditions.push("pgu.group_nickname = ?");
            args.push(msg.group_nickname);
        }

        if (
            msg.player_name &&
            String(msg.player_name).trim() !== ""
        ) {
            selectConditions.push("u.username = ?");
            updateConditions.push("u.username = ?");
            args.push(String(msg.player_name).trim());
        }

        const selectWhere =
            "WHERE " + selectConditions.join(" AND ");

        const selectSql = `
            SELECT
                pgu.group_nickname,
                pgu.userId,
                u.username AS player_name,
                pgu.points
            FROM points_group_user pgu
            INNER JOIN user u
                ON u.Id = pgu.userId
            ${selectWhere}
        `;

        console.log("[pointsClear SELECT SQL]", selectSql);
        console.log("[pointsClear SELECT ARGS]", args);

        const rows = await mysql.query(
            "bjl",
            selectSql,
            args
        );

        if (!rows || rows.length === 0) {
            return {
                err: "没有可清空的记录",
                data: null
            };
        }

        const sqlParamsEntity = [];
        const batchId = "B" + uuidv4();
        const now = new Date();

        // 先写入积分变动日志，并同步扣减 user.daily_points 和 user.total_points
        for (const item of rows) {
            const points = Number(item.points) || 0;

            if (points <= 0) {
                continue;
            }

            sqlParamsEntity.push(
                mysql._getNewSqlParamEntity(
                    `
                        INSERT INTO points_log
                        (
                            group_nickname,
                            userId,
                            player_name,
                            type,
                            points_change,
                            source_id,
                            stime,
                            operator,
                            exchange_type,
                            exchange_date,
                            batch_id
                        )
                        VALUES (?,?,?,?,?,?,?,?,?,?,?)
                    `,
                    [
                        item.group_nickname,
                        item.userId,
                        item.player_name,
                        "reset",
                        -points,
                        uuidv4(),
                        now,
                        msg.userName,
                        "按有效流水",
                        msg.statistics_date,
                        batchId
                    ]
                )
            );

            // 新增：同步扣减 user.daily_points 和 user.total_points
            sqlParamsEntity.push(
                mysql._getNewSqlParamEntity(
                    `
                        UPDATE user
                        SET 
                            daily_points = GREATEST(COALESCE(daily_points,0) - ?, 0),
                            total_points = GREATEST(COALESCE(total_points,0) - ?, 0)
                        WHERE Id = ?
                    `,
                    [points, points, item.userId]
                )
            );
        }

        // UPDATE 中明确声明 pgu 和 u 别名。
        const updateWhere =
            "WHERE " + updateConditions.join(" AND ");

        const updateSql = `
            UPDATE points_group_user pgu
            INNER JOIN user u
                ON u.Id = pgu.userId
            SET pgu.points = 0
            ${updateWhere}
        `;

        sqlParamsEntity.push(
            mysql._getNewSqlParamEntity(
                updateSql,
                args
            )
        );

        console.log("[pointsClear UPDATE SQL]", updateSql);
        console.log("[pointsClear UPDATE ARGS]", args);

        const result = await mysql.tranExecSync(
            "bjl",
            sqlParamsEntity
        );

        console.log(
            "[积分清零成功]",
            "群=" + (msg.group_nickname || "全部"),
            "玩家=" + (msg.player_name || "全部"),
            "数量=" + rows.length,
            "batchId=" + batchId
        );

        return {
            err: null,
            data: {
                result,
                count: rows.length,
                batch_id: batchId,
                can_restore: true
            }
        };
    } catch (err) {
        console.error("pointsClear err:", err);

        return {
            err: err.message || err,
            data: null
        };
    }
};

/**
 * 按 points_clear 返回的 batch_id 撤销一次积分清零。
 * 已清掉的积分通过累加恢复，避免覆盖清零之后新产生的积分。
 * msg: { batch_id, userName, statistics_date }
 */
dao.pointsClearRevoke = async function (msg) {
    try {
        const sourceBatchId = msg.batch_id ? String(msg.batch_id).trim() : "";

        if (!sourceBatchId) {
            return { err: "batch_id 不能为空", data: null };
        }

        const rows = await mysql.query(
            "bjl",
            `
                SELECT
                    Id,
                    group_nickname,
                    userId,
                    player_name,
                    points_change,
                    exchange_type,
                    exchange_date,
                    COALESCE(is_revoke, 0) AS is_revoke
                FROM points_log
                WHERE batch_id = ?
                  AND type = 'reset'
                ORDER BY Id ASC
            `,
            [sourceBatchId]
        );

        if (!rows || rows.length === 0) {
            return { err: "清零批次不存在", data: null };
        }

        if (rows.some(item => Number(item.is_revoke) === 1)) {
            return { err: "该清零批次已撤销，不能重复撤销", data: null };
        }

        const sqlParamsEntity = [];
        let totalPoints = 0;

        for (const item of rows) {
            const points = Math.abs(Number(item.points_change) || 0);

            if (points <= 0) {
                return { err: "清零批次积分数据异常，无法撤销", data: null };
            }

            totalPoints += points;

            // 撤销成功后删除原清零日志；条件删除同时承担并发幂等保护。
            // 任意一条删除不到时，事务会完整回滚。
            sqlParamsEntity.push(
                mysql._getNewSqlParamEntity(
                    `
                        DELETE FROM points_log
                        WHERE Id = ?
                          AND type = 'reset'
                          AND COALESCE(is_revoke, 0) = 0
                    `,
                    [item.Id]
                )
            );

            sqlParamsEntity.push(
                mysql._getNewSqlParamEntity(
                    `
                        UPDATE points_group_user
                        SET points = COALESCE(points, 0) + ?
                        WHERE group_nickname = ?
                          AND userId = ?
                    `,
                    [points, item.group_nickname, item.userId]
                )
            );

            sqlParamsEntity.push(
                mysql._getNewSqlParamEntity(
                    `
                        UPDATE user
                        SET
                            daily_points = COALESCE(daily_points, 0) + ?,
                            total_points = COALESCE(total_points, 0) + ?
                        WHERE Id = ?
                    `,
                    [points, points, item.userId]
                )
            );

        }

        const result = await mysql.tranExecSync(
            "bjl",
            sqlParamsEntity
        );

        if (!result) {
            return { err: "该清零批次已撤销或数据已发生变化", data: null };
        }

        sendToGameFront("all#", { type: "9" });

        console.log(
            "[撤销积分清零成功]",
            "sourceBatchId=" + sourceBatchId,
            "数量=" + rows.length,
            "恢复积分=" + totalPoints
        );

        return {
            err: null,
            data: {
                result,
                count: rows.length,
                points: totalPoints,
                source_batch_id: sourceBatchId,
                can_restore: false
            }
        };
    } catch (err) {
        console.error("pointsClearRevoke err:", err);

        return {
            err: err.message || err,
            data: null
        };
    }
};

/**
 * 按 score_operation_record.id 单条撤销积分兑换
 * msg: { id, userName, statistics_date }
 */
dao.cancelExchangeById = async function (msg) {
    let sql = "SELECT * FROM score_operation_record WHERE Id = ? LIMIT 1";
    let r = await mysql.query("bjl", sql, [msg.id]);
    if (!r || r.length === 0) return { err: "记录不存在", data: null };

    let record = r[0];
    if (record.is_revoke) return { err: "该记录已被撤销，不能重复撤销", data: null };
    if (record.option_type !== "积分充值") return { err: "该记录不是积分兑换操作，无法撤销", data: null };

    // ✅ points_log 改用 userId 查询
    sql = `
        SELECT * FROM points_log 
        WHERE userId = ? AND score_change = ? AND type = 'exchange' AND is_revoke != 1
        ORDER BY stime DESC LIMIT 1
    `;
    let logRows = await mysql.query("bjl", sql, [record.userId, record.score]);
    if (!logRows || logRows.length === 0) return { err: "未找到对应的积分兑换日志，无法撤销", data: null };

    let pointsLogItem = logRows[0];

    // ✅ user 表用 Id 查询
    let userRows = await mysql.query("bjl", "SELECT Id, score FROM user WHERE Id = ? LIMIT 1", [record.userId]);
    if (!userRows || userRows.length === 0) return { err: "用户不存在", data: null };
    let currentScore = userRows[0].score;

    if (Number(currentScore) < Number(record.score)) {
        return { err: `用户余额不足，当前余额 ${currentScore}，需扣回 ${record.score}`, data: null };
    }

    let points = Math.abs(pointsLogItem.points_change);
    let scoreBack = Number(record.score);
    let sqlParamsEntity = [];
    let batch_id = "B" + uuidv4();
    let now = new Date();

    // ✅ points_log 撤销日志补充 userId
    sqlParamsEntity.push(mysql._getNewSqlParamEntity(
        `INSERT INTO points_log(group_nickname, userId, player_name, type, points_change, score_change, source_id, stime, operator, exchange_type, exchange_date, memo, batch_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [record.group_nickname, record.userId, record.playername, "cancel", points, -scoreBack, uuidv4(), now, msg.userName, "按有效流水", msg.statistics_date, "单条撤销", batch_id]
    ));

    // ✅ user 表改用 Id 更新
    sqlParamsEntity.push(mysql._getNewSqlParamEntity(
        "UPDATE user SET score = score - ?, raw_score = raw_score - ?, daily_points = daily_points + ?, total_points = total_points + ? WHERE Id = ? AND score >= ?",
        [scoreBack, scoreBack, points, points, record.userId, scoreBack]
    ));

    // ✅ points_group_user 改用 userId 还原
    sqlParamsEntity.push(mysql._getNewSqlParamEntity(
        "UPDATE points_group_user SET points = points + ? WHERE group_nickname = ? AND userId = ?",
        [points, record.group_nickname, record.userId]
    ));

    sqlParamsEntity.push(mysql._getNewSqlParamEntity(
        "UPDATE points_log SET is_revoke = 1 WHERE Id = ?", [pointsLogItem.Id]
    ));

    sqlParamsEntity.push(mysql._getNewSqlParamEntity(
        "delete from score_operation_record WHERE Id = ?", [msg.id]
    ));

    let res = await mysql.tranExecSync("bjl", sqlParamsEntity);
    if (res) {
        sendToGameFront("all#", { type: "9" });
        let ye = Number(currentScore) - scoreBack;
        sendToClientFront("all#", { type: 1, msg: `${record.playername} 撤销积分兑换下分 ${scoreBack} 分，成功，余额: ${ye}` });
    }
    return { err: null, data: { res, score: scoreBack, points } };
};

sendToGameFront =  (group_nickname,msg) => {
    sendToFront.sendNoticeToGameClient(group_nickname, msg);
};

sendToClientFront =  (group_nickname, msg) => {
    console.log("msg:",msg);
    sendToFront.sendNoticeToClient(group_nickname, msg);
};
