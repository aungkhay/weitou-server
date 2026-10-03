let express = require("express");
let router = express.Router();
let pomelo = require("pomelo");
let redlock = pomelo.app.get('redlock');
let officeBussionessDao = require('../../../dao/officeBussionessDao');
let playerDao = require('../../../dao/playerDao');
let systemDao = require('../../../dao/systemDao');
const moment = require('moment');

module.exports = router;

router.post('/add_office_expenses', async function(req, res) {                                                // 客服发聊天过来
    try {
        let msg = req.body.data?req.body.data:req.body;
        if(!msg.card_name){
            return res.send({code:500,msg:"没有指定银行卡名称",data:null}); 
        }

        await redlock.lock("add_office_expenses:" + msg.userName,2000);

        let groupInfo = await systemDao.getStatisticsDateByAnyGroup();
        msg.statistics_date = groupInfo.data && groupInfo.data.statistics_date
            ? moment(groupInfo.data.statistics_date).format('YYYY-MM-DD')
            : moment().format('YYYY-MM-DD');
        
        let row = await officeBussionessDao.addOfficeExpenses(msg);    
        if (row.data ) {
            return res.send({code:200,msg:"添加成功",data:row.data});  
        }else{
            return res.send({code:500,msg:typeof row.err === "string" ? row.err : "添加失败",data:null});
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})

router.post('/edit_office_expenses', async function(req, res) {                                                // 客服发聊天过来
    try {
        let msg = req.body.data?req.body.data:req.body;
        if(!msg.id){
            return res.send({code:500,msg:"没有指定修改的编号",data:null}); 
        }

        await redlock.lock("edit_office_expenses:" + msg.userName,2000);

        let groupInfo = await systemDao.getStatisticsDateByAnyGroup();
        msg.statistics_date = groupInfo.data && groupInfo.data.statistics_date
            ? moment(groupInfo.data.statistics_date).format('YYYY-MM-DD')
            : moment().format('YYYY-MM-DD');

        let row = await officeBussionessDao.editOfficeExpenses(msg);                                  // 无此帐号(帐号密码分开判断)
        if (row.data ) {
            return res.send({code:200,msg:"修改成功",data:null});  
        }else{
            return res.send({code:500,msg:typeof row.err === "string" ? row.err : "修改失败",data:null});
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})

router.post('/get_office_expenses', async function(req, res) {                                                // 客服发聊天过来
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("get_office_expenses:" + msg.userName,2000);
        let row = await officeBussionessDao.getOfficeExpenses(msg);                                  // 无此帐号(帐号密码分开判断)
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

router.post('/delete_office_expenses', async function(req, res) {                                                // 客服发聊天过来
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("delete_office_expenses:" + msg.userName,2000);
        let groupInfo = await systemDao.getStatisticsDateByAnyGroup();
        msg.statistics_date = groupInfo.data && groupInfo.data.statistics_date
            ? moment(groupInfo.data.statistics_date).format('YYYY-MM-DD')
            : moment().format('YYYY-MM-DD');
        let row = await officeBussionessDao.deleteOfficeExpenses(msg);                                  // 无此帐号(帐号密码分开判断)
        if (row.data ) {
            return res.send({code:200,msg:"删除成功",data:null});  
        }else{
            return res.send({code:500,msg:"删除",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})
