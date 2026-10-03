
const roomManage = require("../../../domain/roomManage");
module.exports = function (app) {
	return new bjlRemote(app);
};

var bjlRemote = function (app) {
	this.app = app;
	this.redis = app.get("redis");                                   // 获得 redis 对象
	this.channels = [];
	this.rType = "bjl";
	this.channelService = app.get('channelService');
	this.roomManage = new roomManage(this.channelService);
};

bjlRemote.prototype.doOpt = function(splitRes,cb) {                 
	switch (splitRes[0]){
		case "06":                                                  
			this.createRoom(splitRes,cb);
			break;
	}
}

bjlRemote.prototype.createRoom = function(splitRes,cb) {
	// 下面测试数据
	var self = this;
	let msg={rType:this.rType};
	this.roomManage.createRoom(splitRes,msg,this.redis,cb);
}

bjlRemote.prototype.autoCreateRoom = function (cb) {
	let msg = {rType:this.rType};
	this.roomManage.autoCreateRoom(msg,this.redis,cb);
}

bjlRemote.prototype.autoCreateSingleRoom = function (msg,cb) {
	this.roomManage.autoCreateSingleRoom(msg,cb);
}

// 微投台的:
bjlRemote.prototype.doBet = function(msg,cb){
	this.roomManage.doBet(msg,cb);
}

bjlRemote.prototype.addRoad = function(msg,cb){
	this.roomManage.addRoad(msg,cb);
}

bjlRemote.prototype.setBetFormImgStatus = function(msg,cb){
	this.roomManage.setBetFormImgStatus(msg,cb);
}

bjlRemote.prototype.setScoreReportStatus = function(msg,cb){
	this.roomManage.setScoreReportStatus(msg,cb);
}

bjlRemote.prototype.leave = function (userId, sid,cb) {  
	sid = this.rType + "-server-1";                                                                                       // leave channel
	this.roomManage.leave(sid,userId,cb);
};

// 下面是用于荷官台
bjlRemote.prototype.importTable = function(msg,cb) {
	this.roomManage.importTable(msg,cb);
}

bjlRemote.prototype.startSatistics = function(msg,cb) {
	// 开始统计
	console.log("remote startSatistics");
	this.roomManage.startSatistics(msg,cb);
};

bjlRemote.prototype.stopSatistics = function(msg,cb) {
	// 开始统计
	this.roomManage.stopSatistics(msg,cb);
};

bjlRemote.prototype.startGame = function(msg,cb) {
	// 开局
	this.roomManage.startGame(msg,cb);
};

bjlRemote.prototype.stopBet = function(msg,cb) {
	// 停止下注
	this.roomManage.stopBet(msg,cb);
};

bjlRemote.prototype.setHztp = function(msg,cb) {
	// 红正停牌
	this.roomManage.setHztp(msg,cb);
};

bjlRemote.prototype.pauseGame = function(msg,cb) {
	this.roomManage.pauseGame(msg,cb);
};

bjlRemote.prototype.changeGameStage = function(msg,cb) {
	// 改变游戏的状态
	this.roomManage.changeGameStage(msg,cb);
};

bjlRemote.prototype.historyRoad = function(msg,cb) {
	// 历史结果
	this.roomManage.historyRoad(msg,cb);
};

bjlRemote.prototype.rolling = function(msg,cb) {
	//请求定位
	this.roomManage.rolling(msg,cb);
};



bjlRemote.prototype.openPk = function(msg,cb) {
	//翻牌
	this.roomManage.openPk(msg,cb);
};

bjlRemote.prototype.reOpenCard = function(msg,cb){
	this.roomManage.reOpenCard(msg,cb);
}

bjlRemote.prototype.adjunctionCard = function(msg,cb) {                //cb 要确认有开有房间以后才返回
	//请求增牌
	this.roomManage.adjunctionCard(msg,cb);
};
  
bjlRemote.prototype.nextCc = function(msg,cb) {
	//换靴
	this.roomManage.nextCc(msg,cb);
};

bjlRemote.prototype.proceedNextRound = function(msg,cb) {
	//进行下一轮
	this.roomManage.proceedNextRound(msg,cb);
};

bjlRemote.prototype.doKj = function(msg,cb) {
	//换靴
	this.roomManage.doKj(msg,cb);
};
  
bjlRemote.prototype.pushResult = function(msg,cb) {                //cb 要确认有开有房间以后才返回
	//一次性发送开奖结果,开完奖后
	this.roomManage.pushResult(msg,cb);
};

bjlRemote.prototype.noValid = function(msg,cb) {
	//本局无效
	this.roomManage.noValid(msg,cb);
};

bjlRemote.prototype.sendNoPush = function(msg,cb) {
	this.roomManage.sendNoPush(msg,cb);
};
			
bjlRemote.prototype.getTotalBet = function(msg,cb) {
	//取各门总下注
	this.roomManage.getTotalBet(msg,cb);
};

bjlRemote.prototype.pushResult = function(msg,cb) {
	//一次性发送开奖结果,开完奖后
	this.roomManage.pushResult(msg,cb);
};

bjlRemote.prototype.editRoad = function(msg,cb) {
	//一次性发送开奖结果,开完奖后
	this.roomManage.editRoad(msg,cb);
};

//　下面是用于荷官台(连接自已的荷官台用)
bjlRemote.prototype.getRoomInfo = function(msg,cb) {
	//开局
	console.log("getRoomInfo:",msg)
	this.roomManage.getRoomInfo(msg,cb);
};

bjlRemote.prototype.chkEditRoadPw = function(msg,cb) {
	//一次性发送开奖结果,开完奖后
	this.roomManage.chkEditRoadPw(msg, cb);
};

bjlRemote.prototype.editShoeRound = function(msg,cb) {
	//一次性发送开奖结果,开完奖后
	this.roomManage.editShoeRound(msg, cb);
};
  