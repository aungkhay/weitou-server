let express = require("express");
let router = express.Router();
const HG_TRANS = require('../../util/hgTrans');
const pomelo = require('pomelo');
const emitter = require('../../util/info_events');
let desk1_url = "ws://flw-kxkey.kx3333.net:4149";
let ws =  require("../../util/websocket");

// 使用示例(凯旋)
const desk1_ws =  new ws(desk1_url, {     // flw-kxkey.kx3333.net:4149  2149   4149
  reconnectInterval: 3000,  // 重连间隔 3 秒
  maxReconnectAttempts: 100,  // 最大重连次数 5 次
});
desk1_ws.connect();

emitter.on('ws:message', (msg) => {
  //console.log('收到服务器消息:', msg);
  if(msg.protocol != 999)doHg(msg);
});

function doHg(data){
    try{
        // 收到服务器消息: {"protocol":20,"data":{"areaID":651,"gameNo":13369550,"gameNoRound":2,"unixTime":1765798236,"gameStage":3}}
        // areaID: 桌号 
        let protocol = data.protocol;
        data = data.data;
        data.protocol = protocol;
        //let time =  utils.transDate((new Date(parseInt(data.unixTime) * 1000)));
        //data.time = time;
        let game = HG_TRANS.gameIdTrans(data.areaID);
        console.log("game:",game);
        let msg = {};
        msg.rType = game.rType;
        msg.roomId = game.roomId;
        msg.isOtherHg = 1;           
        let rpc = pomelo.app.rpc; 
        let gt = game.rType;
        msg.gameId = data.areaID;
        console.log("msg:",msg)
        let obj=gt=="bjl"?rpc.bjl.bjlRemote:gt=="lh"?rpc.lh.lhRemote:gt=="dx"?rpc.dx.dxRemote:gt=="nn"?rpc.nn.nnRemote:rpc.tts.ttsRemote;
        if(obj && game.rType != "" )doNewHgOpt(data,msg,obj);     
     }catch(err){
        console.log("JSON 解析错误:",data);
    }
}

function doNewHgOpt(data,msg,obj){
    msg.diffTime = 0;
    msg.newVersion = 1;
    //if(data.time)msg.diffTime = getDiffTime(data.time,new Date(),msg,data);
    if(!!data.gameNo){msg.cc = data.gameNo , msg.jc = data.gameNoRound};
    console.log("============doNewHgOpt:===============",msg,data);
    switch(data.protocol){
        case 10:                                 // 桌资讯 {areaID:桌号, areaType: 桌类型}    areaType 桌类型: 0=网投, 4=咪牌, 5=极速, 6=三合一
            break;
        case 20:                                 // 游戏阶段 {桌号(areaID,长度可能bitint)，场次(gameNo)，局次(gameNoRound)，阶段（gameStage）} 
            msg.gameStage = data.gameStage;
            obj.changeGameStage(null,msg,function(result){});    // gameStage: 0=洗牌, 1=下注, 2=开牌, 3=结算, 4=关闭
            break; 
        case 21:                                 // 更新场次信息 {areaID,areaType,gameNo,gameNoRound,dealerName,dealerImage,betMilliSecond,bWantToShuffle,bWantToEnd} 
            break;
        case 24:                                 // 发牌 {areaID,areaType,gameNo,gameNoRound,cardArea,cardID,cardArr} ,cardArea:牌位置，cardID：牌号
            msg.cardArea = data.cardArea;
            msg.cardID = data.cardID;
            if(msg.cardArea == 0 ){
                obj.rolling(null,msg,function(result){});   
                return;
            }
            obj.openPk(null,msg,function(result){});
            break;    
        case 25:                                 // 输赢结果 {areaID,gameNo,gameNoRound,result,cardArr,}
            msg.result_code = data.result;
            msg.cardArr = data.cardArr;
            if(msg.rType == "bjl"){
                msg.playerScore = data.playerScore;
                msg.bankerScore = data.bankerScore;
            }
            obj.pushResult(null,msg,function(result){});
            break;
        case 26:                                 // 历史牌路 {areaID,historyArr, resultObjArr }
            msg.historyArr = data.historyArr;
            obj.historyRoad(null,msg,function(result){});
            break;
        case 36:                                // 提示发牌{ areaID,cardAreaArr:[提示牌位置代号]}
            //obj.rolling(null,msg,function(result){});   
            break;
        case 38:                                // 下注倒数开始  {areaID,gameNo,gameNoRound,startBetUnixTime,timeMillisecond} ,  
            msg.remainSec = Math.floor(data.timeMillisecond / 1000);
            obj.startGame(null,msg,function(result){});              //  startBetUnixTime: 开始下注时间UnixTime(long),timeMillisecond: 倒数毫秒时间(int)
            break;    
        case 59:                               //  取消当局 {areaID,gameNo,gameNoRound}
            obj.noValid(null,msg,function(result){});  
            break;  
        case 71:                               //  可以咪牌  {areaID,miCardMilliSecond,miCardId}
    }
}

module.exports = router;