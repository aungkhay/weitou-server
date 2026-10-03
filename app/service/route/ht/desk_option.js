let express = require("express");
let router = express.Router();
let pomelo = require("pomelo");
let redlock = pomelo.app.get('redlock');
let userDao = require('../../../dao/userDao');
let deskOptionDao = require('../../../dao/deskOptionDao');
const sentToFrontEnd = require("../../../domain/sx/sendToFrontEnd");

module.exports = router;

router.post('/trans_score', async function(req, res) {                                                // 客服发聊天过来
    try {
        let msg = req.body.data?req.body.data:req.body;
         // 锁两个用户（防并发）
        await redlock.lock(`trans_score:${msg.source_player_name}`, 1000);
        await redlock.lock(`trans_score:${msg.target_player_name}`, 1000);

        if (!msg.source_desk) {
            return res.send({code:500,msg:"必须要填写源台"});
        }

        if (!msg.target_desk) {
            return res.send({code:500,msg:"必须要填写目标台"});
        }

        //  修正判断
        if (msg.source_player_name === msg.target_player_name) {
            return res.send({code:500,msg:"不能同一客户互转"});
        }

        //  金额校验
        let amount = Number(msg.source_score);
        if (!amount || amount <= 0) {
            return res.send({code:500,msg:"金额必须大于0"});
        }

        let user = await userDao.getUserByName(msg.target_player_name);
        if (!user || !user.data) {
            return res.send({code:500,msg:"没有找到目标用户"});
        }
        msg.target_before_add_score = user.data.score;
        msg.target_userId = user.data.Id;
        msg.target_option_type = "充值";

        let user2 = await userDao.getUserByName(msg.source_player_name);
        if (!user2 || !user2.data) {
            return res.send({code:500,msg:"没有找到源用户"});
        }
        msg.source_before_add_score = user2.data.score;
        msg.source_userId = user2.data.Id;
        msg.source_option_type = "提款";

        if(msg.source_before_add_score < msg.source_score) {
            return res.send({code:500,msg:"转账金额超过源账户余额"});
        }

        msg.demo = msg.source_player_name + " 转" + msg.source_score + "分给" + msg.target_player_name;
        let row = await deskOptionDao.trans_score(msg);                                  // 无此帐号(帐号密码分开判断)
        
        if (row.data ) {
            sentToFrontEnd.sendNoticeToGameClient("all#", {type:9});
            sentToFrontEnd.sendNoticeToClient("all#",{type:1,msg:"多台互转：" + msg.demo});
            return res.send({code:200,msg:"操作成功",data:null});  
        }else{
            return res.send({code:500,msg:"操作失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({ code: 500, msg: "服务器繁忙", data: null });
    }
})

router.post('/trans_all_score', async function(req, res) {                                                // 客服发聊天过来
    try {
        let msg = req.body.data?req.body.data:req.body;
        // 锁两个用户（防并发）
        await redlock.lock(`trans_score:${msg.source_player_name}`, 2000);
        await redlock.lock(`trans_score:${msg.target_player_name}`, 2000);

        if (!msg.source_desk) {
            return res.send({code:500,msg:"必须要填写源台"});
        }

        if (!msg.target_desk) {
            return res.send({code:500,msg:"必须要填写目标台"});
        }

        //  修正判断
        if (msg.source_desk === msg.target_desk &&
            msg.source_player_name === msg.target_player_name) {
            return res.send({code:500,msg:"不能同一台同一客户互转"});
        }

        let r = await userDao.getUserByName(msg.source_player_name);
        if(!r.data){
            return res.send({code:500,msg:"没有找到源用户"});
        }

        msg.source_score = r.data.score;
        msg.source_before_add_score = r.data.score;
        msg.source_userId = r.data.Id;

        let user = await userDao.getUserByName(msg.target_player_name);
        if (!user || !user.data) {
            return res.send({code:500,msg:"没有找到目标用户"});
        }
        msg.target_before_add_score = user.data.score;
        msg.target_userId = user.data.Id;
        msg.target_option_type = "充值";

        msg.source_option_type = "提款";

        msg.demo = msg.source_player_name + " 转" + msg.source_score + "分给" + msg.target_player_name;
        let row = await deskOptionDao.trans_score(msg);                                  // 无此帐号(帐号密码分开判断)
        if (row.data ) {
            sentToFrontEnd.sendNoticeToGameClient("all#", {type:9});
            sentToFrontEnd.sendNoticeToClient("all#",{type:1,msg:"多台互转：" + msg.demo});
            return res.send({code:200,msg:"操作成功",data:null});  
        }else{
            return res.send({code:500,msg:"操作失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({ code: 500, msg: "服务器繁忙", data: null });
    }
})

router.post('/revoke_trans_score', async function(req, res) {
     try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("revoke_trans_score:" + msg.userName,2000);
        if (!msg.trans_id) {
            return res.send({code:500,msg:"缺少trans_id"});
        }
        let row = await deskOptionDao.revokeTransScore(msg);                                  // 无此帐号(帐号密码分开判断)
        if (row.data ) {
            return res.send({code:200,msg:"操作成功",data:row.data});  
        }else{
            return res.send({code:500,msg:"操作失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({ code: 500, msg:"服务器繁忙", data: null });
    }
        
})

// 不在这里这个函数
router.post('/get_score_option_type', async function(req, res) {                                                // 客服发聊天过来
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("get_score_option_type:" + msg.userName,2000);
        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"必须要填写群昵称",data:null}); 
        }
        let row = await deskOptionDao.getScoreOptionType(msg);                                  // 无此帐号(帐号密码分开判断)
        if (row.data ) {
            return res.send({code:200,msg:"获取成功",data:row.data});  
        }else{
            return res.send({code:500,msg:"获取失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({ code: 500, msg: "服务器繁忙", data: null });
    }
})

router.post('/add_score', async function(req, res) {                                                // 客服发聊天过来
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("add_score:" + msg.userName,2000);
        if(!msg.option_score || msg.option_score <= 0){
            return res.send({code:500,msg:"金额不正确",data:null}); 
        }
        if(!msg.player_name){
            return res.send({code:500,msg:"没有指定玩家",data:null}); 
        }

        msg.bank_card = msg.bank_card ? msg.bank_card : "";
        msg.option_type =  "充值";
        let user = await userDao.getUserByName(msg.player_name);
        if(user.data)msg.before_add_score = user.data.score;  
        let row = await playerOptionDao.add_score(msg);                                  // 无此帐号(帐号密码分开判断)
        if (row.data ) {
            return res.send({code:200,msg:"设定成功",data:null});  
        }else{
            return res.send({code:500,msg:"设定失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({ code: 500, msg: "服务器繁忙", data: null });
    }
})

router.post('/subtract_score', async function(req, res) {                                                // 客服发聊天过来
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("subtract_score:" + msg.userName,2000);

        if(!msg.option_score || msg.option_score <= 0){
            return res.send({code:500,msg:"参数不正确",data:null}); 
        }

        if(!msg.player_name){
            return res.send({code:500,msg:"没有指定选手",data:null}); 
        }
        
        msg.bank_card = msg.bank_card ? msg.bank_card : "";
        msg.option_type = "提款";
        let user = await userDao.getUserByName(msg.player_name);
        if(user.data)msg.before_add_score = user.data.score;  
        let row = await playerOptionDao.subtract_score(msg);                                  // 无此帐号(帐号密码分开判断)
        if (row.data ) {
            return res.send({code:200,msg:"设定成功",data:null});  
        }else{
            return res.send({code:500,msg:"设定失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({ code: 500, msg: "服务器繁忙", data: null });
    }
})

