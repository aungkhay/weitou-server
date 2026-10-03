let pomelo = require("pomelo");
let bankBussionessDao = module.exports;
let mysql = pomelo.app.get("sqlHelper");

function pagination(msg) {
    const page = Math.max(1, Math.min(1000000, Math.floor(Number(msg.currentPage) || 1)));
    const pageSize = Math.max(1, Math.min(500, Math.floor(Number(msg.pageSize) || 20)));
    return { page, pageSize, start: (page - 1) * pageSize };
}

bankBussionessDao.getBankCardByCardName = async function (msg) {
    try{
        let sql = "select * from bank_list where card_name = ?";
        let args = [ msg.card_name ];
        let res = await mysql.query("bjl",sql,args);
        return{err:null,data:res};
    }catch(err){
        console.log("err:",JSON.stringify(err));
        return {err:err,data:null};
    }           
}


bankBussionessDao.getBankCard = async function (msg) {
    let condition = " 1 ";
    let args = [];

    if ( msg.optioner && msg.optioner != ''){ 
        condition += " and optioner = ? ";
        args.push(msg.optioner);  
    }

    if ( msg.card_code && msg.card_code != ""){ 
        condition += " and card_code = ? ";
        args.push(msg.card_code);  
    }

    if ( msg.card_type && msg.card_type != ""){ 
        condition += " and card_type = ? ";
        args.push(msg.card_type);  
    }

    if ( msg.card_status && msg.card_status > 0){ 
        condition += " and card_status = ? ";
        args.push(msg.card_status);  
    }

    if ( msg.player_name && msg.player_name != ''){ 
        condition += " and playername = ? ";
        args.push(msg.player_name);  
    }

    if( msg.card_name && msg.card_name != ""){
        condition += " and card_name = ?";
        args.push(msg.card_name);  
    }

    const sortable = ['Id', 'card_name', 'card_type', 'card_code', 'card_status', 'initial_amount',
        'initial_office_amount', 'deduction_amount', 'bonus_amount', 'transfer_in_amount',
        'transfer_out_amount', 'office_amount', 'remaining_amount', 'handling_fee'];
    const sort = String(msg.sort_name || 'Id DESC').trim().split(/\s+/);
    if (!sortable.includes(sort[0]) || sort.length > 2 || (sort[1] && !/^(ASC|DESC)$/i.test(sort[1]))) {
        return { err: '排序字段无效', data: null };
    }
    const sort_name = ` ORDER BY ${sort[0]} ${sort[1] || 'ASC'}${sort[0] === 'Id' ? '' : ', Id DESC'}`;

    try{
        let sql = `
            SELECT
                COUNT(*) AS count,
                COALESCE(SUM(initial_amount), 0) AS initial_amount,
                COALESCE(SUM(initial_office_amount), 0) AS initial_office_amount,
                COALESCE(SUM(deduction_amount), 0) AS deduction_amount,
                COALESCE(SUM(bonus_amount), 0) AS bonus_amount,
                COALESCE(SUM(transfer_in_amount), 0) AS transfer_in_amount,
                COALESCE(SUM(transfer_out_amount), 0) AS transfer_out_amount,
                COALESCE(SUM(office_amount), 0) AS office_amount,
                COALESCE(SUM(remaining_amount), 0) AS remaining_amount
            FROM bank_list
            WHERE ${condition}
        `;
        let rows2 = await mysql.query("bjl",sql,args);

        const { start, pageSize } = pagination(msg);
        sql = "select * from bank_list where " + condition + sort_name + " LIMIT ?, ?";
        let rows = await mysql.query("bjl",sql,args.concat(start, pageSize));
        const totals = rows2[0];
        const summary = {
            card_name: "合计",
            initial_amount: Number(totals.initial_amount) || 0,
            initial_office_amount: Number(totals.initial_office_amount) || 0,
            deduction_amount: Number(totals.deduction_amount) || 0,
            bonus_amount: Number(totals.bonus_amount) || 0,
            transfer_in_amount: Number(totals.transfer_in_amount) || 0,
            transfer_out_amount: Number(totals.transfer_out_amount) || 0,
            office_amount: Number(totals.office_amount) || 0,
            remaining_amount: Number(totals.remaining_amount) || 0
        };
        return {err:null,data:{rows:rows,count:totals.count,summary:summary}};
    }catch(err){
        console.error("err:",JSON.stringify(err));
        return {err:err,data:null}
    }
};

bankBussionessDao.addBankCard = async function(msg){
    try{
        let sql = "insert into bank_list(card_type,card_code,card_name,initial_amount,initial_office_amount,card_status,remaining_amount) values(?,?,?,?,?,?,?)";
        let args = [msg.card_type, msg.card_code, msg.card_name, msg.initial_amount, msg.initial_office_amount, msg.card_status, msg.initial_amount];
        let res = await mysql.query("bjl",sql,args);
        return{err:null,data:res};
    }catch(err){
        console.error("err:",JSON.stringify(err));
        return {err:err,data:null};
    }
}

bankBussionessDao.editBankCard = async function(msg){
    try {
        // 1. 严格的安全校验：确保 ID 存在
        if (!msg || !msg.id) {
            return { err: new Error("Missing bank card ID"), data: null };
        }
        // 现有流水以 card_name 关联。禁止直接改名，避免旧记录和撤销入口断链。
        const cards = await mysql.query('bjl', 'SELECT card_name FROM bank_list WHERE Id = ?', [msg.id]);
        if (!cards.length) return { err: '银行卡不存在', data: null };
        if (cards[0].card_name !== msg.card_name) {
            return { err: '银行卡名称用于关联历史流水，不能直接修改；其他资料可正常编辑', data: null };
        }

        // 2. 金额字段防御：防止 undefined 变成 "NaN" 或破坏 SQL 语句
        // 如果传入了 0，Number(0) 依然是 0；如果是 null/undefined 则兜底为 0
        const initial_amount = typeof msg.initial_amount === 'number' ? msg.initial_amount : Number(msg.initial_amount) || 0;
        const initial_office_amount = typeof msg.initial_office_amount === 'number' ? msg.initial_office_amount : Number(msg.initial_office_amount) || 0;
        const deduction_amount = typeof msg.deduction_amount === 'number' ? msg.deduction_amount : Number(msg.deduction_amount) || 0;
        const bonus_amount = typeof msg.bonus_amount === 'number' ? msg.bonus_amount : Number(msg.bonus_amount) || 0;
        const transfer_in_amount = typeof msg.transfer_in_amount === 'number' ? msg.transfer_in_amount : Number(msg.transfer_in_amount) || 0;
        const transfer_out_amount = typeof msg.transfer_out_amount === 'number' ? msg.transfer_out_amount : Number(msg.transfer_out_amount) || 0;
        const office_amount = typeof msg.office_amount === 'number' ? msg.office_amount : Number(msg.office_amount) || 0;
        const remaining_amount = initial_amount + bonus_amount - deduction_amount;

        let sql = `UPDATE bank_list SET 
            card_type = ?, card_code = ?, card_name = ?, 
            initial_amount = ?, initial_office_amount = ?, deduction_amount = ?, bonus_amount = ?, office_amount = ?, remaining_amount = ?,
            transfer_in_amount = ?, transfer_out_amount = ?, card_status = ? 
            WHERE Id = ? AND BINARY card_name = BINARY ?`;
            
        let args = [
            msg.card_type, 
            msg.card_code, 
            msg.card_name, 
            initial_amount, 
            initial_office_amount,
            deduction_amount, 
            bonus_amount, 
            office_amount,
            remaining_amount,
            transfer_in_amount, 
            transfer_out_amount, 
            msg.card_status, 
            msg.id,
            cards[0].card_name
        ];

        let res = await mysql.query("bjl", sql, args);
        
        // 3. 规范化日志：线上环境避免高频打印完整 SQL 以免撑爆日志文件
        console.log("editBankCard success, ID:", msg.id, "Args:", args, "AffectedRows:", res ? res.affectedRows : 0);

        return { err: null, data: res };

    } catch (err) {
        // 4. 必须解开 try-catch：捕获数据库断开、字段超长、类型不匹配等突发异常
        console.error("editBankCard database error:", JSON.stringify(err));
        return { err: err, data: null };
    }
}


bankBussionessDao.getInterBanktransfer = async function (msg) {
    let condition = " 1 ";
    let args = [];

    if ( msg.optioner && msg.optioner != ''){ 
        condition += " and optioner = ? ";
        args.push(msg.optioner);  
    }

    if ( msg.card_type && msg.card_type != ""){ 
        condition += " and transfer_out_card_type = ? ";
        args.push(msg.card_type);  
    }

    if( msg.startTime && msg.startTime != ""){
        condition += " and working_day between ? and ?";
        args.push(msg.startTime);
        args.push(msg.endTime);  
    }
   
    if( msg.card_name && msg.card_name != ""){
        condition += " and transfer_out_card_name = ?"; 
        args.push(msg.card_name);  
    }


    // ==========================================
    // 1. 全局统计：总条数与转账总金额 (使用真实的 option_amount)
    // ==========================================
    let sql = `
        SELECT 
            COUNT(*) as count,
            COALESCE(SUM(CASE WHEN is_revoke = 0 THEN option_amount ELSE 0 END), 0) as total_option_amount
        FROM card_transfer_registration  
        WHERE ${condition}
    `;
    let rows2 = await mysql.query("bjl", sql, args);

    // 安全转换分页参数
    const { page, pageSize, start } = pagination(msg);

    // ==========================================
    // 2. 列表分页查询
    // ==========================================
    sql = `
        SELECT * 
        FROM card_transfer_registration 
        WHERE ${condition}
        ORDER BY Id DESC
        LIMIT ?, ?
    `;
    let rows = await mysql.query("bjl", sql, [...args, start, pageSize]);

    // 组装统一的合计对象格式
    const totalSummary = {
        transfer_out_card_name: "合计",
        option_amount: Number(rows2[0].total_option_amount) || 0
    };

    // ==========================================
    // 3. 返回带合计的数据
    // ==========================================
    return {
        err: null,
        data: {
            rows: rows,
            count: rows2[0].count,
            summary: totalSummary // 全局总合计
        }
    };
};

const transfers = require('./bankTransferService')(mysql);
async function transferResult(operation, msg) {
    try { return { err: null, data: await operation(msg) }; }
    catch (err) { console.error('Bank transfer failed:', err); return { err: err.message || '转账操作失败', data: null }; }
}
bankBussionessDao.inteBbankTransfer = msg => transferResult(transfers.create, msg);
bankBussionessDao.editInteBbankTransfer = msg => transferResult(transfers.edit, msg);
bankBussionessDao.revokeInterBankTransfer = msg => transferResult(transfers.revoke, msg);
// 所有删除入口都冲正，不能只删除登记。
bankBussionessDao.DeleteInterBankTransfer = bankBussionessDao.revokeInterBankTransfer;

bankBussionessDao.cardDetailsInquiry = async function (msg) {
    let condition = " 1 ";
    let args = [];
    const cardType = msg.card_type === undefined || msg.card_type === null
        ? ''
        : String(msg.card_type).trim();
    const cardName = msg.card_name === undefined || msg.card_name === null
        ? ''
        : String(msg.card_name).trim();
    const optionType = msg.option_type === undefined || msg.option_type === null
        ? ''
        : String(msg.option_type).trim();

    if ( msg.optioner && msg.optioner != ''){ 
        condition += " and optioner = ? ";
        args.push(msg.optioner);  
    }

    if (cardName !== '' && cardName !== '全部') {
        condition += " and card_name = ? ";
        args.push(cardName);
    }

    if (cardType !== '' && cardType !== '全部') {
        condition += " and card_type = ? ";
        args.push(cardType);
    }

    if (optionType !== '' && optionType !== '全部') {
        condition += " and option_type = ? ";
        args.push(optionType);
    }
   
    if( msg.startTime && msg.startTime != ""){
        condition += " and statistics_date between ? and ?";
        args.push(msg.startTime);
        args.push(msg.endTime);  
    }

    // ==========================================
    // 1. 全局统计：通过 SUM 计算当前筛选条件下的【操作金额全局总和】
    // ==========================================
    let sql = `
        SELECT 
            COUNT(*) as count,
            COALESCE(SUM(option_amount), 0) as total_option_amount,
            COALESCE(SUM(CASE
                WHEN option_type IN ('上分', '转入') THEN option_amount
                WHEN option_type IN ('下分', '转出', '手续费', '办公费用') THEN -option_amount
                ELSE 0 END), 0) AS net_change_amount
        FROM bank_card_transaction_details  
        WHERE ${condition}
    `;
    let rows2 = await mysql.query("bjl", sql, args);

    // ==========================================
    // 2. 加固：安全转换分页参数，防止 NaN 或无效值导致报错
    // ==========================================
    const { page, pageSize, start } = pagination(msg);

    // ==========================================
    // 3. 列表分页查询（使用数组传递 limit 参数，避免拼接隐患）
    // ==========================================
    sql = `
        SELECT * 
        FROM bank_card_transaction_details 
        WHERE ${condition}
        ORDER BY Id DESC
        LIMIT ?, ?
    `;
    let rows = await mysql.query("bjl", sql, [...args, start, pageSize]);

    // ==========================================
    // 4. 组装固定的合计对象格式
    // ==========================================
    const totalSummary = {
        card_type: "合计",
        option_amount: Number(rows2[0].total_option_amount) || 0,
        net_change_amount: Number(rows2[0].net_change_amount) || 0
    };

    // ==========================================
    // 5. 返回结果，结构与 rows2.count 对齐
    // ==========================================
    return {
        err: null,
        data: {
            rows: rows,
            currentPage: page,
            pageSize: pageSize,
            count: rows2[0].count,
            summary: totalSummary // 返回全局大计
        }
    };
};


// 统计某时间段所有银行卡
bankBussionessDao.bankStatistics = async function (msg) {
    let condition = " 1 ";
    let args = [];

    if(msg.startTime && msg.startTime != ""){
        condition += " and a.statistics_date between ? and ?";
        args.push(msg.startTime);
        args.push(msg.endTime)  
    }

    if( msg.card_name && msg.card_name != ""){
        condition += " and a.card_name = ?";
        args.push(msg.card_name);  
    }
    
    const { start, pageSize } = pagination(msg);
    
    // 定义所有操作类型
    const allOptionTypes = ['上分', '下分', '转入', '转出', '手续费', '办公费用'];
    
    try{
        if(msg.card_status && msg.card_status != ""){
            // 使用 UNION 方式确保所有类型都存在
            let unionQueries = allOptionTypes.map(type => {
                return `SELECT '${type}' as option_type, COALESCE(SUM(a.option_amount), 0) as total_amount 
                    FROM bank_card_transaction_details a
                    INNER JOIN bank_list b ON a.card_name = b.card_name 
                    WHERE ${condition} AND b.card_status = ? AND a.option_type = '${type}'`;
            }).join(" UNION ALL ");
            
            let argsWithStatus = [...args, msg.card_status];
            // 每个 UNION 子查询都需要参数，复制参数数组
            let unionArgs = [];
            for(let i = 0; i < allOptionTypes.length; i++) {
                unionArgs.push(...argsWithStatus);
            }
            
            let sql = unionQueries + ` ORDER BY FIELD(option_type, '上分', '下分', '转入', '转出', '手续费', '办公费用') LIMIT ${start}, ${pageSize}`;
            
            let rows = await mysql.query("bjl", sql, unionArgs);
            
            return {err: null, data: {rows: rows, count: allOptionTypes.length}};
            
        } else {
            // 使用 UNION 方式确保所有类型都存在
            let unionQueries = allOptionTypes.map(type => {
                return `SELECT '${type}' as option_type, COALESCE(SUM(a.option_amount), 0) as total_amount 
                    FROM bank_card_transaction_details a 
                    WHERE ${condition} AND a.option_type = '${type}'`;
            }).join(" UNION ALL ");
            
            let sql = unionQueries + ` ORDER BY FIELD(option_type, '上分', '下分', '转入', '转出', '手续费', '办公费用') LIMIT ${start}, ${pageSize}`;
            
            // 每个 UNION 子查询都需要相同的参数
            let unionArgs = [];
            for(let i = 0; i < allOptionTypes.length; i++) {
                unionArgs.push(...args);
            }
            
            let rows = await mysql.query("bjl", sql, unionArgs);
            
            return {err: null, data: {rows: rows, count: allOptionTypes.length}};
        }    
    } catch(err){
        console.error("err:", JSON.stringify(err));
        return {err: err, data: null};
    }
};

bankBussionessDao.bankStatisticsByDate = async function (msg) {
    let condition = " 1 ";
    let args = [];

    // 必须指定 card_name
    if (msg.card_name && msg.card_name != ''){ 
        condition += " and a.card_name = ? ";
        args.push(msg.card_name);  
    } else {
        return {err: "card_name is required", data: null};
    }

    if(msg.startTime && msg.startTime != ""){
        condition += " and a.statistics_date between ? and ?";
        args.push(msg.startTime);
        args.push(msg.endTime)  
    }
    
    const { start, pageSize } = pagination(msg);
    
    // 定义所有操作类型
    const allOptionTypes = ['上分', '下分', '转入', '转出', '手续费', '办公费用'];
    
    try{
        // 按天统计各操作类型的金额，使用 DATE_FORMAT 格式化日期
        let sql = `
            SELECT 
                DATE_FORMAT(a.statistics_date, '%Y-%m-%d') as date,
                a.option_type,
                SUM(a.option_amount) as total_amount
            FROM bank_card_transaction_details a
            WHERE ${condition}
            GROUP BY DATE_FORMAT(a.statistics_date, '%Y-%m-%d'), a.option_type
            ORDER BY date DESC
        `;
        
        let rows = await mysql.query("bjl", sql, args);
        
        // 获取所有日期
        let dates = [...new Set(rows.map(row => row.date))];
        
        // 分页处理
        let paginatedDates = dates.slice(start, start + pageSize);
        
        // 将数据按日期分组并补全缺失的操作类型
        let resultMap = new Map();
        rows.forEach(row => {
            if (paginatedDates.includes(row.date)) {
                if (!resultMap.has(row.date)) {
                    resultMap.set(row.date, {});
                }
                resultMap.get(row.date)[row.option_type] = row.total_amount;
            }
        });
        
        // 格式化为前端需要的格式，补全缺失的类型为0
        let formattedRows = [];
        for (let date of paginatedDates) {
            let row = { date: date };
            for (let optionType of allOptionTypes) {
                let amount = resultMap.get(date)?.[optionType];
                row[optionType] = amount !== undefined ? parseFloat(amount) : 0;
            }
            formattedRows.push(row);
        }

        // 做全量合计
        let summarySql = `
            SELECT 
                a.option_type,
                SUM(a.option_amount) as total_amount
            FROM bank_card_transaction_details a
            WHERE ${condition}
            GROUP BY a.option_type
        `;
        let summaryRows = await mysql.query("bjl", summarySql, args);
        let summary = {};

        for (let optionType of allOptionTypes) {
            let found = summaryRows.find(r => r.option_type === optionType);
            summary[optionType] = found ? parseFloat(found.total_amount) : 0;
        }
        
        return {err: null, data: {rows: formattedRows, count: dates.length, summary: summary}};
        
    } catch(err){
        console.error("err:", JSON.stringify(err));
        return {err: err, data: null};
    }
};
