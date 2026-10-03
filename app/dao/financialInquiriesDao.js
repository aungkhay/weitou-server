let pomelo = require("pomelo");
let dao = module.exports;
let mysql = pomelo.app.get("sqlHelper");
const utils = require("../util/utils");

const BET_TYPE_FIELDS = {
    '庄': 'z',
    'z': 'z',
    '闲': 'x',
    'x': 'x',
    '和': 'h',
    'h': 'h',
    '庄对': 'zd',
    'zd': 'zd',
    '闲对': 'xd',
    'xd': 'xd',
    '小老虎': 'l',
    'l': 'l',
    '大老虎': 'k',
    'k': 'k',
    '幸运七': 'q',
    'q': 'q',
    '幸运六': 'm',
    'm': 'm'
};

function buildBetTypeCondition(betType) {
    if (!betType || betType === '全部') return '';

    const field = BET_TYPE_FIELDS[betType];
    if (!field) return '';

    // “庄”在明细筛选中代表庄闲主玩法，需要同时包含庄、闲下注。
    if (field === 'z') return ' AND (g.z > 0 OR g.x > 0) ';

    return ` AND g.${field} > 0 `;
}

// 辅助：若需要排除虚拟用户，返回 SQL 片段（适用于已用 gm 别名的查询）
function buildExcludeVirtualForGroupMember(msg) {
    if (msg && Number(msg.is_contains_virtual) === 0) {
        return " AND gm.is_virtual = 0 ";
    }
    return "";
}

// 辅助：若需要排除虚拟用户（gameshist_record 没有 gm 联表时，使用 user 表子查询）
function buildExcludeVirtualForGameshist(msg, tableAlias = 'g') {
    if (msg && Number(msg.is_contains_virtual) === 0) {
        return ` AND EXISTS (SELECT 1 FROM user u WHERE u.Id = ${tableAlias}.userId AND u.is_virtual = 0) `;
    }
    return "";
}

dao.getPlayerBettingDetails = async function (msg) {
    let condition = " 1 ";
    let args = [];

    if (msg.group_nickname && (msg.group_nickname != '全部' && msg.group_nickname != '')) {
        condition += " AND g.group_nickname = ? ";
        args.push(msg.group_nickname);
    }

    if (msg.player_name && msg.player_name != '') {
        condition += " AND u.username = ? ";   // ✅ 改成 JOIN user 过滤
        args.push(msg.player_name);
    }

    if (msg.startTime && msg.startTime != "") {
        condition += " AND g.stime BETWEEN ? AND ? ";
        args.push(msg.startTime, msg.endTime);
    }

    condition += buildBetTypeCondition(msg.bet_type);

    let start = (msg.currentPage - 1) * msg.pageSize;

    // ✅ 加 JOIN user
    let joinUser = " INNER JOIN user u ON u.Id = g.userId ";

    let sql = `SELECT g.*, u.username AS userName 
               FROM gameshist_record g ${joinUser}
               WHERE ${condition} 
               ORDER BY g.Id ASC              -- ✅ 按 Id 从小到大
               LIMIT ${start}, ${msg.pageSize}`;
    let rows = await mysql.query("bjl", sql, args);

    let summarySql = `
        SELECT
            COUNT(*) as total_count,
            IFNULL(SUM(g.xz),0) as total_xz,
            IFNULL(SUM(g.yl),0) as total_yl,
            IFNULL(SUM(g.before_bet_ye),0) as total_before_bet_ye
        FROM gameshist_record g
        ${joinUser}
        WHERE ${condition}
    `;
    let summaryRows = await mysql.query("bjl", summarySql, args);
    let s = summaryRows[0];

    return { err: null, data: { rows, count: s.total_count, summary: {
        total_count: s.total_count,
        total_xz: parseFloat(s.total_xz),
        total_yl: parseFloat(s.total_yl),
        total_before_bet_ye: parseFloat(s.total_before_bet_ye)
    }}};
};

dao.getJcStatistics = async function (msg) {
    let condition = " 1 ";
    let args = [];

    if(msg.group_nickname && msg.group_nickname != '全部' && msg.group_nickname != ''){
        condition += " and group_nickname = ? ";
        args.push(msg.group_nickname);  
    }

    if(msg.date){
        condition += " and statistics_date = ? ";
        args.push(msg.date);
    }

    if(msg.shoe){
        condition += " and cc = ? ";
        args.push(msg.shoe);
    }

    //try{

        let start = (msg.currentPage - 1) * msg.pageSize;

        let sql = "select * from game_jc_total where " + condition   + " limit ?,? ";
        args.push(start, msg.pageSize);

        let rows = await mysql.query("bjl",sql,args);

        const summaryFields = ['z', 'h','x','zd','xd','l','k','m', 'q','g_z','g_x','g_zd', 'g_xd','g_h','g_m',
                    'g_l','g_k','g_q','zxdc','tzx','tsbl','lt','sp','zyk', 'xzyk','gyk','dcyk','xztyk', 
                    'sbltyk','sblspyk','xzspyk','ltyk', 'spzsyk'     
        ];

        // table, fields, condition
        let summarySql = mysql.buildSummarySQL('game_jc_total',summaryFields,condition)

        // 下面统计
        let summaryRows = await mysql.query("bjl", summarySql, args);
        let s = summaryRows[0];

        let summary = {
            total_count: s.total_count
        };

        summaryFields.forEach(f => {
            summary[`total_${f}`] = parseFloat(s[`total_${f}`]);
        });

        return {err:null,data:{list:rows,count:s.total_count, summary: summary}};

    // }catch(err){
    //     console.error("err:",JSON.stringify(err));
    //     return {err:err,data:null}
    // }
};

dao.getCcTotal = async function(msg){

    let whereGroup = '';
    let args = [msg.shoe, msg.date];

    if (msg.group_nickname && (msg.group_nickname !== '全部' && msg.group_nickname !== '')) {
        whereGroup = 'AND g.group_nickname = ?';
        args.push(msg.group_nickname);
    }

    let whereVirtual = '';
    if (msg.is_virtual !== undefined && msg.is_virtual === 0) {
        whereVirtual = 'AND gm.is_virtual = 0';
    }

    // ✅ JOIN 改用 userId
    let baseSql = `
        FROM gameshist_record g
        INNER JOIN user u ON u.Id = g.userId
        INNER JOIN group_member gm ON 
            u.username = gm.playername 
            AND g.group_nickname = gm.group_nickname
        LEFT JOIN finance_personal_setup f ON 
            f.userId = u.Id                        -- ✅ 改成 userId
            AND g.group_nickname = f.group_nickname
        LEFT JOIN group_parameter_setup gp 
            ON g.group_nickname = gp.group_nickname
        WHERE g.cc = ? 
            AND g.statistics_date = ?
            ${whereGroup}
            ${whereVirtual}
    `;

    // =========================
    // ✅ 1️⃣ 查询总数（分页用）
    // =========================
    let countSql = `
        SELECT COUNT(*) as total FROM (
            SELECT 1
            ${baseSql}
            ${groupBy}
        ) t
    `;

    let countRes = await mysql.query("bjl", countSql, args);
    let total = countRes[0]?.total || 0;

    // =========================
    // ✅ 2️⃣ 分页参数
    // =========================
    let pageSize = Number(msg.pageSize) || 20;
    let currentPage = Number(msg.currentPage) || 1;
    let offset = (currentPage - 1) * pageSize;

    // =========================
    // ✅ 3️⃣ 主查询（加 LIMIT）
    // =========================
    let sql = `
        SELECT 
            MAX(g.group_nickname) as group_nickname,
            MAX(g.cc) as cc,
            MAX(g.jc) as jc,
            MAX(g.kj) as kj,
            DATE_FORMAT(MAX(g.stime), '%Y-%m-%d %H:%i:%s') as stime,

            SUM(g.z) as z,
            SUM(g.h) as h,
            SUM(g.x) as x,
            SUM(g.zd) as zd,
            SUM(g.xd) as xd,
            SUM(g.m) as m,
            SUM(g.q) as q,
            SUM(g.l) as l,
            SUM(g.k) as k,

            SUM(g.h_yl) as h_yl,
            SUM(g.zd_yl) as zd_yl,
            SUM(g.xd_yl) as xd_yl,
            SUM(g.m_yl) as m_yl,
            SUM(g.q_yl) as q_yl,
            SUM(g.l_yl) as l_yl,
            SUM(g.k_yl) as k_yl,

            COALESCE(SUM(CASE 
                WHEN IFNULL(f.bp_personal_share,0) > 0 
                THEN g.z * f.bp_personal_share / 100 
            END), 0) as g_z,

            COALESCE(SUM(CASE 
                WHEN IFNULL(f.bp_personal_share,0) > 0 
                THEN g.x * f.bp_personal_share / 100 
            END), 0) as g_x,

            COALESCE(SUM(CASE 
                WHEN IFNULL(f.bp_personal_share,0) = 0 
                THEN g.z * gp.pb_tabletop_occupies_proportion / 100 
            END), 0) as d_z,

            COALESCE(SUM(CASE 
                WHEN IFNULL(f.bp_personal_share,0) = 0 
                THEN g.x * gp.pb_tabletop_occupies_proportion / 100 
            END), 0) as d_x,

            COALESCE(SUM(g.zd * f.sb_personal_share / 100), 0) as g_zd,
            COALESCE(SUM(g.xd * f.sb_personal_share / 100), 0) as g_xd,
            COALESCE(SUM(g.h * f.sb_personal_share / 100), 0) as g_h

        ${baseSql}
        ${groupBy}
        LIMIT ?, ?
    `;

    let list = await mysql.query("bjl", sql, [...args, offset, pageSize]);

    return {
        err: null,
        data: {
            list,
            total,
            currentPage,
            pageSize
        }
    };
};

dao.htPlayerDetailsQuery = async function (msg) {
    try {

        // ================= 分页 =================
        let page = Math.max(1, parseInt(msg.currentPage) || 1);
        let pageSize = Math.min(200, parseInt(msg.pageSize) || 20);
        let offset = (page - 1) * pageSize;


        // ================= 条件 =================
        let where = " WHERE 1=1 ";
        let args = [];


        // 日期必须存在
        if (!msg.startTime || !msg.endTime) {
            return {
                err:null,
                data:{
                    list:[],
                    total:0,
                    currentPage:page,
                    pageSize,
                    summary:{}
                }
            };
        }


        msg.startTime = utils.toDateYMD(msg.startTime);

        where += `
            AND g.statistics_date BETWEEN ? AND ?
        `;

        args.push(
            msg.startTime,
            msg.endTime
        );


        // 群组
        if(
            msg.group_nickname &&
            msg.group_nickname !== "全部"
        ){

            where += `
                AND g.group_nickname = ?
            `;

            args.push(
                msg.group_nickname
            );
        }


        // 排除虚拟玩家
        where += buildExcludeVirtualForGameshist(
            msg,
            'g'
        );


        const playerFilter =
            msg.playername ||
            msg.name;



        // =====================================================
        // 玩家模式：按天统计
        // =====================================================
        if(playerFilter){


            // 找 userId
            let userRows = await mysql.query(
                "bjl",
                `
                SELECT Id 
                FROM user 
                WHERE username = ?
                LIMIT 1
                `,
                [
                    playerFilter
                ]
            );


            if(
                userRows &&
                userRows.length > 0
            ){

                // ⭐关键：
                // 不再 OR userName
                // 防止同名玩家混入
                where += `
                    AND g.userId = ?
                `;

                args.push(
                    userRows[0].Id
                );

            }else{

                // 兼容历史没有userId的数据
                where += `
                    AND g.userName = ?
                `;

                args.push(
                    playerFilter
                );
            }



            let playerAggSql = `

            SELECT

                DATE_FORMAT(
                    g.statistics_date,
                    '%Y-%m-%d'
                ) AS stat_date,


                COALESCE(
                    u.username,
                    g.userName
                ) AS username,


                COALESCE(
                    u.reference_name,
                    ''
                ) AS reference_name,


                g.userId,


                -- 庄闲洗码
                COALESCE(
                    SUM(g.xml_zx),
                    0
                ) AS xml_zx,


                -- 三宝洗码
                COALESCE(
                    SUM(g.xml_sb),
                    0
                ) AS xml_sb,


                -- 庄闲盈利
                COALESCE(
                    SUM(
                        CASE
                            WHEN g.x > 0 OR g.z > 0 THEN g.yl
                            ELSE 0
                        END
                    ),
                    0
                ) AS zx_yl,


                -- 三宝盈利
                COALESCE(
                    SUM(
                        g.zd_yl +
                        g.xd_yl +
                        g.h_yl +
                        g.l_yl +
                        g.k_yl +
                        g.m_yl +
                        g.q_yl
                    ),
                    0
                ) AS sb_yl,


                COALESCE(
                    SUM(g.yxxz),
                    0
                ) AS yxxz,


                COALESCE(
                    SUM(g.points),
                    0
                ) AS total_points


            FROM gameshist_record g


            LEFT JOIN user u
            ON u.Id = g.userId


            ${where}


            GROUP BY
                DATE_FORMAT(
                    g.statistics_date,
                    '%Y-%m-%d'
                ),
                g.userId

            `;



            let listSql = `

                WITH player_agg AS
                (
                    ${playerAggSql}
                )

                SELECT *
                FROM player_agg

                ORDER BY
                    stat_date DESC

                LIMIT ?,?

            `;



            let summarySql = `

                WITH player_agg AS
                (
                    ${playerAggSql}
                )


                SELECT

                    COUNT(*) total_count,

                    SUM(xml_zx) total_xml_zx,

                    SUM(xml_sb) total_xml_sb,

                    SUM(zx_yl) total_zx_yl,

                    SUM(sb_yl) total_sb_yl,

                    SUM(yxxz) total_yxxz,

                    SUM(total_points) total_points


                FROM player_agg

            `;



            const [
                listRows,
                summaryRows
            ] = await Promise.all([


                mysql.query(
                    "bjl",
                    listSql,
                    [
                        ...args,
                        offset,
                        pageSize
                    ]
                ),


                mysql.query(
                    "bjl",
                    summarySql,
                    args
                )

            ]);



            let summary =
                summaryRows[0] || {};


            return {

                err:null,

                data:{

                    list:listRows || [],

                    total:Number(
                        summary.total_count || 0
                    ),

                    currentPage:page,

                    pageSize,


                    summary:{

                        total_xml_zx:
                            Number(summary.total_xml_zx || 0),

                        total_xml_sb:
                            Number(summary.total_xml_sb || 0),

                        total_zx_yl:
                            Number(summary.total_zx_yl || 0),

                        total_sb_yl:
                            Number(summary.total_sb_yl || 0),

                        total_yxxz:
                            Number(summary.total_yxxz || 0),

                        total_points:
                            Number(summary.total_points || 0)

                    }

                }

            };


        }



        // =====================================================
        // 全部玩家模式：按 userId 汇总
        // =====================================================


        let listSql = `


        SELECT


            CONCAT(
                ?,
                '至',
                ?
            ) AS stat_date,


            COALESCE(
                MAX(u.username),
                MAX(g.userName),
                ''
            ) username,


            COALESCE(
                MAX(u.reference_name),
                ''
            ) reference_name,


            g.userId,


            SUM(g.xml_zx) xml_zx,


            SUM(g.xml_sb) xml_sb,


            COALESCE(
                SUM(
                    CASE
                        WHEN g.x > 0 OR g.z > 0 THEN g.yl
                        ELSE 0
                    END
                ),
                0
            ) zx_yl,


            SUM(
                g.zd_yl+
                g.xd_yl+
                g.h_yl+
                g.l_yl+
                g.k_yl+
                g.m_yl+
                g.q_yl
            ) sb_yl,


            SUM(g.yxxz) yxxz,


            SUM(g.points) total_points


        FROM gameshist_record g


        LEFT JOIN user u
        ON u.Id=g.userId


        ${where}


        GROUP BY g.userId


        ORDER BY total_points DESC, username ASC, g.userId ASC


        LIMIT ?,?


        `;



        let countSql = `

        SELECT COUNT(*) total
        FROM
        (
            SELECT g.userId

            FROM gameshist_record g

            LEFT JOIN user u
            ON u.Id=g.userId

            ${where}

            GROUP BY g.userId

        ) t

        `;



        let summarySql = `

        SELECT


            SUM(g.xml_zx) total_xml_zx,


            SUM(g.xml_sb) total_xml_sb,


            COALESCE(
                SUM(
                    CASE
                        WHEN g.x > 0 OR g.z > 0 THEN g.yl
                        ELSE 0
                    END
                ),
                0
            ) total_zx_yl,


            SUM(
                g.zd_yl+
                g.xd_yl+
                g.h_yl+
                g.l_yl+
                g.k_yl+
                g.m_yl+
                g.q_yl
            ) total_sb_yl,


            SUM(g.yxxz) total_yxxz,


            SUM(g.points) total_points


        FROM gameshist_record g


        LEFT JOIN user u
        ON u.Id=g.userId


        ${where}

        `;



        const [
            listRows,
            countRows,
            summaryRows
        ] = await Promise.all([


            mysql.query(
                "bjl",
                listSql,
                [
                    msg.startTime,
                    msg.endTime,
                    ...args,
                    offset,
                    pageSize
                ]
            ),


            mysql.query(
                "bjl",
                countSql,
                args
            ),


            mysql.query(
                "bjl",
                summarySql,
                args
            )

        ]);



        let summary =
            summaryRows[0] || {};


        return {

            err:null,

            data:{

                list:listRows || [],

                total:Number(
                    countRows[0]?.total || 0
                ),

                currentPage:page,

                pageSize,


                summary:{

                    total_xml_zx:
                        Number(summary.total_xml_zx || 0),

                    total_xml_sb:
                        Number(summary.total_xml_sb || 0),

                    total_zx_yl:
                        Number(summary.total_zx_yl || 0),

                    total_sb_yl:
                        Number(summary.total_sb_yl || 0),

                    total_yxxz:
                        Number(summary.total_yxxz || 0),

                    total_points:
                        Number(summary.total_points || 0)

                }

            }

        };


    } catch(err){

        console.error(
            "htPlayerDetailsQuery error:",
            err
        );

        return {
            err:err.message,
            data:null
        };

    }
};

dao.htPlayerDetailsQueryByShoe = async function(msg){
    let condition = " 1 ";
    let args = [];

    if (msg.group_nickname && msg.group_nickname != "全部"){ 
        condition += " AND g.group_nickname = ? ";
        args.push(msg.group_nickname);  
    }

    if (msg.name){ 
        condition += " AND u.username = ? ";   // ✅ 改成 user 表过滤
        args.push(msg.name);  
    }

    if (msg.startTime){ 
        condition += " AND g.betTime BETWEEN ? AND ? ";
        args.push(msg.startTime,msg.endTime);  
    }

    try{
        let sql = `
            SELECT 
                g.cc,
                MAX(u.username) as username,     -- ✅ 从 user 实时取
                MAX(u.reference_name) as reference_name,
                IFNULL(SUM(CASE WHEN (g.z > 0 OR g.x > 0) THEN g.yxxz ELSE 0 END),0) as xml_zx,
                IFNULL(SUM(CASE WHEN (g.zd > 0 OR g.xd > 0 OR g.h > 0) THEN g.yxxz ELSE 0 END),0) as xml_sb,
                SUM(g.z + g.x) as xz_xz,
                SUM(g.z_yl + g.x_yl) as xz_yl,
                SUM(g.zd_yl + g.xd_yl + g.h_yl + g.l_yl + g.k_yl + g.m_yl + g.q_yl) as sb_yl,
                SUM(g.yxxz) as yxxz
            FROM gameshist_record g
            INNER JOIN user u ON u.Id = g.userId   -- ✅ userId 关联
            WHERE ${condition} 
            GROUP BY g.cc
            ORDER BY g.cc DESC
        `;
        let rows = await mysql.query("bjl", sql, args);
        return { err: null, data: rows };
    } catch(err){
        console.error("err:", JSON.stringify(err));
        return { err: err, data: null };
    }
}

// 三宝盈亏明细查询
dao.htSbDetailsQuery = async function(msg) {
    try {
        let where = " WHERE 1=1 ";
        let args = [];

        // 群筛选
        if (msg.group_nickname && msg.group_nickname !== "全部" && msg.group_nickname !== "") {
            where += " AND group_nickname = ?";
            args.push(msg.group_nickname);
        }

        // 开始时间
        if (msg.startTime) {
            msg.startTime = utils.toDateYMD(msg.startTime);
            where += " AND statistics_date >= ?";
            args.push(msg.startTime);
        }

        // 结束时间
        if (msg.endTime) {
            where += " AND statistics_date <= ?";
            args.push(msg.endTime);
        }

        // =========================
        // ✅ 基础 SQL 片段（复用）
        // =========================
        let baseSql = `
            FROM game_jc_total
            ${where}
        `;

        let groupSql = `
            GROUP BY statistics_date, cc, jc, kj, group_nickname
        `;

        // =========================
        // ✅ 1️⃣ 分页总行数查询语句
        // =========================
        let countSql = `
            SELECT COUNT(*) as total FROM (
                SELECT 1
                ${baseSql}
                ${groupSql}
            ) t
        `;

        // =========================
        // ✅ 2️⃣ 分页参数安全处理
        // =========================
        let pageSize = Math.max(1, parseInt(msg.pageSize) || 20);
        let currentPage = Math.max(1, parseInt(msg.currentPage) || 1);
        let offset = (currentPage - 1) * pageSize;

        // =========================
        // ✅ 3️⃣ 主明细列表查询语句
        // =========================
        let sql = `
            SELECT
                DATE_FORMAT(statistics_date, '%Y-%m-%d') AS stat_date,
                cc,
                jc,
                group_nickname,
                kj,
                SUM(h) AS h,
                SUM(zd) AS zd,
                SUM(xd) AS xd,
                SUM(l) AS l,
                SUM(k) AS k,
                SUM(m) AS m,
                SUM(q) AS q,
                SUM(h_yl) AS h_yl,
                SUM(zd_yl) AS zd_yl,
                SUM(xd_yl) AS xd_yl,
                SUM(l_yl) AS l_yl,
                SUM(k_yl) AS k_yl,
                SUM(m_yl) AS m_yl,
                SUM(q_yl) AS q_yl,
                SUM(zyk) AS yl
            ${baseSql}
            ${groupSql}
            ORDER BY statistics_date DESC, cc ASC, jc ASC
            LIMIT ?, ?
        `;

        // =========================
        // ✅ 4️⃣ 全局大盘汇总统计语句
        // =========================
        let summarySql = `
            SELECT
                IFNULL(SUM(h),0) AS total_h,
                IFNULL(SUM(zd),0) AS total_zd,
                IFNULL(SUM(xd),0) AS total_xd,
                IFNULL(SUM(l),0) AS total_l,
                IFNULL(SUM(m),0) AS total_m,
                IFNULL(SUM(q),0) AS total_q,
                IFNULL(SUM(k),0) AS total_k,
                IFNULL(SUM(h_yl),0) AS total_h_yl,
                IFNULL(SUM(zd_yl),0) AS total_zd_yl,
                IFNULL(SUM(xd_yl),0) AS total_xd_yl,
                IFNULL(SUM(l_yl),0) AS total_l_yl,
                IFNULL(SUM(k_yl),0) AS total_k_yl,
                IFNULL(SUM(m_yl),0) AS total_m_yl,
                IFNULL(SUM(q_yl),0) AS total_q_yl,
                IFNULL(SUM(zyk),0) AS total_yl
            FROM game_jc_total
            ${where}
        `;

        // =========================
        // ✅ 5️⃣ 核心优化：并发执行所有查询
        // =========================
        const [countRes, listRes, summaryRows] = await Promise.all([
            mysql.query("bjl", countSql, args),
            mysql.query("bjl", sql, [...args, offset, pageSize]),
            mysql.query("bjl", summarySql, args)
        ]);

        // 数据组装与防空处理
        let total = (countRes && countRes[0]) ? countRes[0].total : 0;
        let s = (summaryRows && summaryRows[0]) ? summaryRows[0] : {};

        let summary = {
            total_h: parseFloat(s.total_h || 0),
            total_zd: parseFloat(s.total_zd || 0),
            total_xd: parseFloat(s.total_xd || 0),
            total_l: parseFloat(s.total_l || 0),
            total_m: parseFloat(s.total_m || 0),
            total_q: parseFloat(s.total_q || 0),
            total_h_yl: parseFloat(s.total_h_yl || 0),
            total_zd_yl: parseFloat(s.total_zd_yl || 0),
            total_xd_yl: parseFloat(s.total_xd_yl || 0),
            total_l_yl: parseFloat(s.total_l_yl || 0),
            total_k_yl: parseFloat(s.total_k_yl || 0),
            total_m_yl: parseFloat(s.total_m_yl || 0),
            total_q_yl: parseFloat(s.total_q_yl || 0),
            total_yl: parseFloat(s.total_yl || 0),
            total_k_yl: parseFloat(s.total_k_yl || 0)
        };

        return {
            err: null,
            data: {
                list: listRes || [],
                total: parseInt(total || 0),
                currentPage,
                pageSize,
                summary
            }
        };

    } catch (err) {
        console.error("htSbDetailsQuery 发生错误:", JSON.stringify(err));
        return { err: err, data: null };
    }
};

dao.cashDetailsInquiry = async function(msg){
    try {
        let conditions = [];
        let args = [];

        // 时间过滤
        if (msg.startTime && msg.endTime) {
            msg.startTime = utils.toDateYMD(msg.startTime);
            conditions.push('statistics_date BETWEEN ? AND ?');
            args.push(msg.startTime, msg.endTime);
        }

        // 群过滤
        if (msg.group_nickname && msg.group_nickname !== '全部' && msg.group_nickname !== '') {
            conditions.push('group_nickname = ?');
            args.push(msg.group_nickname);
        }

        // 靴过滤
        if (msg.shoe && msg.shoe !== "全部" && msg.shoe !== '') {
            conditions.push('cc = ?');
            args.push(msg.shoe);
        }

        let whereSql = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

        // =========================
        // ✅ 1️⃣ 分页参数严格安全转换
        // =========================
        let page = Math.max(1, parseInt(msg.currentPage) || 1);
        let pageSize = Math.max(1, parseInt(msg.pageSize) || 20);
        let offset = (page - 1) * pageSize;

        // =========================
        // ✅ 2️⃣ 主明细列表 SQL（只输出格式化后的 stat_date 字符串）
        // =========================
        let listSql = `
            SELECT 
                group_nickname,
                DATE_FORMAT(statistics_date, '%Y-%m-%d') AS stat_date,
                cc,
                jc,
                zxdc,
                lt,
                sp,
                kj,
                dcyk,
                ltyk
            FROM game_jc_total
            ${whereSql}
            ORDER BY statistics_date DESC, cc DESC, jc DESC
            LIMIT ?, ?
        `;

        // =========================
        // ✅ 3️⃣ 汇总统计 SQL（合并了 total 计数）
        // =========================
        let summarySql = `
            SELECT
                COUNT(*) AS total_count,
                IFNULL(SUM(zxdc),0) AS total_zxdc,
                IFNULL(SUM(lt),0) AS total_lt,
                IFNULL(SUM(sp),0) AS total_sp,
                IFNULL(SUM(dcyk),0) AS total_dcyk,
                IFNULL(SUM(ltyk),0) AS total_ltyk
            FROM game_jc_total
            ${whereSql}
        `;

        // =========================
        // ✅ 4️⃣ 并行执行列表与汇总查询
        // =========================
        const [listRows, summaryRows] = await Promise.all([
            mysql.query("bjl", listSql, [...args, offset, pageSize]),
            mysql.query("bjl", summarySql, args)
        ]);

        // 数据防空与清洗
        let s = (summaryRows && summaryRows[0]) ? summaryRows[0] : {};
        let total = parseInt(s.total_count || 0);

        let summary = {
            total_count: total,
            total_zxdc: parseFloat(s.total_zxdc || 0),
            total_lt: parseFloat(s.total_lt || 0),
            total_sp: parseFloat(s.total_sp || 0),
            total_dcyk: parseFloat(s.total_dcyk || 0),
            total_ltyk: parseFloat(s.total_ltyk || 0)
        };

        return {
            err: null,
            data: {
                list: listRows || [],
                total: total,
                currentPage: page,
                pageSize: pageSize,
                summary
            }
        };
    } catch (err) {
        console.error("cashDetailsInquiry err:", JSON.stringify(err));
        return { err: err, data: null };
    }
};

// 游戏记录按天按人统计总注和盈亏；定时任务按最新营业日校准。
dao.total_gameshist_day = async function(msg = {}){
    try {
        const groupNickname = String(msg.group_nickname || '').trim();
        const statisticsDate = msg.statistics_date || '';
        const sourceConditions = [];
        const sourceArgs = [];

        // 开奖时按群和营业日刷新，定时任务只传最新营业日；无参数调用仍支持全量校准。
        if (groupNickname) {
            sourceConditions.push('src.group_nickname = ?');
            sourceArgs.push(groupNickname);
        }
        if (statisticsDate) {
            sourceConditions.push('src.statistics_date = ?');
            sourceArgs.push(statisticsDate);
        }

        const sourceWhere = sourceConditions.length
            ? `WHERE ${sourceConditions.join(' AND ')}`
            : '';

        let sql = `
            INSERT INTO gameshist_record_day (
                stat_date, group_nickname, userId,
                z, x, z_yl, x_yl,
                zd, xd, h, l, k, m, q,
                zd_yl, xd_yl, h_yl, l_yl, k_yl, m_yl, q_yl,
                yxxz, g_yxxz, xml_zx, xml_sb, g_xm, g_yl, points
            )
            SELECT 
                g.statistics_date as stat_date,
                g.group_nickname,
                g.userId,                          -- ✅ 直接用 gameshist_record.userId
                SUM(z), SUM(x), SUM(z_yl), SUM(x_yl),
                SUM(zd), SUM(xd), SUM(h), SUM(l),SUM(k), SUM(m), SUM(q),
                SUM(zd_yl), SUM(xd_yl), SUM(h_yl), SUM(l_yl), SUM(k_yl), SUM(m_yl), SUM(q_yl),
                SUM(yxxz),
                IFNULL(SUM(
                    CASE
                        WHEN (
                            TRIM(CAST(g.kj AS CHAR)) IN ('i', 'j', 'k', 'l')
                            OR (
                                TRIM(CAST(g.kj AS CHAR)) REGEXP '^[0-9]+$'
                                AND (CAST(g.kj AS UNSIGNED) & 4) = 4
                            )
                        ) THEN 0
                        WHEN TRIM(CAST(g.g_zx AS CHAR)) REGEXP '^-{0,1}[0-9]+([.][0-9]+){0,1}$'
                        THEN CAST(g.g_zx AS DECIMAL(20,2))
                        ELSE 0
                    END
                ), 0),
                SUM(xml_zx), SUM(xml_sb),
                IFNULL(SUM(
                    CASE
                        -- 使用 {0,1}，避免旧 SQL 参数替换器把正则量词误当占位符。
                        WHEN TRIM(CAST(g.g_xm AS CHAR)) REGEXP '^-{0,1}[0-9]+([.][0-9]+){0,1}$'
                        THEN CAST(g.g_xm AS DECIMAL(20,2))
                        ELSE 0
                    END
                ), 0),
                IFNULL(SUM(
                    CASE
                        WHEN TRIM(CAST(g.g_yl AS CHAR)) REGEXP '^-{0,1}[0-9]+([.][0-9]+){0,1}$'
                        THEN CAST(g.g_yl AS DECIMAL(20,2))
                        ELSE 0
                    END
                ), 0),
                SUM(points)
            FROM (
                -- 已搬入历史表的数据。
                SELECT
                    src.Id, src.statistics_date, src.group_nickname, src.userId,
                    src.z, src.x, src.z_yl, src.x_yl,
                    src.zd, src.xd, src.h, src.l, src.k, src.m, src.q,
                    src.zd_yl, src.xd_yl, src.h_yl, src.l_yl,
                    src.k_yl, src.m_yl, src.q_yl,
                    src.yxxz, src.kj, src.g_zx, src.xml_zx, src.xml_sb, src.g_xm, src.g_yl, src.points
                FROM gameshist_record src
                ${sourceWhere}

                UNION ALL

                -- 刚结算但尚未来得及搬入历史表的数据，保证开奖后立即可统计。
                -- NOT EXISTS 避免搬表过程中同一个 Id 在两张表同时存在而被重复计算。
                SELECT
                    src.Id, src.statistics_date, src.group_nickname, src.userId,
                    src.z, src.x, src.z_yl, src.x_yl,
                    src.zd, src.xd, src.h, src.l, src.k, src.m, src.q,
                    src.zd_yl, src.xd_yl, src.h_yl, src.l_yl,
                    src.k_yl, src.m_yl, src.q_yl,
                    src.yxxz, src.kj, src.g_zx, src.xml_zx, src.xml_sb, src.g_xm, src.g_yl,
                    src.points
                FROM gameshist src
                ${sourceWhere}
                ${sourceWhere ? 'AND' : 'WHERE'} src.closed = 1
                  AND NOT EXISTS (
                      SELECT 1
                      FROM gameshist_record archived
                      WHERE archived.Id = src.Id
                  )
            ) g
            LEFT JOIN group_chat_setup gcs ON g.group_nickname = gcs.group_nickname
            WHERE g.statistics_date = gcs.statistics_date
            GROUP BY stat_date, group_nickname, g.userId  -- ✅ 不再需要 JOIN user

            ON DUPLICATE KEY UPDATE
                z = VALUES(z), x = VALUES(x),
                z_yl = VALUES(z_yl), x_yl = VALUES(x_yl),
                zd = VALUES(zd), xd = VALUES(xd),
                h = VALUES(h), l = VALUES(l), k = VALUES(k), m = VALUES(m), q = VALUES(q),
                zd_yl = VALUES(zd_yl), xd_yl = VALUES(xd_yl),
                h_yl = VALUES(h_yl), l_yl = VALUES(l_yl),
                k_yl = VALUES(k_yl), m_yl = VALUES(m_yl), q_yl = VALUES(q_yl),
                yxxz = VALUES(yxxz),
                g_yxxz = VALUES(g_yxxz),
                xml_zx = VALUES(xml_zx),
                xml_sb = VALUES(xml_sb),
                g_xm = VALUES(g_xm),
                g_yl = VALUES(g_yl),
                points = VALUES(points);
        `;
        // sourceWhere 在 gameshist_record、gameshist 两个分支各出现一次。
        let res = await mysql.query("bjl", sql, sourceArgs.concat(sourceArgs));
        return { err: null, data: res };
    } catch (err) {
        console.error("total_gameshist_day error:", JSON.stringify(err));
        return { err: err, data: null };
    }
}

// 个人占成明细
dao.getZcTotal = async function (msg) {
    try {
        let conditions = [];
        let args = [];
        const hasPlayerName = typeof msg.player_name === 'string' && msg.player_name.trim() !== '';
        const groupNickname = typeof msg.group_nickname === 'string' ? msg.group_nickname.trim() : '';
        const hasGroupNickname = groupNickname !== '' && groupNickname !== '全部';
        const hasTimeRange = Boolean(msg.startTime && msg.endTime);
        const startTime = hasTimeRange ? utils.toDateYMD(msg.startTime) : '';
        const endTime = hasTimeRange ? utils.toDateYMD(msg.endTime) : '';

        if (hasTimeRange) {
            conditions.push('g.stat_date BETWEEN ? AND ?');
            args.push(startTime, endTime);
        }

        if (hasGroupNickname) {
            conditions.push('g.group_nickname = ?');
            args.push(groupNickname);
        }

        if (hasPlayerName) {
            conditions.push('u.username = ?');   // ✅ 改成通过 user 表过滤
            args.push(msg.player_name.trim());
        }

        let whereSql = conditions.length ? 'WHERE ' + conditions.join(' AND ') : 'WHERE 1=1';

        let page = Math.max(1, parseInt(msg.currentPage) || 1);
        let pageSize = Math.max(1, Math.min(200, parseInt(msg.pageSize) || 20));
        let offset = (page - 1) * pageSize;

        // 个人占成明细只显示明确设置了个人占成比例的玩家。
        let joinClause = `
            INNER JOIN user u ON u.Id = g.userId AND IFNULL(u.is_virtual, 0) = 0
            INNER JOIN (
                SELECT
                    userId,
                    group_nickname,
                    MAX(bp_personal_share) AS bp_personal_share,
                    MAX(bp_personal_share_upperlimit) AS bp_personal_share_upperlimit
                FROM finance_personal_setup
                WHERE IFNULL(bp_personal_share, 0) > 0
                GROUP BY userId, group_nickname
            ) f
                ON f.userId = g.userId
               AND f.group_nickname = g.group_nickname
        `;

        // 查询指定玩家时展示每日、分群明细；未指定玩家时跨日期、跨群按玩家汇总。
        const statDateSelect = hasPlayerName
            ? "DATE_FORMAT(g.stat_date, '%Y-%m-%d') AS stat_date"
            : 'NULL AS stat_date';
        const groupBySql = hasPlayerName
            ? 'GROUP BY g.stat_date, g.group_nickname, g.userId'
            : 'GROUP BY g.userId';
        const orderBySql = hasPlayerName
            ? 'ORDER BY g.stat_date DESC, g.group_nickname ASC, u.username ASC'
            : 'ORDER BY u.username ASC';
        const groupNicknameSelect = hasPlayerName
            ? 'g.group_nickname'
            : (hasGroupNickname ? 'MAX(g.group_nickname)' : 'NULL');

        // 盈利独立于日汇总表查询；整局汇总与个人明细共用日期、群筛选。
        const realtimeConditions = [];
        const realtimeArgs = [];
        if (hasTimeRange) {
            realtimeConditions.push('DATE(r.statistics_date) BETWEEN ? AND ?');
            realtimeArgs.push(startTime, endTime);
        }
        if (hasGroupNickname) {
            realtimeConditions.push('r.group_nickname = ?');
            realtimeArgs.push(groupNickname);
        }
        if (hasPlayerName) {
            realtimeConditions.push('ru.username = ?');
            realtimeArgs.push(msg.player_name.trim());
        }
        const realtimeWhereSql = realtimeConditions.length
            ? 'WHERE ' + realtimeConditions.join(' AND ')
            : 'WHERE 1=1';

        let pageSql = `
            SELECT 
                g.userId AS __userId,
                ${groupNicknameSelect} AS group_nickname,
                u.username AS userName,
                u.reference_name,
                ${statDateSelect},
                IFNULL(SUM(g.g_xm), 0) AS zxzcxm,
                IFNULL(SUM(g.g_yxxz), 0) AS zxzcls,
                IFNULL(MAX(f.bp_personal_share), 0) AS zxzcbl,
                IFNULL(MAX(f.bp_personal_share_upperlimit), 0) AS zxzcsx
            FROM gameshist_record_day g
            ${joinClause}
            ${whereSql}
            ${groupBySql}
            ${orderBySql}
            LIMIT ?, ?
        `;

        let countSql = `
            SELECT COUNT(*) AS total FROM (
                SELECT 1
                FROM gameshist_record_day g
                ${joinClause}
                ${whereSql}
                ${groupBySql}
            ) t
        `;

        let summarySql = `
            SELECT
                IFNULL(SUM(g.g_xm), 0) AS zxzcxm,
                IFNULL(SUM(g.g_yxxz), 0) AS zxzcls
            FROM gameshist_record_day g
            ${joinClause}
            ${whereSql}
        `;

        // 未指定玩家时直接累计整局 gyk，沿用结算时的整局取整结果。
        // 个人列表仍按逐笔明细展示，故其合计可能与 整局汇总存在取整尾差。
        // 指定玩家时保留个人口径，不能把整桌 gyk 归给该玩家。
        let realtimeSummarySql = hasPlayerName ? `
            SELECT IFNULL(-SUM(r.g_yl), 0) AS zxyl
            FROM gameshist_record r
            INNER JOIN user ru ON ru.Id = r.userId AND IFNULL(ru.is_virtual, 0) = 0
            INNER JOIN (
                SELECT DISTINCT userId, group_nickname
                FROM finance_personal_setup
                WHERE IFNULL(bp_personal_share, 0) > 0
            ) rf
                ON rf.userId = r.userId
               AND rf.group_nickname = r.group_nickname
            ${realtimeWhereSql}
        ` : `
            SELECT IFNULL(SUM(r.gyk), 0) AS zxyl
            FROM game_jc_total r
            ${realtimeWhereSql}
        `;
        let realtimeSummaryArgs = realtimeArgs;

        // 并发查询
        let [rawList, rawTotalRes, rawSummaryRes, rawRealtimeSummaryRes] = await Promise.all([
            mysql.query("bjl", pageSql, [...args, offset, pageSize]),
            mysql.query("bjl", countSql, args),
            mysql.query("bjl", summarySql, args),
            mysql.query("bjl", realtimeSummarySql, realtimeSummaryArgs)
        ]);

        // 兼容驱动返回格式并清洗
        let list = rawList || [];
        const userIds = [...new Set(list.map(item => item.__userId).filter(id => id !== undefined && id !== null))];
        if (userIds.length > 0) {
            const idPlaceholders = userIds.map(() => '?').join(',');
            const listRealtimeConditions = [`r.userId IN (${idPlaceholders})`];
            const listRealtimeArgs = [...userIds];
            if (hasTimeRange) {
                listRealtimeConditions.push('DATE(r.statistics_date) BETWEEN ? AND ?');
                listRealtimeArgs.push(startTime, endTime);
            }
            if (hasGroupNickname) {
                listRealtimeConditions.push('r.group_nickname = ?');
                listRealtimeArgs.push(groupNickname);
            }

            const realtimeGroupFields = hasPlayerName
                ? ", r.group_nickname, DATE_FORMAT(r.statistics_date, '%Y-%m-%d') AS stat_date"
                : '';
            const realtimeGroupBy = hasPlayerName
                ? 'GROUP BY r.userId, r.group_nickname, DATE(r.statistics_date)'
                : 'GROUP BY r.userId';
            const realtimeListSql = `
                SELECT r.userId${realtimeGroupFields}, IFNULL(-SUM(r.g_yl), 0) AS zxyl
                FROM gameshist_record r
                INNER JOIN (
                    SELECT DISTINCT userId, group_nickname
                    FROM finance_personal_setup
                    WHERE IFNULL(bp_personal_share, 0) > 0
                ) rf
                    ON rf.userId = r.userId
                   AND rf.group_nickname = r.group_nickname
                WHERE ${listRealtimeConditions.join(' AND ')}
                ${realtimeGroupBy}
            `;
            const realtimeRows = await mysql.query("bjl", realtimeListSql, listRealtimeArgs) || [];
            const realtimeMap = new Map(realtimeRows.map(item => {
                const key = hasPlayerName
                    ? `${item.userId}|${item.group_nickname}|${item.stat_date}`
                    : String(item.userId);
                return [key, Number(item.zxyl) || 0];
            }));
            list.forEach(item => {
                const key = hasPlayerName
                    ? `${item.__userId}|${item.group_nickname}|${item.stat_date}`
                    : String(item.__userId);
                item.zxyl = realtimeMap.get(key) || 0;
                delete item.__userId;
            });
        }
        let total = 0;
        if (Array.isArray(rawTotalRes) && rawTotalRes[0]) {
            total = rawTotalRes[0].total || 0;
        } else if (rawTotalRes && rawTotalRes.total !== undefined) {
            total = rawTotalRes.total;
        }

        let s = (Array.isArray(rawSummaryRes) && rawSummaryRes[0]) ? rawSummaryRes[0] : (rawSummaryRes || {});
        let realtimeSummary = (Array.isArray(rawRealtimeSummaryRes) && rawRealtimeSummaryRes[0])
            ? rawRealtimeSummaryRes[0]
            : (rawRealtimeSummaryRes || {});
        let summary = {
            zxzcxm: parseFloat(s.zxzcxm || 0),
            zxyl: parseFloat(realtimeSummary.zxyl || 0),
            zxzcls: parseFloat(s.zxzcls || 0)
        };

        return {
            err: null,
            data: {
                list: list,
                total: parseInt(total),
                currentPage: page,
                pageSize,
                summary
            }
        };
    } catch (err) {
        console.error("getZcTotal err:", JSON.stringify(err));
        return { err: err, data: null };
    }
};

dao.rechargeDetailsInquiry = async function (msg) {
    try {
        // =========================
        // 1️⃣ 基础过滤条件（不含 option_type）
        // =========================
        let baseConditions = ["1=1"];
        let baseArgs = [];

        // 群筛选
        if (msg.group_nickname && msg.group_nickname !== '全部' && msg.group_nickname !== '') {
            baseConditions.push("group_nickname = ?");
            baseArgs.push(msg.group_nickname);
        }

        // 时间范围筛选
        if (msg.startTime && msg.startTime !== "") {
            baseConditions.push("option_time BETWEEN ? AND ?");
            baseArgs.push(msg.startTime, msg.endTime);
        }

        let baseWhereSql = baseConditions.join(' AND ');

        // =========================
        // 2️⃣ 列表专用的过滤条件（加入 option_type）
        // =========================
        let listConditions = [...baseConditions];
        let listArgs = [...baseArgs];

        if (msg.option_type && msg.option_type !== '') {
            listConditions.push("option_type = ?");
            listArgs.push(msg.option_type);
        }

        let listWhereSql = listConditions.join(' AND ');

        // =========================
        // 3️⃣ 汇总统计 SQL（合并计数，且不受 option_type 干扰）
        // =========================
        let summarySql = `
            SELECT 
                COUNT(*) AS total_count,
                IFNULL(SUM(CASE WHEN option_type = '充值' THEN score ELSE 0 END), 0) AS total_add,
                IFNULL(SUM(CASE WHEN option_type = '提款' THEN score ELSE 0 END), 0) AS total_subtract,
                IFNULL(SUM(CASE 
                    WHEN option_type = '充值' THEN score 
                    WHEN option_type = '提款' THEN -score 
                    ELSE 0 
                END), 0) AS net_total
            FROM score_operation_record
            WHERE ${baseWhereSql}
        `;

        // =========================
        // 4️⃣ 分页参数严格转换
        // =========================
        let page = Math.max(1, parseInt(msg.currentPage) || 1);
        let pageSize = Math.max(1, parseInt(msg.pageSize) || 20);
        let start = (page - 1) * pageSize;

        // =========================
        // 5️⃣ 明细列表 SQL（显式指定字段，使用真实列名并兼容旧接口字段名）
        // =========================
        let listSql = `
            SELECT 
                Id AS id,
                group_nickname,
                playername AS userName,
                playername,
                option_type,
                score,
                DATE_FORMAT(option_time, '%Y-%m-%d %H:%i:%s') AS option_time,
                optioner AS operator,
                memo AS remark
            FROM score_operation_record
            WHERE ${listWhereSql}
            ORDER BY Id DESC, option_time DESC
            LIMIT ?, ?
        `;

        // =========================
        // 6️⃣ 核心优化：并行执行所有查询
        // =========================
        let [summaryRows, listRes] = await Promise.all([
            mysql.query("bjl", summarySql, baseArgs),
            mysql.query("bjl", listSql, [...listArgs, start, pageSize])
        ]);

        // 数据清洗防空
        let s = (summaryRows && summaryRows[0]) ? summaryRows[0] : {};
        let total = parseInt(s.total_count || 0);

        let summary = {
            total_add: parseFloat(s.total_add || 0),
            total_subtract: parseFloat(s.total_subtract || 0),
            net_total: parseFloat(s.net_total || 0)
        };

        // =========================
        // 返回
        // =========================
        return {
            err: null,
            data: {
                list: listRes || [],
                total: total,
                currentPage: page,
                pageSize: pageSize,
                summary
            }
        };

    } catch (err) {
        console.error("rechargeDetailsInquiry 发生错误:", JSON.stringify(err));
        return { err: err, data: null };
    }
};

// ✅ 查询积分时改用 userId 关联
dao.getPointsTotal = async function(msg) {
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

        let sql = `
            SELECT 
                u.username AS player_name,       -- ✅ 实时取 username
                u.reference_name,
                p.group_nickname,
                p.points,
                p.userId
            FROM points_group_user p
            INNER JOIN user u ON u.Id = p.userId -- ✅ 改用 userId 关联
            ${where}
            ORDER BY p.points DESC
        `;

        let rows = await mysql.query("bjl", sql, args);
        return { err: null, data: rows };
    } catch(err) {
        console.error("getPointsTotal err:", JSON.stringify(err));
        return { err: err, data: null };
    }
};


dao.getPlayerBetData = async function (msg) {
    try {
        if (!msg.group_nickname || !msg.statistics_date) {
            return {
                err: "group_nickname 和 statistics_date 不能为空",
                data: null
            };
        }

        const startDate = String(msg.statistics_date).substring(0, 10);
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

        const betConditions = [
            'g.group_nickname = gm.group_nickname',
            'g.statistics_date >= ?',
            'g.statistics_date < ?'
        ];
        const memberConditions = ['gm.group_nickname = ?'];
        const betArgs = [startDate, nextDate];
        const memberArgs = [msg.group_nickname];

        // 指定场次
        if (
            msg.shoe !== undefined &&
            msg.shoe !== null &&
            msg.shoe !== ""
        ) {
            betConditions.push('g.cc = ?');
            betArgs.push(Number(msg.shoe));
        }

        // 指定局次
        if (
            msg.round !== undefined &&
            msg.round !== null &&
            msg.round !== ""
        ) {
            betConditions.push('g.jc = ?');
            betArgs.push(Number(msg.round));
        }

        // 指定玩家。成员条件必须放在 WHERE；下注条件必须留在 LEFT JOIN 的 ON 中，
        // 否则没有下注记录的群成员会被过滤掉。
        if (msg.name && String(msg.name).trim() !== "") {
            memberConditions.push('gm.playername = ?');
            memberArgs.push(String(msg.name).trim());
        }

        const sql = `
            SELECT
                gm.playername AS userName,
                COALESCE(NULLIF(gm.userId, 0), u.Id) AS userId,
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
            FROM group_member gm
            LEFT JOIN user u
                ON u.Id = NULLIF(gm.userId, 0)
                OR (
                    (gm.userId IS NULL OR gm.userId = 0)
                    AND u.username = gm.playername
                )
            LEFT JOIN gameshist_record g
                ON g.userId = COALESCE(NULLIF(gm.userId, 0), u.Id)
               AND ${betConditions.join('\n               AND ')}
            WHERE ${memberConditions.join('\n              AND ')}
            GROUP BY
                gm.group_nickname,
                gm.userId,
                gm.playername,
                u.Id
            HAVING
                COALESCE(SUM(g.xz), 0) > 0
            ORDER BY
                gm.playername ASC
        `;

        const rows = await mysql.query("bjl", sql, betArgs.concat(memberArgs));

        return {
            err: null,
            data: rows || []
        };
    } catch (err) {
        console.error("getPlayerBetData err:", JSON.stringify(err));

        return {
            err: err.message || err,
            data: null
        };
    }
};

dao.getPlayerScoreData = async function (msg) {
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

        let sql = `
            SELECT
                gm.playername AS userName,

                /*
                 * 指定群、指定日期的已结算盈利。
                 */
                COALESCE(
                    SUM(
                        COALESCE(gh.yl, 0)
                    ),
                    0
                ) AS yl,

                /*
                 * 当前可用分
                 * +
                 * 该玩家在所有群、所有日期中
                 * 尚未结算的下注额。
                 */
                MAX(
                    COALESCE(u.score, 0)
                )
                +
                COALESCE(
                    (
                        SELECT
                            SUM(
                                COALESCE(h.xz, 0)
                            )
                        FROM gameshist h
                        WHERE h.userId = u.Id
                          AND h.closed = 0
                    ),
                    0
                ) AS score,

                MAX(
                    COALESCE(u.raw_score, 0)
                ) AS raw_score,

                MAX(
                    COALESCE(u.daily_points, 0)
                ) AS daily_points,

                MAX(
                    COALESCE(u.total_points, 0)
                ) AS total_points

            FROM group_member gm

            /*
             * 以 group_member 为主表；user 不存在时仍保留该群成员。
            */
            LEFT JOIN user u
                ON u.Id = NULLIF(gm.userId, 0)
                OR (
                    (gm.userId IS NULL OR gm.userId = 0)
                    AND u.username = gm.playername
                )

            LEFT JOIN gameshist_record gh
                ON gh.userId = COALESCE(NULLIF(gm.userId, 0), u.Id)
                AND gh.group_nickname = ?
                AND gh.statistics_date >= ?
                AND gh.statistics_date < ?
        `;

        const args = [
            msg.group_nickname,
            startDate,
            nextDate
        ];

        /*
         * 已结算记录按靴过滤。
         */
        if (
            msg.shoe !== undefined &&
            msg.shoe !== null &&
            msg.shoe !== ""
        ) {
            sql += `
                AND gh.cc = ?
            `;

            args.push(Number(msg.shoe));
        }

        /*
         * 已结算记录按局过滤。
         */
        if (
            msg.round !== undefined &&
            msg.round !== null &&
            msg.round !== ""
        ) {
            sql += `
                AND gh.jc = ?
            `;

            args.push(Number(msg.round));
        }

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
            GROUP BY
                gm.group_nickname,
                gm.userId,
                u.Id,
                gm.playername

            HAVING
                COALESCE(SUM(gh.xz), 0) > 0

            ORDER BY
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
