let express = require("express");
let router = express.Router();
let pomelo = require("pomelo");
let redlock = pomelo.app.get('redlock');
let bankBussionessDao = require('../../../dao/bankBussionessDao');
let playerDao = require('../../../dao/playerDao');
let systemDao = require('../../../dao/systemDao');
let util = require('../../../util/utils');
const moment = require('moment');

module.exports = router;

router.post('/get_bank_card', async function(req, res) {                                                
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("get_bank_card:" + msg.userName,2000);
        let row = await bankBussionessDao.getBankCard(msg);                                            
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

router.post('/add_bank_card', async function(req, res) {                                     
    try {
        let msg = req.body.data?req.body.data:req.body;

        if(!msg.initial_amount ){
            return res.send({code:500,msg:"初始化金额无效",data:null});  
        }

        if (
            msg.initial_office_amount === undefined ||
            msg.initial_office_amount === null ||
            msg.initial_office_amount === "" ||
            !Number.isFinite(Number(msg.initial_office_amount))
        ) {
            return res.send({code:500,msg:"初始办公金额无效",data:null});
        }
        msg.initial_office_amount = Number(msg.initial_office_amount);

        await redlock.lock("add_bank_card:" + msg.userName,2000);
        let row = await bankBussionessDao.addBankCard(msg);                                 
        if (row.data.affectedRows > 0 ) {
            return res.send({code:200,msg:"添加成功",data:row.data});  
        }else{
            return res.send({code:500,msg:"添加失败,检查是否已存在卡账号",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null}); 
    }
})

router.post('/edit_bank_card', async function(req, res) {                                                
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("edit_bank_card:" + msg.userName,2000);  

        if(!msg.id || msg.id == '' ){
            return res.send({code:500,msg:"id不能为空",data:null});  
        }

        if(!msg.card_name || msg.card_name == '' ){
            return res.send({code:500,msg:"姓名不能为空",data:null});  
        }

        if(!msg.card_status || msg.card_status == '' ){
            return res.send({code:500,msg:"卡状态不能为空",data:null});  
        }

        if (
            msg.initial_office_amount === undefined ||
            msg.initial_office_amount === null ||
            msg.initial_office_amount === "" ||
            !Number.isFinite(Number(msg.initial_office_amount))
        ) {
            return res.send({code:500,msg:"初始办公金额无效",data:null});
        }
        msg.initial_office_amount = Number(msg.initial_office_amount);

        if(typeof msg.deduction_amount !== 'number' || msg.deduction_amount < 0 ){
            return res.send({code:500,msg:"下分金额不能小于0",data:null});  
        }

        if(typeof msg.bonus_amount !== 'number' || msg.bonus_amount < 0 ){
            return res.send({code:500,msg:"上分金额不能小于0",data:null});  
        }

        if(typeof msg.transfer_in_amount !== 'number' || msg.transfer_in_amount < 0 ){
            return res.send({code:500,msg:"转入金额不能小于0",data:null});  
        }

        if(typeof msg.office_amount !== 'number' || msg.office_amount < 0 ){
            return res.send({code:500,msg:"办公金额不能小于0",data:null});  
        }

        if(typeof msg.transfer_out_amount !== 'number' || msg.transfer_out_amount < 0 ){
            return res.send({code:500,msg:"转出金额不能小于0",data:null});  
        }

        let row = await bankBussionessDao.editBankCard(msg);
        if (row.data && row.data.affectedRows > 0) {
            return res.send({code:200,msg:"修改成功",data:null});  
        }else{
            return res.send({code:500,msg:typeof row.err === "string" ? row.err : "修改失败",data:null});
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({code:500,msg:"服务器繁忙",data:null});
    }
})

router.post('/get_interbank_transfer', async function(req, res) {
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("get_interbank_transfer:" + msg.userName,2000);
        let row = await bankBussionessDao.getInterBanktransfer(msg);                                 
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

function registerTransferRoute(route, operation, successMessage) {
    router.post(route, async function(req, res) {
        try {
            const body = req.body || {};
            const msg = Object.assign({}, body.data || body);
            // 幂等编号按已认证账户隔离，不能相信嵌套 data 中的 userId。
            msg.userId = req.user ? req.user.userId : body.userId;
            msg.userName = req.user ? req.user.userName : body.userName;
            msg.id = msg.id || msg.Id;
            // 旧前端未提供请求编号时保留短时防连点；可靠重试需要 request_id。
            if (route === '/inter_bank_transfer' && !msg.request_id) {
                await redlock.lock('inter_bank_transfer:' + msg.userName, 2000);
            }
            const groupInfo = await systemDao.getStatisticsDateByAnyGroup();
            if (groupInfo.err) throw new Error('读取营业日失败');
            msg.statistics_date = groupInfo.data && groupInfo.data.statistics_date
                ? moment(groupInfo.data.statistics_date).format('YYYY-MM-DD')
                : moment().format('YYYY-MM-DD');
            const row = await operation(msg);
            return res.send(row.data
                ? { code: 200, msg: successMessage, data: row.data }
                : { code: 500, msg: typeof row.err === 'string' ? row.err : '操作失败', data: null });
        } catch (err) {
            console.error('Bank transfer route failed:', err);
            return res.send({ code: 500, msg: '服务器繁忙，请稍后重试', data: null });
        }
    });
}
registerTransferRoute('/inter_bank_transfer', bankBussionessDao.inteBbankTransfer, '转账成功');
registerTransferRoute('/edit_inter_bank_transfer', bankBussionessDao.editInteBbankTransfer, '修改成功');
registerTransferRoute('/revoke_inter_bank_transfer', bankBussionessDao.revokeInterBankTransfer, '撤销成功');
registerTransferRoute('/delete_inter_bank_transfer', bankBussionessDao.revokeInterBankTransfer, '删除成功');

router.post('/card_details_inquiry', async function(req, res) {
    try {
        // 兼容平铺、data 包装及 query 参数；空的嵌套字段不能覆盖有效的顶层筛选值。
        const body = req.body || {};
        const data = body.data && typeof body.data === 'object' ? body.data : {};
        const query = req.query || {};
        let msg = Object.assign({}, body, data, query);
        const cardTypeCandidates = [
            query.card_type, query.cardType,
            data.card_type, data.cardType,
            body.card_type, body.cardType
        ];
        const cardType = cardTypeCandidates.find(value => value !== undefined
            && value !== null && String(value).trim() !== '');
        msg.card_type = cardType === undefined ? '' : String(cardType).trim();
        const cardNameCandidates = [
            query.card_name, query.cardName,
            data.card_name, data.cardName,
            body.card_name, body.cardName
        ];
        const cardName = cardNameCandidates.find(value => value !== undefined
            && value !== null && String(value).trim() !== '');
        msg.card_name = cardName === undefined ? '' : String(cardName).trim();
        const optionTypeCandidates = [
            query.option_type, query.optionType,
            data.option_type, data.optionType,
            body.option_type, body.optionType
        ];
        const optionType = optionTypeCandidates.find(value => value !== undefined
            && value !== null && String(value).trim() !== '');
        msg.option_type = optionType === undefined ? '' : String(optionType).trim();
        await redlock.lock("card_details_inquiry:" + msg.userName,2000);
        let row = await bankBussionessDao.cardDetailsInquiry(msg);    
        if (row.data ) {
            row.data.rows.forEach(element => {
                element.create_at = util.transDate(element.create_at);
                return element;
            });
            return res.send({code:200,msg:"获取成功",data:row.data});  
        }else{
            return res.send({code:500,msg:"获取失败",data:null}); 
        }
    } catch (err) {
        console.log("err:",JSON.stringify(err));
        return res.send({ code: 500, msg: "服务器繁忙", data: null });
    }
})

router.post('/bank_statistics', async function(req, res) {
    try {
        let msg = req.body.data?req.body.data:req.body;
        await redlock.lock("bank_statistics:" + msg.userName,2000);
        let row = await bankBussionessDao.bankStatistics(msg);                                 
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

router.post('/bank_statistics_by_date', async function(req, res) {
    try {
        let msg = req.body.data?req.body.data:req.body;
        if (!msg.card_name || msg.card_name == ''){ 
            return res.send({code:500,msg:"必须指定银行卡",data:null});
        }
        await redlock.lock("bank_statistics_by_date:" + msg.userName,2000);
        let row = await bankBussionessDao.bankStatisticsByDate(msg);                                 
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

