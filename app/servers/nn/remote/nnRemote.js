var pushMsg = require('../../../domain/pushMsg-min');
var GMResponse= require('../../../domain/GMResponse');

const roomManage = require("../../../domain/roomManage");
module.exports = function (app) {
	return new nnRemote(app);
};

var nnRemote = function (app) {
	this.app = app;
	this.redis= app.get("redis");                                   // 获得 redis 对象
	this.channels=[];
	this.rType="nn";
	this.channelService = app.get('channelService');
	this.roomManage = new roomManage(this.channelService);
};

nnRemote.prototype.doOpt = function(splitRes,cb) {                 
	switch (splitRes[0]){
		case "06":                                                  
			this.createRoom(splitRes,cb);
			break;
	}
}

nnRemote.prototype.createRoom = function(splitRes,cb) {
	// 下面测试数据
	var self = this;
	let msg={rType:this.rType};
	this.roomManage.createRoom(splitRes,msg,this.redis,cb);
}

nnRemote.prototype.autoCreateRoom = function (cb) {
	let msg = {rType:this.rType};
	this.roomManage.autoCreateRoom(msg,this.redis,cb);
}

nnRemote.prototype.add = function (msg,cb) {
	if (msg.roomId == "") {
		this.doSelectGame(msg, cb);
	} else {
		this.doSelectDesk(msg, cb);
	}
}

nnRemote.prototype.doSelectGame = function(msg,cb) {                                                                  //刚选择nn游戏,进入大厅
    this.roomManage.doSelectGame(msg,this.redis,cb); 
}

nnRemote.prototype.addDt = function(msg,cb) { 
	msg.rType=this.rType;                                                                       //刚选择多台游戏,进入大厅
    this.roomManage.addDt(msg,cb);
}

nnRemote.prototype.addAllGame = function(msg,cb) { 
	msg.rType=this.rType;                                                                       //刚选择多台游戏,进入大厅
    this.roomManage.addAllGame(msg,cb);
}

nnRemote.prototype.doSelectDesk = function(msg, cb) {                                                         
	this.roomManage.doSelectDesk(msg,this.redis,cb);
}

nnRemote.prototype.get = function (name, flag,cb) {
	var users = [];
	var channel = this.channelService.getChannel(name, flag);
	if (!!channel) {
		users = channel.getMembers();
	}
	cb(users.length);
};

nnRemote.prototype.leave = function (userId, sid,cb) {  
	sid = this.rType + "-server-1";                                                                                       // leave channel
	this.roomManage.leave(sid,userId,cb);
};

//下面是用于荷官台

nnRemote.prototype.startGame = function(msg,cb) {
	//开局
	this.roomManage.startGame(msg,cb);
};
 
nnRemote.prototype.stopBet = function(msg,cb) {
	//停止下注
	this.roomManage.stopBet(msg,cb);
};

nnRemote.prototype.changeGameStage = function(msg,cb) {
	// 改变游戏的状态
	this.roomManage.changeGameStage(msg,cb);
};

nnRemote.prototype.rolling = function(msg,cb) {
	//请求定位
	this.roomManage.rolling(msg,cb);
};

nnRemote.prototype.openPk = function(msg,cb) {
	//翻牌
	this.roomManage.openPk(msg,cb);
};

nnRemote.prototype.reOpenCard = function(msg,cb){
	this.roomManage.reOpenCard(msg,cb);
}

nnRemote.prototype.adjunctionCard = function(msg,cb) {                //cb 要确认有开有房间以后才返回
	//请求增牌
	this.roomManage.adjunctionCard(msg,cb);
};
  
nnRemote.prototype.nextCc = function(msg,cb) {
	//换靴
	this.roomManage.nextCc(msg,cb);
};

nnRemote.prototype.doKj = function(msg,cb) {
	//换靴
	this.roomManage.doKj(msg,cb);
};
  
nnRemote.prototype.pushResult = function(msg,cb) {                //cb 要确认有开有房间以后才返回
	//一次性发送开奖结果,开完奖后
	this.roomManage.pushResult(msg,cb);
};

nnRemote.prototype.noValid = function(msg,cb) {
	//本局无效
	this.roomManage.noValid(msg,cb);
};

nnRemote.prototype.sendNoPush = function(msg,cb) {
	//本局无效
	this.roomManage.sendNoPush(msg,cb);
};
			
nnRemote.prototype.getTotalBet = function(msg,cb) {
	//取各门总下注
	this.roomManage.getTotalBet(msg,cb);
};

nnRemote.prototype.pushResult = function(msg,cb) {
	//一次性发送开奖结果,开完奖后
	this.roomManage.pushResult(msg,cb);
};

nnRemote.prototype.editRoad = function(msg,cb) {
	//一次性发送开奖结果,开完奖后
	this.roomManage.editRoad(msg,cb);
};

//　下面是用于荷官台(连接自已的荷官台用)
nnRemote.prototype.getRoomInfo = function(msg,cb) {
	//开局
	this.roomManage.getRoomInfo(msg,cb);
};

nnRemote.prototype.chkEditRoadPw = function(msg,cb) {
	//一次性发送开奖结果,开完奖后
	this.roomManage.chkEditRoadPw(msg, cb);
  };