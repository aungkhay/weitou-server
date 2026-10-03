let express = require("express");
let router = express.Router();
let pomelo = require("pomelo");
let redlock = pomelo.app.get('redlock');
let systemSetupDao = require('../../../dao/systemSetupDao');
let userDao = require('../../../dao/userDao');
const md5 = require('js-md5');
module.exports = router;

router.post('/edit_pw', async function(req, res) {                                                // 客服发聊天过来
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("edit_pw:" + msg.userId,2000);
        let user = await userDao.getAdminByName(msg.userName);                                  // 无此帐号(帐号密码分开判断)
        user = user.data;
        let pw = md5(user.salt + msg.old_password);
        console.log("pw:",pw,user.password);
        if (user.password != pw ) {
            return res.send({code:500,msg:"旧密码错误",data:null});                                                    // 密码错误
        }
        if(msg.new_password != msg.new_password2){
            return res.send({code:500,msg:"两次输入的密码不一致",data:null});
        }
        msg.pw = md5(user.salt + msg.new_password);
        let row = await systemSetupDao.editPw(msg);
        if(row.data && row.data.affectedRows > 0 ){
            return res.send({code:200,msg:"修改成功",data:null});
        }else{
            return res.send({code:500,msg:"修改失败",data:null});
        }       
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})

router.post('/get_points_exchange_ratio', async function(req, res) {                                                // 客服发聊天过来
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("get_points_exchange_ratio:" + msg.username,2000);
        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"必须要填写群昵称",data:null}); 
        }
        let row = await bussionessDao.getPointsExchangeRatio(msg);                                  // 无此帐号(帐号密码分开判断)
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

router.post('/persional_echange_ratio', async function(req, res) {                                                // 客服发聊天过来
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("persional_echange_ratio:" + msg.username,2000);
        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"必须要填写群昵称",data:null}); 
        }
        if(!msg.player_name || msg.player_name == ""){
            return res.send({code:500,msg:"必须要填写选手昵称",data:null}); 
        }
        let row = await bussionessDao.persionalEchangeRatio(msg);                                  // 无此帐号(帐号密码分开判断)
        if (row.data && row.data.affectedRows > 0 ) {
            return res.send({code:200,msg:"设定成功",data:null});  
        }else{
            return res.send({code:500,msg:"设定失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})

router.post('/get_persional_echange_ratio', async function(req, res) {                                                // 客服发聊天过来
    try {
        let msg = req.body.data?req.body.data:req.body;
        console.log('msg:',msg);
        await redlock.lock("get_persional_echange_ratio:" + msg.username,1000);
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