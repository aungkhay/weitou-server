var roomManage = require("../../../domain/roomManage");

module.exports = function(app) {
   return new Handler(app);
};

var Handler = function(app) {
    this.app = app;
    this.channels=[];
    this.rType="lh";
    this.redis = app.get("redis");                                                                                 //获得 redis 对象
    this.channelService = app.get('channelService');
    this.roomManage = new roomManage(this.channelService);
};

// 这个协议暂时屏掉不用，改用 dtHandler.selectAllGame
Handler.prototype.doSelectGame = function(msg, session, next) {                                                   //刚选择nn游戏,进入大厅,把之前的所有其它游戏的channel去掉
    msg.rType=this.rType;
    msg.roomId="";
    if(session.uid)msg.userId=session.uid;
    msg.player_type=session.get("player_type");
    this.doExitAllChannel(session,this.app,msg);
    this.app.rpc.lh.lhRemote.add(session, msg ,function(res){
       next(null, res);
    });
}

Handler.prototype.doSelectDesk = function(msg, session, next) {                                                   //选择桌子,退出所有别的游戏的channel
   msg.rType=this.rType;
   if(session.uid)msg.userId=session.uid;
   this.doExitAllChannel(session,this.app,msg);
   msg.player_type=session.get("player_type");
   this.app.rpc.lh.lhRemote.add(session, msg ,function(res){
      next(null, res);
   });
}

Handler.prototype.doExitAllChannel = function(session,app,msg){                                               //退出所有频道
   this.roomManage.doExitAllChannel(session,app,msg);
}

Handler.prototype.doCancelBet = function(msg, session, next) {
  msg.rType=this.rType;
  this.roomManage.doCancelBet(msg,session,next);
};

Handler.prototype.doBet = function(msg, session, next) {
   msg.rType=this.rType;
   this.roomManage.doBet(msg,session,next);
};

//下面是用于荷官台
Handler.prototype.startGame = function(msg, session, next) {
   //开局
   this.roomManage.startGame(msg, next);
 };
 Handler.prototype.stopBet = function(msg, session, next) {
   //停止下注
   this.roomManage.stopBet(msg, next);
 };
 Handler.prototype.openPk = function(msg, session, next) {
   //翻牌
   this.roomManage.openPk(msg, next);
 };
 
 Handler.prototype.nextCc = function(msg, session, next) {
   //换靴
   this.roomManage.nextCc(msg, next);
 };
 
 Handler.prototype.pushResult = function(msg, session, next) {
   //一次性发送开奖结果,开完奖后
   this.roomManage.pushResult(msg, next);
 };
 
 Handler.prototype.noValid = function(msg, session, next) {
   //本局无效
   this.roomManage.noValid(msg, next);
 };
 
 Handler.prototype.sendNoPush = function(msg, session, next) {
   //本局无效
   this.roomManage.sendNoPush(msg, next);
 };
 
 Handler.prototype.getTotalBet = function(msg, session, next) {
   //取各门总下注
   this.roomManage.getTotalBet(msg, next);
 };
 
 Handler.prototype.editRoad = function(msg, session, next) {
  //一次性发送开奖结果,开完奖后
  this.roomManage.editRoad(msg, next);
};

Handler.prototype.chkEditRoadPw = function(msg, session, next) {
 //一次性发送开奖结果,开完奖后
 this.roomManage.chkEditRoadPw(msg, next);
};
