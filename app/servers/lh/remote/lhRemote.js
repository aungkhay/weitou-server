var pushMsg = require('../../../domain/pushMsg-min');
var GMResponse= require('../../../domain/GMResponse');

const roomManage = require("../../../domain/roomManage");
module.exports = function (app) {
	return new lhRemote(app);
};

var lhRemote = function (app) {
	this.app = app;
	this.redis= app.get("redis");                                   // 获得 redis 对象
	this.channels=[];
	this.rType="lh";
	this.channelService = app.get('channelService');
	this.roomManage = new roomManage(this.channelService);
};

lhRemote.prototype.doOpt = function(splitRes,cb) {                 
	switch (splitRes[0]){
		case "06":                                                  
			this.createRoom(splitRes,cb);
			break;
	}
}

lhRemote.prototype.createRoom = function(splitRes,cb) {
	// 下面测试数据
	var self = this;
	let msg={rType:this.rType};
	this.roomManage.createRoom(splitRes,msg,this.redis,cb);
}

lhRemote.prototype.add = function (msg,cb) {
	if (msg.roomId == "") {
		this.doSelectGame(msg, cb);
	} else {
		this.doSelectDesk(msg, cb);
	}
}

lhRemote.prototype.autoCreateRoom = function (cb) {
	let msg = {rType:this.rType};
	this.roomManage.autoCreateRoom(msg,this.redis,cb);
}


lhRemote.prototype.doSelectGame = function(msg,cb) {                                                                  //刚选择nn游戏,进入大厅
    this.roomManage.doSelectGame(msg,this.redis,cb); 
}

lhRemote.prototype.addDt = function(msg,cb) {
	msg.rType=this.rType;                                                                        //刚选择多台游戏,进入大厅
    this.roomManage.addDt(msg,cb);
}

lhRemote.prototype.addAllGame = function(msg,cb) { 
	msg.rType=this.rType;                                                                       //刚选择多台游戏,进入大厅
    this.roomManage.addAllGame(msg,cb);
}

lhRemote.prototype.doSelectDesk = function(msg, cb) {                                                         
	this.roomManage.doSelectDesk(msg,this.redis,cb);
}

lhRemote.prototype.get = function (name, flag,cb) {
	var users = [];
	var channel = this.channelService.getChannel(name, flag);
	if (!!channel) {
		users = channel.getMembers();
	}
	cb(users.length);
};

lhRemote.prototype.leave = function (userId, sid,cb) {  
	sid = this.rType+"-server-1";                                                                                       // leave channel
	this.roomManage.leave(sid,userId,cb);
};

//下面是用于荷官台

lhRemote.prototype.startGame = function(msg,cb) {
	//开局
	this.roomManage.startGame(msg,cb);
};
 
lhRemote.prototype.stopBet = function(msg,cb) {
	//停止下注
	this.roomManage.stopBet(msg,cb);
};

lhRemote.prototype.rolling = function(msg,cb) {
	//请求定位
	this.roomManage.rolling(msg,cb);
};

lhRemote.prototype.changeGameStage = function(msg,cb) {
	// 改变游戏的状态
	this.roomManage.changeGameStage(msg,cb);
};

lhRemote.prototype.openPk = function(msg,cb) {
	//翻牌
	this.roomManage.openPk(msg,cb);
};

lhRemote.prototype.reOpenCard = function(msg,cb){
	this.roomManage.reOpenCard(msg,cb);
}

lhRemote.prototype.adjunctionCard = function(msg,cb) {                //cb 要确认有开有房间以后才返回
	//请求增牌
	this.roomManage.adjunctionCard(msg,cb);
};
  
lhRemote.prototype.nextCc = function(msg,cb) {
	//换靴
	this.roomManage.nextCc(msg,cb);
};

lhRemote.prototype.doKj = function(msg,cb) {
	//换靴
	this.roomManage.doKj(msg,cb);
};
  
lhRemote.prototype.pushResult = function(msg,cb) {                //cb 要确认有开有房间以后才返回
	//一次性发送开奖结果,开完奖后
	this.roomManage.pushResult(msg,cb);
};

lhRemote.prototype.noValid = function(msg,cb) {
	//本局无效
	this.roomManage.noValid(msg,cb);
};

lhRemote.prototype.sendNoPush = function(msg,cb) {
	//本局无效
	this.roomManage.sendNoPush(msg,cb);
};
			
lhRemote.prototype.getTotalBet = function(msg,cb) {
	//取各门总下注
	this.roomManage.getTotalBet(msg,cb);
};

lhRemote.prototype.pushResult = function(msg,cb) {
	//一次性发送开奖结果,开完奖后
	this.roomManage.pushResult(msg,cb);
};

lhRemote.prototype.editRoad = function(msg,cb) {
	//一次性发送开奖结果,开完奖后
	this.roomManage.editRoad(msg,cb);
};

//　下面是用于荷官台(连接自已的荷官台用)
lhRemote.prototype.getRoomInfo = function(msg,cb) {
	//开局
	this.roomManage.getRoomInfo(msg,cb);
};

lhRemote.prototype.chkEditRoadPw = function(msg, cb) {
	//一次性发送开奖结果,开完奖后
	this.roomManage.chkEditRoadPw(msg, cb);
  };