let express = require("express");
let router = express.Router();
let userDao = require('../../dao/userDao');
let Token = require('../../util/token');
let pomelo = require("pomelo");
let secret = require('../../../config/session').secret;
let redlock = pomelo.app.get('redlock');
const md5 = require('js-md5');
let util = require('../../util/utils');
let ipWhitelist = require('../middleware/ipWhitelist');
const loginSession = require('../../util/loginSession');

// 登录类型由接口决定，不接受请求体中的免踢标记。
router.post('/login', (req, res) => login(req, res, false));
router.post('/control_login', (req, res) => login(req, res, true));

async function login(req, res, isControl) {
    let loginLock;
    try {
        let msg = req.body.data?req.body.data:req.body;

        let user = await userDao.getAdminByName(msg.username);
        user = user.data;
        if(!user){
            return res.send({code:500,msg:"账号或者密码错误",data:null});  
        }

        if(user.permissions != 2){
            return res.send({code:500,msg:"账号或者密码错误",data:null});
        }

        let pw = md5(user.salt + msg.password);
        if (user.password != pw ) {
            return res.send({code:500,msg:"账号或者密码错误",data:null});                                                   
        } else {
            // 按数据库账号 ID 串行签发，不使用客户端可伪造/漏传的 userName。
            if (!isControl) loginLock = await redlock.lock("login:" + user.Id,3000);
            const token = isControl
                ? Token.createControl(user.Id, Date.now(), secret)
                : Token.create(user.Id, Date.now(), secret);
            await userDao.editUserLoginInfo(msg.username,util.getClientIP(req),"","");
            if (!isControl) await loginSession.register(user.Id, token);
            console.log("登录成功")
            return res.send(
            {
                code:200,
                msg:"登录成功",
                data:{
                    userId: user.Id,
                    amount: user.ye,
                    token: token,
                    account: user.username,
                    enable: user.enable
                }
            })
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"登录失败，请稍后重试",data:null});
    } finally {
        if (loginLock) {
            try { await loginLock.unlock(); } catch (err) {
                console.error('[登录锁释放失败]', err.message);
            }
        }
    }
}

router.post('/agent_login', async function(req, res) {
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("agent_login:" + msg.userName,3000);

        let user = await userDao.getAdminByName(msg.username);                                 
        user = user.data;
        if(!user){
            return res.send({code:500,msg:"账号或者密码错误",data:null});  
        }

        if(user.permissions != 1){
            return res.send({code:500,msg:"账号或者密码错误",data:null});
        }

        let pw = md5(user.salt + msg.password);
        if (user.password != pw ) {
            return res.send({code:500,msg:"账号或者密码错误",data:null});                                                   
        } else {
            let token = Token.create(user.Id, Date.now(), secret);
            await userDao.editUserLoginInfo(msg.username,util.getClientIP(req),"","");
            console.log("登录成功")
            return res.send(
            {
                code:200,
                msg:"登录成功",
                data:{
                    userId: user.Id,
                    amount: user.ye,
                    token: token,
                    account: user.username,
                    enable: user.enable
                }
            })
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return { err: err, data: null }
    }
})

router.post('/regist', async function(req, res) {                                            
    try {
        let msg = req.body.data ? req.body.data : req.body;
        await redlock.lock("regist:" , 3000);
        msg.ip = util.getClientIP(req);
        let user = await userDao.createAdminUser(msg);                                 
        user = user.data;
        if(user && user.affectedRows > 0){
            return res.send({code:200,msg:"注册成功",data:null});  
        }else{
            return res.send({code:500,msg:"注册失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return { err: err, data: null }
    }
})

router.post('/get_user_info', async function(req, res) {
    try {
        let msg = req.body.data ? req.body.data : req.body;
        await redlock.lock("get_user_info:" + msg.userId, 3000);
        msg.ip = util.getClientIP(req);
        let user = await userDao.getAdminInfo();  
        user = user.data;
        if(user){
            user.forEach(element => {
                element.registTime = util.transDate(element.registTime);
            });
            return res.send({code:200,msg:"获取成功",data:user});  
        }else{
            return res.send({code:500,msg:"获取失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return { err: err, data: null }
    }
})

router.post('/add_permissions', async function(req, res) {                                            
    try {
        let msg = req.body.data ? req.body.data : req.body;
        await redlock.lock("regist:" , 3000);
        msg.ip = util.getClientIP(req);
        let user = await userDao.addPermissions(msg);                                 
        user = user.data;
        if(user && user.affectedRows > 0){
            return res.send({code:200,msg:"注册成功",data:null});  
        }else{
            return res.send({code:500,msg:"注册失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return { err: err, data: null }
    }
})

router.post('/get_permissions', async function(req, res) {                                            
    try {
        let msg = req.body.data ? req.body.data : req.body;
        await redlock.lock("get_permissions:" , 3000);
        msg.ip = util.getClientIP(req);
        let user = await userDao.getPermissions(msg);                                 
        user = user.data;
        if(user && user.affectedRows > 0){
            return res.send({code:200,msg:"注册成功",data:null});  
        }else{
            return res.send({code:500,msg:"注册失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return { err: err, data: null }
    }
})

router.post('/set_user_permissions', async function(req, res) {  
  try {
        let msg = req.body.data ? req.body.data : req.body;
        await redlock.lock("set_user_permissions:" , 3000);
        msg.ip = util.getClientIP(req);
        if(!msg.permissions_id || !Array.isArray(msg.permissions_id)){
            return res.send({code:500,msg:"参数不正确!",data:null}); 
        }
        msg.permissions = msg.permissions_id.join(",");
        let user = await userDao.setUserPermissions(msg);                                 
        user = user.data;
        console.log("user:",user);
        if(user && user.affectedRows > 0){
            return res.send({code:200,msg:"设定成功",data:null});  
        }else{
            return res.send({code:500,msg:"设定失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return { err: err, data: null }
    }
})

router.post('/get_while_list', async function(req, res) {                                            
    try {
        let msg = req.body.data ? req.body.data : req.body;
        await redlock.lock("get_while_list:" , 1000);
        let row = await userDao.getIpWhileList(msg);                                 
        row = row.data;
        if(row){
            return res.send({code:200,msg:"操作成功",data:row});  
        }else{
            return res.send({code:500,msg:"操作失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return { err: err, data: null }
    }
})

router.post('/set_while_list', async function(req, res) {                                            
    try {
        let msg = req.body.data ? req.body.data : req.body;
        await redlock.lock("set_while_list:" , 1000);
        let row = await userDao.setWhileList(msg);                                 
        row = row.data;
        if(row){
            return res.send({code:200,msg:"操作成功",data:null});  
        }else{
            return res.send({code:500,msg:"操作失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return { err: err, data: null }
    }
})


module.exports = router;
