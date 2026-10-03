let express = require("express");
let router = express.Router();
let systemDao = require('../../dao/systemDao');
let pomelo = require("pomelo");
let redlock = pomelo.app.get('redlock');
let util = require('../../util/utils');

router.post('/group_pull_data_setup', async function(req, res) {                                             
    //try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("group_pull_data_setup:" + msg.userName,2000);
        let row = await systemDao.groupChatSetup(msg);  
        if (row.data && row.data.affectedRows > 0 ) {
            // 如果是生成新的群,要开通新房间
            if(row.createRoom.isNeedCreateRoom){
                let msg = {rType:'bjl' , roomId:row.createRoom.roomId};
                pomelo.app.rpc.bjl.bjlRemote.autoCreateSingleRoom(pomelo.app , msg , function(res) {
                    console.log("自动创建单个百家乐房间结果:", res);
                })
            }
            return res.send({code:200,msg:"修改成功",data:null});  
        }else{
            return res.send({code:500,msg:row.err,data:null}); 
        }
    // } catch (err) {  
    //     console.log("err:",JSON.stringify(err));
    //      return res.send({code:500,msg:"修改失败,请检查账号是否己经绑定过别的群",data:null});  
    // }
})

router.post('/get_group_pull_data_setup', async function(req, res) {                                             
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("get_group_pull_data_setup:" + msg.userName,2000);
        if(!msg.userName){
            return res.send({code:500,msg:"请先登录",data:null}); 
        }
        msg.account = msg.userName;
        let row = await systemDao.getGroupPullDataSetupByAccount(msg);                                                     
        row = row.data;
        let data = row.map(item =>{
            item.group_id = item.Id
            item.create_at = util.transDate(item.create_at);
            item.update_at = util.transDate(item.update_at);
            return item;
        })
        return res.send({code:200,msg:"获取成功",data:data});  
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return { err: err, data: null }
    }
})

router.post('/hide_zero_score_players', async function(req, res) {
    try {
        await redlock.lock("zero_score_players_visibility", 2000);
        const row = await systemDao.setPlayersHidden(1);
        if (row.data) {
            return res.send({code:200,msg:"0分选手隐藏成功",data:{affectedRows:row.data.affectedRows || 0}});
        }
        return res.send({code:500,msg:"0分选手隐藏失败",data:null});
    } catch (err) {
        console.log("err:", JSON.stringify(err));
        return res.send({code:500,msg:"0分选手隐藏失败",data:null});
    }
})

router.post('/show_zero_score_players', async function(req, res) {
    try {
        await redlock.lock("zero_score_players_visibility", 2000);
        const row = await systemDao.setPlayersHidden(0);
        if (row.data) {
            return res.send({code:200,msg:"隐藏选手显示成功",data:{affectedRows:row.data.affectedRows || 0}});
        }
        return res.send({code:500,msg:"隐藏选手显示失败",data:null});
    } catch (err) {
        console.log("err:", JSON.stringify(err));
        return res.send({code:500,msg:"隐藏选手显示失败",data:null});
    }
})

// 聊天插件发上来的
router.post('/get_group_pull_data_by_nickname', async function(req, res) {                                             
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("get_group_pull_data_by_nickname:" + msg.userName,2000);
        if(!msg.userName){
            return res.send({code:500,msg:"请先登录",data:null}); 
        }
        msg.account = msg.userName;
        msg.chat_group_nickname = msg.group_nickname;
        let row = await systemDao.getGroupPullDataByChatGroupNickname(msg);                                                     
        row = row.data;
        let data = row.map(item =>{
            item.group_id = item.Id
            item.create_at = util.transDate(item.create_at);
            item.update_at = util.transDate(item.update_at);
            return item;
        })
        return res.send({code:200,msg:"获取成功",data:data});  
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return { err: err, data: null }
    }
})

router.post('/auto_lottery_setup', async function(req, res) {                                                   
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("auto_lottery_setup:" + msg.userName,2000);
        let row = await systemDao.autoLotterySetup(msg);                                                         
        if (row.data.affectedRows > 0 ) {
            return res.send({code:200,msg:"提交成功",data:null});  
        }else{
            return res.send({code:500,msg:"提交失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"提交失败",data:null}); 
    }
})

router.post('/get_auto_lottery_setup', async function(req, res) {                                                   
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("get_auto_lottery_setup:" + msg.userName,2000);
        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"没有提供群昵称",data:null}); 
        }
        let row = await systemDao.getAutoLotterySetup(msg);       
        if(row.data && row.data.length > 0){
            return res.send({code:200,msg:"获取成功",data:row.data[0]});  
        }else{
            return res.send({code:500,msg:"获取失败,没有数据",data:row[0]});  
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"获取失败",data:null});  
    }
})

router.post('/parameter_setup', async function(req, res) {   
    try{                                                
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("parameter_setup:" + msg.userName,2000);
        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"没有提供开工群昵称",data:null}); 
        }
        let row = await systemDao.parameterSetup(msg);                                                         
        if (row.data.affectedRows > 0 ) {
            return res.send({code:200,msg:"提交成功",data:null});  
        }else{
            return res.send({code:500,msg:"提交失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"提交失败",data:null}); 
    }
})

router.post('/get_parameter', async function(req, res) {                                                  
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("get_parameter:" + msg.userName,2000);
        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"没有提供开工群昵称",data:null}); 
        }
        let row = await systemDao.getParameter(msg);                                                          
        if (row.data) {
            return res.send({code:200,msg:"获取成功",data:row.data});  
        }else{
            return res.send({code:500,msg:"获取失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"提交失败",data:null}); 
    }
})

router.post('/personal_parameter_setup', async function(req, res) {                                                  
     try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("personal_parameter_setup:" + msg.userName,2000);
        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"没有提供开工群昵称",data:null}); 
        }
        if(!msg.player_name || msg.player_name == ""){
            return res.send({code:500,msg:"没有提供玩家账号",data:null}); 
        }
        let row = await systemDao.personalParameterSetup(msg);                                                          
        if (row.data.affectedRows > 0 ) {
            return res.send({code:200,msg:"提交成功",data:null});  
        }else{
            return res.send({code:500,msg:"提交失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"提交失败",data:null}); 
    }
})

router.post('/get_personal_parameter', async function(req, res) {                                                   
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("get_personal_parameter:" + msg.userName,2000);
        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"没有提供开工群昵称",data:null}); 
        }
        if(!msg.player_name || msg.player_name == ""){
            return res.send({code:500,msg:"没有提供玩家账号",data:null}); 
        }
        let row = await systemDao.getPersonalParameter(msg);                                                         
        if (row.data ) {
            return res.send({code:200,msg:"提交成功",data:row});  
        }else{
            return res.send({code:500,msg:"提交失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"提交失败",data:null}); 
    }
})

router.post('/edit_desk_nickname', async function(req, res) {                                                  
     try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("edit_desk_nickname:" + msg.userName,2000);
        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"没有提供开工群昵称",data:null}); 
        }
        let row = await systemDao.editDeskNickname(msg);                                                        
        if (row.data.affectedRows > 0 ) {
            return res.send({code:200,msg:"提交成功",data:null});  
        }else{
            return res.send({code:500,msg:"提交失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"提交失败",data:null}); 
    }
})

router.post('/init_desk_coin', async function(req, res) {                                                   
     try {
        let msg = req.body.data?req.body.data:req.body;
        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"没有提供开工群昵称",data:null}); 
        }
        let row = await systemDao.initDeskCoin(msg);                                                         
        if (row.data.affectedRows > 0 ) {
            return res.send({code:200,msg:"提交成功",data:null});  
        }else{
            return res.send({code:500,msg:"提交失败",data:null}); 
        }
        } catch (err) {
            console.log("err:",JSON.stringify(err));
            return res.send({code:500,msg:"提交失败",data:null}); 
        }
})

router.post('/synchronize_points', async function(req, res) {                                                 
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("synchronize_points:" + msg.userName,2000);
        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"没有提供开工群昵称",data:null}); 
        }
        let row = await systemDao.synchronizePoints(msg);                                                         
        if (row.data.affectedRows > 0 ) {
            return res.send({code:200,msg:"提交成功",data:null});  
        }else{
            return res.send({code:500,msg:"提交失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"提交失败",data:null}); 
    }
})


// 添加路单，一天开始前补单
router.post('/add_road', async function(req, res) {                                                  
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("add_road:" + msg.userName,2000);
        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"没有提供开工群昵称",data:null}); 
        }

        if(!msg.shoe){
            return res.send({code:500,msg:"要提供当前靴",data:null}); 
        }

        let r = await systemDao.getGroupPullDataSetup(msg);
        if(!r.data || r.data.length == 0){
            return res.send({code:500,msg:"开工群昵称不正确",data:null}); 
        }
        r = r.data[0];
        msg.roomId = r.Id;
        msg.rType = r.rType;
        
        let row = await systemDao.add_road(msg);    
        if (row.data ) {
            
            msg.cc = row.result.cc;
            msg.jc = row.result.jc;
            msg.road = row.result.road;

            if(msg.rType == "bjl"){
                // 修改状态
                pomelo.app.rpc.bjl.bjlRemote.addRoad(1,msg,function(){});
            }
            return res.send({code:200,msg:"提交成功",data:null});  
        }else{
            return res.send({code:500,msg:"提交失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"提交失败",data:null}); 
    }
})

module.exports = router;
