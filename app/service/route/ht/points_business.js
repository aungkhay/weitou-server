let express = require("express");
let router = express.Router();
let pomelo = require("pomelo");
let redlock = pomelo.app.get('redlock');
let pointsBusinessDao = require('../../../dao/pointsBusinessDao');
let util = require('../../../util/utils');

module.exports = router;

// 新增加减彩
router.post('/add_modifi_points', async function(req, res) {                                                
    try {
        let msg = req.body.data?req.body.data:req.body;
        
        if(!msg.option_type){
            return res.send({code:500,msg:"没有指定操作类型",data:null}); 
        }

        await redlock.lock("add_modifi_points:" + msg.userName,2000);
        let row = await pointsBusinessDao.addModifiPoints(msg);          
        if (row.data ) {
            return res.send({code:200,msg:"添加成功",data:row.data});  
        }else{
            console.log("row:", JSON.stringify(row));
            return res.send({code:500,msg:"添加失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})

router.post('/get_points_record', async function(req, res) {                                                
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("get_points_record:" + msg.userName,2000);

        let row = await pointsBusinessDao.getPointsRecord(msg);                                  
        if (row.data ) {
            row.data.list.forEach(item => {
                item.option_time = util.transDate(item.option_time);
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

router.post('/edit_modifi_points', async function(req, res) {                                                // 客服发聊天过来
    try {
        let msg = req.body.data?req.body.data:req.body;
        if(!msg.id){
            return res.send({code:500,msg:"没有指定修改的编号",data:null}); 
        }
        await redlock.lock("edit_modifi_points:" + msg.userName,2000);
        let row = await pointsBusinessDao.editModifiPoints(msg);                                  // 无此帐号(帐号密码分开判断)
        if (row.data ) {
            return res.send({code:200,msg:"修改成功",data:null});  
        }else{
            return res.send({code:500,msg:"修改失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})

router.post('/delete_modifi_points', async function(req, res) {                                                // 客服发聊天过来
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("delete_modifi_points:" + msg.userName,2000);
        let row = await pointsBusinessDao.deleteModifiPoints(msg);                                  // 无此帐号(帐号密码分开判断)
        if (row.data ) {
            return res.send({code:200,msg:"删除成功",data:null});  
        }else{
            return res.send({code:500,msg:"删除失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})