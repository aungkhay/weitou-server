module.exports = {                   // 荷官参照表
    GAME_TYPE:{                      // 游戏类型
		brcc: "brcc",                // 百乐
		dt:   "dt",                  // 龙虎
		nb:   "nb",                  // 庄闲牛
		nn:   "nn",                  // 牛牛
		sd:   "sd",                  // 单双
		bs:   "bs",                  // 大小
		rb:   "rb",                  // 红黑
		qttz:  "qttz",               // 推筒子
		gttz:  "gttz"                // 推筒子
	},	
	GAME_STATUS:{
		BET: "1",               // 下注状态
		STOP_BET: "2",          // 停止下注
		KJ: "3",                // 开奖
		XP: "4",                // 洗牌 
		JS: "5",                // 结算
		NO_START_GAME: "0"      // 未开局 
	},
	EVENT:{
		EV_DEALER_EDITSHOE_REQ:                    0,
		EV_DEALER_ORGANIZECARDS_REQ:               1,    //洗牌
		EV_DEALER_BETSTART_REQ:                    2,    //开时计时
		EV_DEALER_BETSTOP_REQ:                     3,    //停止计时
		EV_DEALER_CARD_REQ:                        4,    //发牌
		EV_DEALER_REVISECARD_REQ:                  5,    //清除重新发牌
		EV_DEALER_REVISEHISTORY_REQ:               6,    //编辑路单
		EV_DEALER_BACCRESULT_REQ:                  7,    //百家乐请求结果
		EV_DEALER_ADJUNCTIONCARD_REQ:              8,    //      
		EV_DEALER_DTRESULT_REQ:                    9,    //请求游戏结果
		EV_DEALER_DICESDEAL_REQ:                   10,   //骰子点数   
		EV_DEALER_ROLLING_REQ:                     11,   //定位牌
		EV_DEALER_CHECKOUT_REQ:                    12,   //结算
		EV_DEALER_CANCELTHEGAME_REQ:               13, 
		EV_DEALER_STARTSTATISTICS_REQ:             14,   // 开始统计
		EV_DEALER_STOPSTATISTICS_REQ:              15,   // 停止统计
		EV_DEALER_HZTP_REQ:                        16,   // 红正停牌
		EV_DEALER_PAUSEGAME_REQ:                   17,   // 暂停游戏
		EV_DEALER_IMPORT_TABLE_REQ:                18,   // 导入表格
		EV_DEALER_PROCEED_NEXT_ROUND_REQ:          20,   // 进行下一轮

		EV_SERVER_LOGIN_REPLY:                     100,
		EV_SERVER_ORGANIZECARDS_REPLY:             101,   //洗牌应答
		EV_SERVER_BETSTART_REPLY:                  102,   //开始计时应答
		EV_SERVER_BETSTOP_REPLY:                   103,   //停止计时应答
		EV_SERVER_CARD_REPLY:                      104,   //发牌应答
		EV_SERVER_REVISECARD_REPLY:                105,   //清除重新发牌
		EV_SERVER_REVISEHISTORY_REPLY:             106,
		EV_SERVER_BACCRESULT_REPLY:                107,   //百家乐请求结果
		EV_SERVER_ADJUNCTIONCARD_REPLY:            108,
		EV_SERVER_DTRESULT_REPLY:                  109,   //请求游戏结果
		EV_SERVER_DICESDEAL_REPLY:                 110,   //点数
		EV_SERVER_ROLLING_REPLY:                   111,   //定位牌
		EV_SERVER_CHECKOUT_REPLY:                  112,   //结算应答
		EV_SERVER_CANCELTHEGAME_REPLY:             113,   //本局無效
	},

};