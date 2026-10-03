let pomelo = require("pomelo");
const { setGroupMute } = require("../chat/sendGroupMessage");
let dao = module.exports;
let mysql = pomelo.app.get("sqlHelper");

const officeOperations = require('./bankOfficeService')(mysql);
async function officeResult(operation, msg) {
    try { return { err: null, data: await operation(msg) }; }
    catch (err) { console.error('Office operation failed:', err); return { err: err.message || '办公费用操作失败', data: null }; }
}
dao.addOfficeExpenses = msg => officeResult(officeOperations.add, msg);
dao.editOfficeExpenses = msg => officeResult(officeOperations.edit, msg);

dao.getOfficeExpenses = async function (msg) {
    let condition = " 1 ";
    let args = [];

    if ( msg.optioner && msg.optioner != ''){ 
        condition += " and optioner = ? ";
        args.push(msg.optioner);  
    }

    if ( msg.project_name && msg.project_name != "全部"){ 
        condition += " and project_name = ? ";
        args.push(msg.project_name);  
    }

    if( msg.startTime && msg.startTime != ""){
        condition += " and option_time between  ?  and ? ";
        args.push(msg.startTime);
        args.push(msg.endTime);  
    }

    if( msg.card_name && msg.card_name != ""){
        condition += " and card_name = ?";
        args.push(msg.card_name);  
    }

    try{
        let sql = "select count(*) as count from office_expense_registration  where "  + condition;
        let rows2 = await mysql.query("bjl",sql,args);

        let start = (msg.currentPage - 1) * msg.pageSize;

        sql = "select * from office_expense_registration where " + condition   + " limit " + start + "," + msg.pageSize;
        let rows = await mysql.query("bjl",sql,args);

        let summarySql = `
            SELECT 
                COUNT(*) as total_count,
                IFNULL(SUM(money), 0) as total_amount
            FROM office_expense_registration
            WHERE ${condition}
        `;
        let summaryRows = await mysql.query("bjl", summarySql, args);
        let summary = summaryRows[0];

        return {err:null,data:{rows:rows,count:rows2[0].count, summary: {
            total_count: summary.total_count,
            total_money: parseFloat(summary.total_amount)
        }}};
    }catch(err){
        console.error("err:",JSON.stringify(err));
        return {err:err,data:null}
    }
};

dao.deleteOfficeExpenses = msg => officeResult(officeOperations.remove, msg);
