let pomelo = require("pomelo");
let playerDao = module.exports;
let mysql = pomelo.app.get("sqlHelper");
let financialInquiriesDao = require('./financialInquiriesDao');

playerDao.addPlayer2 = async function (msg) {
    try {
        const playerName = String(msg.name || "").trim();
        const groupNickname = String(msg.group_nickname || "").trim();
        const isVirtual = Number(msg.is_virtual) === 1 ? 1 : 0;

        if (!playerName) {
            return {
                err: "玩家名称不能为空",
                data: null
            };
        }

        if (!groupNickname) {
            return {
                err: "群名称不能为空",
                data: null
            };
        }

        const sqlParamsEntity = [];
        const now = new Date();

        /*
         * 第一步：确保 user 表中存在这个玩家。
         *
         * user.username 必须有唯一索引。
         *
         * 玩家已存在时：
         * - 不修改密码
         * - 不修改余额
         * - 只同步 is_virtual
         *
         * 玩家不存在时：
         * - 正常插入并自动生成 Id
         */
        let sql = `
            INSERT INTO user
            (
                username,
                password,
                registTime,
                enable,
                level,
                is_virtual
            )
            VALUES (?, ?, ?, ?, ?, ?)

            ON DUPLICATE KEY UPDATE
                is_virtual = VALUES(is_virtual)
        `;

        let args = [
            playerName,
            "96e79218965eb72c92a549dd5a330112",
            now,
            1,
            3,
            isVirtual
        ];

        sqlParamsEntity.push(
            mysql._getNewSqlParamEntity(sql, args)
        );

        /*
         * 第二步：从 user 表实时取得 Id，
         * 再插入 group_member。
         *
         * 不再使用前端传来的 msg.userId，
         * 因为新增玩家时前端不可能提前知道数据库生成的 Id。
         */
        sql = `
            INSERT INTO group_member
            (
                userId,
                group_nickname,
                playername,
                is_virtual
            )
            SELECT
                u.Id,
                ?,
                u.username,
                ?
            FROM user u
            WHERE u.username = ?
            LIMIT 1

            ON DUPLICATE KEY UPDATE
                userId = VALUES(userId),
                playername = VALUES(playername),
                is_virtual = VALUES(is_virtual)
        `;

        args = [
            groupNickname,
            isVirtual,
            playerName
        ];

        sqlParamsEntity.push(
            mysql._getNewSqlParamEntity(sql, args)
        );

        const result = await mysql.tranExecSync(
            "bjl",
            sqlParamsEntity
        );

        /*
         * 返回最终 userId，方便调用方保存或刷新。
         */
        const userRows = await mysql.query(
            "bjl",
            `
                SELECT
                    Id,
                    username,
                    is_virtual
                FROM user
                WHERE username = ?
                LIMIT 1
            `,
            [playerName]
        );

        if (!userRows || userRows.length === 0) {
            return {
                err: "玩家创建成功，但读取 userId 失败",
                data: result
            };
        }

        const user = userRows[0];

        console.log(
            "[添加玩家成功]",
            "userId=" + user.Id,
            "player=" + user.username,
            "group=" + groupNickname,
            "is_virtual=" + isVirtual
        );

        return {
            err: null,
            data: {
                result: result,
                userId: user.Id,
                username: user.username,
                group_nickname: groupNickname,
                is_virtual: isVirtual
            }
        };
    } catch (err) {
        console.error("addPlayer err:", err);

        return {
            err: err.message || err,
            data: null
        };
    }
};

playerDao.addPlayer = async function(msg){
    try{
        let sqlParamsEntity = [];
        let time = new Date();
        let sql;
        let args;

        if(!msg.isHaveUser){
            sql = "insert into user(username,password,registTime,enable,level,is_virtual) " + "values(?,?,?,?,?,?)";
            args = [msg.name,"96e79218965eb72c92a549dd5a330112", time, 1, 3, msg.is_virtual];
            sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args));  
        }

        // group_member.userId 必须使用玩家在 user 表中的 Id，msg.userId 是当前操作员 ID。
        sql = `
            INSERT INTO group_member(userId, group_nickname, playername, is_virtual)
            SELECT Id, ?, username, ?
            FROM user
            WHERE username = ?
            LIMIT 1
        `;
        args = [msg.group_nickname, msg.is_virtual, msg.name];
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args));

        let res = await mysql.tranExecSync("bjl",sqlParamsEntity)
        return{err:null,data:res};
    }catch(err){
        return {err:err,data:null};
    }
}

playerDao.refreshPlayer = async function(msg){
    try{
        // 把 user 表中在当前 group_member（指定群）不存在的用户插入进来
        let sql = `
            INSERT INTO group_member (userId, group_nickname, playername, is_virtual)
            SELECT u.Id, ?, u.username, IFNULL(u.is_virtual, 0)
            FROM user u
            LEFT JOIN group_member gm
              ON gm.playername = u.username
              AND gm.group_nickname = ?
            WHERE gm.playername IS NULL
        `;
        let args = [msg.group_nickname, msg.group_nickname];

        let res = await mysql.query("bjl", sql, args);
        return { err: null, data: res };
    }catch(err){
        console.error("refreshPlayer err:", err);
        return { err: err, data: null };
    }
}

playerDao.topPlayer = async function(msg){
    try{
        // 先确认目标属于当前群；目标不存在时不能扰动已有置顶顺序。
        let sql = "select Id from group_member where group_nickname = ? and playername = ? limit 1";
        let args = [msg.group_nickname, msg.name];
        const targetRows = await mysql.query("bjl", sql, args);
        if (!targetRows || targetRows.length === 0) {
            return {err:null,data:{affectedRows:0}};
        }

        if (msg.isReset === 1 || msg.isReset === '1') {
            // 只取消当前群指定玩家的置顶，恢复默认排序，不改动其他玩家。
            sql = `UPDATE group_member
                SET is_top = 0, sort_order = DEFAULT
                WHERE group_nickname = ? AND playername = ?`;
            const res = await mysql.query("bjl", sql, args);
            return {err:null,data:res};
        }

        /*
         * 保留所有历史置顶：
         * 1. 本次置顶玩家排到第 0 位；
         * 2. 其他已置顶玩家顺序整体后移一位；
         * 3. 普通玩家保持原状态。
         * 单条 UPDATE 保证同一次排序调整不会只完成一半。
         */
        sql = `UPDATE group_member
            SET sort_order = CASE
                    WHEN playername = ? THEN 0
                    ELSE COALESCE(sort_order, 100) + 1
                END,
                is_top = CASE
                    WHEN playername = ? THEN 1
                    ELSE is_top
                END
            WHERE group_nickname = ?
              AND (is_top = 1 OR playername = ?)`;
        args = [msg.name, msg.name, msg.group_nickname, msg.name];
        const res = await mysql.query("bjl",sql,args);
        return{err:null,data:res};
    }catch(err){
        return {err:err,data:null}
    }
}

// 获取真实玩家名称
playerDao.getRealPlayerName = async function(msg){
    try{
        let sql = "select playername from group_member WHERE group_nickname = ? and is_virtual = 0";
        let args = [msg.group_nickname];
        let res = await mysql.query("bjl",sql,args);
        return{err:null,data:res};
    }catch(err){
        return {err:err,data:null}
    }
}

playerDao.getVirtualPlayer = async function(msg){
    try{
        let sql = "select playername from group_member WHERE group_nickname = ? and is_virtual = 1";
        let args = [msg.group_nickname];
        let res = await mysql.query("bjl",sql,args);
        return{err:null,data:res};
    }catch(err){
        return {err:err,data:null}
    }
}

playerDao.getPlayer = async function(msg){
    let condition = " group_nickname = ? ";
    let args = [msg.group_nickname];

    if ( typeof msg.is_virtual === 'number' && msg.is_virtual == 0){ 
        condition += " and is_virtual = ? ";
        args.push(msg.is_virtual);  
    }

    if ( typeof msg.is_hide === 'number' && msg.is_hide >= 0){ 
        condition += " and is_hide = ? ";
        args.push(msg.is_hide);  
    }

    if ( typeof msg.is_top === 'number' && msg.is_top >= 0){ 
        condition += " and is_top = ? ";
        args.push(msg.is_top);  
    }

    try{
        // 1. 拼接基础查询语句
        let sql = "select * from group_member where " + condition;
        
        // 2. 拼接排序逻辑（去掉所有 gm. 前缀，并将 MAX(is_top) 简化为 is_top）
        sql += ` ORDER BY 
            is_top DESC, 
            sort_order ASC,
            CASE 
                WHEN playername REGEXP '^[0-9]+$' THEN 0 
                WHEN playername REGEXP '^[A-Za-z]+$' THEN 1 
                ELSE 2 
            END ASC, 
            CASE WHEN playername REGEXP '^[0-9]+$' THEN CAST(playername AS UNSIGNED) ELSE NULL END ASC, 
            CASE WHEN playername REGEXP '^[A-Za-z]+$' THEN playername ELSE NULL END ASC, 
            CONVERT(playername USING gbk) COLLATE gbk_chinese_ci ASC `;

        let rows = await mysql.query("bjl", sql, args);
        return {err: null, data: rows};
    }catch(err){
        console.error("err:", JSON.stringify(err));
        return {err: err, data: null};
    }
}


playerDao.editPlayer = async function(msg) {
    let sqlParamsEntity = [];
    
    if (!msg.new_name || msg.new_name.trim() === "") {
        msg.new_name = null;
    }

    // 严格检查是否传入了 is_virtual 字段（允许 0 和 1，排除 undefined 和 null）
    let hasVirtual = msg.hasOwnProperty('is_virtual') && msg.is_virtual !== null;

    if (!msg.new_name) {
        // 只有在明确传了 is_virtual 时才生成更新 SQL
        if (hasVirtual) {
            let sql = "UPDATE group_member SET is_virtual = ? WHERE playername = ?";
            let args = [msg.is_virtual, msg.name];
            sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args));
            sql = "UPDATE user SET is_virtual = ? WHERE username = ?";
            args = [msg.is_virtual, msg.name];
            sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args));
        }
    } else {
        const oldName = String(msg.name || "").trim();
        const newName = String(msg.new_name || "").trim();

        // 改名需要区分核心更新和可选同步，不能把可选表的0行更新当作整笔失败。
        return new Promise(resolve => {
            mysql.beginTransaction((connectionErr, connection) => {
                if (connectionErr) return resolve({ err: connectionErr, data: null });

                const query = (sql, args) => new Promise((queryResolve, queryReject) => {
                    connection.query(sql, args, (queryErr, rows) => {
                        if (queryErr) return queryReject(queryErr);
                        queryResolve(rows);
                    });
                });
                const rollback = () => new Promise(done => connection.rollback(() => done()));
                const commit = () => new Promise((done, reject) => connection.commit(err => err ? reject(err) : done()));

                connection.beginTransaction(async beginErr => {
                    if (beginErr) {
                        connection.release();
                        return resolve({ err: beginErr, data: null });
                    }
                    try {
                        const users = await query(
                            "SELECT Id, is_virtual FROM user WHERE username = ?",
                            [oldName]
                        );
                        if (!users || users.length !== 1) throw new Error("旧玩家名称不存在");
                        const userId = Number(users[0].Id);
                        if (Number(users[0].is_virtual) === 1) throw new Error("虚拟机器人不允许修改名称");

                        const duplicate = await query(
                            "SELECT Id FROM user WHERE username = ? AND Id <> ? LIMIT 1",
                            [newName, userId]
                        );
                        if (duplicate && duplicate.length > 0) throw new Error("新玩家名称已存在");

                        const userSql = hasVirtual
                            ? "UPDATE user SET username = ?, is_virtual = ? WHERE Id = ?"
                            : "UPDATE user SET username = ? WHERE Id = ?";
                        const userArgs = hasVirtual
                            ? [newName, msg.is_virtual, userId]
                            : [newName, userId];
                        const userResult = await query(userSql, userArgs);
                        if (!userResult || userResult.affectedRows !== 1) throw new Error("玩家主资料更新失败");

                        const memberSql = hasVirtual
                            ? "UPDATE group_member SET playername = ?, is_virtual = ? WHERE userId = ?"
                            : "UPDATE group_member SET playername = ? WHERE userId = ?";
                        const memberArgs = hasVirtual
                            ? [newName, msg.is_virtual, userId]
                            : [newName, userId];
                        const memberResult = await query(memberSql, memberArgs);
                        if (!memberResult || memberResult.affectedRows < 1) throw new Error("群成员资料更新失败");

                        // 以下都是可选同步：没有配置或没有下级时，更新0行属于正常情况。
                        await query("UPDATE finance_personal_setup SET playername = ? WHERE userId = ?", [newName, userId]);
                        await query("UPDATE group_personal_setup SET playername = ? WHERE userId = ?", [newName, userId]);
                        await query("UPDATE user SET reference_name = ? WHERE reference_name = ?", [newName, oldName]);

                        await commit();
                        connection.release();
                        resolve({ err: null, data: true });
                    } catch (err) {
                        await rollback();
                        connection.release();
                        resolve({ err: err.message || err, data: null });
                    }
                });
            });
        });
    }

    // 如果没有任何更新项，直接返回成功，避免空事务报错
    if (sqlParamsEntity.length === 0) {
        return { err: null, data: "没有需要更新的内容" };
    }

    try {
        let res = await mysql.tranExecSync("bjl", sqlParamsEntity);
        return { err: null, data: res };
    } catch (err) {
        return { err: err, data: null };
    }
};


playerDao.deletePlayer = async function(msg){
    //try{
        let sql = "delete from group_member where playername = ? ";
        let args = [msg.name];
        let res = await mysql.query("bjl",sql,args);
        sql = "delete from user where username = ? ";
        args = [msg.name];  
        res = await mysql.query("bjl",sql,args);
        return{err:null,data:res};
    // }catch(err){
    //     return {err:err,data:null};
    // }
}

playerDao.hidePlayer = async function(msg){
    try{
        let sql = "update group_member set is_hide = ? where playername = ? and is_hide <> ?";
        let args = [msg.is_hide , msg.name , msg.is_hide];
        let res = await mysql.query("bjl",sql,args);
        sql = "update user set is_hide = ? where username = ? and is_hide <> ?";
        args = [msg.is_hide , msg.name , msg.is_hide];
        res = await mysql.query("bjl",sql,args);
        return{err:null,data:res};
    }catch(err){
        return {err:err,data:null};
    }
}

playerDao.getPlayerByArray = async function(msg){
    try{
        let sql = "select * from group_member where group_nickname = ?  and playername in (?)";
        let args = [msg.group_nickname , msg.array_player_name];
        let res = await mysql.query("bjl",sql,args);
        return{err:null,data:res};
    }catch(err){
        return {err:err,data:null};
    }
}

playerDao.betDetailsQueryByName = async function(msg){
    let args = [msg.group_nickname, msg.name, msg.startTime, msg.endTime];

    let commonFields = `g.Id, u.username AS userName, g.cc, g.jc, g.kj, g.str_pai, 
                        g.z, g.h, g.x, g.zd, g.xd, g.m, 0 AS d, g.l, g.k, g.q,
                        g.z_yl, g.h_yl, g.x_yl, g.zd_yl, g.xd_yl, g.m_yl, g.q_yl, g.l_yl,g.k_yl,
                        g.xz, g.xzmx, g.yxxz, g.yl, g.reference_name, 
                        g.stime, g.betTime, g.before_bet_ye, 
                        g.xml_zx, g.xml_sb, g.xml_s, g.xml_d, 
                        g.order_id, g.bet_order`;

    // ✅ 改成 userId JOIN
    let condition1 = "g.group_nickname = ? AND u.username = ? AND g.statistics_date BETWEEN ? AND ?";
    let condition2 = "h.group_nickname = ? AND u2.username = ? AND h.statistics_date BETWEEN ? AND ?";

    try {
        let sql = `
            (SELECT ${commonFields}, u.raw_score AS initial_amount, 'record' AS table_type 
             FROM gameshist_record g 
             INNER JOIN user u ON u.Id = g.userId
             WHERE ${condition1})
            UNION ALL
            (SELECT ${commonFields.replace(/\bg\./g, 'h.').replace('u.username AS userName', 'u2.username AS userName').replace('u.raw_score', 'u2.raw_score')}, u2.raw_score AS initial_amount, 'history' AS table_type 
             FROM gameshist h 
             INNER JOIN user u2 ON u2.Id = h.userId
             WHERE ${condition2})
            ORDER BY betTime DESC
        `;
        let allArgs = [...args, ...args];
        let rows = await mysql.query("bjl", sql, allArgs);
        return { err: null, data: rows };
    } catch(err) {
        console.error("err:", JSON.stringify(err));
        return { err: err, data: null };
    }
}

playerDao.PlayerDetailsQuery = async function(msg){
    let condition = " g.group_nickname = ? ";
    let args = [msg.group_nickname];

    if (msg.name){ 
        condition += " AND u.username = ? ";   // ✅ 改成 user 表过滤
        args.push(msg.name);  
    }
    if (msg.shoe){ 
        condition += " AND g.cc = ? ";
        args.push(msg.shoe);  
    }
    if (msg.startTime){ 
        condition += " AND g.statistics_date BETWEEN ? AND ? ";
        args.push(msg.startTime, msg.endTime);  
    }

    let virtualJoin = "";
    if (msg.is_contains_virtual === 0) {
        virtualJoin = `
            INNER JOIN group_member gm 
            ON u.username = gm.playername 
            AND g.group_nickname = gm.group_nickname
        `;
        condition += " AND gm.is_virtual = 0 ";
    }

    try{
        let sql = `
            SELECT 
                u.username,
                g.reference_name,
                SUM(CASE WHEN (g.z > 0 OR g.x > 0) THEN g.yxxz ELSE 0 END) AS xml_zx,
                SUM(CASE WHEN (g.zd > 0 OR g.xd > 0 OR g.h > 0) THEN g.yxxz ELSE 0 END) AS xml_sb,
                SUM(g.z_yl + g.x_yl) AS zx_yl,
                SUM(g.zd_yl + g.xd_yl + g.h_yl + g.l_yl + g.k_yl + g.m_yl + g.q_yl) AS sb_yl,
                SUM(g.yxxz) AS yxxz
            FROM gameshist_record g
            INNER JOIN user u ON u.Id = g.userId   -- ✅ userId 关联
            ${virtualJoin}
            WHERE ${condition}
            GROUP BY g.userId, u.username, g.reference_name  -- ✅ GROUP BY userId
        `;
        let rows = await mysql.query("bjl", sql, args);
        return { err: null, data: rows };
    } catch(err){
        console.error("err:", JSON.stringify(err));
        return { err: err, data: null }
    }
};

playerDao.playerDetailsQueryByRound = async function(msg){
    let condition = " group_nickname = ? ";
    let args = [msg.group_nickname];

    if(msg.shoe){
        condition += " and cc = ? ";
        args.push(msg.shoe);  
    }

    if(msg.round){
        condition += " and jc = ? ";
        args.
        push(msg.round);  
    }

    if (msg.date){ 
        condition += " and statistics_date = ?";
        args.push(msg.date);  
    }

    try{
        let sql = `select 
            IFNULL(sum(z), 0) as z,
            IFNULL(sum(x), 0) as x,
            IFNULL(sum(zd), 0) as zd,
            IFNULL(sum(xd), 0) as xd,
            IFNULL(sum(h), 0) as h,
            IFNULL(sum(m), 0) as m,
            IFNULL(sum(l), 0) as l,
            IFNULL(sum(q), 0) as q,

            IFNULL(SUM(CASE 
                WHEN (z > 0 OR x > 0)
                THEN yxxz
                ELSE 0
            END),0) as xml_zx,

            IFNULL(SUM(CASE 
                WHEN (zd > 0 OR xd > 0 OR h > 0)
                THEN yxxz
                ELSE 0
            END),0) as xml_sb,

            IFNULL(sum(z_yl + x_yl), 0) as zx_yl,
            IFNULL(sum(zd_yl + xd_yl + h_yl + l_yl + k_yl + m_yl + q_yl), 0) as sb_yl,
            IFNULL(sum(yxxz), 0) as yxxz
            from gameshist_record
            where ${condition}` 

        let rows = await mysql.query("bjl", sql, args);
return {err: null, data: rows};
    }catch(err){
        console.error("err:",JSON.stringify(err));
        return {err:err,data:null}
    }
}

playerDao.playerDetailsQueryByShoe = async function(msg){
    let condition = " g.group_nickname = ? ";
    let args = [msg.group_nickname];

    if (msg.name){ 
        condition += " AND u.username = ? ";   // ✅ 改成 user 表过滤
        args.push(msg.name);  
    }
    if (msg.startTime){ 
        condition += " AND g.statistics_date BETWEEN ? AND ? ";
        args.push(msg.startTime, msg.endTime);  
    }

    try{
        let sql = `
            SELECT 
                g.cc,
                MAX(g.reference_name) AS reference_name,
                MAX(u.username) AS username,     -- ✅ 从 user 实时取
                SUM(CASE WHEN (g.z > 0 OR g.x > 0) THEN g.yxxz ELSE 0 END) AS xml_zx,
                SUM(CASE WHEN (g.zd > 0 OR g.xd > 0 OR g.h > 0) THEN g.yxxz ELSE 0 END) AS xml_sb,
                SUM(g.z + g.x) AS xz_xz,
                SUM(g.z_yl + g.x_yl) AS xz_yl,
                SUM(g.yxxz) AS yxxz
            FROM gameshist_record g
            INNER JOIN user u ON u.Id = g.userId   -- ✅ userId 关联
            WHERE ${condition}
            GROUP BY g.cc
            ORDER BY g.cc
        `;
        let rows = await mysql.query("bjl", sql, args);
        return { err: null, data: rows };
    } catch(err){
        console.error("err:", JSON.stringify(err));
        return { err: err, data: null }
    }
}

playerDao.getPlayerBetData = async function (msg) {
    try {
        if (!msg.group_nickname || !msg.statistics_date) {
            return {
                err: "group_nickname 和 statistics_date 不能为空",
                data: null
            };
        }

        let condition = `
            g.group_nickname = ?
            AND g.statistics_date = ?
        `;

        const args = [
            msg.group_nickname,
            msg.statistics_date
        ];

        // 指定玩家
        if (msg.name && String(msg.name).trim() !== "") {
            condition += `
                AND u.username = ?
            `;

            args.push(String(msg.name).trim());
        }

        // 指定场次
        if (
            msg.shoe !== undefined &&
            msg.shoe !== null &&
            msg.shoe !== ""
        ) {
            condition += `
                AND g.cc = ?
            `;

            args.push(Number(msg.shoe));
        }

        // 指定局次
        if (
            msg.round !== undefined &&
            msg.round !== null &&
            msg.round !== ""
        ) {
            condition += `
                AND g.jc = ?
            `;

            args.push(Number(msg.round));
        }

        const selectFields = `
            u.username AS userName,
            g.userId,

            COALESCE(SUM(g.z), 0) AS z,
            COALESCE(SUM(g.x), 0) AS x,
            COALESCE(SUM(g.h), 0) AS h,
            COALESCE(SUM(g.zd), 0) AS zd,
            COALESCE(SUM(g.xd), 0) AS xd,
            COALESCE(SUM(g.m), 0) AS m,
            COALESCE(SUM(g.l), 0) AS l,
            COALESCE(SUM(g.k), 0) AS k,
            COALESCE(SUM(g.q), 0) AS q,

            COALESCE(SUM(g.xz), 0) AS total_xz,
            COALESCE(SUM(g.yxxz), 0) AS total_yxxz
        `;

        // 先查当前下注表
        let sql = `
            SELECT
                ${selectFields}

            FROM gameshist g

            INNER JOIN user u
                ON u.Id = g.userId
                AND u.yxtz = 1

            WHERE ${condition}
              AND g.closed = 0

            GROUP BY
                g.userId,
                u.username

            ORDER BY
                u.username ASC
        `;

        let rows = await mysql.query("bjl", sql, args);

        // 当前下注表没有数据，再查已结算记录表
        if (!rows || rows.length === 0) {
            sql = `
                SELECT
                    ${selectFields}

                FROM gameshist_record g

                INNER JOIN user u
                    ON u.Id = g.userId

                WHERE ${condition}

                GROUP BY
                    g.userId,
                    u.username

                ORDER BY
                    u.username ASC
            `;

            rows = await mysql.query("bjl", sql, args);
        }

        return {
            err: null,
            data: rows || []
        };
    } catch (err) {
        console.error("getPlayerBetData err:", err);

        return {
            err: err.message || err,
            data: null
        };
    }
};

playerDao.getPlayerScoreData = async function (msg) {
    try {
        if (!msg.group_nickname || !msg.statistics_date) {
            return {
                err: "group_nickname 和 statistics_date 不能为空",
                data: null
            };
        }

        const startDate = String(msg.statistics_date).substring(0, 10);

        /*
         * 直接通过日期字符串计算下一天，
         * 避免服务器时区影响日期。
         */
        const dateParts = startDate.split("-");

        const endDate = new Date(
            Number(dateParts[0]),
            Number(dateParts[1]) - 1,
            Number(dateParts[2]) + 1
        );

        const nextDate =
            endDate.getFullYear() +
            "-" +
            String(endDate.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(endDate.getDate()).padStart(2, "0");

        const hasShoe =
            msg.shoe !== undefined &&
            msg.shoe !== null &&
            msg.shoe !== "";

        const hasRound =
            msg.round !== undefined &&
            msg.round !== null &&
            msg.round !== "";

        // 固定本次查询使用的靴、局。SQL 过滤和返回字段共用这两个值，
        // 避免路由在查询结束后再从可变的 msg 补写，造成显示条件不一致。
        const queryShoe = hasShoe ? Number(msg.shoe) : null;
        const queryRound = hasRound ? Number(msg.round) : null;

        const historyArgs = [
            msg.group_nickname,
            startDate,
            nextDate
        ];

        const shoeFilterSql = hasShoe ? " AND history.cc = ?" : "";
        const roundFilterSql = hasRound ? " AND history.jc = ?" : "";

        if (hasShoe) historyArgs.push(queryShoe);
        if (hasRound) historyArgs.push(queryRound);

        let sql = `
            SELECT
                gm.playername AS userName,
                ? AS shoe,
                ? AS round,
                COALESCE(profit.yl, 0) AS yl,
                COALESCE(u.score, 0) + COALESCE(open_bets.xz, 0) AS score,
                COALESCE(u.raw_score, 0) AS raw_score,
                COALESCE(u.daily_points, 0) AS daily_points,
                COALESCE(u.total_points, 0) AS total_points

            FROM group_member gm

            /*
             * 以群成员为主。group_member.userId 的旧数据可能不准确，
             * 继续使用玩家名称关联；user 不存在时仍保留群成员。
             */
            LEFT JOIN user u
                ON u.username = gm.playername

            /*
             * 指定群、营业日和靴局的盈利先按玩家一次汇总。
             * 历史表与尚未搬表的已结算记录使用 UNION ALL 合并；
             * NOT EXISTS 保持原有去重语义。
             */
            LEFT JOIN (
                SELECT
                    combined.userId,
                    SUM(COALESCE(combined.yl, 0)) AS yl
                FROM (
                    SELECT
                        history.userId,
                        history.yl
                    FROM gameshist_record history
                    WHERE history.group_nickname = ?
                      AND history.statistics_date >= ?
                      AND history.statistics_date < ?
                      ${shoeFilterSql}
                      ${roundFilterSql}

                    UNION ALL

                    SELECT
                        history.userId,
                        history.yl
                    FROM gameshist history
                    WHERE history.group_nickname = ?
                      AND history.statistics_date >= ?
                      AND history.statistics_date < ?
                      ${shoeFilterSql}
                      ${roundFilterSql}
                      AND history.closed = 1
                      AND NOT EXISTS (
                          SELECT 1
                          FROM gameshist_record archived
                          WHERE archived.Id = history.Id
                            AND archived.statistics_date = history.statistics_date
                      )
                ) combined
                GROUP BY combined.userId
            ) profit
                ON profit.userId = u.Id

            /*
             * 当前可用分仍加上该玩家在所有群、所有日期的未结算下注，
             * 但整张当前表只汇总一次，不再为每位群成员重复扫描。
             */
            LEFT JOIN (
                SELECT
                    h.userId,
                    SUM(COALESCE(h.xz, 0)) AS xz
                FROM gameshist h
                WHERE h.closed = 0
                GROUP BY h.userId
            ) open_bets
                ON open_bets.userId = u.Id
        `;

        const args = [
            queryShoe,
            queryRound,
            ...historyArgs,
            ...historyArgs
        ];

        /*
         * 只返回指定群里的成员。
         */
        sql += `
            WHERE gm.group_nickname = ?
        `;

        args.push(msg.group_nickname);

        /*
         * 按玩家名称过滤。
         */
        if (
            msg.name !== undefined &&
            msg.name !== null &&
            String(msg.name).trim() !== ""
        ) {
            sql += `
                AND gm.playername = ?
            `;

            args.push(String(msg.name).trim());
        }

        sql += `
            ORDER BY
                gm.is_top DESC,
                gm.sort_order ASC,
                gm.playername ASC
        `;

        // console.log(
        //     "getPlayerScoreData sql:",
        //     sql
        // );

        // console.log(
        //     "getPlayerScoreData args:",
        //     args
        // );

        const rows = await mysql.query(
            "bjl",
            sql,
            args
        );

        return {
            err: null,
            data: rows || []
        };
    } catch (err) {
        console.error(
            "getPlayerScoreData err:",
            err
        );

        return {
            err: err.message || err,
            data: null
        };
    }
};

playerDao.getRemainingScoreSummary = async function(msg){
    try{
        let sql = `SELECT 
            COALESCE(SUM(score), 0) as total_score,
            COALESCE(SUM(raw_score), 0) as total_raw_score
            FROM user
            WHERE is_virtual = 0`;
        let args = [];
        let res = await mysql.query("bjl",sql,args);
        return{err:null,data:res};
    }catch(err){
        return {err:err,data:null};
    }
}



playerDao.getProfitInfo = async function(msg) {
    try {
        let sql = `
            SELECT 
                COALESCE(SUM(zyk), 0) as zyk,
                COALESCE(SUM(sbltyk), 0) as sblyk,
                COALESCE(SUM(ltyk), 0) as ltyk,
                COALESCE(SUM(dcyk), 0) as dcyk,
                COALESCE(SUM(gyk), 0) as gyk
            FROM game_jc_total 
            WHERE statistics_date >= ?
        `;

        let args = [ msg.statistics_date];
        let res = await mysql.query("bjl", sql, args);
        return { err: null, data: res };

    } catch (err) {
        return { err: err, data: null };
    }
}

playerDao.statisticsSbPercentageByShoe = async function(msg){
//try{
   let sql = `
    SELECT 
        g.cc as shoe,
        g.jc as round,
        MAX(g.kj) as kj,
        
        COALESCE(SUM(g.zd * f.sb_personal_share / 100), 0) as g_zd,
        COALESCE(SUM(g.xd * f.sb_personal_share / 100), 0) as g_xd,
        COALESCE(SUM(g.h * f.sb_personal_share / 100), 0) as g_h,
        COALESCE(SUM(g.m * f.sb_personal_share / 100), 0) as g_m,
        COALESCE(SUM(g.q * f.sb_personal_share / 100), 0) as g_q,
        COALESCE(SUM(g.l * f.sb_personal_share / 100), 0) as g_l

    FROM gameshist_record g
    INNER JOIN user u ON u.Id = g.userId                  -- ✅ userId 关联
    LEFT JOIN finance_personal_setup f ON 
        g.userId = f.userId                               -- 按 userId 关联，兼容玩家改名
        AND g.group_nickname = f.group_nickname
        AND f.bp_personal_share > 0
    WHERE g.cc = ?
        AND g.statistics_date BETWEEN ? AND ?
    GROUP BY g.cc, g.jc
    ORDER BY g.cc, g.jc;`
    
    let args = [msg.shoe, msg.startTime, msg.endTime];
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  // } catch(err) {
  //     return {err:err,data:null};
  // }
}

playerDao.clearBetData = async function(msg){
    try {
        // ✅ 改成 userId 分组，同时统计需要减少的 freeze_score
        let sql = "SELECT SUM(xz) AS xz, userId FROM gameshist WHERE group_nickname = ? AND statistics_date >= ? AND closed = 0 GROUP BY userId";
        let args = [msg.group_nickname, msg.statistics_date];
        let rows = await mysql.query("bjl", sql, args);

        if(rows.length > 0){
            let sqlParamsEntity = [];
            for(let item of rows){
                // ✅ 【修复】同时更新 score 和 freeze_score
                // score 增加（退款），freeze_score 减少（清理冻结分）
                sql = "UPDATE user SET score = score + ?, freeze_score = COALESCE(freeze_score, 0) - ? WHERE Id = ?";
                sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, [item.xz, item.xz, item.userId]));
            }
            
            // 删除 gameshist 记录
            sql = "DELETE FROM gameshist WHERE group_nickname = ? AND statistics_date >= ? AND closed = 0";
            sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, [msg.group_nickname, msg.statistics_date]));

            let resTran = await mysql.tranExecSync("bjl", sqlParamsEntity);
            if(resTran){
                console.log("[清空投注表] 成功清理，退款并减少冻结分: " + rows.length + " 个用户");
                return { err: null, data: resTran };
            } else {
                return { err: "清空投注表失败", data: null };
            }
        } else {
            return { err: null, data: "ok" };
        }
    } catch(err){
        console.error("清空投注表err:", JSON.stringify(err));
        return { err: err, data: null };
    }
}

playerDao.MoveDataToLogGame = async function() {
    if (global.moveDataInterval) {
        clearTimeout(global.moveDataInterval);
    }

    try {
        // 1️⃣ 获取需要迁移的数据
        let selectSql = "SELECT * FROM gameshist WHERE closed = 1 ORDER BY Id LIMIT 100";
        let records = await mysql.query("bjl", selectSql, []);

        if (!records || records.length === 0) {
            //console.log("没有需要迁移的数据");
            return;
        }

        // 积分以 gameshist 为唯一处理源。开奖通常已经完成积分累计；这里仅为
        // 升级前遗留数据或开奖后进程异常提供补偿。必须先处理积分再搬表，
        // 避免 gameshist 与 gameshist_record 同时成为积分来源而重复累计。
        const pendingPointIds = records
            .filter(record => Number(record.points_processed) !== 1)
            .map(record => record.Id);

        if (pendingPointIds.length > 0) {
            const pointResult = await this.updateDailyPointsByGameId(
                records,
                pendingPointIds,
                { sourceTable: "gameshist" }
            );

            if (pointResult.err) {
                console.error("搬表前积分补偿失败:", pointResult.err);
                return;
            }
        }

        // 重新读取处理状态。若另一个开奖/搬表事务正在竞争，只有已确认完成
        // 积分处理的记录才允许进入历史表。
        const recordKeys = records.map(record => record.Id);
        const processedRows = await mysql.query(
            "bjl",
            "SELECT Id, statistics_date, points_processed FROM gameshist WHERE Id IN (?) AND closed = 1",
            [recordKeys]
        );
        const processedKeys = new Set(
            (processedRows || [])
                .filter(record => Number(record.points_processed) === 1)
                .map(record => `${record.Id}\u0000${new Date(record.statistics_date).getTime()}`)
        );
        records = records.filter(record =>
            processedKeys.has(`${record.Id}\u0000${new Date(record.statistics_date).getTime()}`)
        );

        if (records.length === 0) return;

        // 2️⃣ 批量插入目标表
        let insertSql = "INSERT IGNORE INTO gameshist_record SET ?";
        let insertPromises = records.map(record => {
            const rowToInsert = {};
            for (const key of Object.keys(record)) {
                if (!key.startsWith("_")) {
                    rowToInsert[key] = record[key];
                }
            }
            return mysql.query("bjl", insertSql, [rowToInsert]);
        });
        let insertResults = await Promise.all(insertPromises);

        // 3️⃣ 找出本轮新插入的记录。affectedRows = 0 通常表示目标表中已存在，
        // 这类数据可能是上次已插入但源表删除失败，需确认后继续清理源表。
        let successIds = [];
        let ignoredRecords = [];
        for (let i = 0; i < insertResults.length; i++) {
            if (insertResults[i].affectedRows > 0) {
                successIds.push(records[i].Id);
            } else {
                ignoredRecords.push(records[i]);
            }
        }

        let confirmedDuplicateKeys = new Set();
        if (ignoredRecords.length > 0) {
            const ignoredIds = [...new Set(ignoredRecords.map(record => record.Id))];
            const existingRows = await mysql.query(
                "bjl",
                "SELECT Id, statistics_date FROM gameshist_record WHERE Id IN (?)",
                [ignoredIds]
            );

            confirmedDuplicateKeys = new Set(
                (existingRows || []).map(record =>
                    `${record.Id}\u0000${new Date(record.statistics_date).getTime()}`
                )
            );
        }

        const migratedRecords = records.filter((record, index) => {
            if (insertResults[index].affectedRows > 0) return true;
            const key = `${record.Id}\u0000${new Date(record.statistics_date).getTime()}`;
            return confirmedDuplicateKeys.has(key);
        });

        // 4️⃣ 删除本轮新插入以及已确认存在于目标表的记录。
        // 使用复合主键精确删除，避免只按 Id 误删其他营业日的数据。
        if (migratedRecords.length > 0) {
            const deleteConditions = migratedRecords
                .map(() => "(Id = ? AND statistics_date = ?)")
                .join(" OR ");
            const deleteArgs = [];
            migratedRecords.forEach(record => {
                deleteArgs.push(record.Id, record.statistics_date);
            });
            const deleteSql = `DELETE FROM gameshist WHERE closed = 1 AND (${deleteConditions})`;
            await mysql.query("bjl", deleteSql, deleteArgs);

            // 搬表后按群和营业日去重刷新，确保历史表与即时汇总保持一致。
            const affectedStatistics = new Map();
            migratedRecords.forEach(record => {
                const key = `${record.group_nickname}\u0000${record.statistics_date}`;
                affectedStatistics.set(key, {
                    group_nickname: record.group_nickname,
                    statistics_date: record.statistics_date
                });
            });

            const totalResults = await Promise.all(
                Array.from(affectedStatistics.values()).map(item =>
                    financialInquiriesDao.total_gameshist_day(item)
                )
            );
            totalResults.forEach(result => {
                if (result.err) {
                    console.error("搬表后实时汇总失败:", result.err);
                }
            });
        }

        console.log(
            `批量迁移完成: 新增 ${successIds.length} 条, ` +
            `恢复清理 ${migratedRecords.length - successIds.length} 条, ` +
            `待处理 ${records.length - migratedRecords.length} 条`
        );
    } catch (err) {
        console.error("数据迁移出错:", JSON.stringify(err));
    } finally {
        // 5️⃣ 设置下一次执行
        global.moveDataInterval = setTimeout(() => {
            playerDao.MoveDataToLogGame();
        }, 3000);
    }
};

async function addYxxzAndUpdatePoints(group_nickname, userId, yxxz, ratioBase = 1000, ratioPoints = 3, rid) {
    // 1. 累加 yxxz 到 total_yxxz
    await mysql.query("bjl", `
        INSERT INTO points_group_user (group_nickname, userId, total_yxxz, points)
        VALUES (?, ?, ?, 0)
        ON DUPLICATE KEY UPDATE total_yxxz = total_yxxz + ?
    `, [group_nickname, userId, yxxz, yxxz]);

    // 2. 查询最新的 total_yxxz
    let rows = await mysql.query("bjl", `
        SELECT total_yxxz FROM points_group_user WHERE group_nickname = ? AND userId = ?
    `, [group_nickname, userId]);
    
    if (!rows || rows.length === 0) return;
    
    let row = rows[0];
    
    // ✅ 【修复】用 Math.floor 向下取整，不用 Math.round
    let canExchange = Math.floor(row.total_yxxz / ratioBase);
    
    if (canExchange > 0) {
        // ✅ 【修复】points 只记录可兑换的积分（整数）
        let addPoints = canExchange * ratioPoints;  // 例：3 * 3 = 9
        
        // ✅ 【修复】剩余的 yxxz = 总 yxxz - 已兑换的 yxxz
        let minusYxxz = row.total_yxxz - (canExchange * ratioBase);  // 例：3500 - 3000 = 500

        console.log(`[积分兑换] group=${group_nickname}, userId=${userId}, total_yxxz=${row.total_yxxz}, ratioBase=${ratioBase}, canExchange=${canExchange}, addPoints=${addPoints}, remaining=${minusYxxz}`);

        // 3. 更新 points_group_user：只记录本次可兑换的积分（不是累加）
        await mysql.query("bjl", `
            UPDATE points_group_user 
            SET points = ?, total_yxxz = ? 
            WHERE group_nickname = ? AND userId = ?
        `, [addPoints, minusYxxz, group_nickname, userId]);

        // 4. 更新 user 表
        await mysql.query("bjl", `
            UPDATE user 
            SET daily_points = daily_points + ?, total_points = total_points + ? 
            WHERE Id = ?
        `, [addPoints, addPoints, userId]);

        // 5. 更新 gameshist_record
        await mysql.query("bjl", `
            UPDATE gameshist_record 
            SET points = ? 
            WHERE Id = ?
        `, [addPoints, rid]);
    }
}

playerDao.updateDailyPointsByGameId = async function (
    records,
    successIds,
    options = {}
) {
    try {
        const sourceTable = options.sourceTable || "gameshist_record";
        if (sourceTable !== "gameshist" && sourceTable !== "gameshist_record") {
            return { err: "不支持的积分来源表", data: null };
        }

        if (
            !Array.isArray(records) ||
            !Array.isArray(successIds) ||
            successIds.length === 0
        ) {
            return {
                err: null,
                data: "ok"
            };
        }

        const successIdSet = new Set(
            successIds.map(id => String(id))
        );

        // 只处理本次成功迁移的记录
        let filteredRecords = records.filter(record => {
            return successIdSet.has(String(record.Id)) &&
                Number(record.points_processed) !== 1;
        });

        if (filteredRecords.length === 0) {
            return {
                err: null,
                data: "ok"
            };
        }

        // 即使玩家已被删除或有效流水为0，也必须把下注记录标记为已检查，
        // 否则这类记录会永久占据搬表队列。只有可识别玩家的正流水参与积分。
        const claimRecords = filteredRecords.slice();

        /*
         * 查询用户：
         * 1. 排除虚拟用户(这里改成不排除)
         * 2. 使用userId作为唯一身份
         * 3. 获取当前username写入points_group_user.player_name
         */
        const userIds = [
            ...new Set(
                filteredRecords
                    .map(record => Number(record.userId))
                    .filter(userId => userId > 0)
            )
        ];

        const userRows = userIds.length === 0
            ? []
            : await mysql.query(
                "bjl",
                `
                    SELECT
                        Id,
                        username,
                        IFNULL(is_virtual, 0) AS is_virtual
                    FROM user
                    WHERE Id IN (?)
                `,
                [userIds]
            );

        const userMap = {};

        for (const user of userRows || []) {
            userMap[String(user.Id)] = {
                Id: Number(user.Id),
                username: user.username,
                is_virtual: Number(user.is_virtual) || 0
            };
        }

        filteredRecords = filteredRecords.filter(record => {
            const user = userMap[String(record.userId)];

            if (!user ) {                   // || user.is_virtual === 1
                return false;
            }

            return true;
        });

        // 查询每个群的积分流水基数
        const groupNicknames = [
            ...new Set(
                filteredRecords
                    .map(record => record.group_nickname)
                    .filter(Boolean)
            )
        ];

        let configRows = [];

        if (groupNicknames.length > 0) {
            configRows = await mysql.query(
                "bjl",
                `
                    SELECT
                        group_nickname,
                        points_exchange_ratio
                    FROM group_parameter_setup
                    WHERE group_nickname IN (?)
                `,
                [groupNicknames]
            );
        }

        const groupConfigMap = {};

        for (const config of configRows || []) {
            groupConfigMap[config.group_nickname] = {
                points_exchange_ratio:
                    Number(config.points_exchange_ratio) || 1000
            };
        }

        /*
         * 按“群 + userId”合并本批次流水。
         *
         * 同一玩家同一群一次迁移了多条记录时，
         * 先合计，再一次性写入数据库。
         */
        const groupMap = {};

        for (const record of filteredRecords) {
            const userId = Number(record.userId);
            const groupNickname = record.group_nickname;
            const yxxz = Number(record.yxxz) || 0;

            if (
                !groupNickname ||
                userId <= 0 ||
                yxxz <= 0
            ) {
                continue;
            }

            const key = groupNickname + "#" + userId;

            if (!groupMap[key]) {
                const user = userMap[String(userId)];
                groupMap[key] = {
                    group_nickname: groupNickname,
                    userId,
                    player_name: user ? user.username : "",
                    totalYxxz: 0,
                    recordRefs: []
                };
            }

            groupMap[key].totalYxxz += yxxz;
            groupMap[key].recordRefs.push({
                Id: record.Id,
                statistics_date: record.statistics_date
            });
        }

        const sqlParamsEntity = [];

        // 必须在同一个事务中先取得每条记录的积分处理权。并发开奖或搬表中，
        // 只有 points_processed 从 0 改为 1 的事务可以继续累计积分；失败事务
        // 会整体回滚，从而保证一条下注最多贡献一次积分。
        for (const record of claimRecords) {
            sqlParamsEntity.push(
                mysql._getNewSqlParamEntity(
                    `UPDATE ${sourceTable}
                     SET points_processed = 1
                     WHERE Id = ?
                       AND statistics_date = ?
                       AND closed = 1
                       AND points_processed = 0`,
                    [record.Id, record.statistics_date]
                )
            );
        }

        for (const key of Object.keys(groupMap)) {
            const item = groupMap[key];

            const config =
                groupConfigMap[item.group_nickname] || {};

            /*
             * points_exchange_ratio 表示多少有效流水产生1积分。
             * 没有配置或者配置错误时，默认1000流水产生1积分。
             */
            let ratioBase =
                Number(config.points_exchange_ratio) || 1000;

            if (ratioBase <= 0) {
                ratioBase = 1000;
            }

            const currentYxxz =
                Number(item.totalYxxz) || 0;

            if (currentYxxz <= 0) {
                continue;
            }

            /*
             * 第一步：
             * 无论本批流水是否达到1000，都先累加进total_yxxz。
             *
             * 注意：
             * points这里不增加，后面的SQL根据累计后的total_yxxz
             * 统一计算应该增加多少积分。
             */
            sqlParamsEntity.push(
                mysql._getNewSqlParamEntity(
                    `
                        INSERT INTO points_group_user
                        (
                            group_nickname,
                            userId,
                            player_name,
                            total_yxxz,
                            points
                        )
                        VALUES (?, ?, ?, ?, 0)
                        ON DUPLICATE KEY UPDATE
                            player_name = VALUES(player_name),
                            total_yxxz =
                                COALESCE(total_yxxz, 0) +
                                VALUES(total_yxxz)
                    `,
                    [
                        item.group_nickname,
                        item.userId,
                        item.player_name,
                        currentYxxz
                    ]
                )
            );

            /*
             * 第二步：
             * 根据累加后的total_yxxz更新user积分。
             *
             * 例如：
             * 原来700 + 本次600 = 1300
             * FLOOR(1300 / 1000) = 1积分
             */
            sqlParamsEntity.push(
                mysql._getNewSqlParamEntity(
                    `
                        UPDATE user u
                        INNER JOIN points_group_user pgu
                            ON pgu.userId = u.Id
                           AND pgu.group_nickname = ?
                        SET
                            u.daily_points =
                                COALESCE(u.daily_points, 0) +
                                FLOOR(
                                    COALESCE(pgu.total_yxxz, 0) / ?
                                ),
                            u.total_points =
                                COALESCE(u.total_points, 0) +
                                FLOOR(
                                    COALESCE(pgu.total_yxxz, 0) / ?
                                )
                        WHERE u.Id = ?
                    `,
                    [
                        item.group_nickname,
                        ratioBase,
                        ratioBase,
                        item.userId
                    ]
                )
            );

            /*
             * 第三步：
             * 将本次产生的积分记录到最后一条历史记录。
             *
             * 如果累计后仍不足1000，这里写入0。
             */
            const lastRecord =
                item.recordRefs[item.recordRefs.length - 1];

            sqlParamsEntity.push(
                mysql._getNewSqlParamEntity(
                    `
                        UPDATE ${sourceTable} ghr
                        INNER JOIN points_group_user pgu
                            ON pgu.userId = ?
                           AND pgu.group_nickname = ?
                        SET ghr.points =
                            FLOOR(
                                COALESCE(pgu.total_yxxz, 0) / ?
                            )
                        WHERE ghr.Id = ?
                          AND ghr.statistics_date = ?
                    `,
                    [
                        item.userId,
                        item.group_nickname,
                        ratioBase,
                        lastRecord.Id,
                        lastRecord.statistics_date
                    ]
                )
            );

            /*
             * 第四步：
             * 1. 新积分累加到points，不能覆盖以前的积分
             * 2. total_yxxz只保留不足一个积分基数的余数
             *
             * 例如：
             * total_yxxz = 3500
             * points增加3
             * total_yxxz剩500
             */
            sqlParamsEntity.push(
                mysql._getNewSqlParamEntity(
                    `
                        UPDATE points_group_user
                        SET
                            points =
                                COALESCE(points, 0) +
                                FLOOR(
                                    COALESCE(total_yxxz, 0) / ?
                                ),
                            total_yxxz =
                                MOD(
                                    COALESCE(total_yxxz, 0),
                                    ?
                                ),
                            player_name = ?
                        WHERE group_nickname = ?
                          AND userId = ?
                    `,
                    [
                        ratioBase,
                        ratioBase,
                        item.player_name,
                        item.group_nickname,
                        item.userId
                    ]
                )
            );

            console.log(
                "[积分流水累计]",
                "group=" + item.group_nickname,
                "userId=" + item.userId,
                "本批流水=" + currentYxxz,
                "积分基数=" + ratioBase
            );
        }

        if (sqlParamsEntity.length === 0) {
            return {
                err: null,
                data: "ok"
            };
        }

        /*
         * 同一个事务完成：
         * 1. 累加流水
         * 2. 更新user积分
         * 3. 更新历史记录积分
         * 4. 增加群积分并扣除已计算流水
         */
        const transactionResult =
            await mysql.tranExecSync(
                "bjl",
                sqlParamsEntity
            );

        if (!transactionResult) {
            return {
                err: "积分累计事务执行失败",
                data: null
            };
        }

        return {
            err: null,
            data: "ok"
        };
    } catch (err) {
        console.error(
            "更新积分出错:",
            err
        );

        return {
            err: err.message || err,
            data: null
        };
    }

};

// 开奖完成后立即累计本局积分。查询只包含已经成功结算且尚未处理积分的记录，
// 重新开奖使用 gameshist_record，不会进入这里，因此不会重复累计。
playerDao.updatePointsAfterSettlement = async function (msg, rInfo) {
    try {
        const queryArgs = [
            msg.roomId || rInfo.Id,
            msg.cc,
            msg.jc,
            msg.group_nickname || rInfo.group_nickname,
            rInfo.statistics_date
        ];
        const rows = await mysql.query(
            "bjl",
            `SELECT *
             FROM gameshist
             WHERE roomId = ?
               AND cc = ?
               AND jc = ?
               AND group_nickname = ?
               AND statistics_date = ?
               AND closed = 1
               AND points_processed = 0
             ORDER BY Id`,
            queryArgs
        );

        if (!rows || rows.length === 0) {
            return { err: null, data: "ok" };
        }

        const result = await playerDao.updateDailyPointsByGameId(
            rows,
            rows.map(row => row.Id),
            { sourceTable: "gameshist" }
        );

        if (!result.err) return result;

        // 若刚好与补偿搬表竞争，另一事务可能已经完成。再次确认本局不存在
        // 未处理记录即可视为成功，否则让开奖返回错误，避免静默漏积分。
        const pendingRows = await mysql.query(
            "bjl",
            `SELECT Id
             FROM gameshist
             WHERE roomId = ?
               AND cc = ?
               AND jc = ?
               AND group_nickname = ?
               AND statistics_date = ?
               AND closed = 1
               AND points_processed = 0
             LIMIT 1`,
            queryArgs
        );

        return pendingRows && pendingRows.length > 0
            ? result
            : { err: null, data: "ok" };
    } catch (err) {
        console.error("开奖后即时积分失败:", err);
        return { err, data: null };
    }
};

/**
 * 查询玩家活跃度（按下注记录统计）
 * msg: { group_nickname, startTime, endTime, page, pageSize }
 * 返回 { err: null, data: { list: [{ username, bet_count, total_bet, last_bet }], total } }
 */
playerDao.getPlayerActivity = async function(msg){
    try {
        let page = Number(msg.page || msg.currentPage) || 1;
        let pageSize = Math.max(1, Math.min(500, Number(msg.pageSize) || 50));
        let offset = (page - 1) * pageSize;

        let where = " WHERE 1=1 ";
        let args = [];

        if (msg.group_nickname && msg.group_nickname !== "" && msg.group_nickname !== "全部") {
            where += " AND g.group_nickname = ? ";
            args.push(msg.group_nickname);
        }

        if (msg.startTime && msg.endTime) {
            where += " AND g.stat_date BETWEEN ? AND ? ";
            args.push(msg.startTime, msg.endTime);
        } else if (msg.startTime) {
            where += " AND g.stat_date >= ? ";
            args.push(msg.startTime);
        } else if (msg.endTime) {
            where += " AND g.stat_date <= ? ";
            args.push(msg.endTime);
        }

        // ✅ 改成 userId 去重统计
        const countSql = `SELECT COUNT(DISTINCT g.userId) AS total FROM gameshist_record_day g ${where}`;
        const countRows = await mysql.query("bjl", countSql, args);
        const total = (countRows[0] && countRows[0].total) ? Number(countRows[0].total) : 0;

        // ✅ JOIN user 实时取 username
        const listSql = `
            SELECT
                u.username,
                u.reference_name,
                IFNULL(SUM(g.xml_zx + g.xml_sb), 0) AS bet_count,
                IFNULL(SUM(g.yxxz), 0) AS total_bet,
                IFNULL(SUM(g.z_yl + g.x_yl + g.zd_yl + g.xd_yl + g.h_yl + g.l_yl + g.k_yl + g.m_yl + g.q_yl), 0) AS total_yl,
                MAX(g.stat_date) AS last_bet
            FROM gameshist_record_day g 
            INNER JOIN user u ON u.Id = g.userId
            ${where}
            GROUP BY g.userId
            ORDER BY bet_count DESC, total_bet DESC, last_bet DESC
            LIMIT ?, ?
        `;
        const listArgs = args.concat([offset, pageSize]);
        const rows = await mysql.query("bjl", listSql, listArgs);

        return {
            err: null,
            data: { list: rows || [], total, currentPage: page, pageSize }
        };
    } catch (err) {
        console.error("getPlayerActivity err:", err);
        return { err: err, data: null };
    }
};

