let pomelo = require('pomelo');
const redlock = pomelo.app.get('redlock');
let userDao = require('../../dao/userDao'); 
let systemDao = require('../../dao/systemDao'); 
let playerDao = require('../../dao/playerDao');    
let GMResponse = require('../GMResponse');
const CODE = require('../../util/code').GAME;
const GAMESTATE = require('../../util/gameMsg');
const GAMEDEF = require('../../util/cbdefind').GAME_CONFIG;
let sxShare = require("./sxShare");
let bet = require("./bet");
let settlement = require("./result");
let config = require('../../../config/config.json');
const parseResult = require('./parseResult');
const sendChat = require("../../chat/sendChat");
const moment = require('moment');
const virtualBetModule = require("./virtualBet");
const sendToFront = require("./sendToFrontEnd");
const { calculateSpmInfo } = require("./overSpm");

var sxRoom = function (channel,roomInfo) {
    this.channel = channel;                                      
    this.roomInfo = roomInfo;                                      
    this.roomInfo.gameState = GAMESTATE.NO_START_GAME;               // 0 未开局  1.下注  2.停止下注 3.结算  4.洗牌 
    this.strTempBet = {};
    this.virtualBet_id = [];
    this._virtualStartMsgId = null;
    this._virtualRoundToken = null;
    this._virtualRoundRunning = false;
    this.xh = {};                      
    this.isFirstIn = true;
    this.bsInfo = {maxBs:sxShare.getMaxBs(roomInfo.rType)};          //最大倍数,tts,nn,xjh
    this.redis = pomelo.app.get("redis");
    this.tempTotalbet = {};
    this.interval;
    this.settlement = {cc:0,jc:0,isSettlemment:0};
    this.areaNum = GAMEDEF[roomInfo.rType].BET_AREA_NUM;
    this.goodRoadNumber = 0;
    this.initRoomInfo();
}

module.exports = sxRoom;

sxRoom.prototype.initRoomInfo = function(){                              //　取当前房间的状态: 房间号，限红，桌上筹码,游戏状态，倒计时，路单,总人数,
    let rInfo = this.roomInfo;
    this.resetResult();
    rInfo.stateRedisKey = this.roomInfo.rType + "st:" + this.roomInfo.Id;  
    let self = this;
    this.redis.get(rInfo.stateRedisKey,function(err,re){                              
        if(!!err)console.log(err,res);
        if(!!re){
            re = JSON.parse(re);
            self.roomInfo = re;
        }
    })
}

sxRoom.prototype.setStateRedis = function(){
    let rInfo = this.roomInfo;
    console.log("setStateRedis:",rInfo.gameState);
    //let data={gameState:rInfo.gameState,result:rInfo.result,cc:rInfo.cc,jc:rInfo.jc,group_nickname:rInfo.group_nickname};
    this.redis.set(rInfo.stateRedisKey,JSON.stringify(rInfo));   // 缓存游戏状态
}

sxRoom.prototype.getRoomInfoForHg = function(msg,cb){    
    let rInfo = this.roomInfo;
    var data = {
        gameId:msg.gameId,
        gameType:msg.gameType,
        gameStatus:rInfo.gameState,
        cc:rInfo.cc,
        jc:rInfo.jc,
        gameHistory:rInfo.road,
        roomName:rInfo.roomName,
        gameStatusData:rInfo.result,
        isCurRoundStopBet:rInfo.isCurRoundStopBet
    }
    console.log("getRoomInfoForHg:",data,rInfo.stateRedisKey);
    var response = new GMResponse(CODE.GET_ROOM_INFO.code,rInfo.rType,rInfo.Id,CODE.GET_ROOM_INFO.msg,data);
    cb(response);
}

sxRoom.prototype.returnForNokJ = function(){
    let rInfo = this.roomInfo;
    userDao.returnNoKj(rInfo.rType,rInfo.Id);
}

sxRoom.prototype.addRoad = function(msg,cb){
    let rInfo = this.roomInfo;
    rInfo.cc = msg.cc;
    rInfo.jc = msg.jc;
    rInfo.road = msg.road;
    rInfo.gameState = GAMESTATE.PAUSE;   // 游戏状态为暂停,这样可以保证可以点击开始下注
    rInfo.isEditShoeRound = false;       // 因为修改路单时局数+1，批量导入路单也是，所以这里只能有一个成立，否则局数会+2
    this.setStateRedis();
    var response = new GMResponse(200,rInfo.rType,rInfo.Id,"补路单成功",null);
    cb(response);
    console.log("sxroom addroad:",msg);
}

sxRoom.prototype.setBetFormImgStatus = function(msg,cb){
    let rInfo = this.roomInfo;

    // 暂停游戏状态只有开始下注时状态会改变，其它保持不变
    rInfo.gameState = GAMESTATE.XZB;
    rInfo.quick_mode_Lottery_draw_possible = true;  // 只有在截止投注以后极速模式才可以开奖
    rInfo.startMsgId = null;

    this.pushGameInfoToClient();

    this.setStateRedis();
    var response = new GMResponse(200,rInfo.rType,rInfo.Id,"设定投注表提交状态成功",null);
    cb(response);
}

// 仅仅用于只有在修改靴局的情况上,用于返回增加局数
sxRoom.prototype.setScoreReportStatus = function(msg,cb){
    let rInfo = this.roomInfo;
    // if(rInfo.isEditShoeRound){
    //     rInfo.isEditShoeRound = false;
    //     rInfo.jc ++;
    //     rInfo.lastResultJc = rInfo.jc;
    //     rInfo.lastResultCc = rInfo.cc;
    //     this.setStateRedis();
    //     setTimeout(() => {
    //         this.pushGameInfoToClient();
    //         sendToFront.sendNoticeToGameClient(rInfo.group_nickname, {type:9});
    //     }, 1000);
    // }
    var response = new GMResponse(200,rInfo.rType,rInfo.Id,"设定分表提交状态成功",null);
    cb(response);
}

sxRoom.prototype.getGameState = function(){
    let rInfo = this.roomInfo;
    return rInfo.rType + "," + rInfo.Id + "," + rInfo.gameState + "," + rInfo.road  + "," + rInfo.roomName;
}

sxRoom.prototype.resetRoomInfo = function(){
    let rInfo = this.roomInfo;
    let res = systemDao.getGroupPullDataSetupById(rInfo.Id);
    if (!!res) Object.assign(rInfo, res);
}

sxRoom.prototype.resetResult = function(){
    let rInfo = this.roomInfo;
    sxShare.resetResult(rInfo);
}       

sxRoom.prototype.saveState =  function(){
    let rInfo = this.roomInfo;
    let msg = { status:rInfo.gameState,game:rInfo.rType,cc:rInfo.cc,jc:rInfo.jc,parameter_setup:rInfo.parameter_setup };
    this.redis.set("time:" + rInfo.roomName,JSON.stringify(msg));                                             // 存redis是累加的 
}

sxRoom.prototype.historyRoad = async function(msg,cb){
    let rInfo = this.roomInfo;
    let road = msg.historyArr.map(item =>{
        item = parseResult.parseResult_code(item)
        return item;
    })
    road = road.join("^") + "^";
    rInfo.road = road;
    cb(null)
}

// 开始统计，当天第一靴
sxRoom.prototype.startSatistics = async function(msg,cb){  
    let rInfo = this.roomInfo;
    if(rInfo.gameState != 0){
        let response = new GMResponse("500",msg.rType,msg.roomId,"当前游戏未处于停止状态，所以不能开始！", "");
        return cb(response);
    }

    let row = await systemDao.getGroupPullDataSetup(msg);
    if(!row.data || row.data.length == 0){
        console.log("开始统计没有找到群昵称:",msg);
        return cb(new GMResponse("500",msg.rType,msg.roomId,"开始统计没有找到群昵称", ""));
    }

    rInfo.gameState = GAMESTATE.XP;    // 开始统计就相当于洗牌

    // 如果统计日期大于等于今天的日期，说明今天已经统计过了，过0点后才能重新统计
    if (row.data[0].statistics_date && moment(row.data[0].statistics_date).isSameOrAfter(moment(), 'day')) {
        console.log("startSatistics: 今天已开始统计过,这里只设定重新开始状态");
        await userDao.updateStatisticsDate(rInfo);
        rInfo.statistics_date = moment().format('YYYY-MM-DD');
        return cb(new GMResponse("200" , msg.rType , msg.roomId , "操作成功" , ""));
    }

    // 当天第一张桌开始统计时，统一归档并清空昨日的日积分。
    // 使用全局日期锁，避免多个桌台同时启动造成重复清零。
    let dailyPointsLock = null;
    try {
        const today = moment().format('YYYY-MM-DD');
        dailyPointsLock = await redlock.lock("dailyPointsReset:" + today, 30000);

        const latestStatisticsRes = await systemDao.getStatisticsDateByAnyGroup();
        const latestStatisticsDate =
            latestStatisticsRes && latestStatisticsRes.data
                ? latestStatisticsRes.data.statistics_date
                : null;

        if (!latestStatisticsDate || !moment(latestStatisticsDate).isSame(moment(), 'day')) {
            console.log("[日积分换日] 开始归档并清空昨日积分, today=" + today);
            await userDao.delete_daily_points();
        }

        // 在释放日期锁前写入当天日期，其他桌台随后可识别为已完成换日。
        const statisticsRes = await userDao.updateStatisticsDate(rInfo);
        if (statisticsRes.err || !statisticsRes.data || statisticsRes.data.affectedRows < 1) {
            return cb(new GMResponse("500", msg.rType, msg.roomId, "操作失败", ""));
        }
        rInfo.statistics_date = today;
    } finally {
        if (dailyPointsLock) {
            try {
                await dailyPointsLock.unlock();
            } catch (unlockErr) {
                console.error("释放日积分换日锁失败:", unlockErr);
            }
        }
    }

    rInfo.cc = 1;
    rInfo.jc = 1;

    // 获取分数表时的场次变量(开奖时到开奖后20秒之内保持最后开奖时的场次)
    rInfo.lastResultCc = 1;
    rInfo.lastResultJc = 1;
    // 极速模式场次变量,用于开始下注时场次的更新，因为极速模式下一局先下注，上一局才开奖
    rInfo.quickModeJc = 0;

    rInfo.road = "";
    this.setStateRedis();
    userDao.updateCcAndRoad(rInfo.Id , rInfo.quickModeJc , rInfo.cc , rInfo.jc , "");
    userDao.deleteGame(rInfo);

    this.pushGameInfoToClient();
    let response = new GMResponse("200" , msg.rType , msg.roomId , "操作成功" , "");
    return cb(response);
}

sxRoom.prototype.stopSatistics = async function(msg,cb){                                                                       // n = 1   正常下注  n = 2  重新计时
    let rInfo = this.roomInfo;
    rInfo.gameState = GAMESTATE.NO_START_GAME;    // 停止统计就相当于未开局
    rInfo.lastResultCc = null;
    rInfo.lastResultJc = null;
    this.setStateRedis();
    this.pushGameInfoToClient();
    const controlTableId = rInfo.chat_group_nickname || msg.chat_group_nickname || msg.group_nickname || rInfo.group_nickname;
    if(controlTableId){
        sendToFront.clearNoticeHistory(controlTableId);
    }else{
        console.warn(`[停止统计清缓存] 房间 [${rInfo.Id}] 缺少控制端桌台昵称，未执行 WebSocket 缓存清理。`);
    }
    await systemDao.synchronizePoints(msg);
    await userDao.setGameStopStatus(msg);
    cb("ok");
}

// 红正停牌
sxRoom.prototype.setHztp = async function(msg,cb){                                                                       // n = 1   正常下注  n = 2  重新计时
    let rInfo = this.roomInfo;
    if(rInfo.hztp === undefined)rInfo.hztp = false;
    rInfo.hztp = !rInfo.hztp;
    this.setStateRedis();
    let data = {hztp:rInfo.hztp};
    if(rInfo.hztp)rInfo.gameState = GAMESTATE.PAUSE;
    console.log("===================当前红正停版状态：=================",rInfo.hztp);
    let response = new GMResponse("200" , msg.rType , msg.roomId , "操作成功" , data);
    return cb(response);
}

// 暂停游戏功能无效
sxRoom.prototype.pauseGame = async function(msg,cb) {
    let rInfo = this.roomInfo;
    if(rInfo.gameState == GAMESTATE.BET){
        // 发送截止投注图
        let fileName = rInfo.img2_after_start.split('/').pop();
        let imagePath = config.imgPath[config.imgPath.curSystem] + "/" + fileName;
        let r = await sendChat.sendImageMessage(imagePath,fileName,rInfo.chat_id);
    }
    rInfo.gameState = GAMESTATE.PAUSE;
    this.setStateRedis();
    let response = new GMResponse("200" , msg.rType , msg.roomId , "操作成功" , null);
    return cb(response);
}

sxRoom.prototype.nextCc = function(msg,cb) {
    // 下一场,局数回0,每一场的局数不固定
    let rInfo = this.roomInfo;
    rInfo.cc = Number(rInfo.cc) + 1;
    rInfo.jc = 1;
    rInfo.quickModeJc = 0;
    rInfo.lastResultCc = rInfo.cc;
    rInfo.lastResultJc = 1;
    rInfo.isEditShoeRound = false;
    rInfo.road = "";
    this.setStateRedis();
    rInfo.road = "";
    rInfo.gameState = GAMESTATE.XP;        

    this.isFirstIn = false;
    let data = {gameId:msg.gameId, cc: rInfo.cc, jc: rInfo.jc};
    this.updateGame({});
    let cs = rInfo.cc + "-" + rInfo.jc;
    userDao.updateCcAndRoad(rInfo.Id , rInfo.quickModeJc , rInfo.cc , rInfo.jc , "");
    var response = new GMResponse(CODE.REPLACEMENT2.code,rInfo.rType,rInfo.Id,CODE.REPLACEMENT2.msg,data);
    cb(response);   
};

// 手动加一局: 一般只有修改靴局返回时增加一局使用
sxRoom.prototype.proceedNextRound = async function(msg,cb) {
    let rInfo = this.roomInfo;
    rInfo.jc++;
    if(rInfo.isEditShoeRound){
        rInfo.isEditShoeRound = false;
    }
    rInfo.lastResultJc = rInfo.jc;
    rInfo.lastResultCc = rInfo.cc;
    this.setStateRedis();
    console.log("proceedNextRound:")
    await userDao.updateCcAndRoad(rInfo.Id , rInfo.quickModeJc , rInfo.cc , rInfo.jc , rInfo.road);
    sendToFront.sendNoticeToGameClient(rInfo.group_nickname, {type:9});
    let response = new GMResponse("200" , msg.rType , msg.roomId , "操作成功" , null);
    return cb(response);
}

// 手动开局(发开始图使用)
sxRoom.prototype.nextJc = async function(msg,cb) {
    this.doNextJc(msg,1,cb);                           
};

sxRoom.prototype.doNextJc = async function(msg,n,cb){   // n: 1 手动开始，2 自动开始 
    let rInfo = this.roomInfo;
    let self = this;

    // 空局就是为了快速开奖，不给下注，增加一个isEmptyGame字段，来标识是否是空局，空局就不发图片了
    rInfo.isEmptyGame = msg.is_empty ? true : false;

    if(!msg.group_nickname)msg.group_nickname = rInfo.group_nickname;
    let row = await systemDao.getGroupPullDataSetup(msg);
    if(!row.data || row.data.length == 0){
        console.log("开始下注没有找到群昵称:",msg);
        if(msg.tool_upload_start){
            // 注意: 上传图片插件用 chat_group_nickname
            sendToFront.sendNoticeToClient(rInfo.chat_group_nickname, {type:1,msg:"开始下注没有找到群昵称!"});
        }
        return cb(new GMResponse(500,rInfo.rType,rInfo.Id,"开始下注没有找到群昵称",null));
    }

    const uploadChatId = String(msg.chat_id || "").trim();
    Object.assign(rInfo, row.data[0]);
    // 工具上传的 chatId 是刚刚成功发送开始图所使用的目标，应优先作为本局目标。
    // 不能让数据库中暂时为空的 chat_id 覆盖掉它，否则机器人会全部发送失败。
    if(uploadChatId){
        rInfo.chat_id = uploadChatId;
    }

    let parameter_setup = await systemDao.getParameter(rInfo);
    rInfo.parameter_setup = parameter_setup.data[0];
    if(rInfo.statistics_date){
        rInfo.statistics_date = moment(rInfo.statistics_date).format('YYYY-MM-DD');
    }else{
        console.log("当天还没有设定开工日期:",rInfo.statistics_date);
        return cb(new GMResponse(500,rInfo.rType,rInfo.Id,"当天还没有设定开工日期",null));
    }
    //console.log("startbet rinfo:",rInfo);
   
    if( n === 1 && rInfo.account != msg.userName && !msg.tool_upload_start){
        console.log("登录账号和群设定的主持人账号不一致:", msg.userName, rInfo.account,msg.tool_upload_start);
        return cb(new GMResponse(500,rInfo.rType,rInfo.Id,"登录账号和群设定的主持人账号不一致!",null));
    }
    
    if (rInfo.gameState == GAMESTATE.BET || 
        //rInfo.gameState == GAMESTATE.STOP_BET || 
        //rInfo.gameState == GAMESTATE.XZB && !rInfo.quick_mode ||          // 如果是极速模式，截止投注后，开奖前可以先始开下一局
        rInfo.gameState == GAMESTATE.NO_START_GAME){
        
        console.log("只有在刚开始统计或已开奖状态下才能点击下注:", rInfo.gameState);
        if(msg.tool_upload_start){
            sendToFront.sendNoticeToClient(rInfo.chat_group_nickname, {type:1,msg:" 只有在刚开始统计或非下注状态下才能点击开始下注!"});
        }
        return cb(new GMResponse(500,rInfo.rType,rInfo.Id,"只有在刚开始统计或已开奖状态下才能点击下注!",null));
    };
    
    // 自动发送要等到成功才算. 工具上传图片不能再自动发送一次
    if(!msg.tool_upload_start && !rInfo.isEmptyGame){
        let result = await this.doAutoSendStartImg();
        if(!result){
            //return cb(new GMResponse(500,rInfo.rType,rInfo.Id,"开始下注图片未发送成功",null));
        }
    }
    // 泡泡的开始下注图片 msgId 是本次下注窗口及机器人会话的唯一标识。
    // 必须保存在房间状态，不能只写入本次请求的临时 msg 对象。
    if(msg.tool_upload_start && msg.msgId !== undefined && msg.msgId !== null && msg.msgId !== ""){
        rInfo.startMsgId = String(msg.msgId);
    }

    rInfo.quickModeJc++;

    // 如果在快速模式状态下的局次小于正常模式的局次，说明上一局操作员是走正常模式
    if(rInfo.quickModeJc < rInfo.jc)rInfo.quickModeJc = rInfo.jc;
    if(rInfo.quick_mode && rInfo.quickModeJc > rInfo.jc + 1){
        rInfo.quickModeJc--;
        return cb(new GMResponse(500,rInfo.rType,rInfo.Id,"上一局未开奖，不能连开两次下局",null));
    }

    if(!rInfo.isEmptyGame)this.doAutoSendAfterStartImage();

    self.startBet();                               
    let data = {gameId:msg.gameId,jc:rInfo.jc,cc:rInfo.cc}
    let response = new GMResponse(CODE.START_BET.code,rInfo.rType,rInfo.Id,CODE.START_BET.msg,data);
    cb(response); 

    // 第一次点击下注时,要先记录操作者的id
    if(!msg.tool_upload_start && msg.userId)systemDao.setGroupChatRoomId(msg);
    // 更新场次及路单
    
    // 状态改变要推送给客户端,让客户端知道开始下注了
    this.pushGameInfoToClient();
}

sxRoom.prototype.startBet = async function(){                                                                       // n = 1   正常下注  n = 2  重新计时
    let rInfo = this.roomInfo;

    this.virtualBet_id = [];
    
    console.log("是否编辑靴局:",rInfo.isEditShoeRound,rInfo.jc, rInfo.quickModeJc);
    userDao.updateCcAndRoad(rInfo.Id , rInfo.quickModeJc , rInfo.cc , rInfo.jc , rInfo.road);
   
    rInfo.isEditShoeRound = false
    rInfo.lastStopMsgId =  null;
    rInfo.isCurRoundStopBet = false;

    // 如果是空局，直接进入停止下注状态，不发图片了
    rInfo.gameState = rInfo.isEmptyGame ? GAMESTATE.PAUSE : GAMESTATE.BET;

    this.setStateRedis();

    this.resetResult();
    this.insertGame();

    bet.clearBetCache(rInfo.Id);
    console.log("[开始下注] 清空上一局缓存，tableId=" + rInfo.Id);
    
    this.virtualBet();
    //this.testBet();                                   // 测试用
}

// 下面处理自动发送信息的
sxRoom.prototype.doAutoSendStartImg = async function(){
    let rInfo = this.roomInfo;
    if(rInfo.auto_send_start_img){
        let fileName = rInfo.img_start.split('/').pop();
        let imagePath = config.imgPath[config.imgPath.curSystem] + "/" + fileName;
        let r = await sendChat.sendImageMessage(imagePath,fileName,rInfo.chat_id);
        if(r.err){
            console.log(rInfo.group_nickname + "上传开始下注图片失败");
            sendToFront.sendNoticeToClient(rInfo.chat_group_nickname, {type:1,msg:"上传开始下注图片失败"});
            return false;
        }
        rInfo.startMsgId = String(r.data.data.msgId);
    }
    return true;
}

sxRoom.prototype.doAutoSendAfterStartImage = async function(){
        // 是否自动发送开始后的图1(还有无)
        let rInfo = this.roomInfo;
        let self = this;
        if(rInfo.auto_send_img1_after_start && !rInfo.hztp && !rInfo.isEmptyGame){
             const thisJc = rInfo.jc;
             setTimeout(async () => {
                console.log("自动发送还有无时的状态：",rInfo.gameState);
                if(!rInfo.hztp && !rInfo.isEmptyGame && rInfo.gameState == GAMESTATE.BET && (rInfo.jc === thisJc || rInfo.isEditShoeRound )){
                    let fileName = rInfo.img1_after_start.split('/').pop();
                    let imagePath = config.imgPath[config.imgPath.curSystem] + "/" + fileName;
                    sendChat.sendImageMessage(imagePath,fileName,rInfo.chat_id);
                }
            }, rInfo.second_send_img1_after_start * 1000);
        }
        
        // 自动发送开始后的图2 (停止下注)
        if(rInfo.auto_send_img2_after_start && !rInfo.hztp && !rInfo.isEmptyGame){
            const thisJc = rInfo.jc;
            setTimeout(async () => {
                console.log("自动发送停止投注时的状态：",rInfo.gameState);
                if(!rInfo.hztp && !rInfo.isEmptyGame && rInfo.gameState == GAMESTATE.BET && rInfo.jc === thisJc){
                    let fileName = rInfo.img2_after_start.split('/').pop();
                    let imagePath = config.imgPath[config.imgPath.curSystem] + "/" + fileName;
                    let r = await sendChat.sendImageMessage(imagePath,fileName,rInfo.chat_id);
                    if(r.err){    
                        console.log("上传截止下注图片失败");
                        sendToFront.sendNoticeToClient(rInfo.chat_group_nickname, {type:1,msg:"上传截止下注图片失败"});
                        return false;
                    }
                    console.log("=====================自动截止投注上传图片成功：==================",r.data.data.msgId);
                    self.updateLastStopMsgId(r.data.data.msgId);
                    self.doStopBet();
                }
            }, rInfo.second_send_img2_after_start * 1000);    
        }
    
        // 是否自动发送开始后的图3 ()
        if(rInfo.auto_send_img3_after_start && !rInfo.hztp && !rInfo.isEmptyGame && rInfo.gameState == GAMESTATE.BET){
            const thisJc = rInfo.jc;
            setTimeout(async () => {
                if(!rInfo.hztp && !rInfo.isEmptyGame && rInfo.gameState == GAMESTATE.BET && rInfo.jc === thisJc){
                    let fileName = rInfo.img3_after_start.split('/').pop();
                    let imagePath = config.imgPath[config.imgPath.curSystem] + "/" + fileName;
                    sendChat.sendImageMessage(imagePath,fileName,rInfo.chat_id);
                }
            }, rInfo.second_send_img3_after_start * 1000);
        }
}

// 同一局可能发送多张停止下注图片，始终以消息ID最大的一张作为最终截止线。
// 使用 BigInt 比较，避免泡泡消息ID超过 JavaScript 安全整数范围时丢失精度。
sxRoom.prototype.updateLastStopMsgId = function(msgId){
    let rInfo = this.roomInfo;

    if(msgId === undefined || msgId === null || msgId === ""){
        return false;
    }

    try{
        const nextStopMsgId = BigInt(String(msgId));
        const currentStopMsgId = rInfo.lastStopMsgId === undefined ||
            rInfo.lastStopMsgId === null ||
            rInfo.lastStopMsgId === ""
                ? null
                : BigInt(String(rInfo.lastStopMsgId));

        if(currentStopMsgId === null || nextStopMsgId > currentStopMsgId){
            rInfo.lastStopMsgId = String(msgId);
            console.log("[更新最后停止下注图片] lastStopMsgId=",rInfo.lastStopMsgId);
            return true;
        }

        console.log(
            "[忽略较早停止下注图片] currentLastStopMsgId=",
            rInfo.lastStopMsgId,
            "msgId=",
            msgId
        );
        return false;
    }catch(err){
        console.error("停止下注图片msgId无效:",msgId,err.message);
        return false;
    }
}

sxRoom.prototype.doStopBet = async function(){
    let rInfo = this.roomInfo;
    // 暂停游戏状态只有开始下注时状态会改变，其它保持不变
    if(GAMESTATE.STOP_BET != rInfo.gameState){
        rInfo.gameState = GAMESTATE.STOP_BET;            // 防止泡泡截止图片显示慢一点
    }
    rInfo.isCurRoundStopBet = true;
    
    this.setStateRedis();
    this.pushGameInfoToClient();
}

sxRoom.prototype.pushGameInfoToClient = function(){
    let rInfo = this.roomInfo;
    let obj = {
        shoe: rInfo.cc,
        round: rInfo.jc,
        road: rInfo.road,
        gameStatus: rInfo.gameState,
        group_nickname: rInfo.group_nickname,
        isCurRoundStopBet: rInfo.isCurRoundStopBet === true
    }
    sendToFront.sendNoticeToGameClient(rInfo.chat_group_nickname,{type:5,msg:obj});
}

sxRoom.prototype.doAutoSendImage1 = function(){
    let rInfo = this.roomInfo;
    if(rInfo.auto_send_start_img){
        const fileName = rInfo.img_start.split('/').pop();
        let imagePath = config.imgPath[config.imgPath.curSystem] + "/" + fileName;
        sendChat.sendImageMessage(imagePath,fileName,rInfo.chat_id);
    }
}

sxRoom.prototype.virtualBet = async function(){
    // 委托给独立模块处理
    try{
        await virtualBetModule.start(this);
    }catch(e){
        console.error("sxRoom.virtualBet delegate err:", e);
    }
};

sxRoom.prototype.testBet = function(){
    let s = {start:69251,end:69251};
    s.start = 250802;
    s.end = 250802;
    s.username = "啊明";
    s.group_nickname = "辉煌三台";
    let i = s.start;                  
    let self = this;
    let interval = setInterval(function() {
        var msg = {username:s.username,userId:i,bet:"z800",group_nickname:s.group_nickname,msgId:"3435346436346355"}; 
        self.doBet(msg,function(res){
            i++;
            if(i > s.end)clearInterval(interval);  
            // setTimeout(()=>{
            //     i = s.start
            //     msg = {username:s.username,userId:i,bet:"x100",group_nickname:s.group_nickname,msgId:"3435346436346354"};
            //     self.doBet(msg,function(res){})},2000)
        });
    }, 1000);
}

sxRoom.prototype.doBet = async  function(msg,cb){ 
    bet.doBet(msg,this.roomInfo,this.strTempBet,this.areaNum,this.redis,cb);  // 下注  
}

sxRoom.prototype.flushBetsToDb = async function(msg,cb){ 
    let rInfo = this.roomInfo;
    let flushLock = null;
    const flushStartedAt = Date.now();

    console.log(
        "[导表开始]",
        "roomId=" + rInfo.Id,
        "cc=" + rInfo.cc,
        "jc=" + (rInfo.quick_mode === 1 ? rInfo.quickModeJc : rInfo.jc)
    );

    try {
        // 正常导表完成后 finally 会立即释放；60秒只用于进程异常时的自动解锁兜底。
        flushLock = await redlock.lock("flushBetsToDb:table:" + rInfo.Id, 60000);

        const stopMsgId = String(rInfo.lastStopMsgId || "").trim();
        let hasValidStopImage = /^\d+$/.test(stopMsgId);
        if(hasValidStopImage){
            try{
                hasValidStopImage = BigInt(stopMsgId) > 0n;
            }catch(err){
                hasValidStopImage = false;
            }
        }

        if(!hasValidStopImage){
            console.warn(
                "[导表拒绝] 尚未收到有效停止下注图片，保留下注缓存，tableId=" + rInfo.Id +
                ", cc=" + rInfo.cc +
                ", jc=" + (rInfo.quick_mode === 1 ? rInfo.quickModeJc : rInfo.jc)
            );
            return cb({
                code: 500,
                msg: "停止下注图片尚未成功返回，暂不能导表",
                data: null
            });
        }

        let res = await bet.flushBetsToDb(rInfo.Id,rInfo);
        console.log("flushBetsToDb结果:",res)
        await userDao.cleanupBetsOnStopSimplified(rInfo);  // 每次导入时记得清理用户的重复下注记录

        // 先清理截止图之后的下注，再按最终有效庄闲上盘 sp 执行台面减持。
        if(rInfo.lastStopMsgId){
            await userDao.cleanOutSizeBettingRecord(rInfo);
        }

        // 算出最终上盘买 spm/sp，再判断是否超限。
        const reductionJc = rInfo.quick_mode === 1 ? rInfo.quickModeJc : rInfo.jc;
        const jcTotalRes = await userDao.getJcTotal({
            group_nickname: rInfo.group_nickname,
            cc: rInfo.cc,
            jc: reductionJc,
            statistics_date: rInfo.statistics_date,
            is_re_settlement: false
        });
        if (jcTotalRes.err) throw jcTotalRes.err;
        const jcTotal = jcTotalRes.data && jcTotalRes.data[0]
            ? jcTotalRes.data[0]
            : {};
        const spmInfo = calculateSpmInfo(jcTotal, rInfo.parameter_setup);

        // 最终 sp 超限多少，就从最终 spm 方向减掉多少。
        const reductionRes = await userDao.applyTableBetReduction({
            group_nickname: rInfo.group_nickname,
            roomId: rInfo.Id,
            cc: rInfo.cc,
            jc: reductionJc,
            statistics_date: rInfo.statistics_date,
            spm: spmInfo.spm,
            sp: spmInfo.sp
        });

        if (reductionRes.err) {
            console.error("台面超限减持失败:", reductionRes.err);
            res.code = 500;
            res.msg = "下注已导入，但台面超限减持失败，请重试导表";
            res.tableBetReduction = { error: reductionRes.err.message || String(reductionRes.err) };
        } else {
            res.tableBetReduction = reductionRes.data;
            if (reductionRes.data && reductionRes.data.applied) {
                console.log("[台面超限减持]", reductionRes.data);
            }

            const reductionData = reductionRes.data;
            if (reductionData && (reductionData.applied || reductionData.unavoidableExcess > 0)) {
                const reducedPlayers = reductionData.players || [];
                const header = reductionData.applied
                    ? "上盘（" + reductionData.spm + "）金额" + reductionData.originalSp +
                      "超过限红" + reductionData.maxBetAmount +
                      "，已自动按比例减注"
                    : "上盘（" + reductionData.spm + "）金额" + reductionData.originalSp +
                      "超过限红" + reductionData.maxBetAmount +
                      "，但没有符合减持条件的玩家";
                const excessWarning = reductionData.unavoidableExcess > 0
                    ? "；受最小减持金额保护的注码合计仍超限" + reductionData.unavoidableExcess
                    : "";
                const noticeGroup = rInfo.group_nickname;

                if (reducedPlayers.length === 0) {
                    sendToFront.sendNoticeToGameClient(noticeGroup, {
                        type: 1,
                        msg: header + excessWarning
                    });
                } else {
                    // 每个被减持的玩家单独推送一条，方便前端逐条展示。
                    for (const player of reducedPlayers) {
                        sendToFront.sendNoticeToGameClient(noticeGroup, {
                            type: 1,
                            msg: header + excessWarning + "：" +
                                player.username + " " + player.originalBet + "→" + player.finalBet +
                                "（退回" + player.refundedAmount + "分）"
                        });
                    }
                }
            }
        }

        setTimeout(async () => {
            sendToFront.sendNoticeToGameClient(rInfo.group_nickname, {type:6 ,msg:"投注表有变化"});
        }, 1000);

        console.log(
            "[导表结束]",
            "roomId=" + rInfo.Id,
            "cc=" + rInfo.cc,
            "jc=" + (rInfo.quick_mode === 1 ? rInfo.quickModeJc : rInfo.jc),
            "status=success",
            "耗时=" + (Date.now() - flushStartedAt) + "ms"
        );
        return cb(res);
    } catch (err) {
        console.error("flushBetsToDb异常:", err);
        console.log(
            "[导表结束]",
            "roomId=" + rInfo.Id,
            "cc=" + rInfo.cc,
            "jc=" + (rInfo.quick_mode === 1 ? rInfo.quickModeJc : rInfo.jc),
            "status=error",
            "耗时=" + (Date.now() - flushStartedAt) + "ms"
        );
        return cb({code:500,msg:err.message || String(err),data:null});
    } finally {
        if (flushLock) {
            try {
                await flushLock.unlock();
            } catch (unlockErr) {
                console.error("释放导表锁失败:", unlockErr);
            }
        }
    }
}

sxRoom.prototype.doCancelBet =  async function(msg,cb){
    bet.doCancelBet(msg,this.roomInfo,this.strTempBet,this.redis,cb);
}

// 清空投注表
sxRoom.prototype.noValid = async function(msg,cb){
    let rInfo = this.roomInfo;
    msg.statistics_date = rInfo.statistics_date;
    let res = await playerDao.clearBetData(msg);

    console.log("noValid操作结果:",res.data)
    sendToFront.sendNoticeToGameClient(rInfo.group_nickname, {type:6 ,msg:"投注表有变化"});
    return cb (new GMResponse(CODE.COUNTCIL_INVALID,rInfo.rType,rInfo.Id,CODE.COUNTCIL_INVALID.msg,null));
}

// 只修改路单
sxRoom.prototype.editRoad = async function(msg,cb){
    let rInfo = this.roomInfo;
    let isLucky6_2 = parseResult.isLucky6_2(msg.result);
    let isLucky6_3 = parseResult.isLucky6_3(msg.result);
    let isLucky7_4 = parseResult.isLucky7_4(msg.result);
    let isLucky7_5 = parseResult.isLucky7_5(msg.result);
    let isLucky7_6 = parseResult.isLucky7_6(msg.result);
    let isBank = parseResult.isBank(msg.result);
    let isPlayer = parseResult.isPlayer(msg.result);
    let isPerfect = parseResult.isPerfect(msg.result);
    let playerPair = parseResult.isPlayerPair(msg.result);
    let bankerPair = parseResult.isBankPair(msg.result);

    if(isPerfect && !playerPair && !bankerPair){
        return cb({code:500,msg:"开完美必须是庄对或闲对"});
    }
    
    if((isLucky7_4 || isLucky7_5 || isLucky7_6) && !isPlayer){
        return cb({code:500,msg:"开幸运7必须是闲赢"});
    }

    if(isLucky6_2 && isLucky6_3){
        return cb({code:500,msg:"不能同时开大6和小6"});
    }  

    if(isLucky7_4 && isLucky7_5 || isLucky7_6 && isLucky7_4 || isLucky7_5 && isLucky7_6){
        return cb({code:500,msg:"不能同时两个以上的幸运7"});
    }

    await userDao.updateJcRoad(msg, rInfo.Id, rInfo.rType , rInfo);

    let response = new GMResponse(CODE.EDIT_SHOEROUND.code,rInfo.rType,rInfo.Id,CODE.EDIT_SHOEROUND.msg,null);
    cb(response);     //更新场次
}

sxRoom.prototype.editShoeRound = async function(msg,cb){

    let rInfo = this.roomInfo;

    rInfo.cc = msg.cc;
    rInfo.jc = msg.jc;
    rInfo.quickModeJc = msg.jc;

    if(msg.result == 0){
        return cb({code:500,msg:"必须要选择开奖结果"});
    }
    
    let isLucky6_2 = parseResult.isLucky6_2(msg.result);
    let isLucky6_3 = parseResult.isLucky6_3(msg.result);
    let isLucky7_4 = parseResult.isLucky7_4(msg.result);
    let isLucky7_5 = parseResult.isLucky7_5(msg.result);
    let isLucky7_6 = parseResult.isLucky7_6(msg.result);
    let isBank = parseResult.isBank(msg.result);
    let isPlayer = parseResult.isPlayer(msg.result);
    let isPerfect = parseResult.isPerfect(msg.result);
    let playerPair = parseResult.isPlayerPair(msg.result);
    let bankerPair = parseResult.isBankPair(msg.result);

    if(isPerfect && !playerPair && !bankerPair){
        return cb({code:500,msg:"开完美必须是庄对或闲对"});
    }

    if((isLucky6_2 || isLucky6_3) && !isBank){
        return cb({code:500,msg:"开幸运6必须是庄赢"});
    }

    if((isLucky7_4 || isLucky7_5 || isLucky7_6) && !isPlayer){
        return cb({code:500,msg:"开幸运7必须是闲赢"});
    }

    if(isLucky6_2 && isLucky6_3){
        return cb({code:500,msg:"不能同时开大6和小6"});
    }

    if(isLucky7_4 && isLucky7_5 || isLucky7_6 && isLucky7_4 || isLucky7_5 && isLucky7_6){
        return cb({code:500,msg:"不能同时两个以上的幸运7"});
    }

    if(rInfo.statistics_date)rInfo.statistics_date = moment(rInfo.statistics_date).format('YYYY-MM-DD');
    msg.statistics_date = rInfo.statistics_date;
    userDao.updateCcAndRoad(rInfo.Id , rInfo.quickModeJc , rInfo.cc , rInfo.jc , rInfo.road);

    this.pushGameInfoToClient();

    await userDao.updateJcRoad(msg, rInfo.Id, rInfo.rType , rInfo);

    // 等待重新结算（其中包含按群、按营业日的实时汇总）完成后再返回修改成功。
    await userDao.recalculateResults(msg, rInfo);
    rInfo.isEditShoeRound = true;

    // 更新最后的开奖局数,主要是为了给前端获取分表和投注表数据使用
    rInfo.lastResultJc = msg.jc;
    rInfo.lastResultCc = msg.cc;
    // 修改历史靴局只重算数据，不改变当前桌台状态。
    // 尤其不能在异步重算完成后把已经开始下注的新一局改成 PAUSE。
    this.setStateRedis();

    // 这里改成前端3秒自动获取
    // setTimeout(()=>{
    //     sendToFront.sendNoticeToGameClient(rInfo.group_nickname, {type:7 ,msg:{shoe:msg.cc,round:msg.jc,message:"分数表有变化"}});
    // },2000)
   
    let response = new GMResponse(CODE.EDIT_SHOEROUND.code,rInfo.rType,rInfo.Id,CODE.EDIT_SHOEROUND.msg,null);
    cb(response);     //更新场次
}

sxRoom.prototype.insertGame = function(){
    let rInfo = this.roomInfo;
    console.log(`rInfo.quick_mode:${rInfo.quick_mode === 1},quickModeJc:${rInfo.quickModeJc},jc${rInfo.jc}`);
    let obj = {
        cc:rInfo.cc,
        jc:rInfo.quick_mode === 1 ? rInfo.quickModeJc : rInfo.jc,   // 极速模式下注时jc是递增的，开奖时才更新正式的jc
        kj:null,
        rType:rInfo.rType,
        roomId:rInfo.Id,
        roomName:rInfo.roomName,
        gameStatus:rInfo.gameState,
        start_time:1,
        statistics_date:rInfo.statistics_date
    }
    userDao.insertGame(obj);
}

sxRoom.prototype.updateGame = function(msg){
    //console.log("updateGame:",msg);
    let rInfo = this.roomInfo;
    let obj = {
        cc:rInfo.cc + "-" + rInfo.jc,
        kj:msg.kj?msg.kj:null,
        kj2:msg.kj2?msg.kj2:null,
        pk:msg.pk?msg.pk:null,
        rType:rInfo.rType,
        roomId:rInfo.Id,
        gameStatus:msg.gameState?msg.gameState:rInfo.gameState,
        end_time:msg.end_time?msg.end_time:null,
        result_time:msg.result_time?msg.result_time:null,
        editAccount:msg.editAccount?msg.editAccount:null,
        edit_time:msg.edit_time?msg.edit_time:null,
    } 
    userDao.updateGame(obj);
}

// 手动发送图片都是正确的
sxRoom.prototype.stopBet = async function(msg,cb) {
    let rInfo = this.roomInfo;
    if (msg.server_send_stop_image) {
        const fail = text => cb(new GMResponse(500,rInfo.rType,rInfo.Id,text,null));
        if (this._sendingToolStopImage) return fail("截止图片正在发送，请稍后确认");
        if (![GAMESTATE.BET, GAMESTATE.STOP_BET].includes(rInfo.gameState)) {
            //return fail("当前状态不能发送截止图片");
        }
        const chatId = String(msg.chat_id || rInfo.chat_id || '').trim();
        const fileName = String(rInfo.img_stop || '').split('/').pop();   //img2_after_start
        if (!chatId || !fileName) return fail("未配置聊天群或截止图片");
        const cc = rInfo.cc;
        const jc = rInfo.jc;
        const startMsgId = rInfo.startMsgId;
        this._sendingToolStopImage = true;
        try {
            const imagePath = config.imgPath[config.imgPath.curSystem] + '/' + fileName;
            const result = await sendChat.sendImageMessage(imagePath,fileName,chatId);
            console.log("[服务器发送截止图片结果]", result);
            const sentMsgId = result && result.data && result.data.data && result.data.data.msgId;
            if (!result || result.err || !/^\d+$/.test(String(sentMsgId)) ||
                BigInt(String(sentMsgId)) <= 0n ||
                (typeof sentMsgId === 'number' && !Number.isSafeInteger(sentMsgId))) {
                return fail("截止图片发送失败或未返回有效消息ID，请确认群内图片后重试");
            }
            msg.msgId = String(sentMsgId);
            rInfo.chat_id = chatId;
        } catch (err) {
            console.error('[服务器发送截止图片失败]', err);
            return fail("服务器发送截止图片失败，请确认群内图片后重试");
        } finally {
            this._sendingToolStopImage = false;
        }
    }
    console.log("本局手动停止下注:sxRoom stopBet",rInfo.cc,rInfo.jc,msg.msgId);
    this.updateLastStopMsgId(msg.msgId);

    this.doStopBet();

    let data = { state: rInfo.gameState, cc:rInfo.cc, jc: rInfo.jc, msgId: rInfo.lastStopMsgId };
    let obj = {
        end_time: 1
    }
    this.updateGame(obj);
    let response = new GMResponse(CODE.STOP_BET2.code,rInfo.rType,rInfo.Id,CODE.STOP_BET2.msg,data);
    cb(response); 
};

sxRoom.prototype.pushResult = async function(msg,cb) {                          // 结算
    console.log("==============开始开奖============:", msg.cc,msg.jc)
    
    let rInfo = this.roomInfo;
    if(rInfo.quick_mode === 1){
        if(!rInfo.quick_mode_Lottery_draw_possible && !rInfo.hztp ){
            return cb(new GMResponse(500,rInfo.rType,rInfo.Id,"极速模式只有在开奖局已经发送投注表截图后才能开奖!",null));
        }
    }else{
        // 如果正常模式没有发送投注报表截图,不能开奖
        if(rInfo.gameState != GAMESTATE.XZB && !rInfo.hztp ){
            return cb(new GMResponse(500,rInfo.rType,rInfo.Id,"投注表截图没有发送前不能开奖!",null));
        }
    }

    msg.jc = rInfo.jc;

    rInfo.startMsgId = null;

    let isLucky6_2 = parseResult.isLucky6_2(msg.result_code);
    let isLucky6_3 = parseResult.isLucky6_3(msg.result_code);
    let isLucky7_4 = parseResult.isLucky7_4(msg.result_code);
    let isLucky7_5 = parseResult.isLucky7_5(msg.result_code);
    let isLucky7_6 = parseResult.isLucky7_6(msg.result_code);
    let isPlayer = parseResult.isPlayer(msg.result_code);
    let isBank = parseResult.isBank(msg.result_code);
    let isPerfect = parseResult.isPerfect(msg.result_code);
    let playerPair = parseResult.isPlayerPair(msg.result_code);
    let bankerPair = parseResult.isBankPair(msg.result_code);

    if(isPerfect && !playerPair && !bankerPair){
        return cb({code:500,msg:"开完美必须是庄对或闲对"});
    }
    
    if((isLucky6_2 || isLucky6_3) && !isBank){
        return cb({code:500,msg:"开幸运6必须是庄赢"});
    }

    console.log("开奖:", isLucky7_4,isLucky7_5,isLucky7_6,isPlayer,(isLucky7_4 || isLucky7_5 || isLucky7_6) && !isPlayer);
    if((isLucky7_4 || isLucky7_5 || isLucky7_6) && !isPlayer){
        return cb({code:500,msg:"开幸运7必须是闲赢"});
    }

    if(isLucky6_2 && isLucky6_3){
        return cb({code:500,msg:"不能同时开大6和小6"});
    }

    if(isLucky7_4 && isLucky7_5 || isLucky7_6 && isLucky7_4 || isLucky7_5 && isLucky7_6){
        return cb({code:500,msg:"不能同时两个以上的幸运7"});
    }

    // 因为暂停状态下当局不改变状态,极速模式下没有开奖状态
    console.log(`当前的游戏状态1:${rInfo.gameState},!${rInfo.quick_mode}`);
    if(GAMESTATE.PAUSE != rInfo.gameState && !rInfo.quick_mode){   
        rInfo.gameState = GAMESTATE.JS;
    }

    // 保持原有异步开奖时序；路单刷新和出图通知在 gameResult 内等待更新完成。
    this.gameResult(msg, cb);

    // 获取分数表截图数据的时候按下面这个局数，每局开奖后延长10秒恢复
    rInfo.lastResultJc = rInfo.jc;
    rInfo.lastResultCc = rInfo.cc;

    rInfo.jc = Number(rInfo.jc) + 1;   

    let self = this;
    setTimeout(() => {
        sendToFront.sendNoticeToGameClient(rInfo.group_nickname, {type:7 ,msg:{shoe:rInfo.lastResultCc,round:rInfo.lastResultJc,message:"分数表有变化"}});
    }, 3000);

    this.pushGameInfoToClient();
    setTimeout(() => {
       self.pushGameInfoToClient();
    },2000)

    this.setStateRedis();  
     
    userDao.updateCcAndRoad(rInfo.Id , rInfo.quickModeJc , rInfo.cc , rInfo.jc , rInfo.road);     //更新场次

    sendToFront.sendNoticeToGameClient(rInfo.group_nickname, {type:6 ,msg:"投注表有变化"});

    // 如果是极速模式，下面变量决定是否可以开奖
    if( rInfo.quick_mode === 1 )
        rInfo.quick_mode_Lottery_draw_possible = false;

    // 自动发送开始下注
    console.log(`自动开始下一局的条件:${rInfo.auto_send_start_img},${!rInfo.hztp},${!rInfo.isEmptyGame}`);
    setTimeout(() => {
        if(rInfo.auto_send_start_img && !rInfo.hztp && !rInfo.isEmptyGame){
            let cb = function(){};
            let msg = {};
            self.doNextJc(msg,2,cb);
        }
    }, 3000);
    
    // 自动发送结算报表
    if(rInfo.auto_send_settlement_table){
        setTimeout(() => {
            if(!rInfo.hztp && !rInfo.isEmptyGame){
                sendToFront.sendNoticeToGameClient(rInfo.group_nickname, {type:4,msg:{shoe:msg.cc,round:msg.jc}});
            }
        }, 6000);
    }
    sendToFront.sendNoticeToGameClient("all#", {type:9});

    bet.clearBetCache(rInfo.Id);
};


// 结算
sxRoom.prototype.gameResult = async function (msg, cb) {
    const rInfo = this.roomInfo;
    try {
        // 必须先完成结算
        await settlement.doResult(msg, rInfo);

        // 必须完成路单更新
        await this.updateRoad(
            msg.result_code,
            msg.cc,
            msg.jc
        );

        this.pushGameInfoToClient();
        // updateRoad 完成后 rInfo.road 已更新；前端收到 type:3 后通过
        // getRoomInfoForHg 读取 gameHistory。保留原有出图延时。
        if(rInfo.auto_send_road ){
            setTimeout(() => {
                if(!rInfo.hztp && !rInfo.isEmptyGame){
                    sendToFront.sendNoticeToGameClient(rInfo.group_nickname, {type:3});  
                }
            }, 1000);
        }

        const data = {
            gameId: msg.gameId,
            result: msg.result_code,
            cc: msg.cc,
            jc: msg.jc,
            road: rInfo.road
        };

        cb(new GMResponse(
            CODE.SETTLEMENT2.code,
            rInfo.rType,
            rInfo.Id,
            CODE.SETTLEMENT2.msg,
            data
        ));

        console.log(
            "[开奖完成]",
            "cc =", msg.cc,
            "jc =", msg.jc,
            "road =", rInfo.road
        );

        return true;
    } catch (err) {
        console.error("[开奖处理失败]", JSON.stringify(err));

        cb(new GMResponse(
            500,
            rInfo.rType,
            rInfo.Id,
            "开奖处理失败：" + (err.message || err),
            null
        ));

        return false;
    }
};

sxRoom.prototype.updateRoad = async function (
    kj,
    resultCc,
    resultJc
) {
    const rInfo = this.roomInfo;

    const oldRoad = String(rInfo.road || "");

    // 统一确保每一局使用 ^ 分隔
    const normalizedOldRoad =
        oldRoad === ""
            ? ""
            : oldRoad.endsWith("^")
                ? oldRoad
                : oldRoad + "^";

    const newRoad = normalizedOldRoad + kj + "^";

    const roadMsg = {
        road: newRoad,
        cc: Number(resultCc),
        jc: Number(resultJc),
        kj: kj
    };

    console.log("[updateRoad 开始]", {
        cc: roadMsg.cc,
        jc: roadMsg.jc,
        kj: roadMsg.kj,
        oldRoad: oldRoad,
        newRoad: newRoad
    });

    // 先更新内存
    rInfo.road = newRoad;

    // 再等待数据库更新结束
    const dbRoad = await userDao.updateRoomRoad(
        rInfo,
        roadMsg
    );

    // 数据库若返回了重建路单，以数据库为准
    if (typeof dbRoad === "string") {
        rInfo.road = dbRoad;
    }

    console.log("[updateRoad 完成]", {
        cc: roadMsg.cc,
        jc: roadMsg.jc,
        road: rInfo.road
    });

    return rInfo.road;
};

function GetTotalBet(row){
    let total = 0;
    total += row.z?row.z:0;
    total += row.h?row.h:0;
    total += row.x?row.x:0;
    total += row.x?row.d:0;    // 任意对
    total += row.zd?row.zd:0;
    total += row.xd?row.xd:0;
    total += row.l?row.l:0;
    total += row.m?row.m:0;
    total += row.sb?row.sb:0;
    return total;
}

