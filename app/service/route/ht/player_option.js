let express = require("express");
let router = express.Router();
let pomelo = require("pomelo");
let redlock = pomelo.app.get('redlock');
let userDao = require('../../../dao/userDao');
let playerDao = require('../../../dao/playerDao');
let systemDao = require('../../../dao/systemDao');
let playerOptionDao = require('../../../dao/playerOptionDao');
let pointsExchangeDao = require('../../../dao/pointsExchangeDao');
let util = require('../../../util/utils');
const moment = require('moment');
const sentToFrontEnd = require("../../../domain/sx/sendToFrontEnd");

module.exports = router;

router.post('/get_player_detail', async function(req, res) {   
    let msg = req.body.data ? req.body.data : req.body;
    let lock = await redlock.lock("get_player_detail:" + msg.userName,1000);                                           // 客服发聊天过来
    try {
        let row = await playerOptionDao.getPlayerDetail(msg);     
        if (row.data  ) {
            row = row.data;
            let r = row.list.map (item =>{
                item.registTime = util.transDate(item.registTime);
                return item;
            })
            row.list = r;
            lock.unlock();
            return res.send({code:200,msg:"操作成功",data:row});  
        }else{
            lock.unlock();
            return res.send({code:500,msg:"操作失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return { err: err, data: null }
    }
})

router.post('/get_score_option_type', async function(req, res) {                                                // 客服发聊天过来
    //try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("get_score_option_type:" + msg.userName,500);
        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"必须要填写群昵称",data:null}); 
        }
        let row = await playerOptionDao.getScoreOptionType(msg);                                  // 无此帐号(帐号密码分开判断)
        if (row.data ) {
            return res.send({code:200,msg:"获取成功",data:row.data});  
        }else{
            return res.send({code:500,msg:"获取失败",data:null}); 
        }
    // } catch (err) {
    //     console.log("err:",JSON.stringify(err));
    //     return { err: err, data: null }
    // }
})


/* 
影响到初始分的：现金,纠错,活动,红包,借款,还款)

现金上分->充值
现金下分->提款

红包->红包
活动->活动
借款->借款
还款->还款

纠错上分->纠错充值
纠错下分->纠错提款

返水上分->返水充值
积分上分->积分充值

初始化->初始化
存款->存款(实际上就是下分，存款增加)
取款->取款
 */
router.post('/add_score', async function(req, res) {                                                // 客服发聊天过来
    //try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("add_score:" + msg.userName,2000);

        if(!msg.option_score || msg.option_score <= 0){
            return res.send({code:500,msg:"参数不正确",data:null}); 
        }

        if(!msg.player_name){
            return res.send({code:500,msg:"没有指定玩家",data:null}); 
        }

        if(msg.option_type == "存款"){
            return res.send({code:500,msg:"存款类型不能上分",data:null});
        }

        if(msg.option_type == "还款"){
            return res.send({code:500,msg:"还款类型不能上分",data:null});
        }

        if(msg.option_type !== "现金")msg.card_name = null;   // 只有现金类型才有银行卡号

        if(msg.option_type == "现金")msg.option_type = "充值";
        if(msg.option_type == "返水")msg.option_type = "返水充值";
        if(msg.option_type == "积分")msg.option_type = "积分充值";
        if(msg.option_type == "纠错")msg.option_type = "纠错充值";

        let user = await userDao.getUserByName(msg.player_name);

        if(!user.data){
            return res.send({code:500,msg:"玩家不存在",data:null});
        }
        
        if(user.data.is_virtual == 1 && msg.option_type != "红包"){
            return res.send({code:500,msg:"虚拟选手只能用红包上分",data:null});
        }

        if(msg.option_type == "取款"){
            if(user.data.deposit < msg.option_score){
                return res.send({code:500,msg:"存款金额不足",data:null});
            }
        }
        let groupInfo = await systemDao.getStatisticsDateByAnyGroup();
        if(!groupInfo.data || !groupInfo.data.statistics_date) {
            msg.statistics_date = moment().format('YYYY-MM-DD');
        }else{
            msg.statistics_date = moment(groupInfo.data.statistics_date).format('YYYY-MM-DD');
        }
        
        if(user.data)msg.before_add_score = msg.option_type != "取款" ? user.data.score : user.data.deposit;

        let row = await playerOptionDao.add_score(msg);
        if (row.data ) {
            const hideResult = await playerDao.hidePlayer({
                is_hide: 0,
                group_nickname: msg.group_nickname,
                name: msg.player_name
            });
            if (hideResult.err) {
                console.error("上分后恢复玩家显示失败:", hideResult.err);
            }

            let option = msg.option_type == "取款" ? "取款" : "上分";
            let amount = msg.option_type == "取款" ? Number(msg.before_add_score) - Number(msg.option_score) : Number(msg.before_add_score) + Number(msg.option_score);
          
            sentToFrontEnd.sendNoticeToClient("all#",{type:1,msg:msg.player_name + option + ":"  + msg.option_score + "分,成功,余额：" + amount});
            sentToFrontEnd.sendNoticeToGameClient("all#",{type:9});

            return res.send({code:200,msg:"上分成功",data:null});  
        }else{
            return res.send({code:500,msg:"上分失败",data:null}); 
        }
    // } catch (err) {
    //     console.log("err:",JSON.stringify(err));
    //     return { err: err, data: null }
    // }
})

router.post('/subtract_score', async function(req, res) {                                                // 客服发聊天过来
    //try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("subtract_score:" + msg.userName,2000);

        if(!msg.option_score || msg.option_score <= 0){
            return res.send({code:500,msg:"参数不正确",data:null}); 
        }

        if(!msg.player_name){
            return res.send({code:500,msg:"没有指定选手",data:null}); 
        }

        msg.bank_card = msg.bank_card ? msg.bank_card : "";
        if(!msg.card_name && msg.bank_card)msg.card_name = msg.bank_card;
        // 现金下分和存款下分都需要指定银行卡。
        if(!["现金", "存款下分"].includes(msg.option_type))msg.card_name = null;

        if(msg.option_type == "现金")msg.option_type = "提款";
        if(msg.option_type == "纠错")msg.option_type = "纠错提款";

        // 除现金和还款、纠错提款可以下分 其余选项都不能下分
        if(!["提款","还款","纠错提款","存款","存款下分"].includes(msg.option_type)){
            return res.send({code:500,msg:"该操作类型不能下分",data:null}); 
        }

        let user = await userDao.getUserByName(msg.player_name);

        if(!user.data){
            return res.send({code:500,msg:"选手不存在",data:null});
        }

        if(msg.option_type !== "存款下分" && user.data.score < msg.option_score){
            return res.send({code:500,msg:"剩余积分不足",data:null});
        }

        if(msg.option_type === "存款下分"){
            if(Number(user.data.deposit || 0) < Number(msg.option_score)){
                return res.send({code:500,msg:"存款金额不足",data:null});
            }
            if(!msg.card_name){
                return res.send({code:500,msg:"存款下分必须指定银行卡",data:null});
            }
            const bankRows = await playerOptionDao.getBankcard(msg);
            const bank = bankRows.data && bankRows.data.find(item => item.card_name === msg.card_name);
            if(!bank){
                return res.send({code:500,msg:"指定的银行卡不存在",data:null});
            }
        }

        if(msg.option_type == "还款" && Number(user.data.owe_points || 0) < Number(msg.option_score)){
            return res.send({code:500,msg:"还款金额不能超过欠款金额",data:null});
        }

        let groupInfo = await systemDao.getStatisticsDateByAnyGroup();
        msg.statistics_date = groupInfo.data && groupInfo.data.statistics_date
            ? moment(groupInfo.data.statistics_date).format('YYYY-MM-DD')
            : moment().format('YYYY-MM-DD');

        if(user.data)msg.before_add_score = ["存款", "存款下分"].includes(msg.option_type) ? user.data.deposit : user.data.score;
        let row = await playerOptionDao.subtract_score(msg);                                  // 无此帐号(帐号密码分开判断)
        if (row.data ) {
            let option = msg.option_type == "存款" ? "存分" : msg.option_type == "存款下分" ? "存款下分" : "下分";
            let amount = option == "存分" ? Number(msg.before_add_score) + Number(msg.option_score) : Number(msg.before_add_score) - Number(msg.option_score);

            sentToFrontEnd.sendNoticeToClient("all#",{type:1,msg:msg.player_name + option + ":"  + msg.option_score + "分，成功,余额：" + amount});
            sentToFrontEnd.sendNoticeToGameClient("all#",{type:9});

            return res.send({code:200,msg:"操作成功",data:null});  
        }else{
            return res.send({code:500,msg:"操作失败",data:null}); 
        }
    // } catch (err) {
    //     console.log("err:",JSON.stringify(err));
    //     return { err: err, data: null }
    // }
})

// 现金和还款、纠错提款
router.post('/score_all_down', async function(req, res) {                                                // 客服发聊天过来
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("score_all_down:" + msg.userId,2000);

        if(!msg.player_name){
            return res.send({code:500,msg:"没有指定选手",data:null}); 
        }   
        if(!msg.option_type)msg.option_type 

        let user = await userDao.getUserByName(msg.player_name);
        user = user.data;
        if(!user){
            return res.send({code:500,msg:"选手不存在",data:null}); 
        }
        if(user.score == 0){
            return res.send({code:500,msg:"积分为0不能下分",data:null}); 
        }

        // 暂时用这个，后面去掉
        if(!msg.option_type)msg.option_type = "现金";

        msg.option_score = user.score;
        msg.bank_card = msg.bank_card ? msg.bank_card : "";
        if(msg.option_type !== "现金")msg.card_name = null;
        if(msg.option_type == "现金")msg.option_type = "提款";
        if(msg.option_type == "纠错")msg.option_type = "纠错提款";

        if(msg.option_type == "还款" && Number(user.owe_points || 0) < Number(msg.option_score)){
            return res.send({code:500,msg:"还款金额不能超过欠款金额",data:null});
        }

        let groupInfo = await systemDao.getStatisticsDateByAnyGroup();
        msg.statistics_date = groupInfo.data && groupInfo.data.statistics_date
            ? moment(groupInfo.data.statistics_date).format('YYYY-MM-DD')
            : moment().format('YYYY-MM-DD');

        msg.before_add_score = user.score;  
        let row = await playerOptionDao.subtract_score(msg);                             // 无此帐号(帐号密码分开判断)
        if (row.data) {
            
            // 发往财务
            sentToFrontEnd.sendNoticeToClient("all#",{type:1,msg:msg.player_name + "下了" + msg.option_score + "分，成功,余额：" + (Number(msg.before_add_score) - Number(msg.option_score))});
            // 发往主持 
            sentToFrontEnd.sendNoticeToGameClient("all#",{type:9});

            return res.send({code:200,msg:"操作成功",data:row.data});  
        }else{
            return res.send({code:500,msg:"操作失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})

router.post('/get_score_option_record', async function(req, res) {

    let msg = req.body.data ? req.body.data : req.body;
    let lock = await redlock.lock("get_score_option_record:" + msg.userId, 2000);
    try {

        let row = await playerOptionDao.getScoreOptionRecord(msg);

        if (row.err) {
            lock.unlock();
            return res.send({ code: 500, msg: "查询失败", data: null });
        }

        row.data.list.forEach(item => {
            item.option_time = util.transDate(item.option_time);
            item.working_date = util.transDate(item.working_date).split(" ")[0];
        });

        let data = row.data;

        lock.unlock();    
        return res.send({ code: 200, msg: "获取成功", data });

    } catch (err) { 
        lock.unlock(); 
        console.error("err:", JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
});

router.post('/undo_option_score', async function(req, resp) {
    try {
        let msg = req.body.data ? req.body.data : req.body;
        await redlock.lock("undo_option_score:" + msg.userName, 2000);

        if (!msg.player_name) return resp.send({ code: 500, msg: "没有指定选手", data: null });
        if (!msg.id) return resp.send({ code: 500, msg: "没有指定编号", data: null });

        // 查原始记录
        let res = await playerOptionDao.getScoreOptionRecordById(msg);
        res = res.data[0];
        if (!res) return resp.send({ code: 500, msg: "没有找到指定编号记录", data: null });

        // 超时检查
        if (!util.isTimeLessThanTenMinutes(res.option_time)) {
            return resp.send({ code: 500, msg: "超过十分钟不能再撤销", data: null });
        }

        // 已撤销检查
        if (res.is_revoke == 1 || res.demo == "该记录己撤销操作") {
            return resp.send({ code: 500, msg: "该记录己撤销操作", data: null });
        }

        // 查用户当前余额
        let user = await userDao.getUserByName(msg.player_name);
        if (!user.data) return resp.send({ code: 500, msg: "用户不存在", data: null });

        let currentScore = Number(user.data.score || 0);

        // 上分撤销需检查余额是否够扣回
        if (res.is_add === 1 && currentScore < res.score) {
            return resp.send({ code: 500, msg: "余额不足，无法撤销", data: null });
        }

        // 撤销借款会同时扣回欠款，不能使 owe_points 变成负数。
        if (
            res.option_type == "借款" &&
            Number(user.data.owe_points || 0) < Number(res.score)
        ) {
            return resp.send({ code: 500, msg: "欠款余额不足，无法撤销借款", data: null });
        }

        // 如果原操作是下分，score 取负
        if (res.is_add === 2) res.score = -res.score;

        msg.row = res;
        msg.row.card_name = res.bank_card;
        msg.option_score = res.score;
        msg.bank_card = "";
        msg.option_type = res.option_type;

        let groupInfo = await systemDao.getStatisticsDateByAnyGroup();
        msg.statistics_date = groupInfo.data && groupInfo.data.statistics_date
            ? moment(groupInfo.data.statistics_date).format('YYYY-MM-DD')
            : moment().format('YYYY-MM-DD');

        let row;

        if (msg.option_type == "积分充值") {
            // 积分兑换撤销分支
            row = await pointsExchangeDao.cancelExchangeById(msg);
            if (row.data) {
                let absScore = Math.abs(Number(msg.option_score));
                let finalScore = currentScore - absScore;
                sentToFrontEnd.sendNoticeToClient("all#",{type:1,msg:`${msg.player_name} 积分充值撤销，扣回 ${absScore} 分，成功，余额：${finalScore}`});
                sentToFrontEnd.sendNoticeToGameClient("all#",{type:9});
            }
        } else {
            // 普通上下分撤销分支
            row = await playerOptionDao.undoOptionScore(msg);
            if (row.data) {
                let isAddMode = res.is_add === 1;
                let absScore = Math.abs(Number(msg.option_score));
                let isDepositDown = msg.option_type === "存款下分";
                let optionText = isDepositDown ? "存款下分撤销,恢复存款" : isAddMode ? "上分撤销,下了" : "下分撤销,上了";
                let finalScore = isDepositDown ? currentScore : isAddMode ? currentScore - absScore : currentScore + absScore;

                sentToFrontEnd.sendNoticeToClient("all#",{type:1,msg:`${msg.player_name}${optionText}${absScore}分，成功，余额：${finalScore}`});
                sentToFrontEnd.sendNoticeToGameClient("all#",{type:9});
            }
        }

        if (row.data) {
            return resp.send({ code: 200, msg: "操作成功", data: row.data });
        } else {
            return resp.send({ code: 500, msg: row.err || "操作失败", data: null });
        }
    } catch (err) {
        console.log("undo_option_score err:", JSON.stringify(err));
        return resp.send({ code: 500, msg: "服务器繁忙", data: null });
    }
})

router.post('/get_bankcard', async function(req, res) {     
    let msg = req.body.data?req.body.data:req.body;
    let lock = await redlock.lock("get_bankcard:" + msg.userName,2000);                                           // 客服发聊天过来
    try {
        let row = await playerOptionDao.getBankcard(msg);                                  // 无此帐号(帐号密码分开判断)
        if (row.data ) {
            lock.unlock();
            return res.send({code:200,msg:"获取成功",data:row.data});  
        }else{
            lock.unlock();
            return res.send({code:500,msg:"获取失败",data:null}); 
        }
    } catch (err) {
        lock.unlock();
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null}); 
    }
})

router.post('/get_group_nickname', async function(req, res) {     
    let msg = req.body.data?req.body.data:req.body;
    let lock = await redlock.lock("get_group_nickname:" + msg.userName,1000);                                           // 客服发聊天过来
    try {
        let row = await playerOptionDao.getGroupNickname(msg);   
        if (row.data ) {
            lock.unlock();
            return res.send({code:200,msg:"获取成功",data:row.data});  
        }else{
            lock.unlock();
            return res.send({code:500,msg:"获取失败",data:null}); 
        }
    } catch (err) {
        lock.unlock();
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null}); 
    }
})

router.post('/get_group_players', async function(req, res) { 
    let msg = req.body.data ? req.body.data : req.body;
    let lock = await redlock.lock("get_group_players:" + msg.userId,2000);                                               // 客服发聊天过来
    try {
        if(!msg.group_nickname || msg.group_nickname == ""){
            lock.unlock();
            return res.send({code:500,msg:"没有提供开工群昵称",data:null}); 
        }
        msg.is_top = 1;
        let row = await playerDao.getPlayer(msg);     
        msg.is_top = 0;
        let row2 = await playerDao.getPlayer(msg);             
        let new_row = [...row.data,...row2.data];
        if(row.data){
            lock.unlock();
            return res.send({code:200,msg:"获取选手成功",data:new_row});  
        }else{
            lock.unlock();
            return res.send({code:500,msg:"获取选手失败",data:null});  
        }
    } catch (err) {
        lock.unlock();
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null}); 
    }
})

router.post('/player_fuzzy_query', async function(req, res) {
    let msg = req.body.data?req.body.data:req.body;
    let lock = await redlock.lock("player_fuzzy_query:" + msg.userName,500);
    try {
        if(!msg.player_name || msg.player_name == ""){
            lock.unlock();
            return res.send({code:500,msg:"必须填写选手名称",data:null}); 
        }
        let row = await playerOptionDao.playerFuzzyQuery(msg);
        if (row.data ) {
            lock.unlock();
            return res.send({code:200,msg:"获取成功",data:row.data});  
        }else{
            lock.unlock();
            return res.send({code:500,msg:"获取失败",data:null}); 
        }
    } catch (err) {
        lock.unlock();
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null}); 
    }
})

router.post('/get_profit_score', async function(req, res) {
    let msg = req.body.data?req.body.data:req.body;
    let lock = await redlock.lock("get_profit_score:" + msg.userName,500);
    try {
        let groupInfo = await systemDao.getStatisticsDateByAnyGroup();
        if(groupInfo.data){
            msg.statistics_date = moment(groupInfo.data.statistics_date).format('YYYY-MM-DD');
        }else{
            return res.send({code:500,msg:"还没有开始统计",data:null}); 
        }
                    
        let row = await playerOptionDao.getCombinedStatistics(msg);
        if (row.data ) {
            lock.unlock();
            return res.send({code:200,msg:"获取成功",data:row.data});  
        }else{
            lock.unlock();
            return res.send({code:500,msg:"获取失败",data:null}); 
        }
    } catch (err) {
        lock.unlock();
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null}); 
    }
})
