const GMResponse = require("./GMResponse");
const userDao = require("../dao/userDao");   //-min
const systemDao = require("../dao/systemDao");
const pushMsg = require("./pushMsg-min");
var pomelo = require('pomelo');

var roomManage = function(channel) {
    this.channels = [];
    this.channelService = channel;
    this.room;
    this.redis = pomelo.app.get("redis");
    this.members = {};
};

module.exports = roomManage;

// auto CreateRoom
roomManage.prototype.autoCreateRoom = async function(msg,redis,cb){
    let roomArr = [];
    let self = this;
    let res = await systemDao.getGroupPullDataSetupByRtype(msg);
    res = res.data;
    
    if(!res || res && res.length == 0){
      return cb( new GMResponse("500", msg.rType, "", "未找到房间", ""));
    }
    for (let i = 0; i < res.length; i++){
      if (res[i] && res[i].active  ) {
          roomArr.push(res[i]);
      }
    }
    for (let i = 0; i < roomArr.length; i++) {
        let name = msg.rType + "_game_" + roomArr[i].Id;
        console.log("=================autoCreateRoom:",name)
        let channel = self.channelService.getChannel(name, true);
        if (!channel.gameRoom) {
          let cRoom = require("./sx/sxRoom");                                           // require("./"+msg.rType+"Room-min");     // 导入相关的
          let room = new cRoom(channel, roomArr[i]);
          room.roomInfo = roomArr[i];                                                   // 初始化room信息
          channel.gameRoom = room;
      }
    }
    cb("06ok");
}

roomManage.prototype.autoCreateSingleRoom = async function(msg,cb){
    let self = this;
    
    let res = await systemDao.getGroupPullDataSetupById(msg.roomId);
    res = res.data;

    if(!res){
      return cb( new GMResponse("500", msg.rType, "", "未找到房间", ""));
    }

    if(!res.active){
      return cb( new GMResponse("500", msg.rType, "", "房间未启用", ""));
    }

    let name = msg.rType + "_game_" + msg.roomId;
    let channel = self.channelService.getChannel(name, true);
    if (!channel.gameRoom) {
      let cRoom = require("./sx/sxRoom");                                         
      let room = new cRoom(channel, res);
      room.roomInfo = res;                                                   // 初始化room信息
      channel.gameRoom = room;
      msg.group_nickname = res.group_nickname;
      parameter_Setup(msg);
    }
    cb("06ok");
}

// 设定房间赔率限注等参数
async function  parameter_Setup(msg){
    let res = await systemDao.getParameter(msg);
    if(res.length > 0){
      return;
    }
    let obj = {
      "banker_odds": 95,
      "player_odds": 100,
      "tie_odds": 800,
      "pair_odds": 1100,
      "lucky_6_2_odds": 1200,
      "lucky_6_3_odds": 2000,
      "perfect_pair": 2500,
      "any_pair": 500,
      "enable_pumping_mode": 0,
      "desk_enable_pumping_mode": 0,
      "banker_6points_win_commission_ratio": 0,
      "banker_win_odds": 0,
      "filter_players_setup": "",
      "pb_min_limit": 50,
      "pb_max_limit": 200000,
      "sanbao_min_limit": 30,
      "sanbao_max_limit": 10000,
      "lucky6_2_min_limit": 30,
      "lucky6_2_max_limit": 8000,
      "lucky6_3_min_limit": 30,
      "lucky6_3_max_limit": 8000,
      "perfect_min_limit": 30,
      "perfect_max_limit": 5000,
      "any_min_limit": 30,
      "any_max_limit": 1000000,
      "points_exchange_ratio": 1000,
      "integral_statistics_method": "按有效流水",
      "show_points": 1,
      "default_exchange": 3,
      "pb_max_bet_amount": 200000,
      "pb_min_bet_amount": 3500,
      "transfer_small_change": 0,
      "minimum_amount_sold": 0,
      "enable_Lucky_6": 1,
      "change_settings": "百",
      "enable_perfect_pairs": 1,
      "enable_road":1,
      "enable_any_pairs": 0,
      "screenshot_mode_bet_form": "下注用户",
      "pb_bet_calculation_Mode": "只舍不入",
      "should_statistics_truncated": 1,
      "group_nickname": msg.group_nickname
    }
    systemDao.parameterSetup(obj);
}

roomManage.prototype.changeGameStage = function(msg,cb){
  // 游戏阶段改变
  var channelName = msg.rType + "_game_" + msg.roomId;
  var channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
    var response = new GMResponse("500",msg.rType,msg.roomId,"未找到房间", "");
    cb(response);
    return;
  }
  var room = channel.gameRoom;
  room.changeGameStage(msg,cb);
}

roomManage.prototype.historyRoad = function(msg,cb){
  // 获取结果路单
  var channelName = msg.rType + "_game_" + msg.roomId;
  var channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
    var response = new GMResponse("500",msg.rType,msg.roomId,"未找到房间", "");
    cb(response);
    return;
  }
  var room = channel.gameRoom;
  room.historyRoad(msg,cb);
}

roomManage.prototype.doBet = function(msg,cb){
    let roomId = msg.roomId;
    var channel = this.channelService.getChannel(msg.rType + '_game_' + roomId, false);
    if (!channel || !channel.gameRoom) {
      cb(null, new GMResponse(405,msg.rType,roomId,'未找到房间'));
      return;
    }
    var room = channel.gameRoom;
    room.doBet(msg,function(res){
      cb(res);
    })
}

roomManage.prototype.addRoad = function(msg,cb){
    let roomId = msg.roomId;
    var channel = this.channelService.getChannel(msg.rType + '_game_' + roomId, false);
    if (!channel && !channel.gameRoom) {
      cb(null, new GMResponse(405,msg.rType,roomId,'未找到房间'));
      return;
    }
    var room = channel.gameRoom;
    room.addRoad(msg,function(res){
      cb(res);
    })
}

roomManage.prototype.setBetFormImgStatus = function(msg,cb){
    let roomId = msg.roomId;
    var channel = this.channelService.getChannel(msg.rType + '_game_' + roomId, false);
    if (!channel && !channel.gameRoom) {
      cb(null, new GMResponse(405,msg.rType,roomId,'未找到房间'));
      return;
    }
    var room = channel.gameRoom;
    room.setBetFormImgStatus(msg,function(res){
      cb(res);
    })
}

roomManage.prototype.setScoreReportStatus = function(msg,cb){
    let roomId = msg.roomId;
    var channel = this.channelService.getChannel(msg.rType + '_game_' + roomId, false);
    if (!channel && !channel.gameRoom) {
      cb(null, new GMResponse(405,msg.rType,roomId,'未找到房间'));
      return;
    }
    var room = channel.gameRoom;
    room.setScoreReportStatus(msg,function(res){
      cb(res);
    })
}
  
// 离开时重新设定房间人数
roomManage.prototype.leave = function(sid,userId,cb){
	let channels = this.channels;
	for (let i in channels){
      let ch = channels[i].split("_");   // bjl_game_3
      let s = ch[0] + "-" + ch[2];
      let r = sid.split("-");
      if(r[0] == ch[0] ){
         if(!this.members[s])this.members[s] = [];
         this.members[s] = this.members[s].filter(item => item != userId); 
         this.setMemberRorRedis(ch[0],ch[2],this.members[s]);
      }
      pushMsg.leaveChannel(userId, channels[i]);  
	}
  cb(null);
  
}

// 进入某张桌子的时候退出其它桌子的频道
roomManage.prototype.doExitAllChannel = function(session,app,msg) { 
    let userId = msg.userId;
    app.rpc.nn.nnRemote.leave(session,userId,app.get("serverId"),function(err,res){});                            // 别的游戏另外加
    app.rpc.bjl.bjlRemote.leave(session,userId,app.get("serverId"),function(err,res){});
    app.rpc.lh.lhRemote.leave(session,userId,app.get("serverId"),function(err,res){});
}

// 下面是用于荷官台
roomManage.prototype.getRoomInfo = function(msg,cb) {
  //本局无效
  let channelName = msg.rType + "_game_" + msg.roomId;
  console.log("channelName:",channelName)
  let channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
     let response = new GMResponse("500",msg.rType,msg.roomId,"未找到房间", "");
     return cb(response);
  }
  let room = channel.gameRoom;
  room.getRoomInfoForHg(msg,cb);
};

roomManage.prototype.importTable = function(msg,cb) {
  // 导入表格
  var channelName = msg.rType + "_game_" + msg.roomId;
  var channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
    var response = new GMResponse("500",msg.rType,msg.roomId,"未找到房间", "");
    return cb(response);
  }
  var room = channel.gameRoom;
  room.flushBetsToDb(msg,cb);
};

roomManage.prototype.startSatistics = function(msg,cb) {
  //开局
  var channelName = msg.rType + "_game_" + msg.roomId;
  var channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
    var response = new GMResponse("500",msg.rType,msg.roomId,"未找到房间", "");
    return cb(response);
  }
  var room = channel.gameRoom;
  room.startSatistics(msg,cb);
};

roomManage.prototype.stopSatistics = function(msg,cb) {
  //开局
  var channelName = msg.rType + "_game_" + msg.roomId;
  var channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
    var response = new GMResponse("500",msg.rType,msg.roomId,"未找到房间", "");
    return cb(response);
  }
  var room = channel.gameRoom;
  room.stopSatistics(msg,cb);
};



roomManage.prototype.startGame = function(msg,cb) {
  //开局
  var channelName = msg.rType + "_game_" + msg.roomId;
  var channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
    var response = new GMResponse("500",msg.rType,msg.roomId,"未找到房间", "");
    return cb(response);
  }
  var room = channel.gameRoom;
  room.nextJc(msg,cb);
};

roomManage.prototype.stopBet = function(msg,cb) {
  //本局无效
  var channelName = msg.rType + "_game_" + msg.roomId;
  var channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
    var response = new GMResponse("500",msg.rType,msg.roomId,"未找到房间", "");
    cb(response);
    return;
  }
  var room = channel.gameRoom;
  room.stopBet(msg,cb);
};

roomManage.prototype.setHztp = function(msg,cb) {
  //本局无效
  let channelName = msg.rType + "_game_" + msg.roomId;
  let channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
    let response = new GMResponse("500",msg.rType,msg.roomId,"未找到房间", "");
    cb(response);
    return;
  }
  let room = channel.gameRoom;
  room.setHztp(msg,cb);
};

roomManage.prototype.pauseGame = function(msg,cb) {
  // 暂停游戏
  var channelName = msg.rType + "_game_" + msg.roomId;
  var channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
    var response = new GMResponse("500",msg.rType,msg.roomId,"未找到房间", "");
    cb(response);
    return;
  }
  var room = channel.gameRoom;
  room.pauseGame(msg,cb);
}

roomManage.prototype.rolling = function(msg,cb) {
  //请求定位
  var channelName = msg.rType + "_game_" + msg.roomId;
  var channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
     var response = new GMResponse("500",msg.rType,msg.roomId,"未找到房间", "");
     cb(response);
     return;
  }
  var room = channel.gameRoom;
  room.rolling(msg,cb);
};

roomManage.prototype.openPk = function(msg,cb) {
  //翻牌
  var channelName = msg.rType + "_game_" + msg.roomId;
  var channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
     var response = new GMResponse("500",msg.rType,msg.roomId,"未找到房间", "");
     cb(response);
     return;
  }
  var room = channel.gameRoom;
  room.openPk(msg,cb);
};

roomManage.prototype.reOpenCard = function(msg,cb) {
  //翻牌
  var channelName = msg.rType + "_game_" + msg.roomId;
  var channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
     var response = new GMResponse("500",msg.rType,msg.roomId,"未找到房间", "");
     cb(response);
     return;
  }
  var room = channel.gameRoom;
  room.reOpenCard(msg,cb);
};

roomManage.prototype.adjunctionCard = function(msg,cb) {
  //翻牌
  var channelName = msg.rType + "_game_" + msg.roomId;
  var channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
     var response = new GMResponse("500",msg.rType,msg.roomId,"未找到房间", "");
     cb(response);
     return;
  }
  var room = channel.gameRoom;
  room.adjunctionCard(msg,cb);
};

roomManage.prototype.nextCc = function(msg,cb) {
  //换靴
  var channelName = msg.rType + "_game_" + msg.roomId;
  var channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
     var response = new GMResponse("500",msg.rType,msg.roomId,"未找到房间", "");
     cb(response);
     return;
  }
  var room = channel.gameRoom;
  room.nextCc(msg,cb);
};

roomManage.prototype.proceedNextRound = function(msg,cb) {
  //换靴
  var channelName = msg.rType + "_game_" + msg.roomId;
  var channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
     var response = new GMResponse("500",msg.rType,msg.roomId,"未找到房间", "");
     cb(response);
     return;
  }
  var room = channel.gameRoom;
  room.proceedNextRound(msg,cb);
};

roomManage.prototype.doKj=function(msg,cb){                         //开奖
  var channelName = msg.rType + "_game_" + msg.roomId;
  var channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
     var response = new GMResponse("500",msg.rType,msg.roomId,"未找到房间", "");
     cb(response);
     return;
  }
  msg.pushType=1;                                                      
  //console.log("channelName:",channelName);
  var room = channel.gameRoom;
  room.doKj(msg,cb);
}

roomManage.prototype.pushResult = function(msg,cb) {                    //  结算
  var channelName = msg.rType + "_game_" + msg.roomId;
  var channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
     var response = new GMResponse("500",msg.rType,msg.roomId,"未找到房间", "");
     cb(response);
     return;
  }
  msg.pushType = 1;                                                      
  var room = channel.gameRoom;
  room.pushResult(msg,cb);
};

roomManage.prototype.noValid = function(msg,cb) {
  //本局无效
  var channelName = msg.rType + "_game_" + msg.roomId;
  var channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
     var response = new GMResponse("500",msg.rType,msg.roomId,"未找到房间", "");
     cb(response);
     return;
  }
  msg.pushType = 1;                                               //0:sendNoPush以前未提交  1:当局提交的
  var room = channel.gameRoom;
  room.noValid(msg,cb);
};

//本局无效
roomManage.prototype.sendNoPush = function(msg,cb) {
  var channelName = msg.rType + "_game_" + msg.roomId;
  var channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
    cb(null, new GMResponse("500", msg.rType, msg.roomId, "未找到房间"));
    return;
  }
  msg.pushType=0;               // 0 以前未提交  1 当局提交的
  var room = channel.gameRoom;
  room.sendNoPush(msg,cb);
};

// 取各门总下注
roomManage.prototype.getTotalBet = function(msg,cb) {
  var channelName = msg.rType + "_game_" + msg.roomId;
  var channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
    cb(null, new GMResponse("500", msg.rType, msg.roomId, "未找到房间"));
    return;
  }
  var room = channel.gameRoom;
  room.getTmData(msg,cb);
};

roomManage.prototype.chkEditRoadPw = function(msg,cb) {
  // 改单
  var channelName = msg.rType + "_game_" + msg.roomId;
  let channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
      cb(null, new GMResponse("500", msg.rType, msg.roomId, "未找到房间"));
      return;
  }
  
  userDao.getGameSetup(function(err, res){ 
      if(!!res && res.hgPw==msg.pw){
        let data={gameId:msg.gameId,result:1};
        cb(new GMResponse("200", msg.rType, msg.roomId, "判断密码",data));
      }else{
        let data={gameId:msg.gameId,result:0};
        cb(new GMResponse("500", msg.rType, msg.roomId, "判断密码",data));
      }
  })
};

roomManage.prototype.editRoad = function(msg,cb) {
  // 改单
  var channelName = msg.rType + "_game_" + msg.roomId;
  var channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
    cb(null, new GMResponse("500", msg.rType, msg.roomId, "未找到房间"));
    return;
  }
  var room = channel.gameRoom;
  room.editRoad(msg,cb);
};

roomManage.prototype.editShoeRound = function(msg,cb) {
  // 改单
  var channelName = msg.rType + "_game_" + msg.roomId;
  var channel = this.channelService.getChannel(channelName, false);
  if (!channel || !channel.gameRoom) {
    cb(null, new GMResponse("500", msg.rType, msg.roomId, "未找到房间"));
    return;
  }
  console.log("editShoeRound room msg:",msg)
  var room = channel.gameRoom;
  room.editShoeRound(msg,cb);
};
