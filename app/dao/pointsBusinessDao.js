let pomelo = require("pomelo");
let dao = module.exports;
let mysql = pomelo.app.get("sqlHelper");

dao.addModifiPoints = async function (msg) {

    let sqlParamsEntity = [];

    // 1️⃣ 查当前筹码
    let sql = "select * from group_chat_setup where group_nickname = ?";
    let args = [msg.group_nickname];

    let r = await mysql.query("bjl", sql, args);

    if (!r || r.length === 0) {
        return { err: "查无台面记录", data: null };
    }

    let before = r[0].table_chips;
    let after;

    // 2️⃣ 计算结果
    if (msg.option_type === "加彩") {
        after = Number(before) + Number(msg.amount);
    } else {
        if (before < msg.amount) {
            return { err: "筹码不足，无法减彩", data: null };
        }
        after = Number(before) - Number(msg.amount);
    }

    // 3️⃣ 记录日志
    sql = `INSERT INTO add_subtract_points(
        pull_end,
        money,
        option_money,
        befor_opton_money,
        option_type,
        option_time,
        optioner,
        memo
    ) VALUES (?,?,?,?,?,?,?,?)`;

    args = [
        msg.group_nickname,
        after,
        msg.amount,
        before,
        msg.option_type,
        new Date(),              // ✅ 精确时间
        "大红",
        msg.memo
    ];

    sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args));


    // 4️⃣ 更新台面筹码
    if (msg.option_type === "加彩") {
        sql = "UPDATE group_chat_setup SET table_chips = table_chips + ? WHERE group_nickname = ?";
        args = [msg.amount, msg.group_nickname];
    } else {
        sql = "UPDATE group_chat_setup SET table_chips = table_chips - ? WHERE group_nickname = ? and table_chips - ? >= 0";
        args = [msg.amount, msg.group_nickname,msg.amount];
    }

    sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args));


    // 5️⃣ 执行事务
    let res = await mysql.tranExecSync("bjl", sqlParamsEntity);

    return { err: null, data: res };
};


dao.editModifiPoints = async function (msg) {

    let sqlParamsEntity = [];

    // =========================
    // 1️⃣ 查原记录
    // =========================
    let sql = "SELECT * FROM add_subtract_points WHERE id = ?";
    let oldRes = await mysql.query("bjl", sql, [msg.id]);

    if (!oldRes || oldRes.length === 0) {
        return { err: "记录不存在", data: null };
    }

    let old = oldRes[0];

    // =========================
    // 2️⃣ 计算旧值影响
    // =========================
    let oldValue = old.option_type === "加彩"
        ? old.option_money
        : -old.option_money;

    // =========================
    // 3️⃣ 计算新值影响
    // =========================
    let newValue = msg.option_type === "加彩"
        ? msg.amount
        : -msg.amount;

    // =========================
    // 4️⃣ 差值（关键）
    // =========================
    let delta = newValue - oldValue;

    // =========================
    // 5️⃣ 更新日志
    // =========================
    sql = `
        UPDATE add_subtract_points SET
            option_money = ?,
            option_type = ?,
            option_time = NOW(),
            optioner = ?,
            memo = ?
        WHERE Id = ?
    `;

    let args = [
        msg.amount,
        msg.option_type,
        "大红",
        msg.memo,
        msg.id
    ];

    sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args));

    // =========================
    // 6️⃣ 更新台面筹码（用 delta）
    // =========================
    if (delta !== 0) {

        if (delta > 0) {
            sql = `
                UPDATE group_chat_setup 
                SET table_chips = table_chips + ? 
                WHERE group_nickname = ?
            `;
            args = [delta, old.pull_end];
        } else {
            sql = `
                UPDATE group_chat_setup 
                SET table_chips = table_chips - ? 
                WHERE group_nickname = ? 
                AND table_chips >= ?
            `;
            args = [Math.abs(delta), old.pull_end, Math.abs(delta)];
        }

        sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args));
    }

    // =========================
    // 7️⃣ 执行事务
    // =========================
    let res = await mysql.tranExecSync("bjl", sqlParamsEntity);

    // 👉 检查减彩是否失败（重要）
    if (delta < 0 && res[1].affectedRows === 0) {
        return { err: "修改失败：筹码不足", data: null };
    }

    return { err: null, data: res };
};

dao.getPointsRecord = async function (msg) {

    let condition = "1=1";
    let args = [];

    if (msg.optioner && msg.optioner !== '') {
        condition += " AND optioner = ?";
        args.push(msg.optioner);
    }

    if (msg.group_nickname && msg.group_nickname !== "全部") {
        condition += " AND pull_end = ?";   // ⚠️ 你的字段其实是 pull_end
        args.push(msg.group_nickname);
    }

    if (msg.option_type && msg.option_type !== "全部") {
        condition += " AND option_type = ?";
        args.push(msg.option_type);
    }

    if (msg.startTime && msg.startTime !== "") {
        condition += " AND option_time BETWEEN ? AND ?";
        args.push(msg.startTime, msg.endTime);
    }

    // ============================
    // 1️⃣ 总数
    // ============================
    let countSql = `SELECT COUNT(*) AS count FROM add_subtract_points WHERE ${condition}`;
    let countRes = await mysql.query("bjl", countSql, args);


    // ============================
    // 2️⃣ 合计（重点优化）
    // ============================
    let totalSql = `
        SELECT 
            SUM(CASE WHEN option_type = '加彩' THEN option_money ELSE 0 END) AS total_add,
            SUM(CASE WHEN option_type = '减彩' THEN option_money ELSE 0 END) AS total_subtract,
            SUM(CASE 
                WHEN option_type = '加彩' THEN option_money 
                WHEN option_type = '减彩' THEN -option_money 
                ELSE 0 
            END) AS net_total
        FROM add_subtract_points
        WHERE ${condition}
    `;

    let totalRes = await mysql.query("bjl", totalSql, args);


    // ============================
    // 3️⃣ 分页
    // ============================
    let page = Number(msg.currentPage) || 1;
    let pageSize = Number(msg.pageSize) || 20;
    let start = (page - 1) * pageSize;

    let listSql = `
        SELECT *
        FROM add_subtract_points
        WHERE ${condition}
        ORDER BY option_time DESC
        LIMIT ?, ?
    `;

    let listRes = await mysql.query("bjl", listSql, [...args, start, pageSize]);


    return {
        err: null,
        data: {
            list: listRes,
            total: countRes[0].count,
            currentPage:page,
            pageSize:pageSize,

            // 👉 合计数据
            summary: {
                total_add: totalRes[0].total_add || 0,
                total_subtract: totalRes[0].total_subtract || 0,
                net_total: totalRes[0].net_total || 0
            }
        }
    };
};

dao.deleteModifiPoints = async function(msg){
    try{
        let sql = "delete from add_subtract_points where Id = ?" 
        let args = [msg.id];
        let res = await mysql.query("bjl",sql,args);
        return{err:null,data:res};
    }catch(err){
        console.error("err:",JSON.stringify(err));
        return {err:err,data:null};
    }
}