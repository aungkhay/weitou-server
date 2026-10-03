let express = require("express");
let router = express.Router();
let pomelo = require("pomelo");
let redlock = pomelo.app.get('redlock');
let pointsExchangeDao = require('../../../dao/pointsExchangeDao');
let systemDao = require('../../../dao/systemDao');
let util = require('../../../util/utils');
const moment = require('moment');
const sendToFront = require("../../../domain/sx/sendToFrontEnd");

module.exports = router;

router.post('/single_player_all_group_exchange', async function(req, res) {    
    let msg = req.body.data?req.body.data:req.body;
    let lock = await redlock.lock("single_player_all_group_exchange:",3000);  

    try {
        
        if(!msg.player_name || msg.player_name == ""){
            return res.send({code:500,msg:"请指定玩家",data:null}); 
        }

        let groupInfo = await systemDao.getStatisticsDateByAnyGroup();
        if(groupInfo.data)msg.statistics_date = moment(groupInfo.data.statistics_date).format('YYYY-MM-DD');
        
        let row = await pointsExchangeDao.singlePlayerAllGroupExchange(msg);
        if (row.data && row.data.res ) {

            let r = await systemDao.getOptionIdByPlayer(msg);
            r = r.data;
            for(let item of r){
                console.log(msg.player_name + "上了" + row.data.score + "分");
                sendToFront.sendNoticeToGameClient("all#",{type:9});
                sendToFront.sendNoticeToClient(item.chat_group_nickname,{type:1,msg:item.player_name + "上了" + item.score + "分",isChangScore:true});
            }

            //lock.unlock();
            return res.send({code:200,msg:"操作成功",data:row.data});  
        }else{
            //lock.unlock();
            return res.send({code:500,msg:row.err,data:null}); 
        }
    } catch (err) {
        lock.unlock();
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})

router.post('/single_group_exchange', async function(req, res) {     
    let msg = req.body.data?req.body.data:req.body;
    let lock = await redlock.lock("single_group_exchange:",3000);

    try {
        if(!msg.group_nickname || msg.group_nickname == ""){
            lock.unlock();
            return res.send({code:500,msg:"请指定群",data:null}); 
        }

        let groupInfo = await systemDao.getStatisticsDateByAnyGroup();
        if(groupInfo.data)msg.statistics_date = moment(groupInfo.data.statistics_date).format('YYYY-MM-DD');

        let row = await pointsExchangeDao.singleGroupExchange(msg);                                 
        if (row.data && row.data.res ) {

            let arr = row.data.data;
            for(e of arr){

                let r = await systemDao.getOptionIdByPlayer(e);
                r = r.data;
                for(let item of r){
                    console.log(item + ":"+ e.player_name + "上了" + e.score + "分");
                   
                    sendToFront.sendNoticeToClient(item.chat_group_nickname,{type:1 ,msg:e.player_name + "上了" + e.score + "分",isChangScore:true});
                    sendToFront.sendNoticeToGameClient("all#",{type:9});

                }
            }
            //lock.unlock();
            return res.send({code:200,msg:"操作成功",data:row.data});  
        }else{
            //lock.unlock();
            return res.send({code:500,msg:row.err,data:null}); 
        }
    } catch (err) {
        lock.unlock();
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})

router.post('/all_group_exchange', async function(req, res) {     
    let msg = req.body.data?req.body.data:req.body;
    let lock = await redlock.lock("all_group_exchange:",3000);

    let groupInfo = await systemDao.getStatisticsDateByAnyGroup();
    if(groupInfo.data)msg.statistics_date = moment(groupInfo.data.statistics_date).format('YYYY-MM-DD');

    try {
        let row = await pointsExchangeDao.allGroupExchange(msg);
        if (row.data ) {
            //lock.unlock();
            return res.send({code:200,msg:"操作成功",data:row.data});  
        }else{
            //lock.unlock();
            return res.send({code:500,msg:row.err,data:null}); 
        }
    } catch (err) {
        lock.unlock();
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})

router.post('/cancel_exchange', async function(req, res) {      
    let msg = req.body.data?req.body.data:req.body;
    let lock = await redlock.lock("cancel_exchange:",3000);

    try {

        let groupInfo = await systemDao.getStatisticsDateByAnyGroup();
        if(groupInfo.data)msg.statistics_date = moment(groupInfo.data.statistics_date).format('YYYY-MM-DD');

        let row = await pointsExchangeDao.cancelExchange(msg);     
        if (row.data ) {
            lock.unlock();
            return res.send({code:200,msg:"操作成功",data:row.data});  
        }else{
            lock.unlock();
            return res.send({code:500,msg:row.err,data:null}); 
        }
    } catch (err) {
        lock.unlock();
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})

router.post('/get_exchange_info', async function(req, res) {     
    let msg = req.body.data?req.body.data:req.body;
    let lock = await redlock.lock("get_exchange_info:" + msg.userId,3000);

    try {
        if(!msg.option_type || msg.option_type == ""){
            return res.send({code:500,msg:"必须指定操作类型",data:null}); 
        }
        let row = await pointsExchangeDao.getExchangeInfo(msg);                                 
        if (row.data) {
            let data = [];
            row.data.list.forEach(item => {
                let obj = {};
                obj.group_nickname = item.group_nickname;
                obj.player_name = item.player_name;
                obj.option_type = item.type == 'exchange' ? "兑换积分" : item.type == 'cancel' ? "撤销兑换" : item.type == 'reset' ? "清零" : null;
                obj.redeem_points = -item.points_change;
                obj.rebate_amount = item.score_change; // 返水金额
                obj.option_time = util.transDate(item.stime);
                obj.memo = item.memo;
                obj.personal_points_redemption_ratio = item.personal_points_redemption_ratio ? item.personal_points_redemption_ratio: null;
                obj.exchange_type = item.exchange_type;
                obj.exchange_date = item.exchange_date ? moment(item.exchange_date).format('YYYY-MM-DD') : null;
                obj.operator = item.operator;
                obj.batch_id = item.batch_id;
                obj.is_revoke = Number(item.is_revoke) === 1;
                obj.can_restore = item.type === 'reset' && Number(item.is_revoke) !== 1 && !!item.batch_id;
                data.push(obj);
            });
            row.data.list = data;
            lock.unlock();
            return res.send({code:200,msg:"操作成功",data:row.data});  
        }else{
            lock.unlock();
            return res.send({code:500,msg:row.err,data:null}); 
        }
    } catch (err) {
        lock.unlock();
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})

router.post('/points_clear', async function(req, res) {      
    let lock;

    try {
        lock = await redlock.lock("points_clear:",30000);
        let msg = req.body.data?req.body.data:req.body;

        let groupInfo = await systemDao.getStatisticsDateByAnyGroup();
        if(groupInfo.data)msg.statistics_date = moment(groupInfo.data.statistics_date).format('YYYY-MM-DD');

        let row = await pointsExchangeDao.pointsClear(msg);
        if (row.data) {
            return res.send({code:200,msg:"操作成功",data:row.data});  
        }else{
            return res.send({code:500,msg:row.err,data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    } finally {
        if (lock) {
            try {
                await lock.unlock();
            } catch (unlockErr) {
                console.log("points_clear unlock err:", JSON.stringify(unlockErr));
            }
        }
    }
})

router.post('/points_clear_revoke', async function(req, res) {
    let lock;

    try {
        const msg = req.body.data ? req.body.data : req.body;
        msg.batch_id = msg.batch_id ? String(msg.batch_id).trim() : "";

        if (!msg.batch_id) {
            return res.send({code:500,msg:"必须指定清零批次",data:null});
        }

        // 与清零共用同一把锁，避免同一时刻发生清零和撤销。
        lock = await redlock.lock("points_clear:",30000);

        let groupInfo = await systemDao.getStatisticsDateByAnyGroup();
        if(groupInfo.data)msg.statistics_date = moment(groupInfo.data.statistics_date).format('YYYY-MM-DD');

        const row = await pointsExchangeDao.pointsClearRevoke(msg);
        if (row.data) {
            return res.send({code:200,msg:"撤销成功",data:row.data});
        }

        return res.send({code:500,msg:row.err,data:null});
    } catch (err) {
        console.log("points_clear_revoke err:", JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    } finally {
        if (lock) {
            try {
                await lock.unlock();
            } catch (unlockErr) {
                console.log("points_clear_revoke unlock err:", JSON.stringify(unlockErr));
            }
        }
    }
})

router.post('/virtual_player_points_clear', async function(req, res) {     
    let msg = req.body.data?req.body.data:req.body;
    let lock = await redlock.lock("virtual_player_points_clear:",3000);

    try {
        let groupInfo = await systemDao.getStatisticsDateByAnyGroup();
        if(groupInfo.data)msg.statistics_date = moment(groupInfo.data.statistics_date).format('YYYY-MM-DD');

        let row = await pointsExchangeDao.virtualPlayerPointsClear(msg);
        if (row.data) {
            lock.unlock();
            return res.send({code:200,msg:"操作成功",data:row.data});  
        }else{
            lock.unlock();
            return res.send({code:500,msg:row.err,data:null}); 
        }
    } catch (err) {
        lock.unlock();
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})

router.post('/get_player_exchange_points', async function(req, res) {     
    let msg = req.body.data?req.body.data:req.body;
    let lock = await redlock.lock("get_player_exchange_points:",3000);

    //try {
        let row = await pointsExchangeDao.getPlayerExchangePoints(msg);
        if (row.data) {
            lock.unlock();
            return res.send({code:200,msg:"操作成功",data:row.data});  
        }else{
            lock.unlock();
            return res.send({code:500,msg:row.err,data:null}); 
        }
    // } catch (err) {
    //     lock.unlock();
    //     console.log("err:",JSON.stringify(err));
    //     return res.send({code:500,msg:"服务器繁忙",data:null});
    // }
})

