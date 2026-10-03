var roomManage = require("../../../domain/roomManage");
var pushMsg = require('../../../domain/pushMsg-min');
module.exports = function(app) {
   return new Handler(app);
};

var Handler = function(app) {
    this.app = app;
    this.channels=[];
    this.redis = app.get("redis");  
    this.rType="bjl";                                                                               //获得 redis 对象
    this.channelService = app.get('channelService');
    this.roomManage = new roomManage(this.channelService);
};

Handler.prototype.chkHardBean = function(msg, session, next) {   
   let msg1={code:"07"};
   if(msg.client_type){
      let userId=session.get("userId");
      if(!userId)userId = msg.userId;
      pushMsg.pushMsgByUids(userId,msg1);   //app use 
      next(null);
      return;
   }
   next(null,msg1);
}

Handler.prototype.getClientIp = function(msg, session) {
   let ip = session.__session__.__socket__.remoteAddress.ip
}

// 下面是用于荷官台(own 荷官台用)
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
 
 Handler.prototype.pushResult = function(msg, session, next) {
   //一次性发送开奖结果,开完奖后
   this.roomManage.pushResult(msg, next);
 };

 Handler.prototype.editRoad = function(msg, session, next) {
   //一次性发送开奖结果,开完奖后
   this.roomManage.editRoad(msg, next);
 };

 Handler.prototype.chkEditRoadPw = function(msg, session, next) {
  //一次性发送开奖结果,开完奖后
  this.roomManage.chkEditRoadPw(msg, next);
};