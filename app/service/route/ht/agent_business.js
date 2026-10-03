let express = require("express");
let router = express.Router();
let pomelo = require("pomelo");
let redlock = pomelo.app.get('redlock');
let agentBusinessDao = require('../../../dao/agentBusinessDao');
let userDao = require('../../../dao/userDao');
let util = require('../../../util/utils');

module.exports = router;

// 新增加减彩
router.post('/add_agent', async function(req, res) {       
    let msg = req.body.data?req.body.data:req.body;
    const operatorName = req.user && req.user.userName;
    const operatorId = req.user && req.user.userId;
    await redlock.lock("add_agent:" + operatorId,1000);                                        
    try {
        if(!msg.player_name || msg.player_name == ""){
            return res.send({code:500,msg:"没有指定代理名称",data:null}); 
        }

        // 操作者必须以 token 中的身份为准，不能使用请求体里的 userName，
        // 否则代理可以伪造上级账号。
        let operator = await userDao.getAdminByName(operatorName);
        if(!operator.data || (operator.data.permissions != 1 && operator.data.permissions != 2)){
            return res.send({code:403,msg:"没有新增代理权限",data:null});
        }

        let user = await userDao.getUserByName(msg.player_name);
        if(!user.data){
            return res.send({code:500,msg:"指定代理不存在",data:null});
        }

        // 代理新增的代理自动归属到自己名下；后台管理员沿用原来的新增逻辑。
        const parentAgentName = operator.data.permissions == 1 ? operatorName : null;
        let row = await agentBusinessDao.addAgent(msg.player_name, parentAgentName);
        if (row.data && row.data.affectedRows > 0) {
            return res.send({code:200,msg:"添加成功",data:null});  
        }else{
            return res.send({code:500,msg:"添加失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})

router.post('/add_member', async function(req, res) {                                                
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("add_member:" + msg.userName,2000);
        let user = await userDao.getUserByName(msg.agent_name);
        if(!user.data){
            return res.send({code:500,msg:"指定代理不存在",data:null});
        }
        if(user.data.level != 2){   
             return res.send({code:500,msg:"指定用户不是代理",data:null});
        }
        user = await userDao.getUserByName(msg.player_name);
        if(!user.data){
            return res.send({code:500,msg:"指定玩家不存在",data:null});
        }
        let row = await agentBusinessDao.addMember(msg);
        if (row.data.affectedRows > 0) {
            return res.send({code:200,msg:"添加成功",data:null});
        }else{
            return res.send({code:500,msg:"添加失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})

router.post('/get_agent', async function(req, res) {                                                
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("get_agent:" + msg.userName,2000);

        let row = await agentBusinessDao.getAgent(msg);
        if (row.data ) {
            let date = new Date();
            row.data.list.forEach(item => {
                item.Settlement = util.transDate(date);
                item.optioner = msg.userName;
                item.option_time = util.transDate(date);
            });
            return res.send({code:200,msg:"获取成功",data:row.data});  
        }else{
            return res.send({code:500,msg:"获取失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null}); 
    }
})

router.post('/get_member', async function(req, res) {                                                
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("get_member:" + msg.userName,2000);

        if(!msg.agent_name || msg.agent_name == ""){
            return res.send({code:500,msg:"没有指定代理名称",data:null});
        }   

        let row = await agentBusinessDao.getMember(msg);
        if (row.data ) {
            let date = new Date();
            row.data.list.forEach(item => {
                item.option_time = util.transDate(date);
            });
            return res.send({code:200,msg:"获取成功",data:row.data});  
        }else{
            return res.send({code:500,msg:"获取失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})

router.post('/get_member_details', async function(req, res) {
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("get_member_details:" + msg.userName,2000);

        let row = await agentBusinessDao.getMemberDetails(msg);
        if (row.data ) {
            let date = new Date();
            row.data.list.forEach(item => {
                item.option_time = util.transDate(date);
            });
            return res.send({code:200,msg:"获取成功",data:row.data});  
        }else{
            return res.send({code:500,msg:"获取失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})