let express = require("express");
let router = express.Router();
let pomelo = require("pomelo");
let redlock = pomelo.app.get('redlock');
let financialStatistics = require('../../../dao/financialStatisticsDao');

module.exports = router;

router.post('/daily_query_summary', async function(req, res) {                                                // 客服发聊天过来
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("daily_query_summary:" + msg.userId,2000);

        if(!msg.currentPage || !msg.pageSize){
            return res.send({code:500,msg:"要指定页参数",data:null}); 
        }

        const result = await financialStatistics.dailyQuerySummary(msg);

        // 保护性处理，避免 result.data 为 null 导致读取失败
        if (!result) {
            console.error('dailyQuerySummary returned null/undefined', result);
            return res.send({code:500,msg:"查询失败",data:null}); 
        }
        if (result.err) {
            console.warn('dailyQuerySummary returned err:', result.err);
            // 如果是缺少时间范围等可预判错误，返回 400
            if (result.err === 'MISSING_TIME_RANGE') {
                return res.send({code:500,msg:"请提供 startTime 和 endTime",data:null}); 
            }
            return res.send({ code: 500, msg: '查询出错', data: null });
        }

        const safeData = result.data || { list: [], total: 0, summary: {} };
        const list = Array.isArray(safeData.list) ? safeData.list : [];
        const total = Number(safeData.total) || list.length || 0;
        const summary = safeData.summary || {};
        
        return res.send({code:200,msg:"获取记录成功",data:{list,total,summary}});
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({ code: 500, msg: "服务器繁忙", data: null });
    }
})

router.post('/sb_statistics', async function(req, res) { 
    try{                                              
        let msg = req.body.data ? req.body.data : req.body;
        await redlock.lock("sb_statistics:" + msg.userId,2000);
        
        if(!msg.currentPage || !msg.pageSize){
            return res.send({code:500,msg:"要指定页参数",data:null}); 
        }

        let row = await financialStatistics.sbStatistics(msg);  
        row = row.data;
        if(row){
            return res.send({code:200,msg:"获取记录成功",data:row});  
        }else{
            return res.send({code:500,msg:"获取记录失败",data:null});  
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({ code: 500, msg: "服务器繁忙", data: null });
    }
})

router.post('/personal_proportion_statistics', async function(req, res) { 
    try{                                              
        let msg = req.body.data ? req.body.data : req.body;
        await redlock.lock("personal_proportion_statistics:" + msg.userId,2000);
        
        if(!msg.currentPage || !msg.pageSize){
            return res.send({code:500,msg:"要指定页参数",data:null}); 
        }

        let row = await financialStatistics.personalProportionsStatistics(msg);   
        row = row.data;
        if(row){
            return res.send({code:200,msg:"获取记录成功",data:row});  
        }else{
            return res.send({code:500,msg:"获取记录失败",data:null});  
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({ code: 500, msg: "服务器繁忙", data: null });
    }
})



