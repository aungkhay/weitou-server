var pomelo = require("pomelo");
var systemDao = module.exports;
var mysql = pomelo.app.get("sqlHelper");
var redis = pomelo.app.get("redis");
const cache = require("./Cache");

// 按开工群昵称分
systemDao.groupChatSetup = async function (msg) {
  let sql = "select account from group_chat_setup where chat_group_nickname = ?";
  let args = [msg.chat_group_nickname];
  let row = await mysql.query("bjl", sql, args);
  if(row && row.length > 0 && row[0].account != msg.account){
      console.error("别的账号已经在使用这个昵称:",msg.chat_group_nickname);
      return { err: "别的账号已经在使用这个开工群昵称", data: null }
  }
  sql = "select * from group_chat_setup where account = ?";
  args = [msg.account];
  try {
    let res = await mysql.query("bjl", sql, args);
    let obj = {isNeedCreateRoom:0,roomId:0,isInsert:0};  // 确定是否要建立房间
    if(res.length > 0){
        msg.chat_id = res[0].chat_id;
        cache.set(`pull_table_nickname_${msg.chat_id}`, null);  // 拉表机器人名称缓存清空，发图片时用到
        console.log("拉表机器人缓存清空:",`pull_table_nickname_${msg.chat_id}`);
        if(msg.chat_group_nickname != res[0].chat_group_nickname){
           msg.chat_id = "";
        }
        sql = "UPDATE group_chat_setup SET "
        sql += "chat_group_nickname = ?, pull_table_nickname = ?, report_bet_groups_nickname = ?, img_start = ?, img_stop = ?, auto_send_bet_report = ?, "
        sql += "auto_send_road = ?, auto_send_settlement_table = ?, auto_send_start_img = ?, img1_after_start = ?, img2_after_start = ?, img3_after_start = ?, "
        sql += "auto_send_img1_after_start = ?, auto_send_img2_after_start = ?, auto_send_img3_after_start = ?, second_send_img1_after_start = ?, second_send_img2_after_start = ?, "
        sql += "second_send_img3_after_start = ?, text1_after_betreport = ?, text2_after_betreport = ?, text3_after_betreport = ?, auto_send_text1 = ?, auto_send_text2 = ?, "
        sql += "auto_send_text3 = ?, second_send_text1 = ?, second_send_text2 = ?, second_send_text3 = ?, img1_after_betreport = ?, img2_after_betreport = ?, "
        sql += "img3_after_betreport = ?, auto_send_img1_after_betreport = ?, auto_send_img2_after_betreport = ?, auto_send_img3_after_betreport = ?, "
        sql += "second_send_img1_after_betreport = ?, second_send_img2_after_betreport = ?, second_send_img3_after_betreport = ?, active = ? , quick_mode = ?,chat_id = ? "
        sql += "WHERE account = ?"

        args = [
            msg.chat_group_nickname,
            msg.pull_table_nickname,        // pull_table_nickname
            msg.report_bet_groups_nickname, // report_bet_groups_nickname
            msg.img_start,                  // img_start
            msg.img_stop,                   // img_stop
            msg.auto_send_bet_report,       // auto_send_bet_report
            msg.auto_send_road,             // auto_send_road
            msg.auto_send_settlement_table, // auto_send_settlement_table
            msg.auto_send_start_img,        // auto_send_start_img
            msg.img1_after_start,           // img1_after_start
            msg.img2_after_start,           // img2_after_start
            msg.img3_after_start,           // img3_after_start
            msg.auto_send_img1_after_start,// auto_send_img1_after_start
            msg.auto_send_img2_after_start,// auto_send_img2_after_start
            msg.auto_send_img3_after_start,// auto_send_img3_after_start
            msg.second_send_img1_after_start, // second_send_img1_after_start
            msg.second_send_img2_after_start, // second_send_img2_after_start
            msg.second_send_img3_after_start, // second_send_img3_after_start
            msg.text1_after_betreport,      // text1_after_betreport
            msg.text2_after_betreport,      // text2_after_betreport
            msg.text3_after_betreport,      // text3_after_betreport
            msg.auto_send_text1,            // auto_send_text1
            msg.auto_send_text2,            // auto_send_text2
            msg.auto_send_text3,            // auto_send_text3
            msg.second_send_text1,          // second_send_text1
            msg.second_send_text2,          // second_send_text2
            msg.second_send_text3,          // second_send_text3
            msg.img1_after_betreport,       // img1_after_betreport
            msg.img2_after_betreport,       // img2_after_betreport
            msg.img3_after_betreport,       // img3_after_betreport
            msg.auto_send_img1_after_betreport, // auto_send_img1_after_betreport
            msg.auto_send_img2_after_betreport, // auto_send_img2_after_betreport
            msg.auto_send_img3_after_betreport, // auto_send_img3_after_betreport
            msg.second_send_img1_after_betreport, // second_send_img1_after_betreport
            msg.second_send_img2_after_betreport, // second_send_img2_after_betreport
            msg.second_send_img3_after_betreport, // second_send_img3_after_betreport
            msg.active,                           // active
            msg.quick_mode,                       // quick_mode
            msg.chat_id ,
            msg.userName                            // account
        ];
        if(Number(res[0].active) === 0 && Number(msg.active) === 1){
           obj.isNeedCreateRoom = 1;
           obj.roomId = res[0].Id;
        }
    }else{
        sql = "INSERT INTO group_chat_setup ("
        sql += "group_nickname,chat_group_nickname, account, pull_table_nickname, report_bet_groups_nickname, img_start, img_stop, auto_send_bet_report, "
        sql += "auto_send_road, auto_send_settlement_table, auto_send_start_img, img1_after_start, img2_after_start, img3_after_start, "
        sql += "auto_send_img1_after_start, auto_send_img2_after_start, auto_send_img3_after_start, second_send_img1_after_start, "
        sql += "second_send_img2_after_start, second_send_img3_after_start, text1_after_betreport, text2_after_betreport, text3_after_betreport, "
        sql += "auto_send_text1, auto_send_text2, auto_send_text3, second_send_text1, second_send_text2, second_send_text3, "
        sql += "img1_after_betreport, img2_after_betreport, img3_after_betreport, auto_send_img1_after_betreport, auto_send_img2_after_betreport, "
        sql += "auto_send_img3_after_betreport, second_send_img1_after_betreport, second_send_img2_after_betreport, second_send_img3_after_betreport, active ,quick_mode"
        sql += ") VALUES ("
        sql += "?,?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? ,?, ?,?)"
        args = [
            msg.chat_group_nickname,                // group_nickname
            msg.chat_group_nickname,           // chat_group_nickname
            msg.userName,                       // account
            msg.pull_table_nickname,           // pull_table_nickname
            msg.report_bet_groups_nickname,    // report_bet_groups_nickname
            msg.img_start,                     // img_start
            msg.img_stop,                      // img_stop
            msg.auto_send_bet_report,          // auto_send_bet_report
            msg.auto_send_road,                // auto_send_road
            msg.auto_send_settlement_table,    // auto_send_settlement_table
            msg.auto_send_start_img,           // auto_send_start_img
            msg.img1_after_start,              // img1_after_start
            msg.img2_after_start,              // img2_after_start
            msg.img3_after_start,              // img3_after_start
            msg.auto_send_img1_after_start,    // auto_send_img1_after_start
            msg.auto_send_img2_after_start,    // auto_send_img2_after_start
            msg.auto_send_img3_after_start,    // auto_send_img3_after_start
            msg.second_send_img1_after_start,  // second_send_img1_after_start
            msg.second_send_img2_after_start,  // second_send_img2_after_start
            msg.second_send_img3_after_start,  // second_send_img3_after_start
            msg.text1_after_betreport,         // text1_after_betreport
            msg.text2_after_betreport,         // text2_after_betreport
            msg.text3_after_betreport,         // text3_after_betreport
            msg.auto_send_text1,               // auto_send_text1
            msg.auto_send_text2,               // auto_send_text2
            msg.auto_send_text3,               // auto_send_text3
            msg.second_send_text1,             // second_send_text1
            msg.second_send_text2,             // second_send_text2
            msg.second_send_text3,             // second_send_text3
            msg.img1_after_betreport,          // img1_after_betreport
            msg.img2_after_betreport,          // img2_after_betreport
            msg.img3_after_betreport,          // img3_after_betreport
            msg.auto_send_img1_after_betreport,// auto_send_img1_after_betreport
            msg.auto_send_img2_after_betreport,// auto_send_img2_after_betreport
            msg.auto_send_img3_after_betreport,// auto_send_img3_after_betreport
            msg.second_send_img1_after_betreport,// second_send_img1_after_betreport
            msg.second_send_img2_after_betreport,// second_send_img2_after_betreport
            msg.second_send_img3_after_betreport,// second_send_img3_after_betreport
            msg.active,                          // active
            msg.quick_mode                       // quick_mode
        ];
        obj.isInsert = 1;
        if(msg.active){
           obj.isNeedCreateRoom = 1;
        }
    }
    
    res = await mysql.query("bjl", sql, args);
    if(obj.isInsert)obj.roomId = res.insertId;
    return { err: null, data: res , createRoom:obj};
  } catch (err) {
    console.error("err:", JSON.stringify(err));
    return { err: "数据库操作失败", data: null }
  }
};

systemDao.getGroupPullDataSetup = async function (msg) {
  let sql = "select * from group_chat_setup where group_nickname = ?";
  let args = [msg.group_nickname];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (err) {
    return { err: err, data: null }
  }
};

systemDao.getGroupPullDataSetupByAccount = async function (msg) {
  let sql = "select * from group_chat_setup where account = ?";
  let args = [msg.account];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (err) {
    return { err: err, data: null }
  }
};

systemDao.getGroupPullDataSetupByRtype = async function (msg) {
  let sql = "select * from group_chat_setup where rType = ?";
  let args = [msg.rType];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (err) {
    return { err: err, data: null }
  }
};

systemDao.getGroupPullDataSetupById = async function (id) {
  let sql = "select * from group_chat_setup where Id = ?";
  let args = [id];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res[0] };
  } catch (err) {
    console.error("err:", JSON.stringify(err));
    return { err: err, data: null }
  }
};

systemDao.getGroupPullDataSetupByChatId = async function (msg) {
  let sql = "select * from group_chat_setup where chat_id = ?";
  let args = [msg.chat_id];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (err) {
    console.error("err:", JSON.stringify(err));
    return { err: err, data: null }
  }
};

systemDao.getGroupPullDataByChatGroupNickname = async function (msg) {
  let sql = "select * from group_chat_setup where chat_group_nickname = ?";
  let args = [msg.chat_group_nickname];
  try {
    let res = await mysql.query("bjl", sql, args);
    console.log("sql,args:",sql,args);
    return { err: null, data: res };
  } catch (err) {
    console.error("err:", JSON.stringify(err));
    return { err: err, data: null }
  }
};

systemDao.getStatisticsDateByAnyGroup = async function () {
  // 用所有桌台的最近营业日判断当天是否已执行过日积分清零。
  // 不能只查 game_status=1，否则第一张桌停止后，第二张桌启动会再次清零。
  let sql = "select statistics_date from group_chat_setup where statistics_date is not null order by statistics_date desc limit 1";
  try {
      let res = await mysql.query("bjl", sql,[]);
      return { err: null, data: res[0] };
  } catch (err) {
    console.error("err:", JSON.stringify(err));
    return { err: err, data: null }
  }
};

// 批量修改选手显示状态，同时同步 user 与已有的 group_member。
// 隐藏时只处理0分选手；显示时恢复所有隐藏选手。
systemDao.setPlayersHidden = async function (isHide) {
  const hideValue = Number(isHide) === 1 ? 1 : 0;
  const condition = hideValue === 1
    ? 'u.level = 3 AND u.score = 0'
    : 'u.level = 3 AND (u.is_hide = 1 OR gm.is_hide = 1)';
  const sql = `
    UPDATE user u
    LEFT JOIN group_member gm
      ON gm.userId = u.Id OR gm.playername = u.username
    SET u.is_hide = ?, gm.is_hide = ?
    WHERE ${condition}
  `;

  try {
    const res = await mysql.query("bjl", sql, [hideValue, hideValue]);
    return { err: null, data: res };
  } catch (err) {
    console.error("批量修改0分选手显示状态失败:", err);
    return { err: err, data: null };
  }
};

systemDao.setGroupChatId = async function (msg) {
  let sql = "update group_chat_setup set chat_id = '' where chat_id = ?";
  let args = [msg.chat_id];
  sql = "update group_chat_setup set chat_id = ? where group_nickname = ?";
  args = [msg.chat_id,msg.group_nickname];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (err) {
    console.error("err:", JSON.stringify(err));
    return { err: err, data: null }
  }
};

// 注意：这里的roomId就是操作者的id
systemDao.setGroupChatRoomId = async function (msg) {
  let sql = "update group_chat_setup set optioner_id = ? where group_nickname = ?";
  let args = [msg.userId,msg.group_nickname];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (err) {
    console.error("err:", JSON.stringify(err));
    return { err: err, data: null }
  }
};

// 这里获取主持端操作员的id,以便上分时群发到各主持群
systemDao.getOptionIdByPlayer = async function (msg) { 
    // 参数校验 
    if (!msg || !msg.player_name || typeof msg.player_name !== 'string') { 
        return { err: "Invalid player_name", data: [] }; 
    } 

    // SQL 查询 (移除了 jc 后面多余的逗号)
    const sql = ` 
        SELECT 
            a.optioner_id AS optioner_id, 
            a.cc AS cc, 
            a.jc AS jc,
            a.chat_group_nickname as chat_group_nickname 
        FROM group_chat_setup a 
        INNER JOIN group_member b ON a.group_nickname = b.group_nickname 
        WHERE b.playername = ? AND a.optioner_id IS NOT NULL 
    `; 
    const args = [msg.player_name]; 

    try { 
        // 执行查询 
        const res = await mysql.query("bjl", sql, args); 

        // 提取数据，返回包含 optioner_id, cc, jc 的对象数组
        const resultData = Array.isArray(res) ? res.map(row => ({
            optioner_id: row.optioner_id,
            cc: row.cc,
            jc: row.jc
        })) : []; 

        return { err: null, data: resultData }; 
    } catch (err) { 
        console.error("Error in getOptionIdByPlayer:", JSON.stringify(err)); 
        return { err: err.message || err, data: [] }; 
    } 
};

// 台号昵称刚开始是跟台号一样，后面可以单独修改
systemDao.autoLotterySetup = async function (msg) {
  let sql = "select * from group_auto_lottery where group_nickname = ?";
  let args = [msg.group_nickname];
  try {
      let res = await mysql.query("bjl", sql, args);
      if(res.length > 0){
          sql = "update group_auto_lottery set active = ?,desk_number = ?,official_website_nickname = ?,auto_result_report = ? ,group_nickname = ? where group_nickname = ?";
          args = [msg.active,msg.desk_number,msg.official_website_nickname,msg.auto_result_report,msg.group_nickname,msg.group_nickname];
      }else{
          sql = "insert into group_auto_lottery(userId,username,active,desk_number,official_website_nickname,auto_result_report,desk_nickname,group_nickname) values(?,?,?,?,?,?,?,?)";
          args = [msg.userId,msg.userName,msg.active,msg.desk_number,msg.official_website_nickname,msg.auto_result_report,msg.desk_number,msg.group_nickname];
      }
      res = await mysql.query("bjl", sql, args);
      return { err: null, data: res };
    } catch (err) {
      console.error("err:", JSON.stringify(err));
      return { err: err, data: null }
    }
};

systemDao.getAutoLotterySetup = async function (msg) {
  let sql = "select * from group_auto_lottery where group_nickname = ?";
  let args = [msg.group_nickname];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (err) {
    return { err: err, data: null }
  }
};

systemDao.getParameter = async function (msg) {
  let sql = "select * from group_parameter_setup where group_nickname = ?";
  let args = [msg.group_nickname];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (err) {
    console.error("err:", JSON.stringify(err));
    return { err: err, data: null }
  }
};

systemDao.parameterSetup = async function (msg) {
  const firstDefined = (...values) => values.find(value => value !== undefined && value !== null && value !== "");
  let smallTigerMin = firstDefined(msg.lucky6_2_min_limit, msg.small_tiger_min_limit);
  let smallTigerMax = firstDefined(msg.lucky6_2_max_limit, msg.small_tiger_max_limit);
  let bigTigerMin = firstDefined(msg.lucky6_3_min_limit, msg.big_tiger_min_limit);
  let bigTigerMax = firstDefined(msg.lucky6_3_max_limit, msg.big_tiger_max_limit);

  let sql = "SELECT * FROM group_parameter_setup WHERE group_nickname = ?";
  let args = [msg.group_nickname];

  try {
    let res = await mysql.query("bjl", sql, args);
    const existing = res[0] || {};
    smallTigerMin = Number(firstDefined(smallTigerMin, existing.lucky6_2_min_limit, 30));
    smallTigerMax = Number(firstDefined(smallTigerMax, existing.lucky6_2_max_limit, 8000));
    bigTigerMin = Number(firstDefined(bigTigerMin, existing.lucky6_3_min_limit, 30));
    bigTigerMax = Number(firstDefined(bigTigerMax, existing.lucky6_3_max_limit, 8000));

    if (![smallTigerMin, smallTigerMax, bigTigerMin, bigTigerMax].every(Number.isFinite) ||
        smallTigerMin < 0 || bigTigerMin < 0 ||
        smallTigerMax < smallTigerMin || bigTigerMax < bigTigerMin) {
      throw new Error("小老虎或大老虎限红设置不正确");
    }

    if (res.length > 0) {
      // ✅ 【更新逻辑】修复：删除最后一个字段后的逗号
      sql = `
        UPDATE group_parameter_setup SET
          banker_odds = ?, player_odds = ?, tie_odds = ?, pair_odds = ?,
          lucky_6_2_odds = ?, lucky_6_3_odds = ?, perfect_pair = ?, any_pair = ?,
          enable_pumping_mode = ?, desk_enable_pumping_mode = ?, banker_6points_win_commission_ratio = ?, banker_win_odds = ?,
          filter_players_setup = ?, pb_min_limit = ?, pb_max_limit = ?,
          sanbao_min_limit = ?, sanbao_max_limit = ?,
          lucky6_2_min_limit = ?, lucky6_2_max_limit = ?, lucky6_3_min_limit = ?, lucky6_3_max_limit = ?,
          perfect_min_limit = ?, perfect_max_limit = ?, any_min_limit = ?, any_max_limit = ?,
          points_exchange_ratio = ?, integral_statistics_method = ?, show_points = ?, default_exchange = ?,
          pb_max_bet_amount = ?, pb_min_bet_amount = ?, transfer_small_change = ?,
          minimum_amount_sold = ?, enable_Lucky_6 = ?, change_settings = ?, enable_perfect_pairs = ?,
          enable_road = ?, enable_any_pairs = ?, screenshot_mode_bet_form = ?, pb_bet_calculation_Mode = ?,
          should_statistics_truncated = ?, pb_tabletop_occupies_proportion = ?, pb_tabletop_occupies_proportion_max_limit = ?,
          enable_Lucky_7 = ?, lucky7_4_odds = ?, lucky7_5_odds = ?, lucky7_6_odds = ?, lucky7_min_limit = ?, lucky7_max_limit = ?
        WHERE group_nickname = ?
      `;

      args = [
        msg.banker_odds, msg.player_odds, msg.tie_odds, msg.pair_odds,
        msg.lucky_6_2_odds, msg.lucky_6_3_odds, msg.perfect_pair, msg.any_pair,
        msg.enable_pumping_mode, msg.desk_enable_pumping_mode, msg.banker_6points_win_commission_ratio, msg.banker_win_odds,
        msg.filter_players_setup, msg.pb_min_limit, msg.pb_max_limit,
        msg.sanbao_min_limit, msg.sanbao_max_limit,
        smallTigerMin, smallTigerMax, bigTigerMin, bigTigerMax,
        msg.perfect_min_limit, msg.perfect_max_limit, msg.any_min_limit, msg.any_max_limit,
        msg.points_exchange_ratio, msg.integral_statistics_method, msg.show_points, msg.default_exchange,
        msg.pb_max_bet_amount, msg.pb_min_bet_amount, msg.transfer_small_change,
        msg.minimum_amount_sold, msg.enable_Lucky_6, msg.change_settings, msg.enable_perfect_pairs,
        msg.enable_road, msg.enable_any_pairs, msg.screenshot_mode_bet_form, msg.pb_bet_calculation_Mode,
        msg.should_statistics_truncated, msg.pb_tabletop_occupies_proportion, msg.pb_tabletop_occupies_proportion_max_limit,
        msg.enable_Lucky_7, msg.lucky7_4_odds, msg.lucky7_5_odds, msg.lucky7_6_odds, msg.lucky7_min_limit, msg.lucky7_max_limit,
        msg.group_nickname
      ];
    } else {
      // ✅ 【插入逻辑】46 个字段 = 46 个占位符
      sql = `
        INSERT INTO group_parameter_setup (
          group_nickname, banker_odds, player_odds, tie_odds, pair_odds,
          lucky_6_2_odds, lucky_6_3_odds, perfect_pair, any_pair, enable_pumping_mode,
          desk_enable_pumping_mode, banker_6points_win_commission_ratio, banker_win_odds, filter_players_setup, pb_min_limit,
          pb_max_limit, sanbao_min_limit, sanbao_max_limit,
          lucky6_2_min_limit, lucky6_2_max_limit, lucky6_3_min_limit, lucky6_3_max_limit,
          perfect_min_limit, perfect_max_limit, any_min_limit, any_max_limit, points_exchange_ratio,
          integral_statistics_method, show_points, default_exchange, pb_max_bet_amount, pb_min_bet_amount,
          transfer_small_change, minimum_amount_sold, enable_Lucky_6, change_settings, enable_perfect_pairs,
          enable_road, enable_any_pairs, screenshot_mode_bet_form, pb_bet_calculation_Mode, should_statistics_truncated,
          pb_tabletop_occupies_proportion, pb_tabletop_occupies_proportion_max_limit, enable_Lucky_7, lucky7_4_odds,
          lucky7_5_odds, lucky7_6_odds, lucky7_min_limit, lucky7_max_limit
        ) VALUES (
          ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
        )
      `;

      args = [
        msg.group_nickname,
        msg.banker_odds, msg.player_odds, msg.tie_odds, msg.pair_odds,
        msg.lucky_6_2_odds, msg.lucky_6_3_odds, msg.perfect_pair, msg.any_pair, msg.enable_pumping_mode,
        msg.desk_enable_pumping_mode, msg.banker_6points_win_commission_ratio, msg.banker_win_odds, msg.filter_players_setup, msg.pb_min_limit,
        msg.pb_max_limit, msg.sanbao_min_limit, msg.sanbao_max_limit,
        smallTigerMin, smallTigerMax, bigTigerMin, bigTigerMax,
        msg.perfect_min_limit, msg.perfect_max_limit, msg.any_min_limit, msg.any_max_limit, msg.points_exchange_ratio,
        msg.integral_statistics_method, msg.show_points, msg.default_exchange, msg.pb_max_bet_amount, msg.pb_min_bet_amount,
        msg.transfer_small_change, msg.minimum_amount_sold, msg.enable_Lucky_6, msg.change_settings, msg.enable_perfect_pairs,
        msg.enable_road, msg.enable_any_pairs, msg.screenshot_mode_bet_form, msg.pb_bet_calculation_Mode, msg.should_statistics_truncated,
        msg.pb_tabletop_occupies_proportion, msg.pb_tabletop_occupies_proportion_max_limit, msg.enable_Lucky_7, msg.lucky7_4_odds,
        msg.lucky7_5_odds, msg.lucky7_6_odds, msg.lucky7_min_limit, msg.lucky7_max_limit
      ];
    }

    res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (error) {
    console.error("【系统Dao错误拦截】群配置设定同步失败:", error);
    return { err: error.message || error, data: null };
  }
};


systemDao.personalParameterSetup = async function (msg) {
    let sql = "select * from group_personal_setup where userId = (SELECT Id FROM user WHERE username = ? LIMIT 1) and group_nickname = ?";
    let args = [msg.player_name,msg.group_nickname];
    try {
        let res = await mysql.query("bjl", sql, args);
        if(res.length > 0){
            sql = `update group_personal_setup set userId = (SELECT Id FROM user WHERE username = ? LIMIT 1),playername = ?,group_nickname = ?,bp_personal_share = ?,bp_personal_share_upperlimit = ?,
                  sb_personal_share = ?,personal_points_redemption_ratio = ?,bp_personal_upperlimit = ?, sb_personal_upperlimit = ?,
                   lucky6_personal_upperlimit = ?, perfect_pair_upperlimit = ?,zoom_ratio = ? where group_nickname = ? and userId = (SELECT Id FROM user WHERE username = ? LIMIT 1)`;
            args = [
              msg.player_name,
              msg.player_name,
              msg.group_nickname,
              msg.bp_personal_share,
              msg.bp_personal_share_upperlimit,
              msg.sb_personal_share,
              msg.personal_points_redemption_ratio,
              msg.bp_personal_upperlimit,
              msg.sb_personal_upperlimit,
              msg.lucky6_personal_upperlimit,
              msg.perfect_pair_upperlimit,
              msg.zoom_ratio,
              msg.group_nickname,
              msg.player_name
            ];
        }else{
            sql = `insert into group_personal_setup(userId,playername,group_nickname,bp_personal_share,bp_personal_share_upperlimit,sb_personal_share,
                   personal_points_redemption_ratio,bp_personal_upperlimit,sb_personal_upperlimit,lucky6_personal_upperlimit,
                   perfect_pair_upperlimit,zoom_ratio) values((SELECT Id FROM user WHERE username = ? LIMIT 1),?,?,?,?,?,?,?,?,?,?,?)`;
             args = [
              msg.player_name,
              msg.player_name,
              msg.group_nickname,
              msg.bp_personal_share,
              msg.bp_personal_share_upperlimit,
              msg.sb_personal_share,
              msg.personal_points_redemption_ratio,
              msg.bp_personal_upperlimit,
              msg.sb_personal_upperlimit,
              msg.lucky6_personal_upperlimit,
              msg.perfect_pair_upperlimit,
              msg.zoom_ratio,
            ];
        }
        res = await mysql.query("bjl", sql, args);
        return { err: null, data: res };
    } catch (err) {
        console.error("err:", JSON.stringify(err));
        return { err: err, data: null }
    }
};

systemDao.getPersonalParameter = async function (msg) {
  let sql = "select * from group_personal_setup where group_nickname = ? and userId = (SELECT Id FROM user WHERE username = ? LIMIT 1)";
  let args = [msg.group_nickname,msg.player_name];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (err) {
    console.error("err:", JSON.stringify(err));
    return { err: err, data: null }
  }
};

systemDao.editDeskNickname = async function (msg) {
  let sql = "update group_auto_lottery set desk_nickname = ? where group_nickname = ? and desk_nickname = ?";
  let args = [msg.new_desk_nickname,msg.group_nickname,msg.old_desk_nickname];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (err) {
    console.error("err:", JSON.stringify(err));
    return { err: err, data: null }
  }
};

systemDao.initDeskCoin = async function (msg) {
  let sql = "update group_chat_setup set table_chips = ? where group_nickname = ?";
  let args = [msg.coin,msg.group_nickname];
  try {
    console.log("初始化筹码:",sql,args);
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (err) {
    console.error("err:", JSON.stringify(err));
    return { err: err, data: null }
  }
};

systemDao.synchronizePoints = async function (msg) {
  let sql = "UPDATE user u JOIN group_member gm ON u.username = gm.playerName SET u.raw_score = u.score WHERE gm.group_nickname = ?";
  let args = [msg.group_nickname];
  try {
    let res = await mysql.query("bjl", sql, args);
    return { err: null, data: res };
  } catch (err) {
    console.error("err:", JSON.stringify(err));
    return { err: err, data: null };
  }
};

// 每天刚开始时，当前靴己开的路单先补足
systemDao.add_road = async function (msg) {
  try {
    if (!msg || !Array.isArray(msg.road) || !msg.roomId) {
      return { err: "invalid_params", data: null };
    }

    let time = new Date();
    let sqlParamsEntity = [];

    // 删除指定房间旧数据（保留在事务外，兼容已被提前删除的场景）
    const delSql = "DELETE FROM game WHERE roomId = ?";
    const delArgs = [msg.roomId];
    let delRes;
    try {
      delRes = await mysql.query("bjl", delSql, delArgs);
    } catch (e) {
      // 删除可能已在别处执行，记录并继续
      console.warn("add_road: delete failed or already done, continue. err:", e && e.message || e);
    }

    // 批量插入新数据（如果有路单）
    const values = (msg.road || []).map((item, index) => [msg.shoe, index + 1, item, msg.roomId, msg.rType || null, time, time]);
    if (values.length > 0) {
      const placeholders = values.map(() => "(?,?,?,?,?,?,?)").join(",");
      const flatArgs = values.flat();
      const insertSql = `INSERT INTO game(cc,jc,kj,roomId,rType,start_time,end_time) VALUES ${placeholders}`;
      sqlParamsEntity.push(mysql._getNewSqlParamEntity(insertSql, flatArgs));
    }

    // 更新群设置（放到事务里）
    const jc = (msg.road || []).length + 1;
    const resultRoad = (msg.road || []).join('^') + '^';
    const updSql = "UPDATE group_chat_setup SET cc = ?, jc = ?, quickModeJc = ?, road = ? WHERE group_nickname = ?";
    const updArgs = [msg.shoe, jc, Math.max(0, jc - 1), resultRoad, msg.group_nickname];
    sqlParamsEntity.push(mysql._getNewSqlParamEntity(updSql, updArgs));

    // 执行事务（insert + update）
    const txRes = await mysql.tranExecSync("bjl", sqlParamsEntity);
    if (txRes) {
      return { err: null, data: txRes, result: { cc: msg.shoe, jc: jc, road: resultRoad } };
    } else {
      return { err: "更新失败", data: null };
    }
  } catch (err) {
    console.error("add_road err:", JSON.stringify(err));
    return { err: err, data: null };
  }
};
