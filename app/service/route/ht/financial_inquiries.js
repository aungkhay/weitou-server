let express = require("express");
let router = express.Router();
let pomelo = require("pomelo");
let redlock = pomelo.app.get('redlock');
let financealDao = require('../../../dao/financialInquiriesDao');
let systemDao = require('../../../dao/systemDao');
let playerDao = require('../../../dao/playerDao');
let util = require('../../../util/utils');
let parseResult = require('../../../domain/sx/parseResult');
let result = require('../../../domain/sx/result');
const moment = require('moment');

module.exports = router;

router.post('/player_betting_details', async function(req, res) {                                                // 客服发聊天过来
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("player_betting_details:" + msg.userId,2000);

        let row = await financealDao.getPlayerBettingDetails(msg);                                  // 无此帐号(帐号密码分开判断)
        row = row.data;
        if(row){
            let rows = row.rows.map ( item => ({
                work_date:util.transDate(item.stime).split(" ")[0],
                palyer_nickname: item.userName,
                round: item.cc + "-"+ item.jc,
                bet:item.xz,
                win:item.yl,
                bet_command:item.xzmx,
                command_format:item.xzmx,
                bet_time: util.transDate(item.betTime),
                result: parseResult.parseResult(item.kj),
                result_time: util.transDate(item.stime),
                settlement_status: '己结算',
                raw_string: item.xzmx,
                before_bet_money: item.before_bet_ye,
                init_money:0,
                table_number:item.group_nickname
            }))
            row.rows = rows;
            return res.send({code:200,msg:"获取成功",data:row});
        }else{
            return res.send({code:500,msg:"获取失败",data:null});
        }       
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({ code: 500, msg: "操作失败", data: null });
    }
})

router.post('/round_details', async function(req, res) {                                           
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("round_details:" + msg.userId,2000);
        let row = await financealDao.getJcStatistics(msg);  
        row = row.data;
        if(row){
            row.list.forEach(item => {
                item.stime =  moment(item.stime).format("YYYY-MM-DD HH:mm:ss");
            });
            return res.send({code:200,msg:"获取成功",data:row});
        }else{
            return res.send({code:500,msg:"获取失败",data:null});
        }       
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({ code: 500, msg: "操作失败", data: null });
    }
})

router.post('/ht_get_bet_data', async function(req, res) {
    //try {
        let msg = req.body.data ? req.body.data : req.body;
        let lock = await redlock.lock("ht_get_bet_data:" + msg.userId, 2000);

        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"没有提供开工群昵称",data:null}); 
        }

        let rInfo = await systemDao.getGroupPullDataSetup(msg);
          if(msg.date){
            msg.statistics_date = moment(msg.date).format('YYYY-MM-DD');
        }else{
            if(!rInfo.data[0].statistics_date)rInfo.data[0].statistics_date = new Date();
            msg.statistics_date = moment(rInfo.data[0].statistics_date).format('YYYY-MM-DD');
        }

        let row = await financealDao.getPlayerBetData(msg);   
        row = row.data;
        row = row.map (item =>{
            let s = {};
            s.name = item.userName;
            s.bet_detail = {
                z:item.z,
                h:item.h,
                x:item.x,
                zd:item.zd,
                xd:item.xd,
                l:item.l,
                k:item.k,
                q:item.q,
                m:item.m
            }
            return s;
        })
        if(row){
            lock.unlock();
            return res.send({code:200,msg:"获取记录成功",data:row});  
        }else{
            lock.unlock();
            return res.send({code:500,msg:"获取记录失败",data:null});  
        }    

    // } catch (err) {
    //     console.log("err:", JSON.stringify(err));
    //     return res.send({ code: 500, msg: "操作失败", data: null });
    // }
});

router.post('/ht_get_score_data', async function(req, res) {
    try {
        let msg = req.body.data ? req.body.data : req.body;
        let lock = await redlock.lock("ht_get_score_data:" + msg.userId, 2000);
        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"没有提供开工群昵称",data:null}); 
        }

        let rInfo = await systemDao.getGroupPullDataSetup(msg);

        if(msg.date){
            msg.statistics_date = moment(msg.date).format('YYYY-MM-DD');
        }else{
            if(!rInfo.data[0].statistics_date)rInfo.data[0].statistics_date = new Date();
            msg.statistics_date = moment(rInfo.data[0].statistics_date).format('YYYY-MM-DD');
        }

        let row = await financealDao.getPlayerScoreData(msg);   
        row = row.data;

        if(row){
            row.forEach(element => {
                element.shoe = msg.shoe;
                element.round = msg.round;
            });
            lock.unlock();
            return res.send({code:200,msg:"获取记录成功",data:row});  
        }else{
            lock.unlock();
            return res.send({code:500,msg:"获取记录失败",data:null});  
        }

    } catch (err) {
        console.log("err:", JSON.stringify(err));
        return res.send({ code: 500, msg: "操作失败", data: null });
    }
});

async function get_detail(r,parameter_setup){
        r.g_l = r.g_l ?? 0;
        r.g_m = r.g_m ?? 0;
        r.g_d = r.g_d ?? 0;
        r.tzx = r.d_z + r.d_x;
        r.tsbl = 0;   //  台三宝+幸运6
        r.sbltyk = 0; //  三宝+幸运6台盈亏
        r.sblspyk = r.h_yl + r.zd_yl + r.xd_yl + r.m_yl + r.q_yl + r.l_yl + r.k_yl;  // 上盘盈亏,默认是全部上盘

        // 如果庄闲都下，那要算对冲
        r.zxdc = 0;
        r.spm = '庄';
        let z = r.z - r.g_z -r.d_z;  // 扣掉个占成和台占成
        let x = r.x - r.g_x - r.d_x;
        if(r.z > 0 && r.x > 0){
            if(z > x){
                r.zxdc = x;
                r.sp = z - x;     // 上盘
                r.spm = '庄';     // 上盘买
            }else{
                r.zxdc = z;      //  庄闲对冲
                r.sp = x - z;
                r.spm = '闲';
            }
        }else{
            if(r.z > 0){
                r.sp = z;
                r.spm = '庄';
            }else{
                r.sp = x;
                r.spm = '闲';
            }
        }
        // 算零头，这里先定500
        if(r.sp < 500){
            r.lt = r.sp;
            r.sp = 0;
        }else{
            r.lt = r.sp % 100;
            r.sp -= r.lt;
        }
        // 算盈亏
        let yk = result.do_settlement_jc_bjl(r.kj,parameter_setup,r);

        r.zyk = yk.t_yl;
        r.xzyk = yk.t_xzyl;
        r.gyk = yk.g_yl;
        r.ltyk = yk.t_ltyl;
        r.dcyk = yk.t_dcyl;
        r.spzsyk = yk.t_spzsyl.toFixed(2);      // 上盘抽水盈亏      
        r.xztyk = yk.t_xztyl;                   // 闲庄台盈亏   
        r.xzspyk = yk.t_xzspyl;                 // 闲庄上盘盈亏

        return r;
}

// 选手洗码盈亏-查询选手明细
router.post('/ht_player_details_query', async function(req, res) {
    try {
        let msg = req.body.data ? req.body.data : req.body;
        await redlock.lock("ht_player_details_query:" + msg.userId,2000);
        
        let row = await financealDao.htPlayerDetailsQuery(msg);   
        row = row.data;
        if(row){
            return res.send({code:200,msg:"获取记录成功",data:row});  
        }else{
            return res.send({code:500,msg:"获取记录失败",data:null});  
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({ code: 500, msg: "获取记录失败", data: null });
    }
})

router.post('/ht_player_details_query_by_shoe', async function(req, res) {
    try {
        let msg = req.body.data ? req.body.data : req.body;
        await redlock.lock("ht_player_details_query_by_shoe:" + msg.userId,2000);
        
        if(!msg.group_nickname || msg.group_nickname == ""){
            return res.send({code:500,msg:"没有提供开工群昵称",data:null}); 
        }

        //if(msg.endTime)msg.endTime += " 23:59:59";

        let row = await financealDao.htPlayerDetailsQueryByShoe(msg);   
        row = row.data;
        if(row){
            row.forEach
            return res.send({code:200,msg:"获取记录成功",data:row});  
        }else{
            return res.send({code:500,msg:"获取记录失败",data:null});  
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({ code: 500, msg: "获取记录失败", data: null });
    }
})

router.post('/ht_sb_details_query', async function(req, res) {
    try {
        let msg = req.body.data ? req.body.data : req.body;
        await redlock.lock("ht_sb_details_query:" + msg.userId,2000);
        
        let row = await financealDao.htSbDetailsQuery(msg);   
        row = row.data;
        if(row){
            return res.send({code:200,msg:"获取记录成功",data:row});  
        }else{
            return res.send({code:500,msg:"获取记录失败",data:null});  
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({ code: 500, msg: "获取记录失败", data: null });
    }
})

// 对冲、零钱明细查询
router.post('/cash_details_inquiry', async function(req, res) { 
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("cash_details_inquiry:" + msg.userId,2000);
        let row = await financealDao.cashDetailsInquiry(msg);                                  // 无此帐号(帐号密码分开判断)
        row = row.data;
        return res.send({code:200,msg:"获取成功",data:row});
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({ code: 500, msg: "获取失败", data: null });
    }
})

// 个人占成明细
router.post('/zc_details_inquiry', async function(req, res) {
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("zc_details_inquiry:" + msg.userId,2000);

        if(!msg.currentPage || !msg.pageSize){
            return res.send({code:500,msg:"要指定页参数",data:null}); 
        }

        let row = await financealDao.getZcTotal(msg);
        row = row.data;
        if(row.list){
            return res.send({code:200,msg:"获取成功",data:row});
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({ code: 500, msg: "服务器繁忙", data: null });
    }
})

// 现金充值明细查询
router.post('/recharge_details_inquiry', async function(req, res) {
    try {
        let msg = req.body.data?req.body.data:req.body;

        await redlock.lock("recharge_details_inquiry:" + msg.userId,2000);
        //if(msg.endTime)msg.endTime += " 23:59:59";
        
        let row = await financealDao.rechargeDetailsInquiry(msg);                                  // 无此帐号(帐号密码分开判断)
        row = row.data;
        row.list.forEach(item => {
            item.option_time = util.transDate(item.option_time);
            item.working_date = util.transDate(item.working_date).split(" ")[0];
            item.is_add = null;
            item.memo = item.demo;
            item.demo = null;
        });

        return res.send({code:200,msg:"获取成功",data:row});
        
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({ code: 500, msg: "服务器繁忙", data: null });
    }
})
