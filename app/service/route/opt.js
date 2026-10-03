let express = require("express");
let router = express.Router();
let HG_DEF = require('../../util/hgConfine');
let pomelo = require("pomelo");
let redlock = pomelo.app.get('redlock');
let cache = require('../../dao/Cache');
const formidable = require('formidable');
let Config = require('../../../config/config');
let systemDao = require('../../dao/systemDao');
let userDao = require('../../dao/userDao');
const { sendRequest, getGroupInfo }  = require('../../chat/sendGroupMessage.js');
const sendChat = require("../../chat/sendChat")
let util = require('../../util/utils');
let CODE = require('../../util/code');
const GAMESTATE = require('../../util/gameMsg');
let parseResult = require('../../domain/sx/parseResult');
let fs = require("fs");
const sendToFront = require('../../domain/sx/sendToFrontEnd.js');
const moment = require('moment');
const { send } = require("process");
const crypto = require("crypto");

// opt.js 中的前端提示只在该群当前处于下注状态时发送。
// sxRoom.setStateRedis 会把实时房间状态写入 <rType>st:<roomId>，
// 这里直接读取 Redis，避免为每条错误提示发起跨服务器 RPC。
async function sendNoticeToClientDuringBet(groupInfo, channelName, notice, sourceMsg) {
    if (!groupInfo || !groupInfo.Id || !channelName) {
        return false;
    }

    const rType = groupInfo.rType || 'bjl';
    const stateRedisKey = rType + "st:" + groupInfo.Id;
    let isBetting = false;

    try {
        const roomState = await cache.get(stateRedisKey);
        isBetting = Boolean(
            roomState &&
            Number(roomState.gameState) === GAMESTATE.BET
        );
    } catch (err) {
        console.error(
            "获取房间下注状态失败: key=" + stateRedisKey,
            err
        );
    }

    if (!isBetting) {
        console.log(
            "[跳过非下注时段提示] roomId=" +
            groupInfo.Id +
            ", channelName=" +
            channelName +
            ", msg=" +
            (notice && notice.msg ? notice.msg : "")
        );
        return false;
    }

    // 聊天平台可能重复回传同一条历史消息。使用 Redis 原子去重，
    // 同一桌、同一消息 ID、同一提示内容在 24 小时内只推送一次。
    if (sourceMsg && sourceMsg.msgId !== undefined && sourceMsg.msgId !== null) {
        const noticeHash = crypto
            .createHash("sha1")
            .update(String(sourceMsg.msgId) + "|" + String(notice.msg || ""))
            .digest("hex");
        const dedupeKey =
            "frontBetNotice:" + rType + ":" + groupInfo.Id + ":" + noticeHash;

        try {
            const isFirstNotice = await cache.setIfAbsent(dedupeKey, true, 86400);
            if (!isFirstNotice) {
                console.log(
                    "[跳过重复弹窗] roomId=" + groupInfo.Id +
                    ", msgId=" + sourceMsg.msgId +
                    ", msg=" + (notice.msg || "")
                );
                return false;
            }
        } catch (err) {
            console.error("错误提示去重失败: key=" + dedupeKey, err);
        }
    }

    sendToFront.sendNoticeToClient(channelName, notice);
    return true;
}

// 接收下注时不弹窗；错误先进入对应桌台队列，点击导入时再统一提示。
async function queueNoticeForBetImport(groupInfo, sourceMsg, noticeMessage) {
    if (!groupInfo || !groupInfo.Id || !noticeMessage) {
        return false;
    }

    const deferredMsg = {
        username: sourceMsg.username || "未知用户",
        group_nickname: groupInfo.group_nickname,
        roomId: groupInfo.Id,
        rType: groupInfo.rType || "bjl",
        msgId: sourceMsg.msgId,
        deferredImportNotice: noticeMessage
    };

    return await new Promise(resolve => {
        pomelo.app.rpc.bjl.bjlRemote.doBet(1, deferredMsg, function() {
            resolve(true);
        });
    });
}

function isAdminBetCommand(content) {
    const compact = String(content || "")
        .replace(/[\s\uFEFF\xA0\u2000-\u200B\u3000]+/g, "");
    if (!compact) return false;

    let parsed;
    try {
        parsed = parseResult.parseBetStrToArray(compact);
    } catch (err) {
        return false;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) return false;

    const firstType = parsed[0] && parsed[0].type;
    if (firstType === "撤销" || firstType === "改") {
        // 单独撤/C/改/G，或后面带有合法玩法，才算控制指令。
        if (parsed.length === 1) {
            return /^(撤销?|c|改|g)$/i.test(compact);
        }
        return parsed.slice(1).some(item => item && item.type);
    }

    return parsed.some(item =>
        item && item.type &&
        (
            (Number(item.amount) > 0) ||
            String(item.type).includes("梭")
        )
    );
}


// 工具上传下标(只针对前3图片)
function resolveToolUploadChatId(data, groupInfo) {
    const requestChatId = data.chatId !== undefined ? data.chatId : data.chat_id;

    // 群 ID 往往超过 Number.MAX_SAFE_INTEGER。C# 如果按 long 写成 JSON 数字，
    // Node 在 JSON 解析阶段就会丢失精度，此时不能用失真的值覆盖数据库绑定。
    if (typeof requestChatId === 'string' && requestChatId.trim()) {
        return requestChatId.trim();
    }
    if (typeof requestChatId === 'number' && Number.isSafeInteger(requestChatId)) {
        return String(requestChatId);
    }
    if (requestChatId !== undefined && requestChatId !== null && requestChatId !== '') {
        console.warn('[send_index] 忽略非字符串或不安全的 chat_id，回退数据库绑定');
    }
    return String(groupInfo.chat_id || '').trim();
}

router.post('/send_index', async function(req, res) {                                               
    let data = req.body.data ? req.body.data : req.body;
    await redlock.lock("send_index:" + data.userId,2000);

    if(!data.group_nickname || data.group_nickname == ""){
        return res.send({code:500,msg:"必须要填写群昵称",data:null}); 
    }

    // 因为前端传过来的群昵称对应数据库的chat_group_nickname,但参数是group_nickname,所以这里要转换一下
    data.chat_group_nickname = data.group_nickname;
    let groupResult = await systemDao.getGroupPullDataByChatGroupNickname(data);
    let groupInfo = groupResult && Array.isArray(groupResult.data) ? groupResult.data[0] : null;
    if(!groupInfo){
        return res.send({code:500,msg:"群组信息不存在",data:null});
    }
    let r = {err:"无法上传图片"};
    let msg = {};
    msg.group_nickname = groupInfo.group_nickname;
    msg.roomId = groupInfo.Id;
    msg.rType = 'bjl';  
    msg.userName = data.userName;
    msg.msgId = data.msgId;
    msg.userId = data.userId;
    msg.chat_id = resolveToolUploadChatId(data, groupInfo);

    // 上传工具实际发送图片时已经持有当前群 chatId。同步回来，避免修改靴局、
    // 重载桌台设置或数据库绑定暂时为空后，机器人有任务却没有发送目标。
    if(msg.chat_id && msg.chat_id !== String(groupInfo.chat_id || "").trim()){
        await systemDao.setGroupChatId(msg);
    }
    
    if(data.index == 1){
        msg.tool_upload_start = true;
        pomelo.app.rpc.bjl.bjlRemote.startGame(1,msg,function(res){

        });
    }
    
    if(data.index == 2){
        // index=2 是发送指令，不再依赖工具上传图片后的回调。
        msg.server_send_stop_image = true;
        return pomelo.app.rpc.bjl.bjlRemote.stopBet(1,msg,function(result){
            if (!result || String(result.code) !== '90') {
                return res.send({code:500,msg:result && result.msg || "服务器发送截止图片失败",data:null});
            }
            return res.send({code:200,msg:"截止图片发送成功",data:result.data});
        });
    }
    return res.send({code:200,msg:"上传成功",data:null}); 

})

router.post('/edit_bet_data', async function(req, res) {                                               
    let data = req.body.data ? req.body.data : req.body;
    await redlock.lock("edit_bet_data:" + data.userId,1000);

    if(!data.group_nickname || data.group_nickname == ""){
        return res.send({code:500,msg:"必须要填写群昵称",data:null}); 
    }

    if(!data.player_name || data.player_name == ""){
        return res.send({code:500,msg:"必须要填写选手名称",data:null}); 
    }

    let groupInfo = await systemDao.getGroupPullDataSetup(data);
    groupInfo = groupInfo.data[0];
    if (!groupInfo) {
        return res.send({ code: 500, msg: "群组信息不存在", data: null });
    }

    let user = await userDao.getUserByName(data.player_name);
    if (!user.data) {
        return res.send({ code: 500, msg: "选手信息不存在", data: null });
    }
    user = user.data;

    data.cc = data.shoe;
    data.jc = data.round;
    data.roomId = groupInfo.Id;
    data.statistics_date = moment(groupInfo.statistics_date).format("YYYY-MM-DD");

    const beforeBetResult = await userDao.getPlayerBettingRecords({
        cc: data.cc,
        jc: data.jc,
        userId: user.Id,
        group_nickname: data.group_nickname
    });
    if (beforeBetResult.err) {
        return res.send({ code: 500, msg: "读取原下注记录失败", data: null });
    }
    const beforeBetRows = beforeBetResult.data;

    let sum_score = await userDao.getSumScoreByName(data);
    let xz = sum_score ? sum_score.xz : 0 ;
    let all_score = user.score + xz;

    const total = Object.values(data.bet).reduce((sum, val) => sum + val, 0);
    if(all_score < total){
        return res.send({ code: 500, msg: "下注金额超过可用金额", data: null });
    }

    const cleanResult = await userDao.cleanPlayerBettingRecord(data);
    if (cleanResult.err) {
        return res.send({ code: 500, msg: "清除原下注记录失败", data: null });
    }
    let msg = {};
    msg.xzmx = Object.entries(data.bet)
    .filter(([_, value]) => value > 0) // 只保留下注金额大于 0 的区域
    .map(([key, value]) => `${key}${value}`)
    .join('');

    msg.bet = parseResult.parseBetStrToArray(msg.xzmx);
    msg.username = data.player_name;
    msg.group_nickname = data.group_nickname;
    msg.xz = total;
    msg.userId = user.Id;
    msg.rType =  groupInfo.rType;
    msg.roomId = groupInfo.Id;
    msg.loginip = user.loginip;
    msg.yxxz = 0;
    msg.gx = user.gx;
    msg.reference_name = user.reference_name;
    msg.terminal = user.terminal;
    msg.xm_type = "单边";
    msg.xmb_s = 0;
    msg.xmb_d = 0;
    msg.ye = user.score;
    msg.cc = data.shoe;
    msg.jc = data.round;
    msg.statistics_date = groupInfo.statistics_date;
    msg.msgId = 0;

    const fillResult = await userDao.fillBetInfo(msg);
    if (fillResult.err || !fillResult.data) {
        return res.send({ code: 500, msg: "写入新下注记录失败", data: null });
    }

    // 修改前快照只保存下注类型和金额；原记录 ID 单独保存在 original_record_ids。
    const betFieldNames = {
        z: '庄',
        x: '闲',
        h: '和',
        zd: '庄对',
        xd: '闲对',
        l: '小老虎',
        k: '大老虎',
        m: '完美',
        q: '幸运七'
    };
    const beforeBetLogData = {};
    beforeBetRows.forEach(row => {
        Object.entries(betFieldNames).forEach(([field, chineseName]) => {
            const amount = Number(row[field] || 0);
            if (amount > 0) {
                beforeBetLogData[chineseName] = Number(beforeBetLogData[chineseName] || 0) + amount;
            }
        });
    });
    const afterBetLogData = {};
    Object.entries(betFieldNames).forEach(([field, chineseName]) => {
        const amount = Number(data.bet[field] || 0);
        if (amount > 0) {
            afterBetLogData[chineseName] = amount;
        }
    });

    const logResult = await userDao.addBetEditLog({
        player_user_id: user.Id,
        player_name: data.player_name,
        group_nickname: data.group_nickname,
        room_id: groupInfo.Id,
        r_type: groupInfo.rType,
        shoe_no: data.shoe,
        round_no: data.round,
        original_record_ids: beforeBetRows.map(row => row.Id),
        before_bet_data: beforeBetLogData,
        after_bet_data: afterBetLogData,
        before_total: beforeBetRows.reduce((sum, row) => sum + Number(row.xz || 0), 0),
        after_total: total,
        operator_id: data.userId,
        operator_name: data.userName || data.username || '',
        operator_ip: req.ip || (req.connection && req.connection.remoteAddress) || ''
    });
    if (logResult.err) {
        return res.send({ code: 500, msg: "下注已修改，但保存修改日志失败", data: null });
    }

    return res.send({ code: 200, msg: "修改成功", data: null });
})

// 开始统计
router.post('/start_statistics', async function(req, res) {                                               
    let data = req.body.data ? req.body.data : req.body;
    await redlock.lock("start_statistics:" + data.userId,1000);

    if(!data.group_nickname || data.group_nickname == ""){
        return res.send({code:500,msg:"必须要填写群昵称",data:null}); 
    }

    data.Event = HG_DEF.EVENT.EV_DEALER_STARTSTATISTICS_REQ;
    doOpt(data,res);
})

// 停止统计
router.post('/stop_statistics', async function(req, res) {                                               
    let data = req.body.data ? req.body.data : req.body;
    await redlock.lock("stop_statistics:" + data.userId,1000);

    if(!data.group_nickname || data.group_nickname == ""){
        return res.send({code:500,msg:"必须要填写群昵称",data:null}); 
    }

    data.Event = HG_DEF.EVENT.EV_DEALER_STOPSTATISTICS_REQ;
    
    doOpt(data,res);
})

// 清空投注表,本局作废
router.post('/clear_bet_table', async function(req, res) {                                               
    let data = req.body.data ? req.body.data : req.body;
    await redlock.lock("clear_bet_table:" + data.userId,1000);

    if(!data.group_nickname || data.group_nickname == ""){
        return res.send({code:500,msg:"必须要填写群昵称",data:null}); 
    }

    data.Event = HG_DEF.EVENT.EV_DEALER_CANCELTHEGAME_REQ;
    doOpt(data,res);
})

// import_table
router.post('/import_table', async function(req, res) {
    let data = req.body.data ? req.body.data : req.body;
    await redlock.lock("import_table:" + data.userId,2000);

    if(!data.group_nickname || data.group_nickname == ""){
        return res.send({code:500,msg:"必须要填写群昵称",data:null}); 
    }

    data.Event = HG_DEF.EVENT.EV_DEALER_IMPORT_TABLE_REQ;
    doOpt(data,res);
})

router.post('/proceed_next_shoe', async function(req, res) {                                                
    let data = req.body.data ? req.body.data : req.body;
    await redlock.lock("proceed_next_shoe:" + data.userId,1000);
    if(!data.group_nickname || data.group_nickname == ""){
        return res.send({code:500,msg:"必须要填写群昵称",data:null}); 
    }
    data.Event = HG_DEF.EVENT.EV_DEALER_ORGANIZECARDS_REQ;
    doOpt(data,res);
})

router.post('/proceed_next_round', async function(req, res) {
    let data = req.body.data ? req.body.data : req.body;
    await redlock.lock("proceed_next_round:" + data.userId,1000);
    if(!data.group_nickname || data.group_nickname == ""){
        return res.send({code:500,msg:"必须要填写群昵称",data:null}); 
    }
    data.Event = HG_DEF.EVENT.EV_DEALER_PROCEED_NEXT_ROUND_REQ;
    doOpt(data,res);
})
  
// 作废
router.post('/next_round', async function(req, res) {                                                
    let data = req.body.data ? req.body.data : req.body;
    await redlock.lock("next_round:" + data.userId,1000);
    if(!data.group_nickname || data.group_nickname == ""){
        return res.send({code:500,msg:"必须要填写群昵称",data:null}); 
    }
    data.Event = HG_DEF.EVENT.EV_DEALER_BETSTART_REQ;
    doOpt(data,res);
})

router.post('/set_hztp', async function(req, res) {                                                
    let data = req.body.data ? req.body.data : req.body;
    await redlock.lock("set_hztp:" + data.userId,1000);
    if(!data.group_nickname || data.group_nickname == ""){
        return res.send({code:500,msg:"必须要填写群昵称",data:null}); 
    }
    data.Event = HG_DEF.EVENT.EV_DEALER_HZTP_REQ;
    doOpt(data,res);
})

router.post('/pause_game', async function(req, res) {        
    let data = req.body.data ? req.body.data : req.body;
    let lock = await redlock.lock("pause_game:" + data.userId,1000);    
    try{
        if(!data.group_nickname || data.group_nickname == ""){
            lock.unlock();
            return res.send({code:500,msg:"必须要填写群昵称",data:null}); 
        }
        data.Event = HG_DEF.EVENT.EV_DEALER_PAUSEGAME_REQ;
        doOpt(data,res);
        lock.unlock();
    }catch(err){
        console.log("err:",JSON.stringify(err));
        lock.unlock();
        return res.send({code:500,msg:"服务器繁忙,请稍后再试",data:null});
    }
})

router.post('/lottery_draw', async function(req, res) {                                               
    let data = req.body.data ? req.body.data : req.body;
    await redlock.lock("lottery_draw:" + data.userId,1000);
    if(!data.group_nickname || data.group_nickname == ""){
        return res.send({code:500,msg:"必须要填写群昵称",data:null}); 
    }
    data.Event = HG_DEF.EVENT.EV_DEALER_CHECKOUT_REQ;
    doOpt(data,res);
})

router.post('/edit_shoe', async function(req, res) {                                                  
    let data = req.body.data ? req.body.data : req.body;
    await redlock.lock("edit_shoe:" + data.userId,1000);
    if(!data.group_nickname || data.group_nickname == ""){
        return res.send({code:500,msg:"必须要填写群昵称",data:null}); 
    }
    data.Event = HG_DEF.EVENT.EV_DEALER_EDITSHOE_REQ;
    doOpt(data,res);
})

router.post('/edit_road', async function(req, res) {                                                  
    let data = req.body.data ? req.body.data : req.body;
    await redlock.lock("edit_road:" + data.userId,1000);
    if(!data.group_nickname || data.group_nickname == ""){
        return res.send({code:500,msg:"必须要填写群昵称",data:null}); 
    }
    data.Event = HG_DEF.EVENT.EV_DEALER_REVISEHISTORY_REQ;
    doOpt(data,res);
})

async function doOpt(data,res){
    //try{
        let msg = {};
        msg.group_nickname = data.group_nickname;
        msg.userId = data.userId;
        msg.userName = data.userName;
        let game = await systemDao.getGroupPullDataSetup(msg);
        if(game.data.length == 0){
            return res.send({code:500,msg:"没有找到开工群昵称,请先设定",data:null}); 
        }
        msg.rType = game.data[0].rType;
        msg.roomId = game.data[0].Id;
        let rpc = pomelo.app.rpc; 
        msg.gameId = game.data[0].Id;
        msg.cc = game.data[0].cc;              // 这里取数据库保存的最新局次，如果有前端发来的局次，按data更新
        msg.jc = game.data[0].jc;
        
        let obj = rpc.bjl.bjlRemote;   
        if(obj && game.rType != "" )doHgOpt(data,msg,obj,res); 
    // } catch (err) {
    //     console.log("err:",JSON.stringify(err));
    //     return res.send({code:500,msg:"操作失败,可能桌号没有开通",data:null});
    // }
}

function doHgOpt(data,msg,obj,res){
    msg.diffTime = 0;
    switch(Number(data.Event)){
        case HG_DEF.EVENT.EV_DEALER_BETSTART_REQ:       
            msg.is_empty = data.is_empty;                               
            obj.startGame(null,msg,function(result){
                console.log("result:",JSON.stringify(result));
                if(Number(result.code) == 500){
                    return res.send({code:500,msg:result.msg,data:null});
                }
                let obj = {};
                if(result){
                    obj.gameStatus = 1;
                    obj.desk_number = result.data.gameId;
                    obj.shos = result.data.cc,
                    obj.round = result.data.jc,
                    obj.betTime = result.data.time 
                }
                return res.send({code:200,msg:"操作成功",data:obj});
            });             
            break;
        case HG_DEF.EVENT.EV_DEALER_BETSTOP_REQ:                                     
            obj.stopBet(null,msg,function(result){});
            break;

        case HG_DEF.EVENT.EV_DEALER_CARD_REQ:                                         
            obj.openPk(null,msg,function(result){});
            break;  
        case HG_DEF.EVENT.EV_DEALER_EDITSHOE_REQ:  
            msg.cc = data.shoe;
            msg.jc = data.round;
            msg.result = data.result;
            obj.editShoeRound(null,msg,function(result){
                console.log("result:",result);
                if(Number(result.code) == 500){
                    return res.send({code:500,msg:result.msg,data:null});
                }
                return res.send({code:200,msg:"修改成功",data:null});
            });                 
            break;                       
        case HG_DEF.EVENT.EV_DEALER_CHECKOUT_REQ:
            msg.result_code = data.result;
            msg.cc = data.shoe;
            msg.jc = data.round;
            console.log("==============开始开奖============")
            obj.pushResult(null,msg,function(result){
                console.log("result:",result);
                let obj = {};
                if(result.code != '500'){
                    obj.gameStatus = 5;
                    obj.desk_number = result.data.gameId;
                    obj.road = result.data.road;
                    console.log("==============停止开奖============")
                    return res.send({code:200,msg:"开奖成功",data:obj});
                }else{
                    result.code = 500;
                    return res.send(result);
                }
            });                 
            break;                   
        case HG_DEF.EVENT.EV_DEALER_REVISEHISTORY_REQ:         
            msg.cc = data.shoe;
            msg.jc = data.round;
            msg.result = data.result;
            obj.editRoad(null,msg,function(result){
                return res.send({code:200,msg:"修改成功",data:null});
            });
            break;     
        case HG_DEF.EVENT.EV_DEALER_ORGANIZECARDS_REQ:      
            obj.nextCc(null,msg,function(result){
                return res.send({code:200,msg:"洗牌成功",data:null});
            }); 
            break;   
        case HG_DEF.EVENT.EV_DEALER_HZTP_REQ:     
            obj.setHztp(null,msg,function(result){
                return res.send({code:200,msg:"设定成功",data:result.data});
            }); 
            break;   
        case HG_DEF.EVENT.EV_DEALER_PAUSEGAME_REQ:
            obj.pauseGame(null,msg,function(result){
                return res.send({code:200,msg:"操作成功",data:null});
            });
            break;
        case HG_DEF.EVENT.EV_DEALER_CANCELTHEGAME_REQ:
            obj.noValid(null,msg,function(result){
                if(Number(result.code) != 500){
                    return res.send({code:200,msg:"操作成功",data:obj});
                }else{
                    return res.send(result);
                }
            });  
            break; 
        case HG_DEF.EVENT.EV_DEALER_STARTSTATISTICS_REQ:
            obj.startSatistics(null,msg,function(result){
                console.log("startSatistics result:",result);
                return res.send(result);
            });
            break;
        case HG_DEF.EVENT.EV_DEALER_STOPSTATISTICS_REQ:
            obj.stopSatistics(null,msg,function(result){
                return res.send({code:200,msg:"操作成功",data:null});
            });
            break;
        case HG_DEF.EVENT.EV_DEALER_PROCEED_NEXT_ROUND_REQ:
            obj.proceedNextRound(null,msg,function(result){
                if(result.code != 500){
                    return res.send({code:200,msg:"操作成功",data:null});
                }else{
                    return res.send({code:500,msg:"操作失败",data:null});
                }
            });
            break;
        case HG_DEF.EVENT.EV_DEALER_IMPORT_TABLE_REQ:
            const importRpcStartedAt = Date.now();
            console.log(
                "[导表RPC开始]",
                "roomId=" + msg.roomId,
                "userId=" + msg.userId,
                "cc=" + (msg.cc !== undefined ? msg.cc : ""),
                "jc=" + (msg.jc !== undefined ? msg.jc : "")
            );
            obj.importTable(null,msg,function(result){
                console.log(
                    "[导表RPC返回]",
                    "roomId=" + msg.roomId,
                    "userId=" + msg.userId,
                    "code=" + (result && result.code !== undefined ? result.code : "undefined"),
                    "耗时=" + (Date.now() - importRpcStartedAt) + "ms"
                );
                if(result.code != 500){
                    return res.send({code:200,msg:"导入成功",data:null});
                }else{
                    return res.send({code:500,msg:"导入失败",data:null});
                }
            });
    }
}

router.post('/send_bet_report_image', async function(req, res) {                                               
    let data = req.body.data ? req.body.data : req.body;
    await redlock.lock("send_bet_report_image:" + data.userId,1000);
    // 这里发送给聊天软件
    let groupInfo = await systemDao.getGroupPullDataSetup(data);
    if(!groupInfo.data || groupInfo.data.length == 0){
        return res.send({code:500,msg:"没有指定群昵称",data:null});
    }
    groupInfo = groupInfo.data[0];
    
    // 手动发送投注表
    let msg = {};
    msg.roomId = groupInfo.Id;
    msg.rType = 'bjl';
    pomelo.app.rpc.bjl.bjlRemote.getRoomInfo(null,msg,async function(result){

        // if(Number(result.data.gameStatus) != GAMESTATE.STOP_BET && Number(result.data.gameStatus) != GAMESTATE.PAUSE){   // 只有在截止投注和结算阶段才允许发送投注表截图
        //     console.log("send_bet_report_image：当前游戏未发送截止投注，无法发送投注表截图");
        //     return res.send({code:500,msg:"当前游戏未发送截止投注，无法发送投注表截图",data:null}); 
        // }

        let fileName = data.url.split('/').pop();
        let imagePath = Config.imgPath[Config.imgPath.curSystem] + "/" + fileName;
    
        let r = await sendChat.sendImageMessage(imagePath,fileName,groupInfo.chat_id);

        util.deleteFile(imagePath);      // 先不要删除,正式上线再删除,以免出现问题后无法调试
        
        if(r.err && r.err == "无法上传图片"){
            await sendNoticeToClientDuringBet(
                groupInfo,
                groupInfo.group_nickname,
                {type:1,msg:"上传投注表截图失败"}
            );
            return res.send({code:500,msg:"上传投注表截图失败",data:null});
        }

        let msg = {rType:"bjl",roomId:groupInfo.Id};
        pomelo.app.rpc.bjl.bjlRemote.setBetFormImgStatus(1,msg,function(){});

        if(groupInfo.auto_send_text1){
            setTimeout(async () => {
                sendChat.sendTextMessage(groupInfo.text1_after_betreport,groupInfo.chat_id)
            }, groupInfo.second_send_text1 * 1000);
        }

        if(groupInfo.auto_send_text2){
            setTimeout(async () => {
                sendChat.sendTextMessage(groupInfo.text2_after_betreport,groupInfo.chat_id)
            }, groupInfo.second_send_text2 * 1000);
        }

        if(groupInfo.auto_send_text3){
            setTimeout(async () => {
                sendChat.sendTextMessage(groupInfo.text3_after_betreport,groupInfo.chat_id)
            }, groupInfo.second_send_text3 * 1000);
        }

        if(groupInfo.auto_send_img1_after_betreport){
                setTimeout(async () => {
                    let fileName = groupInfo.img1_after_betreport.split('/').pop();
                    let imagePath = Config.imgPath[Config.imgPath.curSystem] + "/" + fileName;
                    sendChat.sendImageMessage(imagePath,fileName,groupInfo.chat_id);
            }, groupInfo.second_send_img1_after_betreport * 1000);
        }

        if(groupInfo.auto_send_img2_after_betreport){
                setTimeout(async () => {
                    let fileName = groupInfo.img2_after_betreport.split('/').pop();
                    let imagePath = Config.imgPath[Config.imgPath.curSystem] + "/" + fileName;
                    sendChat.sendImageMessage(imagePath,fileName,groupInfo.chat_id);
            }, groupInfo.second_send_img2_after_betreport * 1000);
        } 

        if(groupInfo.auto_send_img3_after_betreport){
                setTimeout(async () => {
                    let fileName = groupInfo.img3_after_betreport.split('/').pop();
                    let imagePath = Config.imgPath[Config.imgPath.curSystem] + "/" + fileName;
                    sendChat.sendImageMessage(imagePath,fileName,groupInfo.chat_id);
            }, groupInfo.second_send_img3_after_betreport * 1000);
        }

        return res.send({code:200,msg:"发送成功",data:null});
    });

})

router.post('/send_score_report_image', async function(req, res) {     
    let data = req.body.data ? req.body.data : req.body;
    let lock = await redlock.lock("send_score_report_image:" + data.userId,2000);
    try{
        console.log("send_score_report_image",data.url);
        // 这里发送给聊天软件
        let groupInfo = await systemDao.getGroupPullDataSetup(data);
        if(!groupInfo.data || groupInfo.data.length == 0){
            console.log("send_bet_report_image：无此group_nickname");
            return res.send({code:500,msg:"没有指定群昵称",data:null});
        }
        groupInfo = groupInfo.data[0];

        let fileName = data.url.split('/').pop();
        let imagePath = Config.imgPath[Config.imgPath.curSystem] + "/" + fileName;

        let r = await sendChat.sendImageMessage(imagePath,fileName,groupInfo.chat_id);
        util.deleteFile(imagePath);  
        if(r.err && r.err == "无法上传图片"){
            await sendNoticeToClientDuringBet(
                groupInfo,
                groupInfo.group_nickname,
                {type:1,msg:"上传分数表截图失败"}
            );
            return res.send({code:500,msg:"上传分数表截图失败",data:null});
        }

        let msg = {rType:"bjl",roomId:groupInfo.Id};
        pomelo.app.rpc.bjl.bjlRemote.setScoreReportStatus(1,msg,function(){});

        lock.unlock();
        return res.send({code:200,msg:"发送成功",data:null});

    }catch(err){
        lock.unlock();
        console.log("send_score_report_image:",JSON.stringify(err));
        return res.send({code:200,msg:"上传分数表截图失败",data:null});
    }
})

router.post('/send_road_image', async function(req, res) {                                                
    let data = req.body.data ? req.body.data : req.body;
    let lock = await redlock.lock("send_road_image:" + data.userId,2000);
    try{
        // 这里发送给聊天软件
        let groupInfo = await systemDao.getGroupPullDataSetup(data);
        if(!groupInfo.data || groupInfo.data.length == 0){
            return res.send({code:500,msg:"没有指定群昵称",data:null});
        }
        groupInfo = groupInfo.data[0];

        let fileName = data.url.split('/').pop();
        let imagePath = Config.imgPath[Config.imgPath.curSystem] + "/" + fileName;

        let r = await sendChat.sendImageMessage(imagePath,fileName,groupInfo.chat_id);
        util.deleteFile(imagePath);  
        if(r.err && r.err == "无法上传图片"){
            await sendNoticeToClientDuringBet(
                groupInfo,
                groupInfo.group_nickname,
                {type:1,msg:"上传路单截图失败"}
            );
            return res.send({code:500,msg:"上传路单截图失败",data:null});
        }
        lock.unlock();
        return res.send({code:200,msg:"发送成功",data:null});
    }catch(err){
        lock.unlock();
        console.log("send_road_image:",JSON.stringify(err));
        return res.send({code:200,msg:"上传路单截图失败",data:null});
    }
})

async function setMgrRemark(payload) {
    const { chatType, groupRole} = payload;
    const { chatId, content,atIds,atUsers } = payload.msg;

    if (chatType !== CODE.CHAT_TYPE.GROUP || groupRole !== CODE.GROUP_ROLE.ADMIN) {
        await sendChat.sendTextMessage( "不是管理员，无法设置备注" ,chatId);
        return;
    }

    if (!atIds?.length) {
        console.log("没有@用户");
        await sendChat.sendTextMessage( "请@要设置备注的用户，并输入备注内容" ,chatId);
        return;
    }

    if (atIds.length > 1) {
        console.log("一次只能为一位用户设置管理员备注");
        await sendChat.sendTextMessage( "一次只能为一位用户设置管理员备注" ,chatId);
        return;
    }

    let mgrRemark = content.replace(/^\/remark(?:\s+)?/i, "").trim();
    mgrRemark = mgrRemark.replace(/^@\S+\s*/, "").trim();

  const targetUser = atUsers?.find((user) => user.uid === atIds[0]);
  if (targetUser?.name && mgrRemark.startsWith(`@${targetUser.name}`)) {
    mgrRemark = mgrRemark.slice(targetUser.name.length + 1).trim();
  }

  console.log("setMgrRemark:", mgrRemark);
  if (!mgrRemark) {
    console.log("请输入管理员备注内容");
    await sendChat.sendTextMessage( "请输入管理员备注内容" ,chatId);
    return;
  }
  
  const uid = atIds[0];
  let apiPath = `/chat/group2/mgr/member/remark/set/op`;
  const resJson = await sendRequest("POST", apiPath, {
    chatId,
    uid,
    mgrRemark,
  });

  if (resJson.code === 200) {
    console.log("管理员备注设置成功");
    await sendChat.sendTextMessage( "管理员备注设置成功" ,chatId);
  }else{
    await sendChat.sendTextMessage(resJson.msg ,chatId);
  }
}

router.post('/bot', async function(req, res) {    
    let data = req.body.data ? req.body.data : req.body;
    data.msg = data.msg.replace(/"chatId":(\d+)/, '"chatId":"$1"');
    data.msg = JSON.parse(data.msg);

    const timestamp = req.headers["x-timestamp"];
    const token = req.headers["x-token"];
    const paopaoToken = Config.paopaochat.token;


    // 校验 token
    if (token !== paopaoToken) {
        return res.status(200).send("ok");
    }

    // 校验时间（防重放）
    if (Math.abs(Date.now() - Number(timestamp)) > 60 * 1000) {
        return res.status(200).send("ok");
    }

    const { chatType, groupRole, nickname, appId } = data;
    const { chatId, clientId, content,msgId,senderId } = data.msg;
    // 回调仅使用根级 groupRole 判断群主和管理员身份。
    const numericGroupRole = Number(groupRole);
    const isAdmin = numericGroupRole === Number(CODE.GROUP_ROLE.ADMIN)

    let msg = { username:nickname,group_nickname:"",bet:content, chat_id:chatId,msgId:msgId}

    if (chatType !== CODE.CHAT_TYPE.GROUP) return res.status(200).send('ok');

    if(appId != Config.paopaochat.appId){
        console.log("无效的appId");
        return res.status(200).send("ok");
    }

    console.log(
        "bot data:",
        msg,
        senderId,
        "groupRole:",
        groupRole
    );

    let re = await cache.get("clientId:" + clientId);
    if(re){
        console.log("已经收到该条信息，不能再接收");
        return res.status(200).send("ok");
    }

    res.status(200).send("ok");
    
    // console.log("====================================开始 bot=====================================")
    // console.log("req:",req.body)
    // console.log("====================================结束 bot=====================================")    

    cache.set("clientId:" + clientId,clientId);
    cache.expire("clientId:" + clientId,70);

    if(content.includes("/remark")) {
        return await setMgrRemark(data);
    }

    // 管理员和群主的普通聊天不参与下注解析，也不进入前端提示队列。
    if (isAdmin) {
        if (isAdminBetCommand(content)) {
            const adminGroupRow = await systemDao.getGroupPullDataSetupByChatId(msg);
            const adminGroupInfo =
                adminGroupRow.data && adminGroupRow.data.length > 0
                    ? adminGroupRow.data[0]
                    : null;

            if (adminGroupInfo) {
                const adminIdentity = String(nickname || "").trim() ||
                    ("账号 " + String(senderId || "未知"));
                await queueNoticeForBetImport(
                    adminGroupInfo,
                    msg,
                    adminIdentity + " 管理员不能下注，指令：" + String(content || "")
                );
            }
        }
        console.log("[忽略管理员普通消息] senderId=" + senderId + ", content=" + content);
        return;
    }

    // 去掉换行、制表，再去掉所有类型的空白（包括全角/零宽空格），准备解析
    const rawContent = String(content || "").replace(/[\r\n]+/g, ' ').trim();

    // 聊天平台未提供可靠的发送者管理员角色时，通过内容识别群公告。
    // 公告不属于下注，不写缓存，也不在导表时提示格式错误。
    const announcementKeywords = [
        "通知",
        "公告",
        "禁止",
        "不要聊天",
        "以财务通知为准",
        "概不承担责任"
    ];
    const announcementKeywordCount = announcementKeywords.reduce(
        (count, keyword) => count + (rawContent.includes(keyword) ? 1 : 0),
        0
    );
    const announcementChineseCharCount =
        (rawContent.match(/[\u4e00-\u9fa5]/g) || []).length;
    const isAnnouncement =
        announcementChineseCharCount > 25 ||
        (
            rawContent.length >= 20 &&
            (
                /^(各位|公告|通知|温馨提示|重要通知)/.test(rawContent) ||
                announcementKeywordCount >= 3
            )
        );

    if (isAnnouncement) {
        console.log("[忽略群公告]", rawContent);
        return;
    }

    let compact = rawContent.replace(/[\s\uFEFF\xA0\u2000-\u200B\u3000]+/g, '');

    // 空消息不属于下注，也无需提示。
    if (!compact) return;

    const SIMILAR_X_CHARS = ['×', '✕', '✖','⨉', '⨯', 'х', 'Х', 'χ', 'Χ', 'ⅹ', 'Ⅹ', '❌', '✖️'];  
    let safeRegex = new RegExp(SIMILAR_X_CHARS.join('|'), 'g');

    // 2. 此时重新赋值就不会报错了
    compact = compact.replace(safeRegex, 'x'); 

    msg.bet = compact;

    // 普通聊天不进入下注提示队列。包含金额、下注玩法、梭哈或字母指令的内容，
    // 才作为可能的下注继续解析。
    const looksLikeBet = /\d/.test(compact) || compact.includes('梭') ||
        /庄|闲|和|对|幸运|完美|三宝|四宝|老虎|改|撤|zs|xs|hs|ls|ks|qs|ms|zds|xds|ds|sbs|bbs/i.test(compact) ||
        /[A-Za-z]/.test(compact);

    if (!looksLikeBet) {
        console.log("[忽略非下注聊天] senderId=" + senderId + ", content=" + rawContent);
        return;
    }
    
    // 尝试解析（严格解析，parseBetStrToArray 在失败时返回 null）
    let arrBet = null;
    try {
        arrBet = parseResult.parseBetStrToArray(compact);
    } catch (e) {
        arrBet = null;
    }

    let row = await systemDao.getGroupPullDataSetupByChatId(msg);
    let groupInfo = row.data && row.data.length > 0 ? row.data[0] : null;
    

    // chat_id 尚未绑定时，格式错误下注也必须像正常下注一样按群昵称回查桌台。
    if (!groupInfo) {
        const groupResult = await getGroupInfo([chatId]);
        console.log("没有按群ID找到桌台，改用群昵称查询:", groupResult);

        if (groupResult.data && groupResult.data.length > 0) {
            const groupData = groupResult.data[0];

            if (groupData.group && groupData.type === 2) {
                msg.chat_group_nickname = groupData.group.name;

                const nicknameRow =
                    await systemDao.getGroupPullDataByChatGroupNickname(msg);

                console.log("按群昵称查询结果:", nicknameRow);
                if (nicknameRow.data && nicknameRow.data.length > 0) {
                    groupInfo = nicknameRow.data[0];
                    msg.roomId = groupInfo.Id;
                    msg.group_nickname = groupInfo.group_nickname;
                    await systemDao.setGroupChatId(msg);
                }
            }
        }
    }

    // 获取玩家备注用户名

    // 按照聊天用户ID获取玩家信息
    let user = await userDao.getPlayerByChatUserId(senderId);
    user = user.data;
    if (user) {
        msg.username = user.username;
    }else{
        user = await userDao.getUserByName(msg.username);
        user = user.data;
        if (user) {
            if(user.chat_user_id !== senderId && user.chat_user_id !== null && user.chat_user_id !== ""){
                console.log("用户备注与之前的ID不一致");
                await queueNoticeForBetImport(
                    groupInfo,
                    msg,
                    msg.username + "用户名与之前的ID不一致"
                );
                return;
            }
            await userDao.updatePlayerChatUserId(user.Id, senderId);
        }else{
            console.log(msg.username + "用户备注不存在");
            await queueNoticeForBetImport(
                groupInfo,
                msg,
                msg.username + "用户备注不存在"
            );
            return;
        }
    }

    // 可能的下注内容解析失败或没有有效类型时，缓存为格式错误下注。
    if (looksLikeBet) {
        if (arrBet === null) {
            console.log("下注格式错误（解析失败）:", compact);
            if (!isAdmin) {
                await queueNoticeForBetImport(
                    groupInfo,
                    msg,
                    msg.username + " 下注命令格式不正确：" + compact
                );
            }
            return;
        }
        // 解析成功但没有有效类型，也认为格式错误。
        if (!(Array.isArray(arrBet) && arrBet.length > 0 && arrBet[0].type)) {
            console.log("下注格式错误（无类型）:", compact, arrBet);
            if (!isAdmin) {
                await queueNoticeForBetImport(
                    groupInfo,
                    msg,
                    msg.username + " 下注命令格式不正确：" + compact
                );
            }
            return  
        }
    }
        
    if (Array.isArray(arrBet) && arrBet.length > 0 && arrBet[0].type) {

        if(groupInfo){
            msg.group_nickname = groupInfo.group_nickname;
            msg.roomId = groupInfo.Id;
        }else{
            console.log("未找到消息对应的桌台，不能写入下注缓存: chatId=" + chatId);
            return;
        }

        msg.rType = "bjl";
        //console.log("bot msg:",msg)
        pomelo.app.rpc.bjl.bjlRemote.doBet(1,msg,function(result){
            console.log("dobet return:",result);
        });
    } else {
        // 非下注信息：不处理
    }
});

router.post('/upload', async function(req, res) {
    //try{
        let data = req.body.data ? req.body.data : req.body;
        let uid = data.userId;
        let datas = {};
        datas.code = '0';
        datas.message = '上传图片成功';
        var form = new formidable.IncomingForm();
        form.encoding = 'utf-8';
        let filedr = Config.imgPath[Config.imgPath.curSystem];
        console.log("========================file dir:======================",filedr);
        form.uploadDir = filedr;
        form.keepExtensions = true;                                        // 保留后缀
        form.maxFieldsSize = 20 * 1024 * 1024;
        // 处理图片
        form.parse(req, async function (err, fields, files) {
            let fileObj = Array.isArray(files.file) ? files.file[0] : files.file;
            console.log("files:",fileObj.originalFilename,fileObj.newFilename);
            let filename = fileObj.originalFilename || fileObj.newFilename;
            let ext = filename.split('.').pop();
            let avatarName = Date.now() + '.' + ext;
            let newPath = form.uploadDir + '/' + avatarName;

            fs.renameSync(fileObj.filepath, newPath);

            let url;
            console.log("Config.imgPath.test:", Config.imgPath.test,Config.imgPath.test === "1");
            if(Config.imgPath.test === "1"){
                url = "http://" + Config.http.host + ":" + Config.http.port + "/statics/" + avatarName;
            }else{
                url = Config.imgUrl + "/" +avatarName;
            }

            let data = {
                name: avatarName,
                url: url
            }

            datas.data = data;
            datas.name = avatarName;

            //console.log("upload data:", datas);

            return res.send({
                code: 200,
                msg: "上传成功",
                data: datas
            });

        })
    // }catch(err){
    //     console.error("upload err:",JSON.stringify(err));
    // }
})

module.exports = router;
