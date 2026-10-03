module.exports = {
	OK: '200',
	FAIL: '500',

	ENTRY: {
		FA_TOKEN_INVALID: 	'1001',
		FA_TOKEN_EXPIRE: 	'1002',
		FA_USER_NOT_EXIST: 	'1003',
		FA_LOGIN_REPLACED: 	'1004',
		FA_SESSION_UNAVAILABLE: '1005',
		FA_TOKEN_SCOPE:      '1006',
	},

	GATE: {
		FA_NO_SERVER_AVAILABLE: '2001'
	},
    
    GAME:{
		 GET_ROOM_INFO :   			{code:"02",msg:"获取桌子信息"},　
		 START_BET :   				{code:"03",msg:"开始下注"},
		 STOP_BET :    				{code:"04",msg:"停止下注"},
		 OPEN_PK :     				{code:"05",msg:"开牌"},
		 SETTLEMENT:				{code:"06",msg:"结算"},
		 RE_OPEN:                   {code:"07",msg:"重新开牌"},
		 OPEN_ONE_PK : 				{code:"08",msg:"翻单张牌"},
		 COUNTCIL_INVALID:  		{code:"10",msg:"本局无效"},
		 REPLACEMENT : 	  			{code:"11",msg:"换靴"},
		 GET_ROLLING: 	  			{code:"12",msg:"请求定位"},
		 OPEN_PK2: 	   	    		{code:"83",msg:"开牌"},
		 START_GAME:   	    		{code:"84",msg:"开局"},
		 SETTLEMENT2:				{code:"86",msg:"结算"},
		 COUNTCIL_INVALID2: 		{code:"87",msg:"本局无效"},
		 REPLACEMENT2:				{code:"88",msg:"换靴"},
		 SUBMIT_NOSEND:				{code:"89",msg:"提交补漏"},
		 STOP_BET2:					{code:"90",msg:"停止下注"},
		 GET_PLAYERS:				{code:"91",msg:"取人数和汇总下注"},
		 EDIT_ROAD:					{code:"93",msg:"修改路单"},
		 IN_ROOM:		            {code:"200",msg:"加入房间"},            // new
		 GET_CURDAY_RECORD:			{code:"106",msg:"取开奖记录"},          // new  
		 KICK_MEMBER:				{code:"108",msg:"踢出"},
		 COLOR_POOL:				{code:"109",msg:"彩池"},
		 BET_SUCCESS:				{code:"401",msg:"下注成功"},
		 NO_BET_TIIME:				{code:"402",msg:"非下注时间"},
		 BET_FAULT:					{code:"403",msg:"下注失败"},
		 INSUFFCIENT_BALANCE:		{code:"404",msg:"余额不足"},
		 OVER_LIMIT:				{code:"405",msg:"超过限注"},
		 NO_USER:					{code:"406",msg:"无此用户"},
		 NO_ROOM:                   {code:"503",msg:"未找到房间"},          // new
         NO_LOGIN:                  {code:"408",msg:"未登录,不能发信息,请重新登录"},
		 GET_BET_RECORD:			{code:"801",msg:"获取下注记录"},
		 EDIT_SHOEROUND:			{code:"805",msg:"修改靴局"},
	},
	CHAT_TYPE: {
		SINGLE:1,
		GROUP:2
	},
	GROUP_ROLE: {
		GROUPOWNER: 1,
		ADMIN: 2,
		MEMBER: 3	
	},
	MSG_TYPE:{
		TEXT: 1,
		IMAGE: 2,
		VIDEO: 3
	}
};
