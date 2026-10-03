let express = require("express");
let router = express.Router();
let playerDao = require('../../dao/playerDao');
let userDao  = require('../../dao/userDao');
let pomelo = require("pomelo");
let redlock = pomelo.app.get('redlock');
let util = require('../../util/utils');

playerDao.MoveDataToLogGame();

router.post('/refresh_player', async function(req, res) {                                                // 客服发聊天过来
    try {
        let msg = req.body.data ? req.body.data : req.body;
        await redlock.lock("refresh_player:" + msg.userId,2000);

        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"没有提供开工群昵称",data:null}); 
        }

        let row = await playerDao.refreshPlayer(msg);
        if(row.data){
            return res.send({code:200,msg:"刷新选手成功,群选手和分表已同步",data:null});  
        }else{
            return res.send({code:500,msg:"刷新选手失败",data:null});  
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return { err: err, data: null }
    }
})

router.post('/add_player', async function(req, res) {                                                // 客服发聊天过来
    //try {
        let msg = req.body.data ? req.body.data : req.body;
        await redlock.lock("add_player:" + msg.userId,2000);
        if(!msg.name || msg.name == ""){
            return res.send({code:500,msg:"没有指定选手名称",data:null});
        }
        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"没有提供开工群昵称",data:null}); 
        }
        let user = await userDao.getUserByName(msg.name);
        if(user.data)msg.isHaveUser = true;
        let row = await playerDao.addPlayer(msg);   
        if(row.data){
            return res.send({code:200,msg:"新增选手成功",data:null});  
        }else{
            return res.send({code:500,msg:"新增选手失败,群里已存在此名称",data:null});  
        }
    // } catch (err) {
    //     console.log("err:",JSON.stringify(err));
    //     return { err: err, data: null }
    // }
})

router.post('/get_player', async function(req, res) {                                             
    try {
        let msg = req.body.data ? req.body.data : req.body;
        await redlock.lock("get_player:" + msg.userId,2000);

        // 注意，这是官方测试群
        if(!msg.group_nickname || msg.group_nickname == "")msg.group_nickname = "辉煌三台";

        let row = await playerDao.getPlayer(msg);     
        if(row.data){
            return res.send({code:200,msg:"获取选手成功",data:row.data});  
        }else{
            return res.send({code:500,msg:"获取选手失败",data:null});  
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return { err: err, data: null }
    }
})

router.post('/edit_player', async function(req, res) {                                             
    try {
        let msg = req.body.data ? req.body.data : req.body;
        await redlock.lock("edit_player:" + String(msg.name || "").trim(),2000);

        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"没有提供开工群昵称",data:null}); 
        }

        if(!msg.name || msg.name == ""){
            return res.send({code:500,msg:"没有指定选手名称",data:null});
        }

        let row = await playerDao.editPlayer(msg);     

        if(row.data){
            return res.send({code:200,msg:"修改选手成功",data:null});  
        }else{
            return res.send({code:500,msg:row.err || "修改选手失败",data:null});  
        }

    } catch(err) {
        console.log("err:",JSON.stringify(err));
        return { err: err, data: null }
    }
})

router.post('/top_player', async function(req, res) {                                             
    try {
        let msg = req.body.data ? req.body.data : req.body;
        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"没有提供开工群昵称",data:null}); 
        }
        if(!msg.name || msg.name == ""){
            return res.send({code:500,msg:"没有指定选手名称",data:null});
        }
        // 同一个群的置顶顺序必须串行更新，避免不同操作者同时置顶造成重号。
        await redlock.lock("top_player:" + msg.group_nickname,2000);
        let row = await playerDao.topPlayer(msg);
        const action = msg.isReset === 1 || msg.isReset === '1' ? "取消置顶" : "置顶选手";
        if(row.data && row.data.affectedRows > 0){
            return res.send({code:200,msg:action + "成功",data:null});
        }else{
            return res.send({code:500,msg:action + "失败",data:null});
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return { err: err, data: null }
    }
})

router.post('/delete_player', async function(req, res) {                                             
    //try {
        let msg = req.body.data ? req.body.data : req.body;
        await redlock.lock("delete_player:" + msg.userId,2000);
        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"没有提供开工群昵称",data:null}); 
        }
        if(!msg.name || msg.name == ""){
            return res.send({code:500,msg:"没有指定选手名称",data:null});
        }

        let user = await userDao.getUserByName(msg.name);
        if(user.data && user.data.score > 0){
            return res.send({code:500,msg:"选手还有积分，不能删除",data:null});
        }
      
        let row = await playerDao.deletePlayer(msg); 
        if(row.data.affectedRows > 0){
            return res.send({code:200,msg:"删除选手成功",data:null});  
        }else{
            return res.send({code:500,msg:"删除选手失败",data:null});  
        }
    // } catch(err) {
    //     console.log("err:",JSON.stringify(err));
    //     return { err: err, data: null }
    // }
})

router.post('/hide_player', async function(req, res) {                                             
    try {
        let msg = req.body.data ? req.body.data : req.body;
        await redlock.lock("edit_player:" + msg.userId,2000);
     
        if(!msg.name || msg.name == ""){
            return res.send({code:500,msg:"没有指定选手名称",data:null});
        }
        if(!msg.option_type || (msg.option_type != 1 && msg.option_type != 2)){ 
            return res.send({code:500,msg:"没有指定操作类型",data:null});
        }

        msg.is_hide = msg.option_type === 1 ? 1 : 0;
        let row = await playerDao.hidePlayer(msg);       
        if(row.data){
            return res.send({code:200,msg:"操作成功",data:null});  
        }else{
            return res.send({code:500,msg:"操作失败",data:null});  
        }
    } catch(err) {
        console.log("err:",JSON.stringify(err));
        return { err: err, data: null }
    }
})

module.exports = router;
