let express = require("express");
let router = express.Router();
let pomelo = require("pomelo");
let redlock = pomelo.app.get('redlock');
let bussionessDao = require('../../../dao/bussionessDao');
let playerDao = require('../../../dao/playerDao');
let systemDao = require('../../../dao/systemDao');

module.exports = router;

router.post('/copy_group_personal_setup', async function(req, res) {
    try {
        const msg = req.body && (req.body.data || req.body) || {};
        const row = await bussionessDao.copyGroupPersonalSetup(msg);
        if (row.err) {
            return res.send({ code: 500, msg: typeof row.err === 'string' ? row.err : '复制失败', data: null });
        }
        return res.send({ code: 200, msg: '复制完成', data: row.data });
    } catch (err) {
        console.error('copy_group_personal_setup error:', err);
        return res.send({ code: 500, msg: '服务器繁忙', data: null });
    }
});

router.post('/points_echange_ratio', async function(req, res) {                                              
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("points_echange_ratio:" + msg.userName,1000);
        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"必须要填写群昵称",data:null}); 
        }
        let row = await bussionessDao.pointsEchangeRatio(msg);                                  
        if (row.data && row.data.affectedRows > 0 ) {
            return res.send({code:200,msg:"修改成功",data:null});  
        }else{
            return res.send({code:500,msg:"修改失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({ code: 500, msg: "服务器繁忙", data: null });
    }
})

router.post('/get_points_exchange_ratio', async function(req, res) {                                             
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("get_points_exchange_ratio:" + msg.userName,1000);
        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"必须要填写群昵称",data:null}); 
        }
        let row = await bussionessDao.getPointsExchangeRatio(msg);                                  
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

router.post('/persional_echange_ratio', async function(req, res) {                                             
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("persional_echange_ratio:" + msg.userName,1000);

        if(msg.option_type === 1 && (!msg.group_nickname || msg.group_nickname == "")){
            return res.send({code:500,msg:"必须要选择操作台",data:null}); 
        }

        if(!msg.player_name || msg.player_name == ""){
            return res.send({code:500,msg:"必须要填写选手昵称",data:null}); 
        }

        let row = await bussionessDao.persionalEchangeRatio(msg);     
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

router.post('/get_persional_echange_ratio', async function(req, res) {     
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("get_persional_echange_ratio:" + msg.userName,300);
        let row = await bussionessDao.getPersionalEchangeRatio(msg);                                  
        if (row.data ) {
            return res.send({code:200,msg:"获取成功",data:row.data});  
        }else{
            return res.send({code:500,msg:"获取失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})

router.post('/player_copy', async function(req, res) {                                              
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("player_copy:" + msg.userName,1000);
        if(msg.source_desk ==  msg.target_desk){
            return res.send({code:500,msg:"同台不能复制",data:null}); 
        }
        msg.group_nickname = msg.target_desk;
        let user = await playerDao.getPlayerByArray(msg);
        if(user.data && user.data.length > 0){
            return res.send({code:500,msg:"己存在相同的选手名称",data:null}); 
        }
        msg.row = user.data;
        let res2 = await systemDao.getGroupPullDataSetup(msg);
        if(!res2.data || res2.data.length == 0){
             return res.send({code:500,msg:"目标台不存在",data:null}); 
        }
        let row = await bussionessDao.playerCopy(msg);                                  // 无此帐号(帐号密码分开判断)
        if (row.data ) {
            return res.send({code:200,msg:"操作成功",data:null});  
        }else{
            return res.send({code:500,msg:"操作失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})

// reset_bank_card_amount
router.post('/get_persional_echange_ratio', async function(req, res) {     
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("get_persional_echange_ratio:" + msg.userName,1000);
        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"必须要填写群昵称",data:null}); 
        }
        let row = await bussionessDao.getPersionalEchangeRatio(msg);                                  
        if (row.data ) {
            return res.send({code:200,msg:"获取成功",data:row.data});  
        }else{
            return res.send({code:500,msg:"获取失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})
