const { list } = require("pm2");
let pomelo = require("pomelo");
let dao = module.exports;
let mysql = pomelo.app.get("sqlHelper");
const utils = require("../util/utils");

// 按天查询汇总（已去掉按天分组，改为直接返回明细页）
dao.dailyQuerySummary = async function (msg) {
    try {
        // 强制要求时间范围
        if (!msg.startTime || !msg.endTime) {
            return { err: 'MISSING_TIME_RANGE', data: null };
        }

        // 支持按群过滤
        msg.startTime = utils.toDateYMD(msg.startTime);
        let conditions = [`statistics_date BETWEEN ? AND ?`];
        let baseArgs = [msg.startTime, msg.endTime];

        if (msg.group_nickname && msg.group_nickname !== "全部" && msg.group_nickname !== "") {
            conditions.push("group_nickname = ?");
            baseArgs.push(msg.group_nickname);
        }

        const whereSql = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

        // =========================
        // 1️⃣ 每日报表列表 SQL（已锁定日期字符串）,这里台占盈亏和个盈亏全部归为个占盈亏，表示为台占盈亏
        // =========================
        const listSql = `
            SELECT
                DATE_FORMAT(statistics_date, '%Y-%m-%d') AS stat_date,
                IFNULL(SUM(xzspyk), 0) AS xzspyk,
                IFNULL(SUM(spxm), 0) AS spxm,
                IFNULL(SUM(spzsyk), 0) AS spzsyk,
                IFNULL(SUM(ltyk), 0) AS lxly,
                IFNULL(SUM(dcyk), 0) AS dcly,
                IFNULL(SUM(xztyk), 0) AS zxtmzcsy,                                 
                IFNULL(SUM(tzx), 0) AS zxtmzcxm,
                IFNULL(SUM(IFNULL(ltyk, 0) + IFNULL(dcyk, 0) + IFNULL(xztyk, 0)), 0) AS lyhs
            FROM game_jc_total
            ${whereSql}
            GROUP BY statistics_date
            ORDER BY statistics_date DESC
        `;

        // =========================
        // 2️⃣ 全量合计 SQL（修复了末尾多余逗号的 Bug，且同步了 lyhs 计算口径,
        // =========================
        const summarySql = `
            SELECT
                IFNULL(SUM(xzspyk), 0) AS xzspyk,
                IFNULL(SUM(spxm), 0) AS spxm,
                IFNULL(SUM(spzsyk), 0) AS spzsyk,
                IFNULL(SUM(ltyk), 0) AS lxly,
                IFNULL(SUM(dcyk), 0) AS dcly,
                IFNULL(SUM(xztyk), 0) AS zxtmzcsy,
                IFNULL(SUM(tzx), 0) AS zxtmzcxm,
                IFNULL(SUM(IFNULL(ltyk, 0) + IFNULL(dcyk, 0) + IFNULL(xztyk, 0)), 0) AS lyhs
            FROM game_jc_total
            ${whereSql}
        `;

        // =========================
        // 3️⃣ 核心优化：并行执行列表与汇总查询
        // =========================
        const [rows, summaryRows] = await Promise.all([
            mysql.query("bjl", listSql, baseArgs),
            mysql.query("bjl", summarySql, baseArgs)
        ]);

        // 汇总防空处理
        const s = summaryRows && summaryRows[0] ? summaryRows[0] : {};

        const summary = {
            xzspyk: parseFloat(s.xzspyk || 0),
            spxm: parseFloat(s.spxm || 0),
            spzsyk: parseFloat(s.spzsyk || 0),
            lxly: parseFloat(s.lxly || 0),
            dcly: parseFloat(s.dcly || 0),
            zxtmzcsy: parseFloat(s.zxtmzcsy || 0),
            zxtmzcxm: parseFloat(s.zxtmzcxm || 0),
            lyhs: parseFloat(s.lyhs || 0) // 👈 直接读取数据库算好的高精度值，规避 JS 浮点数加法失真
        };

        return {
            err: null,
            data: {
                list: rows || [],
                total: Array.isArray(rows) ? rows.length : 0,
                summary: summary
            }
        };

    } catch (err) {
        console.error("dailyQuerySummary 发生错误:", JSON.stringify(err));
        return { err: err, data: null };
    }
};

dao.sbStatistics = async function (msg) {
    try {
        // 强制要求时间范围（按 statistics_date 过滤）
        if (!msg.startTime || !msg.endTime) {
            return { err: 'MISSING_TIME_RANGE', data: null };
        }

        msg.startTime = utils.toDateYMD(msg.startTime);
        // 构造 where 条件（基于 statistics_date）
        let conditions = [`statistics_date BETWEEN ? AND ?`];
        let baseArgs = [msg.startTime, msg.endTime];

        if (msg.group_nickname && (msg.group_nickname !== "全部" && msg.group_nickname !== "")) {
            conditions.push("group_nickname = ?");
            baseArgs.push(msg.group_nickname);
        }

        const whereSql = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

        // 按天分组统计（statistics_date 为 DATE 列）
        const listSql = `
            SELECT
                DATE_FORMAT(statistics_date, '%Y-%m-%d') AS stat_date,
                IFNULL(SUM(h + zd + xd), 0) AS sb,
                IFNULL(-SUM(h_yl + zd_yl + xd_yl), 0) AS sb_yl,
                IFNULL(SUM(l), 0) AS l,
                IFNULL(SUM(k), 0) AS k,
                IFNULL(SUM(m), 0) AS m,
                IFNULL(SUM(q), 0) AS q,
                IFNULL(-SUM(l_yl), 0) AS l_yl,
                IFNULL(-SUM(k_yl), 0) AS k_yl,
                IFNULL(-SUM(m_yl), 0) AS m_yl,
                IFNULL(-SUM(q_yl), 0) AS q_yl,
                IFNULL(-SUM(h_yl + zd_yl + xd_yl + l_yl + k_yl + m_yl + q_yl), 0) AS company_yl
            FROM game_jc_total
            ${whereSql}
            GROUP BY statistics_date
            ORDER BY statistics_date DESC
        `;

        const rows = await mysql.query("bjl", listSql, baseArgs);

        // 全量合计
        const summarySql = `
            SELECT
                IFNULL(SUM(h + zd + xd), 0) AS sb,
                IFNULL(-SUM(h_yl + zd_yl + xd_yl ), 0) AS sb_yl,
                IFNULL(SUM(l), 0) AS l,
                IFNULL(SUM(k), 0) AS k,
                IFNULL(SUM(m), 0) AS m,
                IFNULL(SUM(q), 0) AS q,
                IFNULL(-SUM(l_yl), 0) AS l_yl,
                IFNULL(-SUM(k_yl), 0) AS k_yl,
                IFNULL(-SUM(m_yl), 0) AS m_yl,
                IFNULL(-SUM(q_yl), 0) AS q_yl,
                IFNULL(-SUM(h_yl + zd_yl + xd_yl + l_yl + k_yl + m_yl + q_yl), 0) AS company_yl
            FROM game_jc_total
            ${whereSql}
        `;
        const summaryRows = await mysql.query("bjl", summarySql, baseArgs);
        const s = summaryRows && summaryRows[0] ? summaryRows[0] : {};

        // 保持与历史接口一致的展示（前端可能期望取反）
        const summary = {
            sb: parseFloat(s.sb || 0),
            sb_yl: parseFloat(s.sb_yl || 0),   // 平台记录取反展示
            l: parseFloat(s.l || 0),
            m: parseFloat(s.m || 0),
            q: parseFloat(s.q || 0),
            k: parseFloat(s.k || 0),
            l_yl: parseFloat(s.l_yl || 0),
            k_yl: parseFloat(s.k_yl || 0),
            m_yl: parseFloat(s.m_yl || 0),
            q_yl: parseFloat(s.q_yl || 0),
            k_yl: parseFloat(s.k_yl || 0),
            company_yl: parseFloat(s.company_yl || 0) // 保持与之前相同的取反约定
        };

        return {
            err: null,
            data: {
                list: rows || [],
                total: Array.isArray(rows) ? rows.length : 0,
                summary: summary
            }
        };
    } catch (err) {
        console.error("sbStatistics err:", JSON.stringify(err));
        return { err: err, data: null };
    }
};

// personalProportionsStatistics：只返回汇总
dao.personalProportionsStatistics = async function(msg){
    try {
        // 强制要求时间范围（按 statistics_date 过滤）
        if (!msg.startTime || !msg.endTime) {
            return { err: 'MISSING_TIME_RANGE', data: null };
        }
        
        msg.startTime = utils.toDateYMD(msg.startTime);

        // game_jc_total 与 gameshist_record_day 的日期字段名不同，分别构造条件。
        let conditions = [`statistics_date BETWEEN ? AND ?`];
        let dayConditions = [`stat_date BETWEEN ? AND ?`];
        let baseArgs = [msg.startTime, msg.endTime];
        let dayArgs = [msg.startTime, msg.endTime];

        if (msg.group_nickname && msg.group_nickname !== '全部' && msg.group_nickname !== '') {
            conditions.push('group_nickname = ?');
            dayConditions.push('group_nickname = ?');
            baseArgs.push(msg.group_nickname);
            dayArgs.push(msg.group_nickname);
        }

        const whereSql = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
        const dayWhereSql = dayConditions.length ? 'WHERE ' + dayConditions.join(' AND ') : '';

        // 所选时间范围整体汇总，不再按天分组。
        const listSql = `
            SELECT
                CONCAT(?, '至', ?) AS stat_date,
                jc.g_z,
                jc.g_x,
                jc.g_xz,
                jc.g_yl,
                jc.g_lyzf,
                IFNULL(day_data.g_xm, 0) AS g_xm,
                IFNULL(day_data.g_yxxz, 0) AS g_yxxz
            FROM (
                SELECT
                    IFNULL(SUM(g_z), 0) AS g_z,
                    IFNULL(SUM(g_x), 0) AS g_x,
                    IFNULL(SUM(g_z) + SUM(g_x), 0) AS g_xz,
                    IFNULL(SUM(gyk), 0) AS g_yl,
                    IFNULL(SUM(gyk), 0) AS g_lyzf
                FROM game_jc_total
                ${whereSql}
            ) jc
            CROSS JOIN (
                SELECT
                    IFNULL(SUM(grd.g_xm), 0) AS g_xm,
                    IFNULL(SUM(grd.g_yxxz), 0) AS g_yxxz
                FROM gameshist_record_day grd
                INNER JOIN user day_user
                    ON day_user.Id = grd.userId
                   AND IFNULL(day_user.is_virtual, 0) = 0
                ${dayWhereSql}
            ) day_data
        `;

        const rows = await mysql.query(
            "bjl",
            listSql,
            [msg.startTime, msg.endTime].concat(baseArgs, dayArgs)
        );

        // 全量合计
        const summarySql = `
            SELECT
                jc.g_z,
                jc.g_x,
                jc.g_xz,
                jc.g_yl,
                jc.g_lyzf,
                day_data.g_xm,
                day_data.g_yxxz
            FROM (
                SELECT
                    IFNULL(SUM(g_z), 0) AS g_z,
                    IFNULL(SUM(g_x), 0) AS g_x,
                    IFNULL(SUM(g_z) + SUM(g_x), 0) AS g_xz,
                    IFNULL(SUM(gyk), 0) AS g_yl,
                    IFNULL(SUM(gyk), 0) AS g_lyzf
                FROM game_jc_total
                ${whereSql}
            ) jc
            CROSS JOIN (
                SELECT
                    IFNULL(SUM(grd.g_xm), 0) AS g_xm,
                    IFNULL(SUM(grd.g_yxxz), 0) AS g_yxxz
                FROM gameshist_record_day grd
                INNER JOIN user day_user
                    ON day_user.Id = grd.userId
                   AND IFNULL(day_user.is_virtual, 0) = 0
                ${dayWhereSql}
            ) day_data
        `;
        const summaryRows = await mysql.query("bjl", summarySql, baseArgs.concat(dayArgs));
        const s = summaryRows && summaryRows[0] ? summaryRows[0] : {};

        const summary = {
            g_xz: parseFloat(s.g_xz || 0),
            // 保持历史展示惯例：个人盈亏取反（平台方向记录为正时前端显示为负）
            g_yl: parseFloat(s.g_yl || 0),
            g_lyzf: parseFloat(s.g_lyzf || 0),
            g_xm: parseFloat(s.g_xm || 0),
            g_yxxz: parseFloat(s.g_yxxz || 0)
        };

        return {
            err: null,
            data: {
                list: rows || [],
                total: Array.isArray(rows) ? rows.length : 0,
                summary: summary
            }
        };
    } catch (err) {
        console.error("personalProportionsStatistics err:", err);
        return { err: err, data: null };
    }
};
