const pomelo = require("pomelo");
const userDao = module.exports;
const mysql = pomelo.app.get("sqlHelper");
const cache = require("./Cache");
const md5 = require('js-md5');
const crypto = require('crypto');
let result = require("../domain/sx/result");
const sendToFront = require("../domain/sx/sendToFrontEnd");
const { settleOverBet, calculateSpExcess } = require("../domain/sx/overSpm");

const fieldMap = {
  '庄': 'z',
  '和': 'h',
  '闲': 'x',
  '庄对': 'zd',
  '闲对': 'xd',
  '小老虎': 'l',
  '大老虎': 'k',
  '完美': 'm',
  '幸运七': 'q'
};

userDao.getUserById = async function (Id) {
  let sql = "select * from user where Id = ?";
  let args = [Id];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res[0] };
  } catch (err) {
    return { err: err, data: null }
  }
}

userDao.getUserByIds = async function(userIdArray) {
    const sql = `SELECT * FROM user WHERE Id IN (?)`;
    let args = [userIdArray];
    try {
      let res = await mysql.query("bjl", sql, args);
      return { err: null, data: res };
    } catch (err) {
      console.error("getUserByIds err:", JSON.stringify(err));
      return { err: err, data: null }
    }
}

userDao.getUserByName = async function (name) {
  let sql = "select * from user where username = ?";
  let args = [name];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res[0] };
  } catch (err) {
    return { err: err, data: null }
  }
}

userDao.getPlayerByChatUserId = async function(chat_user_id) {
    try {
        let sql = `
            SELECT u.Id, u.username, u.score
            FROM user u
            WHERE u.chat_user_id = ?
        `;
        let args = [chat_user_id];
        let res = await mysql.query("bjl", sql, args);
        return { err: null, data: res[0] };
    } catch (err) {
        return { err: err, data: null };
    }
}

userDao.updatePlayerChatUserId = async function(userId, chat_user_id) {
    try {
        let sql = "update user set chat_user_id = ?,chat_user_name = username where Id = ?";
        let args = [chat_user_id, userId];
        let res = await mysql.query("bjl", sql, args);
        return { err: null, data: res };
    } catch (err) {
        return { err: err, data: null };
    }
}

userDao.getAdminById = async function (id) {
  let sql = "select * from user_admin where Id = ?";
  let args = [id];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res[0] };
  } catch (err) {
    return { err: err, data: null }
  }
}

userDao.getAdminByName = async function (name) {
  let sql = "select * from user_admin where username = ?";
  let args = [name];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res[0] };
  } catch (err) {
    return { err: err, data: null }
  }
}

userDao.getAdminInfo = async function () {
  let sql = "select username,registTime,permissions from user_admin";
  let args = [];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (err) {
    return { err: err, data: null }
  }
}

userDao.createAdminUser = async function (msg) {
  const salt = crypto.randomBytes(5).toString('hex').slice(0, 10); 
  let password = md5(salt + msg.password);
  let sql = "insert into user_admin(username,password,registTime,loginip,enable,salt) values(?,?,?,?,?,?)";
  let args = [msg.username,password,new Date(),msg.ip,1,salt];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (err) {
    return { err: err, data: null }
  }
}

userDao.editUserLoginInfo = async function (name, ip, terminal, gx) {
  let time = new Date();
  let sql = "insert into login_record(name,level,loginaddr,ip,stime,memo,gx) values(?,?,?,?,?,?,?)";
  let args = [name, 3, terminal, ip, time, "", gx];
  await mysql.query("bjl", sql, args);
  sql = "update user_admin set loginTime=?,loginIp=?,loginCount=loginCount+1,terminal=? where username=?";
  args = [time, ip, terminal, name];
  await mysql.query("bjl", sql, args);
};

userDao.getUserByName = async function (name) {
  let sql = "select * from user where username = ?";
  let args = [name];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res[0] };
  } catch (err) {
    return { err: err, data: null }
  }
}

userDao.getBetInfo = async function (rType, roomId, cc, jc, statistics_date) {
  try{                                                    // 取未结算的下注信息
    let sql = "select * from gameshist where rType=? and roomId=? and cc = ? and jc = ? and closed=0 AND DATE(statistics_date) = DATE(?)";
    let args = [rType, roomId, cc, jc, statistics_date];
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (err) {
    return { err: err, data: null }
  }
}

userDao.addPermissions = async function (msg) {
  try{                                                    // 取未结算的下注信息
    let sql = "insert into permissions(permission_name,description) values(?,?)";
    let args = [msg.permission_name,msg.description];
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (err) {
    return { err: err, data: null }
  }
}

userDao.getPermissions = async function (msg) {
  try{                                                    // 取未结算的下注信息
    let sql = "select * from permissions";
    let args = [];
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (err) {
    return { err: err, data: null }
  }
}

userDao.setUserPermissions = async function (msg) {
  try{                                                    // 取未结算的下注信息
    let sql = "update user_admin set permissions = ? where username = ?";
    let args = [msg.permissions,msg.username];
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (err) {
    console.log("err:",JSON.stringify(err));
    return { err: err, data: null }
  }
}

userDao.updateCcAndRoad = async function (roomId, quickModeJc, cc, jc, road) {                        //只更新房间的场次或者路单
  //try{     
    let sql = "update group_chat_setup set cc = ? , jc = ?, quickModeJc = ?, road = ? where Id = ?";
    var args = [cc, jc, quickModeJc, road, roomId];
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  // } catch (err) {
  //   return { err: err, data: null }
  // }
}

userDao.updateStatisticsDate = async function (msg){
  //try{     
    let sql = "update group_chat_setup set statistics_date = CURDATE(),game_status = 1 where group_nickname = ?"; 
    let args = [msg.group_nickname];
    let res = await mysql.query("bjl", sql, args); 
    console.log("sql,args:",sql,args,res);
    return { err: null, data: res };
  // } catch (err) {
  //   return { err: err, data: null }
  // }
}

userDao.setGameStopStatus = async function (msg){
  //try{     
    let sql = "update group_chat_setup set game_status = 0 where group_nickname = ?"; 
    let args = [msg.group_nickname];
    let res = await mysql.query("bjl", sql, args); 
    return { err: null, data: res };
  // } catch (err) {
  //   return { err: err, data: null }
  // }
}

userDao.updateRoad = async function (roomId, gameType, msg) {      // 更新记录                               
  let sql = "update game set kj = ? where cc = ? and jc = ? and roomId = ? and rType = ?";
  args = [msg.kj, msg.cc, msg.jc, roomId, gameType];
  let res = await mysql.query("bjl", sql, args);
  // 下面这部份直接读取荷官端开奖路单
  let road = userDao.updateRoadFromGameRecord(msg.cc, msg.jc, roomId, gameType);
  return road;
};


userDao.updateRoomRoad = async function (rInfo, msg) {
    const time = new Date();

    const sql = `
        INSERT INTO game
            (cc, jc, kj, rType, stime, roomId)
        VALUES
            (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            kj = VALUES(kj),
            stime = VALUES(stime)
    `;

    const args = [
        Number(msg.cc),
        Number(msg.jc),
        msg.kj,
        rInfo.rType,
        time,
        rInfo.Id
    ];

    console.log("[更新游戏局数表]", {
        cc: msg.cc,
        jc: msg.jc,
        kj: msg.kj,
        roomId: rInfo.Id
    });

    await mysql.query("bjl", sql, args);

    // 直接等待，不再 setTimeout
    const road = await userDao.updateRoadFromGameRecord(
        Number(msg.cc),
        Number(msg.jc),
        rInfo.Id,
        rInfo.rType
    );

    rInfo.road = road;

    return road;
};

userDao.updateRoadFromGameRecord = async function (cc, jc, roomId, gameType) {
  let sql = "select kj from game where cc = ? and roomId = ? and rType = ?  order by jc";
  let args = [cc, roomId, gameType];
  let res = await mysql.query("bjl", sql, args);
  let strRoad = "";
  for (let i = 0; i < res.length; i++) {
    if (res[i].kj) strRoad += res[i].kj + "^";
  }
  sql = "update group_chat_setup set road = ? where Id = ?";     
  args = [strRoad, roomId];
  await mysql.query("bjl", sql, args);
  return strRoad;
}

userDao.getCurrentRoundRoad = async function (msg) {                                      //更新游戏记录表
  //try{
  let sql = "select kj,cc,jc from game where cc=? and roomId = ? and rType=? order by jc";
  let args = [msg.cc, msg.roomId, msg.rType];
  let res = await mysql.query("bjl", sql, args);
  return { err: null, data: res };
  // } catch (err) {
  //   return { err: err, data: null }
  // }
}

userDao.updateGame = async function (msg) {  // 开始下注时插入记录   
  let time = new Date();
  let splitCs = msg.cc.split("-");
  let cc = Number(splitCs[0]);
  let jc = Number(splitCs[1]);
  let sql = "update game set kj = if(? is not null,?,kj), str_pai = if(? is not null,?,str_pai),gameStatus=?,end_time=if(? is not null ,?,end_time),result_time=if(? is not null ,?,result_time),"
  sql += "editAccount=if(? is not null,?,editAccount),edit_time=if(? is not null,?,edit_time),kj2 = if(? is not null,?,kj2) where cc = ? and jc = ? and rType = ? and roomId = ?";
  let args = [msg.kj, msg.kj, msg.pk, msg.pk, msg.gameStatus, msg.end_time, time, msg.result_time, time,
  msg.editAccount, msg.editAccount, msg.edit_time, time, msg.kj2, msg.kj2, cc, jc, msg.rType, msg.roomId];
  await mysql.query("bjl", sql, args);
};

userDao.deleteGame = async function (msg) {
  //try{
    let sql = "delete from game where rType = ? and roomId = ?";
    let args = [msg.rType,msg.Id];
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  // } catch (err) {
  //   return { err: err, data: null }
  // }
}

userDao.getBetInfoForUid = async function (msg) {
  //try{                                                 // 取未结算的下注信息
    let sql = "select * from gameshist where userId=? and rType=? and roomId=? and cc=?  and jc = ? and closed = 0 AND statistics_date >= ?";
    let args = [msg.userId, msg.rType, msg.roomId, msg.cc, msg.jc, msg.statistics_date];
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  // } catch (err) {
  //   return { err: err, data: null }
  // }
}

userDao.getSumScoreByName = async function (msg) {
  //try{
    let sql = "select sum(xz) as total from gameshist where userId=? and rType=? and roomId=? and cc=? and jc=?";
    let args = [msg.userId, msg.rType, msg.roomId, msg.cc, msg.jc];
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  // } catch (err) {
  //   return { err: err, data: null }
  // }
}

// 查询手工修改前的下注记录，供审计日志保存原始快照。
userDao.getPlayerBettingRecords = async function (msg) {
  try {
    const sql = `
      SELECT *
      FROM gameshist
      WHERE cc = ? AND jc = ? AND userId = ?
        AND group_nickname = ? AND closed = 0
      ORDER BY Id
    `;
    const args = [msg.cc, msg.jc, msg.userId, msg.group_nickname];
    const rows = await mysql.query("bjl", sql, args);
    return { err: null, data: rows || [] };
  } catch (err) {
    return { err: err, data: null };
  }
};

// 保存手工修改下注的审计日志。原记录即使被删除，仍可通过快照追溯。
userDao.addBetEditLog = async function (msg) {
  try {
    const sql = `
      INSERT INTO bet_edit_log (
        player_user_id, player_name, group_nickname, room_id, r_type,
        shoe_no, round_no, original_record_ids, before_bet_data,
        after_bet_data, before_total, after_total, operator_id,
        operator_name, operator_ip
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const beforeBetData = msg.before_bet_data || {};
    const recordIds = msg.original_record_ids || [];
    const args = [
      msg.player_user_id,
      msg.player_name,
      msg.group_nickname,
      msg.room_id,
      msg.r_type,
      msg.shoe_no,
      msg.round_no,
      JSON.stringify(recordIds),
      JSON.stringify(beforeBetData),
      JSON.stringify(msg.after_bet_data || {}),
      msg.before_total || 0,
      msg.after_total || 0,
      String(msg.operator_id || ''),
      msg.operator_name || '',
      msg.operator_ip || ''
    ];
    const row = await mysql.query("bjl", sql, args);
    return { err: null, data: row };
  } catch (err) {
    console.error("保存下注修改日志失败:", err);
    return { err: err, data: null };
  }
};

// 后台分页查询下注修改日志。
userDao.getBetEditLogList = async function (msg) {
  try {
    const currentPage = Math.max(1, parseInt(msg.currentPage || msg.page, 10) || 1);
    const pageSize = Math.max(1, Math.min(200, parseInt(msg.pageSize, 10) || 20));
    const offset = (currentPage - 1) * pageSize;
    const conditions = [];
    const args = [];

    if (msg.player_name) {
      conditions.push('player_name LIKE ?');
      args.push(`%${msg.player_name}%`);
    }
    if (msg.group_nickname) {
      conditions.push('group_nickname = ?');
      args.push(msg.group_nickname);
    }
    
    const shoeNo = msg.shoe_no !== undefined ? msg.shoe_no : msg.shoe;
    const roundNo = msg.round_no !== undefined ? msg.round_no : msg.round;
    if (shoeNo !== undefined && shoeNo !== '') {
      conditions.push('shoe_no = ?');
      args.push(shoeNo);
    }
    if (roundNo !== undefined && roundNo !== '') {
      conditions.push('round_no = ?');
      args.push(roundNo);
    }

    const startTime = msg.startTime || msg.start_time;
    const endTime = msg.endTime || msg.end_time;
    if (startTime) {
      conditions.push('created_at >= ?');
      args.push(startTime);
    }
    if (endTime) {
      conditions.push('created_at <= ?');
      args.push(endTime);
    }

    const whereSql = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const countSql = `SELECT COUNT(*) AS total FROM bet_edit_log${whereSql}`;
    const listSql = `
      SELECT *
      FROM bet_edit_log
      ${whereSql}
      ORDER BY Id DESC
      LIMIT ?, ?
    `;

    const results = await Promise.all([
      mysql.query('bjl', countSql, args),
      mysql.query('bjl', listSql, [...args, offset, pageSize])
    ]);
    const total = Number(results[0][0] ? results[0][0].total : 0);

    return {
      err: null,
      data: {
        list: results[1] || [],
        total: total,
        currentPage: currentPage,
        pageSize: pageSize
      }
    };
  } catch (err) {
    console.error('查询下注修改日志失败:', err);
    return { err: err, data: null };
  }
};

userDao.updateUserScoreById = async function (userId, score, cb) {
  //try{  
    let sql = "update user set score = ? where Id = ?";
    let args = [score, userId];
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  // } catch (err) {
  //   return { err: err, data: null }
  // }  
};

userDao.fillBetInfo = async function (msg) {
  //try{
  let sqlParamsEntity = [];
  let time = new Date();

  // 生成唯一的订单ID
  let orderId = `${msg.username}_${msg.cc}_${msg.jc}_${msg.roomId}_${Date.now()}`;

  // 获取用户下注前的余额
  let currentBalance = msg.ye || 0;

  // 扣除新投注的总金额（先记录要扣除，但实际在事务中执行）
  sql = 'UPDATE user SET score = score - ? ,freeze_score = freeze_score + ?, yxtz = 1 WHERE username = ? AND score - ? >= 0';
  args = [msg.xz, msg.xz , msg.username, msg.xz];
  sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args));

  // 解析新投注的xzmx
  let newBetItems = msg.bet;

  // 累计已扣除的金额
  let deductedAmount = 0;

  // 为每一个投注项创建一条记录
  for (let betItem of newBetItems) {
    // 计算这条记录下注前的余额
    // 当前余额减去已经扣除的前面项目的金额
    let beforeThisBet = currentBalance - deductedAmount;

    // 基础字段
    const fields = [
      'userId', 'rType', 'roomId', 'userName', 'group_nickname', 'cc', 'jc', 'xz', 'xzmx',
      'stime', 'betTime', 'gx', 'yxxz', 'reference_name', 'tzmac', 'tzip', 'roomName',
      'g_zx', 'g_yl', 'g_xm', 'order_id', 'before_bet_ye', 'bet_order','statistics_date','msgId'
    ];

    // 获取对应的字段名
    const field = fieldMap[betItem.type];

    // 初始值
    args = [
      msg.userId, msg.rType, msg.roomId, msg.username, msg.group_nickname, msg.cc, msg.jc,
      betItem.amount, msg.xzmx, time, time, msg.gx, msg.yxxz, msg.reference_name,
      msg.terminal, msg.loginip, msg.roomName, Number(msg.g_zx) || 0, Number(msg.g_yl) || 0, 0,
      orderId, beforeThisBet, betItem.type,msg.statistics_date,msg.msgId  // 使用计算后的余额
    ];

    // 添加投注字段
    if (field) {
      // 设置当前投注类型的金额
      fields.push(field);
      args.push(betItem.amount);

      // 其他投注字段设为0
      Object.values(fieldMap).forEach(otherField => {
        if (otherField !== field && !fields.includes(otherField)) {
          fields.push(otherField);
          args.push(0);
        }
      });
    }

    // 构建SQL并添加到事务中
    sql = `INSERT INTO gameshist (${fields.join(', ')}) VALUES (${args.map(() => '?').join(', ')})`;
    sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args));

    // 更新已扣除的金额
    deductedAmount += betItem.amount;
  }

  let row = await mysql.tranExecSync("bjl", sqlParamsEntity);
  
  return { err: null, data: row };
  // } catch(err) {
  //     return {err:err,data:null};
  // }
}

/**
 * 按群参数限制本局庄闲对冲后的上盘金额 sp。
 * 只减上盘方向；小于或等于 minimum_amount_sold 的玩家不参与减持。
 * 注码调整、score 退款和 freeze_score 回退在同一个数据库事务中完成。
 */
userDao.applyTableBetReduction = async function (msg) {
  const groupNickname = String(msg.group_nickname || "").trim();
  const roomId = Number(msg.roomId);
  const cc = Number(msg.cc);
  const jc = Number(msg.jc);
  const statisticsDate = msg.statistics_date;
  const suppliedSpm = String(msg.spm || "").trim();
  const suppliedSp = Number(msg.sp);

  if (!groupNickname || !Number.isFinite(roomId) || !Number.isFinite(cc) ||
      !Number.isFinite(jc) || !statisticsDate ||
      !["庄", "闲"].includes(suppliedSpm) || !Number.isFinite(suppliedSp)) {
    return { err: new Error("台面减持参数不完整"), data: null };
  }

  return new Promise(resolve => {
    mysql.beginTransaction((connectionErr, connection) => {
      if (connectionErr) {
        resolve({ err: connectionErr, data: null });
        return;
      }

      const query = (sql, args) => new Promise((queryResolve, queryReject) => {
        connection.query(sql, args, (queryErr, rows) => {
          if (queryErr) return queryReject(queryErr);
          queryResolve(rows);
        });
      });
      const begin = () => new Promise((beginResolve, beginReject) => {
        connection.beginTransaction(err => err ? beginReject(err) : beginResolve());
      });
      const commit = () => new Promise((commitResolve, commitReject) => {
        connection.commit(err => err ? commitReject(err) : commitResolve());
      });
      const rollback = () => new Promise(done => connection.rollback(() => done()));
      const money = value => Math.round(Number(value) || 0);
      const formatMoney = value => String(money(value));

      (async () => {
        try {
          await begin();

          const parameterRows = await query(`
            SELECT pb_max_bet_amount, minimum_amount_sold
            FROM group_parameter_setup
            WHERE group_nickname = ?
            LIMIT 1
          `, [groupNickname]);
          if (!parameterRows || parameterRows.length === 0) {
            throw new Error("未找到群参数，不能执行台面减持");
          }

          const maxBetAmount = money(parameterRows[0].pb_max_bet_amount);
          const minimumAmountSold = Math.max(0, money(parameterRows[0].minimum_amount_sold));
          if (maxBetAmount <= 0) {
            await commit();
            connection.release();
            resolve({
              err: null,
              data: { applied: false, reason: "LIMIT_DISABLED", maxBetAmount, minimumAmountSold }
            });
            return;
          }

          const scopeArgs = [groupNickname, roomId, cc, jc, statisticsDate];
          const userRows = await query(`
            SELECT DISTINCT g.userId
            FROM gameshist g
            INNER JOIN user real_user ON real_user.Id = g.userId
            LEFT JOIN group_member gm
              ON g.userId = gm.userId
              AND g.group_nickname = gm.group_nickname
            WHERE g.group_nickname = ? AND g.roomId = ? AND g.cc = ? AND g.jc = ?
              AND DATE(g.statistics_date) = DATE(?) AND g.closed = 0
              AND IFNULL(real_user.is_virtual, 0) = 0
              AND IFNULL(gm.is_virtual, 0) = 0
              AND (COALESCE(g.z, 0) > 0 OR COALESCE(g.x, 0) > 0)
            ORDER BY g.userId
          `, scopeArgs);
          const userIds = (userRows || []).map(row => Number(row.userId)).filter(Number.isFinite);

          if (userIds.length === 0) {
            await commit();
            connection.release();
            resolve({
              err: null,
              data: { applied: false, reason: "NO_PB_BETS", maxBetAmount, minimumAmountSold }
            });
            return;
          }

          await query(
            "SELECT Id FROM user WHERE Id IN (?) ORDER BY Id",
            [userIds]
          );

          const betRows = await query(`
            SELECT g.Id, g.userId, g.xz, g.xzmx, g.bet_order,
                   COALESCE(g.z, 0) AS z, COALESCE(g.x, 0) AS x,
                   u.username
            FROM gameshist g
            INNER JOIN user u ON u.Id = g.userId
            LEFT JOIN group_member gm
              ON g.userId = gm.userId
              AND g.group_nickname = gm.group_nickname
            WHERE g.group_nickname = ? AND g.roomId = ? AND g.cc = ? AND g.jc = ?
              AND DATE(g.statistics_date) = DATE(?) AND g.closed = 0
              AND IFNULL(u.is_virtual, 0) = 0
              AND IFNULL(gm.is_virtual, 0) = 0
              AND (COALESCE(g.z, 0) > 0 OR COALESCE(g.x, 0) > 0)
            ORDER BY g.userId, g.Id
          `, scopeArgs);

          const playerMap = {};
          let totalBanker = 0;
          let totalPlayer = 0;

          for (const row of betRows || []) {
            totalBanker = money(totalBanker + Number(row.z || 0));
            totalPlayer = money(totalPlayer + Number(row.x || 0));
          }

          const upperTotal = suppliedSpm === "庄" ? totalBanker : totalPlayer;
          const finalCalculatedSp = Math.max(0, money(suppliedSp));
          const excessAmount = calculateSpExcess(finalCalculatedSp, maxBetAmount);
          const upperPlate = {
            spm: suppliedSpm,
            sp: finalCalculatedSp,
            upperTotal,
            excessAmount,
            targetUpperTotal: Math.max(0, upperTotal - excessAmount)
          };
          const upperField = upperPlate.spm === "庄" ? "z" : "x";

          for (const row of betRows || []) {
            const userKey = String(row.userId);
            if (!playerMap[userKey]) {
              playerMap[userKey] = {
                userId: Number(row.userId),
                username: row.username,
                betAmount: 0,
                rows: []
              };
            }
            const upperAmount = money(Number(row[upperField] || 0));
            playerMap[userKey].betAmount = money(playerMap[userKey].betAmount + upperAmount);
            playerMap[userKey].rows.push({ ...row, upperAmount });
          }

          const players = Object.values(playerMap).filter(player => player.betAmount > 0);
          if (upperPlate.excessAmount <= 0) {
            await commit();
            connection.release();
            resolve({
              err: null,
              data: {
                applied: false,
                reason: "WITHIN_LIMIT",
                spm: upperPlate.spm,
                originalSp: upperPlate.sp,
                finalSp: upperPlate.sp,
                excessAmount: 0,
                originalTotal: upperPlate.sp,
                finalTotal: upperPlate.sp,
                maxBetAmount,
                minimumAmountSold,
                players: []
              }
            });
            return;
          }

          // 上盘 sp 超限多少，就从上盘方向的玩家下注中减掉多少。
          const reductionResults = settleOverBet(
            players,
            upperPlate.targetUpperTotal,
            minimumAmountSold
          );
          const reductionMap = {};
          for (const result of reductionResults) reductionMap[String(result.userId)] = result;

          const changedPlayers = [];
          for (const player of players.sort((left, right) => left.userId - right.userId)) {
            const result = reductionMap[String(player.userId)];
            const refund = money(result ? result.reducedAmount : 0);
            if (refund <= 0) continue;

            const rowResults = Number(result.finalBet) <= 0
              ? player.rows.map(row => ({
                  userId: row.Id,
                  finalBet: 0,
                  reducedAmount: row.upperAmount
                }))
              : settleOverBet(
                  player.rows.map(row => ({ userId: row.Id, betAmount: row.upperAmount })),
                  result.finalBet,
                  -0.01
                );
            const rowResultMap = {};
            for (const rowResult of rowResults) rowResultMap[String(rowResult.userId)] = rowResult;

            for (const row of player.rows) {
              const rowResult = rowResultMap[String(row.Id)];
              const newUpperAmount = money(rowResult ? rowResult.finalBet : row.upperAmount);
              if (newUpperAmount === row.upperAmount) continue;

              const newZ = upperField === "z" ? newUpperAmount : money(row.z);
              const newX = upperField === "x" ? newUpperAmount : money(row.x);
              const newXz = money(Number(row.xz || 0) - row.upperAmount + newUpperAmount);
              const newXzmx = [
                newZ > 0 ? "庄" + formatMoney(newZ) : "",
                newX > 0 ? "闲" + formatMoney(newX) : ""
              ].join("") || String(row.xzmx || "");

              await query(`
                UPDATE gameshist
                SET xz = ?, z = ?, x = ?, xzmx = ?
                WHERE Id = ? AND closed = 0
              `, [newXz, newZ, newX, newXzmx, row.Id]);
            }

            await query(`
              UPDATE user
              SET score = COALESCE(score, 0) + ?,
                  freeze_score = GREATEST(COALESCE(freeze_score, 0) - ?, 0)
              WHERE Id = ?
            `, [refund, refund, player.userId]);

            changedPlayers.push({
              userId: player.userId,
              username: player.username,
              originalBet: money(player.betAmount),
              finalBet: money(result.finalBet),
              spm: upperPlate.spm,
              refundedAmount: refund
            });
          }

          await commit();
          connection.release();

          const refundedTotal = money(
            changedPlayers.reduce((sum, player) => sum + Number(player.refundedAmount || 0), 0)
          );
          const finalSp = money(Math.max(0, upperPlate.sp - refundedTotal));
          resolve({
            err: null,
            data: {
              applied: changedPlayers.length > 0,
              spm: upperPlate.spm,
              originalSp: upperPlate.sp,
              finalSp,
              excessAmount: upperPlate.excessAmount,
              originalTotal: upperPlate.sp,
              finalTotal: finalSp,
              maxBetAmount,
              minimumAmountSold,
              unavoidableExcess: money(Math.max(0, finalSp - maxBetAmount)),
              players: changedPlayers
            }
          });
        } catch (err) {
          await rollback();
          connection.release();
          console.error("applyTableBetReduction err:", err);
          resolve({ err, data: null });
        }
      })();
    });
  });
};

userDao.deductUserScore = async function(userId, deductAmount) {
    try {
        const sql = "UPDATE user SET score = IF(score - ? < 0, 0, score - ?), yxtz = 1 WHERE Id = ?";
        const result = await this.query(sql, [deductAmount, deductAmount, userId]);
        console.log("[扣分成功] userId=" + userId + ", 扣分金额=" + deductAmount + ", 结果:", result);
        return { success: true, data: result };
    } catch (err) {
        console.error("[扣分异常] userId=" + userId + ", error=" + err.message);
        return { success: false, error: err.message };
    }
},

// 清除要修改玩家的下注记录
userDao.cleanPlayerBettingRecord = async function(msg) {
    // 1. 严格防呆防御
    if (!msg || !msg.cc || !msg.jc || !msg.player_name || !msg.group_nickname) {
        return { err: new Error("参数不完整"), data: null };
    }

    try {
        let sqlParamsEntity = [];

        // 先查 userId
        let userRes = await mysql.query("bjl", "SELECT Id FROM user WHERE username = ?", [msg.player_name]);
        if (!userRes || userRes.length === 0) {
            return { err: new Error("用户不存在"), data: null };
        }
        let userId = userRes[0].Id;

        // 查下注总额
        let sumRes = await mysql.query("bjl", `
            SELECT SUM(xz) AS total 
            FROM gameshist 
            WHERE cc = ? AND jc = ? AND userId = ? AND group_nickname = ? AND closed = 0
        `, [msg.cc, msg.jc, userId, msg.group_nickname]);
        let total = (sumRes[0] && sumRes[0].total) ? Number(sumRes[0].total) : 0;

        if (total === 0) {
            return { err: null, data: "无下注记录，无需处理" };
        }
        
        // 退款并减少冻结分
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(
            `UPDATE user 
             SET score = score + ?, freeze_score = freeze_score - ? 
             WHERE Id = ?`,
            [total, total, userId]
        ));

        // 删除下注记录
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(
            `DELETE FROM gameshist 
             WHERE cc = ? AND jc = ? AND userId = ? AND group_nickname = ?`,
            [msg.cc, msg.jc, userId, msg.group_nickname]
        ));

        let row = await mysql.tranExecSync("bjl", sqlParamsEntity);

        return { err: null, data: row };

    } catch (err) {
        console.error("❌ 清除指定玩家的下注记录并退款发生致命异常:", err.message);
        return { err: err, data: null };
    }
};

// 清除不在下注时间内下注的记录
userDao.cleanOutSizeBettingRecord = async function(msg) {
    try {
        // 1. 确定基本查询条件和参数
        const selectedJc = msg.quick_mode ? msg.quickModeJc : msg.jc;
        
        // ✅ 【修复 1】msgId 转字符串防止精度丢失
        const safeMsgIdStr = String(msg.lastStopMsgId);

        const args = [
            msg.group_nickname,
            msg.roomId || msg.Id,
            msg.rType,
            msg.cc,
            selectedJc,
            safeMsgIdStr
        ];

        // ✅ 【修复 2】第一步：查询超过下注时间的玩家
        const querySql = `
            SELECT u.username AS userName, g.group_nickname, g.xz, g.xzmx, g.userId
            FROM gameshist g
            INNER JOIN user u ON u.Id = g.userId
            WHERE g.group_nickname = ? AND g.roomId = ? AND g.rType = ?
              AND g.cc = ? AND g.jc = ? AND g.closed = 0 AND g.msgId > ?
        `;
        const rows = await mysql.query("bjl", querySql, args);
        console.log("[超时下注记录查询] 参数:", args, "结果数:", rows.length);

        // ✅ 【修复 3】如果没有超时下注记录，直接返回
        if (!rows || rows.length === 0) {
            console.log("[清除超时下注] 无超时下注记录，无需处理");
            return { err: null, data: { refunded: {}, deletedIds: [] } };
        }

        // 通知前端
        rows.forEach(element => {
            sendToFront.sendNoticeToClient(element.group_nickname, { type: 1, msg: element.userName + " 超过下注时间下注:" + element.xzmx });
        });

        // 2. 初始化事务参数数组
        let sqlParamsEntity = [];

        // ✅ 【修复 4】步骤一：退款 + 减少冻结分
        // 逻辑：通过 JOIN 算出每个用户需要退还的总金额，同时减少 freeze_score
        const refundSql = `
            UPDATE user u
            JOIN (
                SELECT userId, SUM(xz) as total_refund 
                FROM gameshist 
                WHERE group_nickname = ? AND roomId = ? AND rType = ?
                  AND cc = ? AND jc = ? AND closed = 0 AND msgId > ?
                GROUP BY userId
            ) g ON u.Id = g.userId
            SET u.score = u.score + g.total_refund,
                u.freeze_score = u.freeze_score - g.total_refund
        `;

        sqlParamsEntity.push(mysql._getNewSqlParamEntity(refundSql, args));

        // ✅ 【修复 5】步骤二：删除超时的下注记录
        const deleteSql = `
            DELETE FROM gameshist 
            WHERE group_nickname = ? AND roomId = ? AND rType = ?
              AND cc = ? AND jc = ? AND closed = 0 AND msgId > ?
        `;
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(deleteSql, args));

        // 3. 执行统一事务方法
        let row = await mysql.tranExecSync("bjl", sqlParamsEntity);
        console.log("[清除超时下注记录] 事务执行成功，受影响行数:", row);

        return { err: null, data: { refunded: true, deletedCount: rows.length } };

    } catch (err) {
        console.error("[清除超时下注异常] " + (err.message || err));
        return { err: err.message || err, data: null };
    }
};

userDao.deleteUserBetsByColumns = async function(params) {
  try {
    const { username, roomId, cc, jc, statistics_date, totalBetScore, user_score } = params;
    let columns = ['z', 'x'];
    const columnConds = columns.map(c => `${c} > 0`).join(' OR ');

    // ✅ JOIN user 表，用 userId 匹配
    const selectSql = `
        SELECT g.Id, IFNULL(g.xz,0) AS xz 
        FROM gameshist g
        INNER JOIN user u ON u.Id = g.userId
        WHERE u.username = ? AND g.roomId = ? AND g.cc = ? AND g.jc = ?
          AND g.closed = 0 AND g.statistics_date = ? AND (${columnConds})
    `;
    const rows = await mysql.query("bjl", selectSql, [username, roomId, cc, jc, statistics_date]);

    if (!rows || rows.length === 0) {
      return { err: null, data: { refund: 0, deletedIds: [] } };
    }

    const deleteIds = rows.map(r => r.Id);
    const totalRefund = rows.reduce((s, r) => s + (Number(r.xz) || 0), 0);

    if (totalBetScore > user_score + totalRefund) {
      return { err: "INSUFFICIENT_FUNDS", data: null };
    }

    const sqlParamsEntity = [];
    // ✅ 退款仍用 username（user 表唯一索引）
    sqlParamsEntity.push(mysql._getNewSqlParamEntity(
      "UPDATE user SET score = score + ? WHERE username = ?",
      [totalRefund, username]
    ));

    const batchSize = 500;
    for (let i = 0; i < deleteIds.length; i += batchSize) {
      const batch = deleteIds.slice(i, i + batchSize);
      const placeholders = batch.map(() => '?').join(',');
      sqlParamsEntity.push(mysql._getNewSqlParamEntity(
        `DELETE FROM gameshist WHERE Id IN (${placeholders}) AND statistics_date >= ?`,
        [...batch, statistics_date]
      ));
    }

    let res = await mysql.tranExecSync("bjl", sqlParamsEntity);
    return res
        ? { err: null, data: { refund: totalRefund, deletedIds: deleteIds } }
        : { err: "deleteUserBetsByColumns failed", data: null };
  } catch (err) {
    console.error("deleteUserBetsByColumns err:", JSON.stringify(err));
    return { err: err, data: null };
  }
}

/*
 * 新注到达时，删除数据库中已经入库的同类型旧注并退款。
 * 庄、闲视为同一个 zx 主类型；其他投注字段各自独立。
 * fillBetInfo 当前每个单项单独入库，因此这里只会精确删除被覆盖的行。
 */
userDao.removeExistingBetTypes = async function(params) {
  try {
    const {
      userId, roomId, rType, cc, jc,
      group_nickname, statistics_date, replacementKeys
    } = params || {};

    const keyToCondition = {
      zx: '(IFNULL(g.z,0) > 0 OR IFNULL(g.x,0) > 0)',
      z:  'IFNULL(g.z,0) > 0',
      x:  'IFNULL(g.x,0) > 0',
      h:  'IFNULL(g.h,0) > 0',
      zd: 'IFNULL(g.zd,0) > 0',
      xd: 'IFNULL(g.xd,0) > 0',
      l:  'IFNULL(g.l,0) > 0',
      k:  'IFNULL(g.k,0) > 0',
      q:  'IFNULL(g.q,0) > 0',
      m:  'IFNULL(g.m,0) > 0'
    };

    const uniqueKeys = Array.from(new Set(Array.isArray(replacementKeys) ? replacementKeys : []));
    const typeConditions = uniqueKeys.map(key => keyToCondition[key]).filter(Boolean);

    if (!userId || !roomId || cc === undefined || jc === undefined || typeConditions.length === 0) {
      return { err: null, data: { refund: 0, deletedIds: [] } };
    }

    const selectSql = `
      SELECT g.Id, IFNULL(g.xz, 0) AS xz
      FROM gameshist g
      WHERE g.userId = ?
        AND g.roomId = ?
        AND g.rType = ?
        AND g.cc = ?
        AND g.jc = ?
        AND g.group_nickname = ?
        AND g.closed = 0
        AND DATE(g.statistics_date) = DATE(?)
        AND (${typeConditions.join(' OR ')})
    `;

    const args = [userId, roomId, rType, cc, jc, group_nickname, statistics_date];
    const rows = await mysql.query('bjl', selectSql, args);

    if (!rows || rows.length === 0) {
      return { err: null, data: { refund: 0, deletedIds: [] } };
    }

    const deleteIds = rows.map(row => row.Id);
    const totalRefund = rows.reduce((sum, row) => sum + (Number(row.xz) || 0), 0);
    const sqlParamsEntity = [];

    sqlParamsEntity.push(mysql._getNewSqlParamEntity(
      `UPDATE user
       SET score = score + ?,
           freeze_score = GREATEST(COALESCE(freeze_score, 0) - ?, 0)
       WHERE Id = ?`,
      [totalRefund, totalRefund, userId]
    ));

    const batchSize = 200;
    for (let i = 0; i < deleteIds.length; i += batchSize) {
      const batch = deleteIds.slice(i, i + batchSize);
      sqlParamsEntity.push(mysql._getNewSqlParamEntity(
        `DELETE FROM gameshist WHERE Id IN (${batch.map(() => '?').join(',')}) AND closed = 0`,
        batch
      ));
    }

    const txResult = await mysql.tranExecSync('bjl', sqlParamsEntity);
    console.log('[替换同类型数据库旧注] userId=' + userId + ', types=' + uniqueKeys.join(',') + ', refund=' + totalRefund + ', deleteCount=' + deleteIds.length);

    return {
      err: null,
      data: { refund: totalRefund, deletedIds: deleteIds, txResult }
    };
  } catch (err) {
    console.error('removeExistingBetTypes err:', err);
    return { err: err, data: null };
  }
};

// 停止下注时清理用户的重复下注记录（简化版）
userDao.cleanupBetsOnStopSimplified = async function(msg) {
  try {
    let sql = "SELECT * FROM gameshist WHERE roomId = ? AND cc = ? AND jc = ? AND group_nickname = ? AND closed = 0 AND statistics_date >= ? ORDER BY betTime DESC, Id DESC";
    let args = [msg.Id, msg.cc, msg.jc, msg.group_nickname, msg.statistics_date];
    let rows = await mysql.query("bjl", sql, args);
    if (!rows || rows.length === 0) return { err: null, data: 'no bets' };

    const kept = {};      // kept[userId][typeKey] = Id
    const deleteIds = [];
    const refundMap = {}; // ✅ key 为 userId，value 为退款金额

    function rowTypeKey(r) {
      // ✅ 【修复】添加 q 字段检查（幸运7）
      if ((r.z && Number(r.z) > 0) || (r.x && Number(r.x) > 0)) return 'zx';
      if (r.zd && Number(r.zd) > 0) return 'zd';
      if (r.xd && Number(r.xd) > 0) return 'xd';
      if (r.h  && Number(r.h)  > 0) return 'h';
      if (r.l  && Number(r.l)  > 0) return 'l';
      if (r.k  && Number(r.k)  > 0) return 'k';
      if (r.m  && Number(r.m)  > 0) return 'm';
      if (r.q  && Number(r.q)  > 0) return 'q';  // ✅ 新增：q 字段（幸运7）
      return null;
    }

    for (let r of rows) {
      const uid = r.userId;   // ✅ 用 userId 作 key
      const t = rowTypeKey(r);
      if (!t) {
        deleteIds.push(r.Id);
        refundMap[uid] = (refundMap[uid] || 0) + (Number(r.xz) || 0);
        continue;
      }
      if (!kept[uid]) kept[uid] = {};
      if (!kept[uid][t]) {
        kept[uid][t] = r.Id;
      } else {
        deleteIds.push(r.Id);
        refundMap[uid] = (refundMap[uid] || 0) + (Number(r.xz) || 0);
      }
    }

    const uniqueDeleteIds = Array.from(new Set(deleteIds));
    if (uniqueDeleteIds.length === 0 && Object.keys(refundMap).length === 0) {
      return { err: null, data: 'nothing to clean' };
    }

    const sqlParamsEntity = [];

    // ✅ 【修复】退款同时减少冻结分数
    // score 增加（退款），freeze_score 减少（清理冻结分）
    for (let userId of Object.keys(refundMap)) {
      const amount = refundMap[userId];
      if (amount > 0) {
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(
          "UPDATE user SET score = score + ?, freeze_score = COALESCE(freeze_score, 0) - ? WHERE Id = ?",
          [amount, amount, userId]
        ));
      }
    }

    const batchSize = 200;
    for (let i = 0; i < uniqueDeleteIds.length; i += batchSize) {
      const batch = uniqueDeleteIds.slice(i, i + batchSize);
      sqlParamsEntity.push(mysql._getNewSqlParamEntity(
        `DELETE FROM gameshist WHERE Id IN (${batch.map(() => '?').join(',')})`,
        batch
      ));
    }

    let res = await mysql.tranExecSync("bjl", sqlParamsEntity);
    console.log("[清理重复下注] 退款用户数=" + Object.keys(refundMap).length + ", 删除记录数=" + uniqueDeleteIds.length);
    return { err: null, data: { refunded: refundMap, deletedIds: uniqueDeleteIds, txResult: res } };
  } catch (err) {
    console.error("cleanupBetsOnStopSimplified err:", err);
    return { err: err, data: null };
  }
};

userDao.updateResult = async function (msg, bet) {
  let sqlParamsEntity = [];
  const historyTable = msg.is_re_settlement ? "gameshist_record" : "gameshist";
  let sql = `
    SELECT
      u.Id,
      u.score,
      u.username,
      IFNULL(g.z, 0) AS z,
      IFNULL(g.x, 0) AS x,
      IFNULL(f.bp_personal_share, 0) AS bp_personal_share,
      IFNULL(f.bp_personal_share_upperlimit, 0) AS bp_personal_share_upperlimit
    FROM user u
    INNER JOIN ${historyTable} g
      ON g.Id = ? AND g.userId = u.Id
    LEFT JOIN finance_personal_setup f
      ON f.userId = g.userId
      AND f.group_nickname = g.group_nickname
    WHERE u.Id = ?
    LIMIT 1
  `;
  let args = [bet.id, bet.userId];
  let u = await mysql.query("bjl", sql, args);
  let time = new Date();
  if (u.length > 0) {
    u = u[0];

    /*
     * g_zx：该条庄/闲下注的个人占成本金。
     * 按 bp_personal_share 计算；上限大于 0 时按单条记录封顶，
     * 上限为 0 或 NULL 时不封顶。非庄闲记录的个人占成为 0。
     */
    const zAmount = Number(u.z) || 0;
    const xAmount = Number(u.x) || 0;
    const bpAmount = zAmount > 0 ? zAmount : (xAmount > 0 ? xAmount : 0);
    const shareRatio = Math.max(0, Number(u.bp_personal_share) || 0);
    const shareUpperLimit = Math.max(0, Number(u.bp_personal_share_upperlimit) || 0);

    let g_zx = shareRatio > 0 ? bpAmount * shareRatio / 100 : 0;
    if (shareUpperLimit > 0) g_zx = Math.min(g_zx, shareUpperLimit);

    /*
     * g_yl：个人占成本金对应的庄闲盈亏。
     * 盈亏方向、和局处理及庄闲赔率与该记录的 z_yl/x_yl 完全一致，
     * 只是下注基数由原下注额换成 g_zx。
     */
    const bpResult = zAmount > 0
      ? (Number(bet.zyl) || 0)
      : (xAmount > 0 ? (Number(bet.xyl) || 0) : 0);
    const rawPersonalProfit = bpAmount > 0 ? bpResult * g_zx / bpAmount : 0;
    // 个人占成盈亏和洗码都不保留小数，统一向 0 截断：4.6 -> 4，-4.6 -> -4。
    const g_yl = Math.trunc(rawPersonalProfit);
    const g_xm = g_yl < 0 ? Math.trunc(g_zx) : 0;

    bet.g_zx = g_zx;
    bet.g_yl = g_yl;
    bet.g_xm = g_xm;

    if(!msg.is_re_settlement){
      sql = `update gameshist set xml_s = ?,xml_d = ?, g_zx = ?, g_yl = ?, g_xm = ?, ye = ?,
            z_yl = ?,x_yl = ?,h_yl = ?,zd_yl = ? , xd_yl = ? , l_yl = ?,k_yl = ?,m_yl = ?,q_yl = ? , fh = ? , yl = ? ,
            xz = ? , xml_zx = ? ,xml_sb = ?, kj = ? , str_pai = ? , stime = ? , yxxz = ? , closed = 1 where Id = ? and closed = 0`;
    }else{
      sql = `update gameshist_record set xml_s = ?,xml_d = ?, g_zx = ?, g_yl = ?, g_xm = ?, ye = ?,
              z_yl = ?,x_yl = ?,h_yl = ?,zd_yl = ? , xd_yl = ? , l_yl = ?,k_yl = ?,m_yl = ?,q_yl = ? , fh = ? , yl = ? ,
              xz = ? , xml_zx = ? ,xml_sb = ?, kj = ? , str_pai = ? , stime = ? , yxxz = ? , yedemo = "修改路单" 
              where Id = ? `;
    }
    args = [
      bet.xml_s,
      bet.xml_d,
      g_zx,
      g_yl,
      g_xm,
      u.score + bet.t_fh,
      bet.zyl,
      bet.xyl,
      bet.hyl,
      bet.zdyl,
      bet.xdyl,
      bet.lyl,
      bet.kyl,
      bet.myl,
      bet.qyl,
      bet.t_fh,
      bet.t_yl,
      bet.t_xz,
      bet.zx_xml,
      bet.sb_xml,
      msg.result_code,
      msg.strPai,
      time,
      bet.yxxz,
      bet.id
    ];
    sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args));
    msg.des_freeze_score = msg.is_re_settlement ? 0 : bet.t_xz;
    // 重新开奖保留原有效下注，不能再次累加到用户的累计有效下注。
    const yxxzChange = msg.is_re_settlement ? 0 : bet.yxxz;
    sql = `update user set score = IF(score + ? < 0, 0, score + ?),
          xml_sb = xml_sb + ?,
          xml_zx = xml_zx + ?,
          xz_yl = xz_yl + ?,
          sb_yl = sb_yl + ?,
          yxxz = yxxz + ?,freeze_score = freeze_score - ? where Id = ?`;
    args = [bet.t_fh, bet.t_fh, bet.sb_xml, bet.zx_xml,bet.xz_yl,bet.sb_yl, yxxzChange,msg.des_freeze_score, bet.userId];
    sqlParamsEntity.push(mysql._getNewSqlParamEntity(sql, args));
    let row = await mysql.tranExecSync("bjl", sqlParamsEntity)
    console.log("sqlParamsEntity:", sqlParamsEntity);
    return { err: null, data: row };
  }
}

userDao.updateTabelChip = async function(total_yl,group_nickname) {
  let sql = "update group_chat_setup set table_chips = IF(table_chips + ? < 0, 0, table_chips + ?) where group_nickname = ?";
  let args = [total_yl,total_yl,group_nickname];
  console.log("游戏输嬴时更新筹码:",sql,args);
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res[0] };
  } catch (err) {
    return { err: err, data: null }
  }
}

// 要指定场次，局次，台号
userDao.getJcTotal = async function (msg) {

  // 动态表名
  const tableName = msg.is_re_settlement
    ? "gameshist_record"
    : "gameshist";

  let sql = `
    SELECT 
        MAX(g.group_nickname) as group_nickname,
        MAX(g.cc) as cc,
        MAX(g.jc) as jc,
        MAX(g.kj) as kj,

        SUM(g.z) as z,
        SUM(g.h) as h,
        SUM(g.x) as x,
        SUM(g.zd) as zd,
        SUM(g.xd) as xd,
        SUM(g.m) as m,
        SUM(g.q) as q,
        SUM(g.l) as l,
        SUM(g.k) as k,

         -- 个人占成（按比例计算，但如超过上限则以上限为准；当上限为 0 或 NULL 则视为无上限）
        COALESCE(SUM(CASE 
            WHEN IFNULL(f.bp_personal_share,0) > 0 
            THEN
              CASE 
                WHEN IFNULL(f.bp_personal_share_upperlimit,0) > 0 
                THEN LEAST(g.z * f.bp_personal_share / 100, f.bp_personal_share_upperlimit)
                ELSE g.z * f.bp_personal_share / 100
              END
        END), 0) as g_z,

        COALESCE(SUM(CASE 
            WHEN IFNULL(f.bp_personal_share,0) > 0 
            THEN
              CASE 
                WHEN IFNULL(f.bp_personal_share_upperlimit,0) > 0 
                THEN LEAST(g.x * f.bp_personal_share / 100, f.bp_personal_share_upperlimit)
                ELSE g.x * f.bp_personal_share / 100
              END
        END), 0) as g_x,

        -- 其他
        COALESCE(SUM(g.zd * f.sb_personal_share / 100), 0) as g_zd,
        COALESCE(SUM(g.xd * f.sb_personal_share / 100), 0) as g_xd,
        COALESCE(SUM(g.h * f.sb_personal_share / 100), 0) as g_h

    FROM ${tableName} g

    INNER JOIN user real_user
        ON real_user.Id = g.userId

    -- 个人财务配置按 userId + 群关联，玩家改名后仍能正确取到配置
    LEFT JOIN finance_personal_setup f 
        ON g.userId = f.userId
        AND g.group_nickname = f.group_nickname
        AND f.bp_personal_share >= 0

    LEFT JOIN group_parameter_setup gp 
        ON g.group_nickname = gp.group_nickname

    -- 只统计真实玩家，避免玩家改名导致群成员关联失效
    LEFT JOIN group_member gm 
        ON g.userId = gm.userId
        AND g.group_nickname = gm.group_nickname

    WHERE
        g.group_nickname = ? 
        AND g.cc = ?
        AND g.jc = ? 
        AND DATE(g.statistics_date) = DATE(?)

        -- ✅ 核心过滤
        AND IFNULL(real_user.is_virtual, 0) = 0
        AND IFNULL(gm.is_virtual, 0) = 0
  `;

  let args = [msg.group_nickname, msg.cc, msg.jc, msg.statistics_date];

  //console.log("sql,args:", sql, args);

  let res = await mysql.query("bjl", sql, args);

  return { err: null, data: res };
};

userDao.insertJcTotal = async function (r) {
  const fields = [
    'group_nickname', 'cc', 'jc', 'kj',
    'z', 'h', 'x', 'zd', 'xd', 'm', 'q', 'l','k',
    'g_z', 'g_h', 'g_x', 'g_zd', 'g_xd', 'g_m', 'g_q', 'g_l',
    'z_yl', 'h_yl', 'x_yl', 'zd_yl', 'xd_yl', 'm_yl', 'q_yl', 'l_yl','k_yl',
    'zxdc', 'tzx', 'tsbl', 'lt', 'sp', 'spm','spxm',
    'stime', 'zyk', 'xzyk', 'gyk', 'dcyk', 'xztyk',
    'sbltyk', 'sblspyk', 'xzspyk', 'ltyk','spzsyk','statistics_date'
  ];
  const placeholders = fields.map(() => '?').join(', ');
  const insertSql = `INSERT INTO game_jc_total (${fields.join(', ')}) VALUES (${placeholders})`;
  const args = fields.map(field => {
    if (field === 'stime') return new Date();
    if (field === 'group_nickname' || field === 'spm' || field === 'statistics_date') {
      return r[field] ?? '';
    }
    const value = Number(r[field]);
    return Number.isFinite(value) ? value : 0;
  });

  return new Promise((resolve, reject) => {
    mysql.beginTransaction((connectionErr, connection) => {
      if (connectionErr) {
        reject(connectionErr);
        return;
      }

      const query = (sql, queryArgs) => new Promise((queryResolve, queryReject) => {
        connection.query(sql, queryArgs, (queryErr, rows) => {
          if (queryErr) return queryReject(queryErr);
          queryResolve(rows);
        });
      });
      const begin = () => new Promise((beginResolve, beginReject) => {
        connection.beginTransaction(err => err ? beginReject(err) : beginResolve());
      });
      const commit = () => new Promise((commitResolve, commitReject) => {
        connection.commit(err => err ? commitReject(err) : commitResolve());
      });
      const rollback = () => new Promise(done => connection.rollback(() => done()));

      (async () => {
        try {
          await begin();

          const scopeArgs = [r.group_nickname, r.cc, r.jc, r.statistics_date];
          const oldRows = await query(`
            SELECT Id, COALESCE(xzspyk, 0) AS xzspyk
            FROM game_jc_total
            WHERE group_nickname = ? AND cc = ? AND jc = ?
              AND DATE(statistics_date) = DATE(?)
          `, scopeArgs);
          const oldTableChipResult = (oldRows || []).reduce(
            (sum, row) => sum + (Number(row.xzspyk) || 0),
            0
          );

          if (oldRows && oldRows.length > 0) {
            await query(`
              DELETE FROM game_jc_total
              WHERE group_nickname = ? AND cc = ? AND jc = ?
                AND DATE(statistics_date) = DATE(?)
            `, scopeArgs);
          }

          console.log("insertJcTotal sql,args:", insertSql, args);
          const insertResult = await query(insertSql, args);
          const newTableChipResult = Number(r.xzspyk) || 0;
          const tableChipDelta = newTableChipResult - oldTableChipResult;

          if (tableChipDelta !== 0) {
            await query(`
              UPDATE group_chat_setup
              SET table_chips = GREATEST(COALESCE(table_chips, 0) + ?, 0)
              WHERE group_nickname = ?
            `, [tableChipDelta, r.group_nickname]);
          }

          await commit();
          connection.release();
          console.log("insertJcTotal result:", insertResult, "tableChipDelta:", tableChipDelta);
          resolve({ err: null, data: insertResult, tableChipDelta });
        } catch (err) {
          await rollback();
          connection.release();
          reject(err);
        }
      })();
    });
  });
}

// 0点定时清除当日所有玩家积分
userDao.delete_daily_points = async function (player_name) {
  try {
    let sqlParamsEntity = [];
    
    // 1. 查询有积分的用户
    let selectSql = "SELECT username, daily_points FROM user WHERE daily_points > 0";
    let selectArgs = [];
    let users = await mysql.query("bjl", selectSql, selectArgs);

    if (users && users.length > 0) {
        // 2. 插入积分记录到 points_record
        let insertSql = "INSERT INTO points_record (player_name, point, stime) VALUES ?";
        let values = users.map(user => [user.username, user.daily_points, new Date()]);
        let insertArgs = [values];
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(insertSql, insertArgs));
        
        // 3. 清空 user 表的 daily_points
        let updateSql = "UPDATE user SET daily_points = 0 WHERE daily_points > 0";
        let updateArgs = [];
        sqlParamsEntity.push(mysql._getNewSqlParamEntity(updateSql, updateArgs));
    }
    
    let res = await mysql.tranExecSync("bjl", sqlParamsEntity);
    return { err: null, data: res };
  } catch (err) {
      return { err: err, data: null };
  }
};

userDao.getSumBetForName = async function (msg) {
    try {
        // ✅ 改用 userId
        let sql = "SELECT SUM(xz) FROM gameshist WHERE cc = ? AND jc = ? AND group_nickname = ? AND userId = ? AND statistics_date >= ?";
        let args = [msg.cc, msg.jc, msg.group_nickname, msg.userId, msg.statistics_date];
        let row = await mysql.query("bjl", sql, args);
        return { err: null, data: row[0] };
    } catch (err) {
        console.error("getSumBetForName error:", err);
        return { err: err, data: null };
    }
};

userDao.insertGame = async function (msg) {
    // 开始下注时：
    // 1. 写入当前游戏记录
    // 2. 查询当前房间所有未结算下注
    // 3. 按 userId 汇总下注金额并退回 score
    // 4. 同时扣减 freeze_score
    // 5. 删除当前房间所有未结算下注记录
    try {
        const time = new Date();
        const sqlParamsEntity = [];

        /*
         * 写入或更新当前游戏记录。
         */
        const gameSql = `
            REPLACE INTO game
            (
                cc,
                jc,
                rType,
                stime,
                roomId,
                roomName,
                gameStatus,
                start_time
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await mysql.query(
            "bjl",
            gameSql,
            [
                msg.cc,
                msg.jc,
                msg.rType,
                time,
                msg.roomId,
                msg.roomName,
                msg.gameStatus,
                time
            ]
        );

        /*
         * 查询当前房间所有未结算下注。
         *
         * 不再限制：
         * - cc
         * - jc
         * - statistics_date
         *
         * 只限制：
         * - 当前 roomId
         * - closed = 0
         */
        const sumSql = `
            SELECT
                userId,
                COALESCE(SUM(xz), 0) AS refund
            FROM gameshist
            WHERE roomId = ?
              AND closed = 0
            GROUP BY userId
        `;

        const sums = await mysql.query(
            "bjl",
            sumSql,
            [msg.roomId]
        );

        /*
         * 按玩家退回下注额。
         */
        if (Array.isArray(sums) && sums.length > 0) {
            for (const item of sums) {
                const userId = Number(item.userId);
                const refund = Number(item.refund || 0);

                if (!Number.isFinite(userId) || userId <= 0) {
                    console.warn(
                        "[开始下注退款] 无效 userId:",
                        item.userId
                    );
                    continue;
                }

                if (!Number.isFinite(refund) || refund <= 0) {
                    continue;
                }

                /*
                 * score：退回下注金额
                 *
                 * freeze_score：减少冻结金额
                 *
                 * 使用 GREATEST 防止历史数据异常导致负数。
                 */
                const refundSql = `
                    UPDATE user
                    SET
                        score = COALESCE(score, 0) + ?,
                        freeze_score = GREATEST(
                            COALESCE(freeze_score, 0) - ?,
                            0
                        )
                    WHERE Id = ?
                `;

                sqlParamsEntity.push(
                    mysql._getNewSqlParamEntity(
                        refundSql,
                        [
                            refund,
                            refund,
                            userId
                        ]
                    )
                );
            }
        }

        /*
         * 删除当前房间全部未结算下注。
         *
         * 删除条件必须与上面的汇总退款条件完全一致，
         * 避免出现：
         * - 退了但没有删
         * - 删了但没有退
         */
        const deleteSql = `
            DELETE FROM gameshist
            WHERE roomId = ?
              AND closed = 0
        `;

        sqlParamsEntity.push(
            mysql._getNewSqlParamEntity(
                deleteSql,
                [msg.roomId]
            )
        );

        const result = await mysql.tranExecSync(
            "bjl",
            sqlParamsEntity
        );

        console.log(
            "[开始下注清理完成]",
            "roomId=" + msg.roomId,
            "退款玩家数=" + (
                Array.isArray(sums)
                    ? sums.length
                    : 0
            )
        );

        return {
            err: null,
            data: result
        };
    } catch (err) {
        console.error(
            "insertGame error:",
            err
        );

        return {
            err: err.message || err,
            data: null
        };
    }
};

// 记得修改下注记录
userDao.updateJcRoad = async function (msg, roomId , gameType , rInfo) {
  try {
      let sql = "update game set kj = ? where cc = ? and jc = ? and roomId = ?";
      let args = [msg.result, msg.cc, msg.jc, roomId];
      let res = await mysql.query("bjl", sql, args);
      setTimeout(async () => {                                               // 视频延时
        let road = await userDao.updateRoadFromGameRecord(msg.cc, msg.jc, roomId, gameType);
        rInfo.road = road;
      }, 1000);
  } catch (err) {
    console.log("updateJcRoad:", JSON.stringify(err));
    cb(err);
  }
};

// 重新计算结果
userDao.recalculateResults = async function (msg,rInfo) {
  try {
    let sql = "SELECT * FROM gameshist_record WHERE cc = ? AND jc = ? AND roomId = ? AND DATE(statistics_date) = DATE(?)";
    let args = [msg.cc, msg.jc, msg.roomId, rInfo.statistics_date];
    let rows = await mysql.query("bjl", sql, args);
    if (!rows || rows.length === 0) return { err: null, data: [] };

    // ✅ 改用 userId 做 key
    let array_user_id = {};
    let sum_score = 0;
    rows.forEach(row => {
        if (!array_user_id[row.userId]) array_user_id[row.userId] = 0;
        sum_score += Number(row.yl) || 0;
        array_user_id[row.userId] += Number(row.fh) || 0;
    });

    // ✅ WHERE Id = ?（user.Id 大写）
    for (let userId in array_user_id) {
        if (array_user_id[userId] > 0) {
            sql = "UPDATE user SET score = score - ? WHERE Id = ?";
            let updateArgs = [array_user_id[userId], userId];
            let res = await mysql.query("bjl", sql, updateArgs);
            console.log("修改路单update_score:", sql, updateArgs, res);
        }
    }

    sql = "SELECT * FROM game_jc_total WHERE cc = ? AND jc = ? AND group_nickname = ? AND DATE(statistics_date) = DATE(?)";
    let row = await mysql.query("bjl", sql, [msg.cc, msg.jc, msg.group_nickname, rInfo.statistics_date]);
    const oldTableChipResult = (row || []).reduce(
        (sum, item) => sum + (Number(item.xzspyk) || 0),
        0
    );
    if (oldTableChipResult !== 0) {
        await userDao.updateTabelChip(-oldTableChipResult, msg.group_nickname);
    }

    sql = "DELETE FROM game_jc_total WHERE cc = ? AND jc = ? AND group_nickname = ? AND DATE(statistics_date) = DATE(?)";
    let res = await mysql.query("bjl", sql, [msg.cc, msg.jc, msg.group_nickname, rInfo.statistics_date]);

    // 等待重新开奖、玩家记录更新和日汇总全部完成，避免 editShoeRound
    // 已返回成功但财务查询仍显示旧数据。
    await result.re_doResult(
        { cc: msg.cc, jc: msg.jc, result_code: msg.result, group_nickname: msg.group_nickname, roomId: rInfo.Id },
        { optioner_id: rInfo.optioner_id, rType: rInfo.rType, parameter_setup: rInfo.parameter_setup, statistics_date: rInfo.statistics_date, group_nickname: rInfo.group_nickname },
        rows
    );
    return { err: null, data: res };
  } catch (err) {
    console.log("recalculateResults error:", JSON.stringify(err));
    return { err: err, data: null };
  }
};

userDao.checkDuplicateBet = async function(msg) {
  try {
    // ✅ 改用 userId（msg.userId 由调用方传入）
    let sql = "SELECT z,x,zd,xd,h,l,k,m,d,xz,order_id FROM gameshist WHERE userId = ? AND cc = ? AND jc = ? AND group_nickname = ? AND rType = ? AND roomId = ? AND closed = 0 AND statistics_date >= ?";
    let args = [msg.userId, msg.cc, msg.jc, msg.group_nickname, msg.rType, msg.roomId, msg.statistics_date];
    let rows = await mysql.query("bjl", sql, args);
    if (!rows || rows.length === 0) return { err: null, data: [] };

    const hasTypeInRow = (row, field) => (Number(row[field]) || 0) > 0;
    const duplicates = [];
    for (let betItem of (msg.bet || [])) {
      const field = fieldMap[betItem.type];
      if (!field) continue;
      if (field === 'z' || field === 'x') {
        const exists = rows.some(r => hasTypeInRow(r, 'z') || hasTypeInRow(r, 'x'));
        if (exists && !duplicates.includes('zx')) duplicates.push('zx');
      } else {
        const exists = rows.some(r => hasTypeInRow(r, field));
        if (exists && !duplicates.includes(field)) duplicates.push(field);
      }
    }
    return { err: null, data: duplicates };
  } catch (err) {
    return { err: err, data: null };
  }
};

userDao.getIpWhileList = async function (msg) {
  let sql = "select ipWhileList from gamesetup";
  let args = [];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (err) {
    console.error("err:", JSON.stringify(err));
    return { err: err, data: null };
  }
};

userDao.setWhileList = async function (msg) {
  let sql = "update gamesetup set ipWhileList = ?";
  let args = [msg.ip_list];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (err) {
    console.error("err:", JSON.stringify(err));
    return { err: err, data: null };
  }
};

// ✅ 所有 INSERT INTO score_operation_record 补充 userId
userDao.insertScoreOperationRecord = async function(msg) {
    try {
        let sql = `
            INSERT INTO score_operation_record
                (userId, player_name, group_nickname, type, score, before_score, after_score, remark, stime, operator)
            VALUES
                ((SELECT Id FROM user WHERE username = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        let args = [
            msg.player_name,   // 子查询取 userId
            msg.player_name,
            msg.group_nickname,
            msg.type,
            msg.score,
            msg.before_score,
            msg.after_score,
            msg.remark || '',
            new Date(),
            msg.operator || ''
        ];
        let res = await mysql.query("bjl", sql, args);
        return { err: null, data: res };
    } catch(err) {
        console.error("insertScoreOperationRecord err:", JSON.stringify(err));
        return { err: err, data: null };
    }
};

userDao.getScoreOperationRecord = async function(msg) {
    try {
        let where = " WHERE 1=1 ";
        let args = [];

        if (msg.group_nickname && msg.group_nickname !== '全部' && msg.group_nickname !== '') {
            where += " AND s.group_nickname = ? ";
            args.push(msg.group_nickname);
        }

        if (msg.player_name && msg.player_name !== '') {
            where += " AND u.username = ? ";    // ✅ 通过 user 表过滤
            args.push(msg.player_name);
        }

        if (msg.startTime && msg.endTime) {
            where += " AND s.stime BETWEEN ? AND ? ";
            args.push(msg.startTime, msg.endTime);
        }

        if (msg.type && msg.type !== '全部') {
            where += " AND s.type = ? ";
            args.push(msg.type);
        }

        let page = Math.max(1, parseInt(msg.currentPage) || 1);
        let pageSize = Math.max(1, Math.min(200, parseInt(msg.pageSize) || 20));
        let offset = (page - 1) * pageSize;

        let countSql = `
            SELECT COUNT(*) AS total
            FROM score_operation_record s
            INNER JOIN user u ON u.Id = s.userId    -- ✅ userId 关联
            ${where}
        `;

        let listSql = `
            SELECT
                u.username AS player_name,           -- ✅ 实时从 user 取
                u.reference_name,
                s.group_nickname,
                s.type,
                s.score,
                s.before_score,
                s.after_score,
                s.remark,
                s.stime,
                s.operator,
                s.userId
            FROM score_operation_record s
            INNER JOIN user u ON u.Id = s.userId     -- ✅ userId 关联
            ${where}
            ORDER BY s.stime DESC
            LIMIT ?, ?
        `;

        let [countRes, list] = await Promise.all([
            mysql.query("bjl", countSql, args),
            mysql.query("bjl", listSql, [...args, offset, pageSize])
        ]);

        return {
            err: null,
            data: {
                list: list || [],
                total: (countRes[0] && countRes[0].total) ? Number(countRes[0].total) : 0,
                currentPage: page,
                pageSize
            }
        };
    } catch(err) {
        console.error("getScoreOperationRecord err:", JSON.stringify(err));
        return { err: err, data: null };
    }
};

