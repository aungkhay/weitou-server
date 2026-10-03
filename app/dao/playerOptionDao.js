let pomelo = require("pomelo");
let playerOptionDao = module.exports;
let mysql = pomelo.app.get("sqlHelper");

// ...existing code...
playerOptionDao.getPlayerDetail = async function (msg) {
    try {
        // 保持现有分页逻辑
        let page = Number(msg.page || msg.currentPage) || 1;
        let pageSize = Number(msg.pageSize || msg.size) || 20;
        pageSize = Math.max(1, Math.min(200, pageSize));
        let offset = (page - 1) * pageSize;

        const whereParts = [];
        const args = [];

        if (msg.group_nickname && msg.group_nickname !== "" && msg.group_nickname !== "全部") {
            whereParts.push("gm.group_nickname = ?");
            args.push(msg.group_nickname);
        }

        if (msg.player_name && msg.player_name !== "") {
            whereParts.push("gm.playername = ?");
            args.push(msg.player_name);
        }

        const mainWhere = whereParts.length ? (" WHERE " + whereParts.join(" AND ")) : "";

        // 从 gameshist_record_day 聚合取得各类总和（不包含时间筛选）
        const aggSql = `
            (SELECT 
                ghd.userId AS userId,
                MAX(ghd.group_nickname) AS group_nickname,
                IFNULL(SUM(ghd.z_yl + ghd.x_yl), 0) AS total_xzyl,
                IFNULL(SUM(ghd.zd_yl + ghd.xd_yl + ghd.h_yl + ghd.m_yl + ghd.l_yl + ghd.k_yl + ghd.q_yl), 0) AS total_sbyl,
                IFNULL(SUM(ghd.xml_sb), 0) AS total_xml_sb,
                IFNULL(SUM(ghd.xml_zx), 0) AS total_xml_zx,
                IFNULL(SUM(ghd.yxxz), 0) AS total_yxxz,
                IFNULL(SUM(ghd.points), 0) AS daily_points
            FROM gameshist_record_day ghd
            GROUP BY ghd.userId
            ) agg
        `;

        // 主查询：以 group_member 为基准，连接 user，再左连接 agg 取聚合值
        let sql = `
            SELECT 
                gm.group_nickname, 
                gm.playername, 
                u.score, 
                0 AS freeze_score, 
                u.raw_score, 
                u.option_time,
                COALESCE(agg.total_xml_zx, 0) AS total_xml_zx, 
                COALESCE(agg.total_xml_sb, 0) AS total_xml_sb, 
                COALESCE(agg.total_xzyl, 0) AS total_xzyl, 
                COALESCE(agg.total_sbyl, 0) AS total_sbyl, 
                COALESCE(agg.total_yxxz, 0) AS total_yxxz,
                CASE WHEN u.reference_name = 'admin' THEN '' ELSE u.reference_name END AS reference_name,
                COALESCE(u.daily_points, 0) AS daily_points, 
                u.total_points, 
                u.registTime, 
                u.deposit, 
                u.owe_points, 
                gm.is_hide,
                u.is_virtual AS is_virtual
            FROM group_member gm
            LEFT JOIN user u ON gm.playername = u.username
            LEFT JOIN ${aggSql} ON u.Id = agg.userId
            ${mainWhere}
            ORDER BY u.score DESC, gm.playername ASC
        `;

        let rows = await mysql.query("bjl", sql, args);

        // 去重：按 playername 保留第一条出现的记录
        const map = new Map();
        for (const r of rows) {
            const key = r.playername;
            if (!key) continue;
            if (!map.has(key)) {
                map.set(key, Object.assign({}, r));
            }
        }
        const merged = Array.from(map.values());

        // 计算合计（过滤虚拟用户）
        const totalRow = {
            playername: "合计",
            score: 0,
            freeze_score: 0,
            raw_score: 0,
            total_xml_zx: 0,
            total_xml_sb: 0,
            total_xzyl: 0,
            total_sbyl: 0,
            total_yxxz: 0,
            daily_points: 0,
            total_points: 0,
            deposit: 0,
            owe_points: 0
        };

        for (const item of merged) {
            if (Number(item.is_virtual) !== 0) continue;
            totalRow.score += Number(item.score) || 0;
            totalRow.freeze_score += 0;  // Number(item.freeze_score) || 0
            totalRow.raw_score += Number(item.raw_score) || 0;
            totalRow.total_xml_zx += Number(item.total_xml_zx) || 0;
            totalRow.total_xml_sb += Number(item.total_xml_sb) || 0;
            totalRow.total_xzyl += Number(item.total_xzyl) || 0;
            totalRow.total_sbyl += Number(item.total_sbyl) || 0;
            totalRow.total_yxxz += Number(item.total_yxxz) || 0;
            totalRow.daily_points += Number(item.daily_points) || 0;
            totalRow.total_points += Number(item.total_points) || 0;
            totalRow.deposit += Number(item.deposit) || 0;
            totalRow.owe_points += Number(item.owe_points) || 0;
        }

        // 内存分页
        const total = merged.length;
        const pageList = merged.slice(offset, offset + pageSize);

        return {
            err: null,
            data: {
                list: pageList,
                total: total,
                currentPage: page,
                pageSize: pageSize,
                summary: totalRow
            }
        };
    } catch (err) {
        console.error("playerOptionDao.getPlayerDetail err:", err);
        return { err: err.message || err, data: null };
    }
};
// ...existing code...

playerOptionDao.getScoreOptionType = async function (msg) {
    let sql = "select * from score_operation_types";
    let args = [];
    try {
      let res = await mysql.query("bjl", sql, args);
      return { err: null, data: res};
    } catch (err) {
      console.error("err:",JSON.stringify(err));
      return { err: err, data: null }
    }
};

playerOptionDao.add_score = async function(msg){
    try{
        let time = msg.statistics_date;
        let sqlParamsEntity = [];

        // ✅ score_operation_record 补充 userId
        let sql = `INSERT INTO score_operation_record
            (group_nickname, userId, playername, score, before_option_score, option_type, working_date, optioner, memo, bank_card, is_add)
            VALUES(?, (SELECT Id FROM user WHERE username = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        let args = [msg.group_nickname, msg.player_name, msg.player_name, msg.option_score, msg.before_add_score, msg.option_type, time, "大红", "", msg.card_name, 1];
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args));

        if(msg.option_type == "取款"){
            // ✅ user 表改用 Id 更新
            sql = "UPDATE user SET score = score + ?, raw_score = raw_score + ?, deposit = deposit - ?, option_time = ? WHERE username = ? AND deposit >= ?";
            args = [msg.option_score, msg.option_score, msg.option_score, time, msg.player_name, msg.option_score];
        } else if(msg.option_type == "借款"){
            sql = "UPDATE user SET score = score + ?, raw_score = raw_score + ?, owe_points = COALESCE(owe_points, 0) + ?, option_time = ? WHERE username = ?";
            args = [msg.option_score, msg.option_score, msg.option_score, time, msg.player_name];
        } else {
            sql = "UPDATE user SET score = score + ?, raw_score = raw_score + ?, option_time = ? WHERE username = ?";
            args = [msg.option_score, msg.option_score, time, msg.player_name];
        }
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args));

        if(msg.card_name){
            sql = "UPDATE bank_list SET remaining_amount = remaining_amount + ?, bonus_amount = bonus_amount + ? WHERE card_name = ?";
            args = [msg.option_score, msg.option_score, msg.card_name];
            sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args));
            sql = "SELECT * FROM bank_list WHERE card_name = ?";
            let res = await mysql.query("bjl", sql, [msg.card_name]);
            if(res.length > 0){
                let r = res[0];
                sql = `INSERT INTO bank_card_transaction_details(card_type,card_name,card_code,option_amount,before_option_amount,
                desk_number,optioner,option_type,statistics_date) VALUES(?,?,?,?,?,?,?,?,?)`;
                args = [r.card_type, r.card_name, r.card_code, msg.option_score, r.remaining_amount, msg.group_nickname, "大红", "上分", time];
                sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args));
            }
        }
        let res = await mysql.tranExecSync("bjl", sqlParamsEntity);
        return { err: null, data: res };
    } catch(err){
        console.error("err:", JSON.stringify(err));
        return { err: err, data: null };
    }
}

playerOptionDao.subtract_score = async function(msg){
    try{
        let time = msg.statistics_date;
        let sqlParamsEntity = [];

        // ✅ score_operation_record 补充 userId
        let sql = `INSERT INTO score_operation_record
            (group_nickname, userId, playername, score, before_option_score, option_type, optioner, working_date, memo, bank_card, is_add)
            VALUES(?, (SELECT Id FROM user WHERE username = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        let args = [msg.group_nickname, msg.player_name, msg.player_name, msg.option_score, msg.before_add_score, msg.option_type, "大红", time, "", msg.card_name, 2];
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args));

        if(msg.option_type == "存款下分"){
            // 只扣存款，不改玩家积分余额。
            sql = "UPDATE user SET deposit = deposit - ?, option_time = ? WHERE username = ? AND deposit >= ?";
            args = [msg.option_score, time, msg.player_name, msg.option_score];
        } else if(msg.option_type == "存款"){
            sql = "UPDATE user SET score = score - ?, raw_score = raw_score - ?, deposit = deposit + ?, option_time = ? WHERE username = ? AND score >= ?";
            args = [msg.option_score, msg.option_score, msg.option_score, time, msg.player_name, msg.option_score];
        } else if(msg.option_type == "还款"){
            sql = "UPDATE user SET score = score - ?, raw_score = raw_score - ?, owe_points = COALESCE(owe_points, 0) - ?, option_time = ? WHERE username = ? AND score >= ? AND COALESCE(owe_points, 0) >= ?";
            args = [msg.option_score, msg.option_score, msg.option_score, time, msg.player_name, msg.option_score, msg.option_score];
        } else {
            sql = "UPDATE user SET score = score - ?, raw_score = raw_score - ?, option_time = ? WHERE username = ? AND score - ? >= 0";
            args = [msg.option_score, msg.option_score, time, msg.player_name, msg.option_score];
        }
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args));

        if(msg.card_name){
            sql = "UPDATE bank_list SET remaining_amount = remaining_amount - ?, deduction_amount = deduction_amount + ? WHERE card_name = ?";
            args = [msg.option_score, msg.option_score, msg.card_name];
            sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args));
            sql = "SELECT * FROM bank_list WHERE card_name = ?";
            let res = await mysql.query("bjl", sql, [msg.card_name]);
            if(res.length > 0){
                let r = res[0];
                sql = `INSERT INTO bank_card_transaction_details(card_type,card_name,card_code,option_amount,before_option_amount,
                desk_number,optioner,option_type,statistics_date) VALUES(?,?,?,?,?,?,?,?,?)`;
                args = [r.card_type, r.card_name, r.card_code, msg.option_score, r.remaining_amount, msg.group_nickname, "大红", "下分", time];
                sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args));
            }
        }
        let res = await mysql.tranExecSync("bjl", sqlParamsEntity);
        return { err: null, data: res };
    } catch(err){
        console.error("err:", JSON.stringify(err));
        return { err: err, data: null };
    }
}

playerOptionDao.pointsEchangeRatio = async function (msg) {
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
        console.error("err:",JSON.stringify(err));
        return { err: err, data: null }
    }
};

playerOptionDao.persionalEchangeRatio = async function (msg) {
    // ✅ finance_personal_setup / group_personal_setup 改用 userId 查询
    let sql = "SELECT * FROM finance_personal_setup WHERE userId = (SELECT Id FROM user WHERE username = ?) AND group_nickname = ?";
    let args = [msg.player_name, msg.group_nickname];
    try {
        let res = await mysql.query("bjl", sql, args);
        if(res.length > 0){
            sql = `UPDATE finance_personal_setup SET 
                userId = (SELECT Id FROM user WHERE username = ?),
                playername = ?, group_nickname = ?,
                bp_personal_share = ?, bp_personal_share_upperlimit = ?,
                sb_personal_share = ?, redemption_type = ?, rebate_ratio = ?,
                personal_points_redemption_ratio = ?,
                redemption_start_time = ?, rebate_type = ?, rebate_pair_start_time = ?,
                start_exchange = ?
                WHERE group_nickname = ? AND userId = (SELECT Id FROM user WHERE username = ?)`;
            args = [
                msg.player_name, msg.player_name, msg.group_nickname,
                msg.bp_personal_share, msg.bp_personal_share_upperlimit,
                msg.sb_personal_share, msg.redemption_type, msg.rebate_ratio,
                msg.personal_points_redemption_ratio,
                msg.redemption_start_time, msg.rebate_type, msg.rebate_pair_start_time,
                msg.start_exchange,
                msg.group_nickname, msg.player_name
            ];
        } else {
            // ✅ INSERT 补充 userId
            sql = `INSERT INTO finance_personal_setup
                (userId, playername, group_nickname, bp_personal_share, bp_personal_share_upperlimit,
                 sb_personal_share, redemption_type, rebate_ratio, personal_points_redemption_ratio,
                 redemption_start_time, rebate_type, rebate_pair_start_time, start_exchange)
                VALUES((SELECT Id FROM user WHERE username = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            args = [
                msg.player_name, msg.player_name, msg.group_nickname,
                msg.bp_personal_share, msg.bp_personal_share_upperlimit,
                msg.sb_personal_share, msg.redemption_type, msg.rebate_ratio,
                msg.personal_points_redemption_ratio,
                msg.redemption_start_time, msg.rebate_type, msg.rebate_pair_start_time,
                msg.start_exchange
            ];
        }
        res = await mysql.query("bjl", sql, args);
        return { err: null, data: res };
    } catch(err){
        console.error("err:", JSON.stringify(err));
        return { err: err, data: null };
    }
};

playerOptionDao.getScoreOptionRecordById = async function (msg) {
    try{
        let sql = "select * from score_operation_record where Id = ?";
        let args = [msg.id];
        let rows = await mysql.query("bjl",sql,args);
        return { err: null, data: rows };
    }catch(err){
        console.error("err:",JSON.stringify(err));
        return {err:err,data:null};
    }
}

playerOptionDao.getScoreOptionRecord = async function (msg) {
    let condition = [];
    let args = [];

    if (typeof msg.is_virtual === 'number' && msg.is_virtual == 0) {
        condition.push(`
            EXISTS (
                SELECT 1 FROM group_member p
                WHERE (
                    p.userId = s.userId
                    OR (s.userId IS NULL AND p.playername = s.playername)
                )
                AND p.is_virtual = 0 LIMIT 1
            )
        `);
    }

    if (msg.group_nickname && msg.group_nickname !== '' && msg.group_nickname !== '全部') {
        condition.push("s.group_nickname = ?");
        args.push(msg.group_nickname);
    }

    if (msg.option_type && msg.option_type !== '全部') {
        if (msg.option_type == "现金") {
            condition.push(`s.option_type IN (?, ?)`);
            args.push("充值", "提款");
        } else if (msg.option_type == "纠错") {
            condition.push(`s.option_type IN (?, ?)`);
            args.push("纠错充值", "纠错提款");
        } else if (msg.option_type == "积分") {
            condition.push(`s.option_type = ?`);
            args.push("积分充值");
        } else if (msg.option_type == "返水") {
            condition.push(`s.option_type = ?`);
            args.push("返水充值");
        } else {
            condition.push(`s.option_type = ?`);
            args.push(msg.option_type);
        }
    }

    if (msg.id > 0) {
        condition.push("s.Id = ?");
        args.push(msg.id);
    }

    if (msg.is_transfer_score) {
        condition.push("s.trans_id != ?");
        args.push("");
    }

    if (msg.optioner) {
        let optioner = typeof msg.optioner === 'object' ? msg.optioner.optioner : msg.optioner;
        if (optioner) {
            condition.push("s.optioner = ?");
            args.push(optioner);
        }
    }

    // msg.userId 是当前操作员 ID；被查询的玩家 ID 使用独立字段。
    const playerUserId = Number(msg.playerUserId || msg.player_user_id || 0);
    if (Number.isInteger(playerUserId) && playerUserId > 0) {
        condition.push("s.userId = ?");
        args.push(playerUserId);
    } else if (msg.player_name && msg.player_name !== '') {
        // ✅ 改用 userId 子查询过滤玩家
        condition.push(`(
            s.userId = (SELECT Id FROM user WHERE username = ? LIMIT 1)
            OR (s.userId IS NULL AND s.playername = ?)
        )`);
        args.push(msg.player_name, msg.player_name);
    }

    if (msg.start_time && msg.end_time) {
        condition.push("s.option_time BETWEEN ? AND ?");
        args.push(msg.start_time, msg.end_time);
    }

    let where = condition.length ? condition.join(" AND ") : "1 = 1";

    try {
        let countSql = `
            SELECT 
                COUNT(*) as count,
                COALESCE(SUM(s.score), 0) as total_score,
                COALESCE(SUM(s.before_option_score), 0) as total_before_score
            FROM score_operation_record s
            WHERE ${where}
        `;
        let countRows = await mysql.query("bjl", countSql, args);
        const totalCount = countRows[0].count;
        const totalSummary = {
            playername: "合计",
            score: Number(countRows[0].total_score) || 0,
            before_score: Number(countRows[0].total_before_score) || 0
        };

        let page = Math.max(1, Number(msg.currentPage) || 1);
        let size = Math.min(100, Number(msg.pageSize) || 20);
        let start = (page - 1) * size;

        // =========================
        // list
        // =========================
        let listSql = `
            SELECT s.*
            FROM score_operation_record s
            WHERE ${where}
            ORDER BY s.Id DESC
            LIMIT ?, ?
        `;

        let listRows = await mysql.query(
            "bjl",
            listSql,
            [...args, start, size]
        );

        // 返回数据，带上全局合计数据 summary
        return {
            err: null,
            data: {
                list: listRows,
                total: totalCount,
                summary: totalSummary // --- 新增：返回合计数据 ---
            }
        };

    } catch (err) {

        console.error(
            "getScoreOptionRecord err:",
            JSON.stringify(err)
        );

        console.error(
            "SQL args:",
            JSON.stringify(args)
        );

        return {
            err,
            data: null
        };
    }
};


playerOptionDao.undoOptionScore = async function(msg){
    try{
        let time = msg.statistics_date;
        let sqlParamsEntity = [];

        //let sql = "UPDATE score_operation_record SET memo = '该记录己撤销操作', is_revoke = 1 WHERE Id = ?";
        let sql = "delete from score_operation_record where Id = ?";
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, [msg.id]));

        if(msg.option_type === "存款下分"){
            // 原操作是存款下分，撤销时只恢复存款，不改积分余额。
            sql = "UPDATE user SET deposit = deposit - ?, option_time = ? WHERE username = ?";
            sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, [msg.option_score, time, msg.player_name]));
        } else if("存款,取款".indexOf(msg.option_type) > -1){
            sql = "UPDATE user SET score = score - ?, raw_score = raw_score - ?, deposit = deposit - ?, option_time = ? WHERE username = ? AND score - ? >= 0";
            sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, [msg.option_score, msg.option_score, -msg.option_score, time, msg.player_name, msg.option_score]));
        } else if("借款,还款".indexOf(msg.option_type) > -1){
            // 借款撤销时 option_score 为正：扣回积分并减少欠款。
            // 还款撤销时 option_score 为负：返还积分并恢复欠款。
            sql = "UPDATE user SET score = score - ?, raw_score = raw_score - ?, owe_points = COALESCE(owe_points, 0) - ?, option_time = ? WHERE username = ? AND score - ? >= 0 AND COALESCE(owe_points, 0) - ? >= 0";
            sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, [msg.option_score, msg.option_score, msg.option_score, time, msg.player_name, msg.option_score, msg.option_score]));
        } else {
            sql = "UPDATE user SET score = score - ?, raw_score = raw_score - ?, option_time = ? WHERE username = ? AND score - ? >= 0";
            sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, [msg.option_score, msg.option_score, time, msg.player_name, msg.option_score]));
        }

        if(msg.row.card_name && msg.row.card_name != ''){
            let res = await mysql.query("bjl", "SELECT * FROM bank_list WHERE card_name = ?", [msg.row.card_name]);
            if(msg.row.is_add === 1){
                sql = "UPDATE bank_list SET remaining_amount = remaining_amount - ?, bonus_amount = bonus_amount - ? WHERE card_name = ?";
                sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, [msg.row.score, msg.row.score, msg.row.card_name]));
                if(res.length > 0){
                    let r = res[0];
                    sql = `INSERT INTO bank_card_transaction_details(card_type,card_name,card_code,option_amount,before_option_amount,
                    desk_number,optioner,option_type,statistics_date) VALUES(?,?,?,?,?,?,?,?,?)`;
                    sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, [r.card_type, r.card_name, r.card_code, -msg.row.score, r.remaining_amount, msg.group_nickname, "大红", "上分", msg.statistics_date]));
                }
            } else {
                sql = "UPDATE bank_list SET remaining_amount = remaining_amount + ?, deduction_amount = deduction_amount - ? WHERE card_name = ?";
                sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, [-msg.row.score, -msg.row.score, msg.row.card_name]));
                if(res.length > 0){
                    let r = res[0];
                    sql = `INSERT INTO bank_card_transaction_details(card_type,card_name,card_code,option_amount,before_option_amount,
                    desk_number,optioner,option_type,statistics_date) VALUES(?,?,?,?,?,?,?,?,?)`;
                    sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, [r.card_type, r.card_name, r.card_code, msg.row.score, r.remaining_amount, msg.group_nickname, "大红", "下分", msg.statistics_date]));
                }
            }
        }

        let res = await mysql.tranExecSync("bjl", sqlParamsEntity);
        return { err: null, data: res };
    } catch(err){
        console.error("err:", JSON.stringify(err));
        return { err: JSON.stringify(err), data: null };
    }
};


playerOptionDao.getBankcard = async function (msg) {
    let sql = "select * from bank_list";
    let args = [];
    try {
        let res = await mysql.query("bjl", sql, args);
        res = await mysql.query("bjl", sql, args);
        return { err: null, data: res};
    } catch (err) {
        return { err: err, data: null }
    }
};

playerOptionDao.getGroupNickname = async function (msg) {
  let sql = "select group_nickname from group_chat_setup";
  let args = [];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (err) {
    return { err: err, data: null }
  }
};

playerOptionDao.playerFuzzyQuery = async function (msg) {
  try {
    const keyword = msg.player_name ? `%${msg.player_name}%` : '%';
    const page = Math.max(1, Number(msg.page) || 1);
    const pageSize = Math.min(100, Number(msg.pageSize) || 20);
    const offset = (page - 1) * pageSize;

    const countSql = 'SELECT COUNT(*) AS total FROM user WHERE username LIKE ?';
    const countRows = await mysql.query('bjl', countSql, [keyword]);
    const total = countRows[0] ? countRows[0].total || 0 : 0;

    const sql = `
      SELECT username AS playername , score ,raw_score,deposit 
      FROM user
      WHERE username LIKE ?
      ORDER BY username
      LIMIT ? OFFSET ?
    `;
    const rows = await mysql.query('bjl', sql, [keyword, pageSize, offset]);

    return {
      err: null,
      data: {
        list: rows,
        total: total,
        currentPage: page,
        pageSize: pageSize
      }
    };
  } catch (err) {
    console.error("playerFuzzyQuery err:", err);
    return { err: err, data: null };
  }
}

// ...existing code...
playerOptionDao.getCombinedStatistics = async function(msg) {
    try {
        // 构建动态 WHERE 与参数
        const where = ["gcs.game_status = 1"];
        const args = [];

        if (msg.statistics_date) {
            where.push("gjt.statistics_date = ?");
            args.push(msg.statistics_date);
        }

        if (msg.group_nickname && msg.group_nickname !== "" && msg.group_nickname !== "全部") {
            where.push("gjt.group_nickname = ?");
            args.push(msg.group_nickname);
        }

        const sql = `
            SELECT 
                -- 1. 用户剩余积分统计
                (SELECT COALESCE(SUM(score), 0) FROM user WHERE is_virtual = 0) as total_score,
                (SELECT COALESCE(SUM(raw_score), 0) FROM user WHERE is_virtual = 0) as total_raw_score,
                
                -- 2. 盈亏信息统计
                COALESCE(SUM(gjt.gyk + gjt.sbltyk + gjt.ltyk + gjt.dcyk + gjt.xztyk), 0) as zyk, 
                COALESCE(SUM(gjt.sbltyk), 0) as sblyk, 
                COALESCE(SUM(gjt.ltyk), 0) as ltyk, 
                COALESCE(SUM(gjt.dcyk), 0) as dcyk, 
                COALESCE(SUM(gjt.gyk), 0) as gyk,
                COALESCE(SUM(gjt.xztyk), 0) as xztyk
            FROM game_jc_total gjt
            INNER JOIN group_chat_setup gcs 
                ON gjt.group_nickname = gcs.group_nickname
            WHERE ${where.join(" AND ")};
        `;

        const res = await mysql.query("bjl", sql, args);
        return { err: null, data: res };
    } catch (err) {
        console.error("getCombinedStatistics err:", JSON.stringify(err));
        return { err: err, data: null };
    }
};

