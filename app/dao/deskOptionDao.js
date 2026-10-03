let pomelo = require("pomelo");
let deskOptionDao = module.exports;
let mysql = pomelo.app.get("sqlHelper");

deskOptionDao.trans_score1 = async function (msg) {
    let sql = "select * from score_operation_types";
    let args = [];
    try {
        let res = await mysql.query("bjl", sql, args);
        res = await mysql.query("bjl", sql, args);
        return { err: null, data: res};
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return { err: err, data: null }
    }
};

deskOptionDao.trans_score = async function(msg){
    try{
        let time = new Date();
        let sqlParamsEntity = [];
        let transId = "T" + Date.now() + Math.random().toString(36).substr(2,6);
        
        let sql = `insert into score_operation_record(group_nickname,userId,playername,score,before_option_score,option_type,
                  optioner,memo,bank_card,is_add,trans_id) values(?,?,?,?,?,?,?,?,?,?,?)`
        let args = [msg.target_desk,msg.target_userId,msg.target_player_name,msg.source_score,msg.target_before_add_score,msg.target_option_type,"大红",msg.demo,msg.bank_card,1,transId];
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args)); 
        
        sql = `insert into score_operation_record(group_nickname,userId,playername,score,before_option_score,option_type,
                  optioner,memo,bank_card,is_add,trans_id) values(?,?,?,?,?,?,?,?,?,?,?)`
        args = [msg.source_desk,msg.source_userId,msg.source_player_name,msg.source_score,msg.source_before_add_score,msg.source_option_type,"大红",msg.demo,msg.bank_card,2,transId];
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args)); 

        sql = "update user set score = score + ? , raw_score = raw_score + ? , option_time = ? where username = ?";
        args = [msg.source_score , msg.source_score , time,msg.target_player_name];
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args)); 

        sql = "update user set score = score - ? , raw_score = raw_score - ? , option_time = ? where username = ? and score - ? >= 0";
        args = [msg.source_score , msg.source_score , time,msg.source_player_name,msg.source_score];
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args)); 

        let res = await mysql.tranExecSync("bjl",sqlParamsEntity);
        return{err:null,data:res};
    }catch(err){
        console.log("err:",JSON.stringify(err));
        return {err:err,data:null};
    }
}

deskOptionDao.revokeTransScore = async function(msg){
    try {
        // 查原始记录
        let record = await mysql.query("bjl", `
            SELECT * FROM score_operation_record 
            WHERE trans_id = ? 
            LIMIT 1
        `, [msg.trans_id]);

        if (!record || record.length === 0) {
            return {err:"原记录不存在",data:null};
        }

        let r = record[0];

        if (r.is_revoke === 1) {
            return {err:"已撤销，不能重复操作",data:null};
        }

        // 查找该转账的两条记录
        let list = await mysql.query("bjl", `
            SELECT * FROM score_operation_record 
            WHERE trans_id = ?
        `, [msg.trans_id]);

        if (list.length !== 2) {
            return {err:"数据异常",data:null};
        }

        let addRecord = list.find(x => x.is_add === 1);
        let subRecord = list.find(x => x.is_add === 2);

        // 反向操作：加分的玩家减回去，减分的玩家加回来
        let sqlParamsEntity = [];

        // 1. 撤销加分（原收款人减分）
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(
            "UPDATE user SET score = score - ?, raw_score = raw_score - ? WHERE Id = ?",
            [addRecord.score, addRecord.score, addRecord.userId]
        ));

        // 2. 撤销减分（原付款人加分）
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(
            "UPDATE user SET score = score + ?, raw_score = raw_score + ? WHERE Id = ?",
            [subRecord.score, subRecord.score, subRecord.userId]
        ));

        // 3. 标记原记录已撤销
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(
            "DELETE FROM score_operation_record WHERE trans_id = ?",
            [msg.trans_id]
        ));

        let res = await mysql.tranExecSync("bjl", sqlParamsEntity);

        return {err:null, data:"撤销成功"};

    } catch (err) {
        console.error("revoke err:", JSON.stringify(err));
        return {err:"系统错误",data:null};
    }
}
