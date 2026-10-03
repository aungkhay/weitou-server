let pomelo = require("pomelo");
let dao = module.exports;
let mysql = pomelo.app.get("sqlHelper");
const utils = require("../util/utils");

dao.addAgent = async function(playerName, parentAgentName){
    try{
        let sql = "update user set level = 2 where username = ?";
        let args = [playerName];

        if (parentAgentName) {
            sql = "update user set level = 2, reference_name = ? where username = ?";
            args = [parentAgentName, playerName];
        }

        let res = await mysql.query("bjl",sql,args);
        return{err:null,data:res};
    }catch(err){
        console.log("err:",JSON.stringify(err));
        return {err:err,data:null};
    }
}

dao.addMember = async function(msg){
    try{
        let sql = "update user set reference_name = ? where username = ?"
        let args = [msg.agent_name, msg.player_name];
        let res = await mysql.query("bjl",sql,args);
        return{err:null,data:res};
    }catch(err){
        console.log("err:",JSON.stringify(err));
        return {err:err,data:null};
    }
}

dao.getAgent = async function (msg) {
    try {

        let page = Number(msg.page) || 1;
        let pageSize = Number(msg.pageSize) || 10;
        let offset = (page - 1) * pageSize;

        let whereSql = ` WHERE u.level = 2 `;
        let args = [];

        // 搜索代理
        if (msg.agent_name && msg.agent_name.trim() !== "" && msg.agent_name != "全部") {
            whereSql += ` AND u.username = ? `;
            args.push(msg.agent_name);
        }

        // 列表SQL
        let listSql = `
            SELECT 
                u.username,
                u.raw_score,
                u.score,
                u.total_points,
                u.fyje,
                (u.xz_yl + u.sb_yl) AS total_yl,
                IFNULL(m.member_count, 0) AS member_count
            FROM user u
            LEFT JOIN (
                SELECT 
                    reference_name,
                    COUNT(*) AS member_count
                FROM user
                WHERE level = 3
                GROUP BY reference_name
            ) m ON m.reference_name = u.username
            ${whereSql}
            ORDER BY u.username ASC, u.Id ASC
            LIMIT ?, ?
        `;

        // summary统计SQL
        let summarySql = `
            SELECT
                COUNT(*) AS total_agent,
                IFNULL(SUM(raw_score), 0) AS total_raw_score,
                IFNULL(SUM(score), 0) AS total_score,
                IFNULL(SUM(total_points), 0) AS total_points,
                IFNULL(SUM(fyje), 0) AS total_fyje,
                IFNULL(SUM(xz_yl + sb_yl), 0) AS total_yl
            FROM user u
            ${whereSql}
        `;

        // total数量
        let countSql = `
            SELECT COUNT(*) AS total
            FROM user u
            ${whereSql}
        `;

        // 查询 summary
        let summaryRes = await mysql.query("bjl", summarySql, args);

        // 查询 total
        let countRes = await mysql.query("bjl", countSql, args);

        // 查询 list
        let listArgs = [...args, offset, pageSize];
        let listRes = await mysql.query("bjl", listSql, listArgs);

        return {
            err: null,

            data: {
                list: listRes,
                summary: {
                    ...summaryRes[0],
                },
                total: countRes[0].total,
            }
        };

    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return {
            err: err.message || err,
            list: [],
            summary: {}
        };
    }
};

dao.getMember = async function(msg){ 
    try {
        // 分页参数：默认页码1，每页10条
        let page = Number(msg.currentPage) || 1;
        let pageSize = Number(msg.pageSize) || 10;
        let offset = (page - 1) * pageSize;

        // 1. 查询列表数据 + 分页（增加 非虚拟 人员 过滤） 
        let sqlList = `
            SELECT 
                reference_name,
                username,
                total_points,
                (xz_yl + sb_yl) AS total_yl,
                fyje
            FROM user u
            WHERE u.reference_name = ? 
                AND IFNULL(u.is_virtual, 0) = 0
            ORDER BY u.Id DESC
            LIMIT ? OFFSET ?;
        `;
        let argsList = [msg.agent_name, pageSize, offset];
        let list = await mysql.query("bjl", sqlList, argsList);

        // 2. 查询汇总（加非虚拟过滤）
        let sqlTotal = `
            SELECT 
                IFNULL(SUM(total_points),0) AS sum_points,
                IFNULL(SUM(xz_yl + sb_yl),0) AS sum_yl,
                IFNULL(SUM(fyje),0) AS sum_fyje
            FROM user u
            WHERE u.reference_name = ? 
                AND IFNULL(u.is_virtual, 0) = 0;
        `;
        let argsTotal = [msg.agent_name];
        let totalRes = await mysql.query("bjl", sqlTotal, argsTotal);
        let summary = totalRes[0] || { sum_points: 0, sum_yl: 0, sum_fyje: 0 };

        // 3. 查询总条数，用于计算总页数（加非虚拟过滤）
        let sqlCount = `
            SELECT COUNT(*) AS total
            FROM user u
            WHERE u.reference_name = ? 
                AND IFNULL(u.is_virtual, 0) = 0;
        `;
        let countRes = await mysql.query("bjl", sqlCount, [msg.agent_name]);
        let total = countRes[0].total || 0;
        let totalPages = Math.ceil(total / pageSize);

        // 4. 返回
        return {
            err: null,
            data: {
                list,
                summary,
                total
            }
        };

    } catch(err) {
        console.log("err:",JSON.stringify(err));
        return { err: err.message || err, data: null };
    }
};

dao.getMemberDetails = async function(msg){
    try {
        let page = Number(msg.page || msg.currentPage) || 1;
        let pageSize = Math.max(1, Math.min(500, Number(msg.pageSize) || 20));
        let offset = (page - 1) * pageSize;

        const agentName = msg.agent_name;
        const groupNick = msg.group_nickname;
        // 与 htPlayerDetailsQuery 一致：必须提供起止日期，起始时间按营业日处理。
        if (!msg.startTime || !msg.endTime) {
            return {
                err: null,
                data: { list: [], total: 0, currentPage: page, pageSize, summary: {} }
            };
        }
        const startTime = utils.toDateYMD(msg.startTime);
        const endTime = msg.endTime;

        // 1. 构建流水表子查询的 WHERE 条件
        let gWhere = " WHERE 1=1 ";
        const gArgs = [];
        gWhere += " AND ghd.stat_date BETWEEN ? AND ? ";
        gArgs.push(startTime, endTime);

        if (groupNick) {
            gWhere += " AND ghd.group_nickname = ? ";
            gArgs.push(groupNick);
        }

        // ✅ 改成 userId 分组关联
        const aggSql = `
            (SELECT 
                ghd.userId AS userId,
                MAX(ghd.group_nickname) AS group_nickname, 
                IFNULL(SUM(ghd.z_yl + ghd.x_yl), 0) AS total_zx_yl,
                IFNULL(SUM(ghd.zd_yl + ghd.xd_yl + ghd.h_yl + ghd.m_yl + ghd.l_yl + ghd.k_yl + ghd.q_yl), 0) AS total_sb_yl,
                IFNULL(SUM(ghd.xml_sb), 0) AS total_xml_sb,
                IFNULL(SUM(ghd.xml_zx), 0) AS total_xml_zx,
                IFNULL(SUM(ghd.yxxz), 0) AS total_yxxz,
                IFNULL(SUM(ghd.points), 0) AS daily_points
            FROM gameshist_record_day ghd
            ${gWhere}
            GROUP BY ghd.userId
            ) agg
        `;

        // ✅ 关联条件改成 u.id = agg.userId
        const joinClause = ` INNER JOIN ${aggSql} ON u.Id = agg.userId `;

        // 3. 用户表过滤条件
        let userWhere = ` WHERE u.is_virtual = 0 AND u.reference_name IS NOT NULL `;
        const userArgs = [];
        if (agentName) {
            userWhere += ` AND u.reference_name = ? `;
            userArgs.push(agentName);
        }

        const combinedArgs = [...gArgs, ...userArgs];

        // 4. COUNT
        const countSql = `
            SELECT COUNT(*) AS total
            FROM user u
            ${joinClause}
            ${userWhere}
        `;
        const countRes = await mysql.query("bjl", countSql, combinedArgs);
        const total = (countRes && countRes[0] && countRes[0].total) ? Number(countRes[0].total) : 0;

        // 5. SUMMARY
        const summarySql = `
            SELECT
                COALESCE(SUM(agg.total_zx_yl), 0) AS sum_zx_yl,
                COALESCE(SUM(agg.total_sb_yl), 0) AS sum_sb_yl,
                COALESCE(SUM(agg.total_xml_sb), 0) AS sum_xml_sb,
                COALESCE(SUM(agg.total_xml_zx), 0) AS sum_xml_zx,
                COALESCE(SUM(agg.total_yxxz), 0) AS sum_yxxz,
                COALESCE(SUM(agg.daily_points), 0) AS sum_daily_points,
                COUNT(u.Id) AS total_users
            FROM user u
            ${joinClause}
            ${userWhere}
        `;
        const summaryRes = await mysql.query("bjl", summarySql, combinedArgs);
        let summary = {
            sum_zx_yl: 0, sum_sb_yl: 0, sum_xml_sb: 0, sum_xml_zx: 0, sum_yxxz: 0, sum_daily_points: 0, total_users: 0
        };
        if (summaryRes && summaryRes[0]) summary = summaryRes[0];

        // 6. 分页列表
        const listSql = `
            SELECT 
                u.reference_name,
                u.username,
                COALESCE(agg.group_nickname, '') AS group_nickname,
                COALESCE(agg.total_zx_yl, 0) AS total_zx_yl,
                COALESCE(agg.total_sb_yl, 0) AS total_sb_yl,
                COALESCE(agg.total_xml_sb, 0) AS total_xml_sb,
                COALESCE(agg.total_xml_zx, 0) AS total_xml_zx,
                COALESCE(agg.total_yxxz, 0) AS total_yxxz,
                COALESCE(agg.daily_points, 0) AS daily_points
            FROM user u
            ${joinClause}
            ${userWhere}
            ORDER BY daily_points DESC, u.reference_name ASC, u.username ASC, u.Id ASC
            LIMIT ? OFFSET ?
        `;
        const listArgs = [...combinedArgs, pageSize, offset];
        const list = await mysql.query("bjl", listSql, listArgs);

        return {
            err: null,
            data: { list: list || [], total, currentPage: page, pageSize, summary }
        };
    } catch (err) {
        console.error("getMemberDetails err:", JSON.stringify(err));
        return { err: err.message || err, data: null };
    }
};

// ✅ 查询积分日志时改用 userId 关联
dao.getPointsLog = async function(msg) {
    try {
        let where = " WHERE 1=1 ";
        let args = [];

        if (msg.group_nickname && msg.group_nickname !== '全部' && msg.group_nickname !== '') {
            where += " AND p.group_nickname = ? ";
            args.push(msg.group_nickname);
        }

        if (msg.player_name && msg.player_name !== '') {
            where += " AND u.username = ? ";    // ✅ 通过 user 表过滤
            args.push(msg.player_name);
        }

        if (msg.startTime && msg.endTime) {
            where += " AND p.stime BETWEEN ? AND ? ";
            args.push(msg.startTime, msg.endTime);
        }

        if (msg.type && msg.type !== '全部') {
            where += " AND p.type = ? ";
            args.push(msg.type);
        }

        let page = Math.max(1, parseInt(msg.currentPage) || 1);
        let pageSize = Math.max(1, Math.min(200, parseInt(msg.pageSize) || 20));
        let offset = (page - 1) * pageSize;

        let countSql = `
            SELECT COUNT(*) AS total
            FROM points_log p
            INNER JOIN user u ON u.Id = p.userId   -- ✅ 改用 userId 关联
            ${where}
        `;

        let listSql = `
            SELECT
                u.username AS player_name,          -- ✅ 实时从 user 取
                u.reference_name,
                p.group_nickname,
                p.type,
                p.points_change,
                p.source_id,
                p.stime,
                p.userId
            FROM points_log p
            INNER JOIN user u ON u.Id = p.userId    -- ✅ 改用 userId 关联
            ${where}
            ORDER BY p.stime DESC
            LIMIT ?, ?
        `;

        let [countRes, list] = await Promise.all([
            mysql.query("bjl", countSql, args),
            mysql.query("bjl", listSql, [...args, offset, pageSize])
        ]);

        return {
            err: null,
            data: {
                list: list || [],
                total: (countRes[0] && countRes[0].total) ? Number(countRes[0].total) : 0,
                currentPage: page,
                pageSize
            }
        };
    } catch(err) {
        console.error("getPointsLog err:", JSON.stringify(err));
        return { err: err, data: null };
    }
};
