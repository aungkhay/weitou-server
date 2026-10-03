let userDao = require('../../dao/userDao');
let playerDao = require('../../dao/playerDao');  
let financialInquiriesDao = require('../../dao/financialInquiriesDao');
let systemDao = require('../../dao/systemDao');
let parseResult = require("./parseResult");
let pomelo = require('pomelo');
const redlock = pomelo.app.get('redlock');
const sendToFront = require('./sendToFrontEnd');

module.exports = {
    doResult: async function(msg,rInfo){
        let settlementLock = null;
        try {
            const lockKey = [
                "settlement",
                rInfo.rType,
                msg.roomId || rInfo.Id,
                rInfo.statistics_date,
                msg.cc,
                msg.jc
            ].join(":");
            // 正常完成后立即释放；120秒只是进程异常时的兜底时间。
            settlementLock = await redlock.lock(lockKey, 120000);

            await refreshParameterSetup(msg, rInfo);
            let res = await userDao.getBetInfo(rInfo.rType,rInfo.Id,msg.cc,msg.jc,rInfo.statistics_date);
            res = res.data || [];
            if(rInfo.rType == "bjl"){
                let msg2 = {
                    cc: msg.cc,
                    jc: msg.jc,
                    result_code: msg.result_code,
                    group_nickname: msg.group_nickname || rInfo.group_nickname,
                    roomId: rInfo.Id,
                    is_re_settlement:false,
                }
                let rInfo2 = {
                    optioner_id: rInfo.optioner_id,
                    rType: rInfo.rType,
                    parameter_setup: rInfo.parameter_setup,
                    statistics_date: rInfo.statistics_date,
                    group_nickname: rInfo.group_nickname,
                    chat_group_nickname: rInfo.chat_group_nickname,
                }
                // 即使余额已经结算、res为空，也要进入积分补偿流程。
                await settlement_bjl(msg2,rInfo2,res);
            }
            return {code:200,msg:"ok"}
        } finally {
            if (settlementLock) {
                try {
                    await settlementLock.unlock();
                } catch (unlockErr) {
                    console.error("释放结算锁失败:", unlockErr);
                }
            }
        }
    },
    re_doResult: async function(msg,rInfo,res){
        let settlementLock = null;
        try {
            const lockKey = [
                "settlement",
                rInfo.rType,
                msg.roomId || rInfo.Id,
                rInfo.statistics_date,
                msg.cc,
                msg.jc
            ].join(":");
            settlementLock = await redlock.lock(lockKey, 120000);
            await refreshParameterSetup(msg, rInfo);
            msg.is_re_settlement = true;
            await settlement_bjl(msg,rInfo,res);
        } finally {
            if (settlementLock) {
                try {
                    await settlementLock.unlock();
                } catch (unlockErr) {
                    console.error("释放重新结算锁失败:", unlockErr);
                }
            }
        }
    },

    // 按数据统计百家乐的各项盈亏，对冲，零钱等
    do_settlement_jc_bjl: function(result_code,parameter_setup,re){
        return settlement_jc_bjl(result_code,parameter_setup,re)
    }
}

// Settlement must use the latest database values, not the room snapshot loaded when betting opened.
async function refreshParameterSetup(msg, rInfo) {
    const groupNickname = msg.group_nickname || rInfo.group_nickname;
    const result = await systemDao.getParameter({ group_nickname: groupNickname });

    if (result.err) {
        throw new Error(`读取群参数失败: ${result.err.message || result.err}`);
    }
    if (!result.data || result.data.length === 0) {
        throw new Error(`未找到群参数: ${groupNickname}`);
    }

    rInfo.parameter_setup = result.data[0];
    return rInfo.parameter_setup;
}

// 三宝：   庄对，闲对11倍 和8倍
// 四宝是： 庄对 闲对 和 幸运6
// 幸运六： 庄6点赢 小六（两张牌）12倍 大六（三张牌）20倍
// 幸运七： 庄7点赢闲6点嬴 小七（4张牌）30倍 中七（5张牌）40倍 大七（6张牌）50倍
// 完美对： 花色点数一样 25倍  只有前两张牌花色点数一致才是完美对 补牌第三张不算
let settlement_bjl = async (msg,rInfo,res) => {
    console.log("结算统计:",msg);
    let isBank = parseResult.isBank(msg.result_code);
    let isTie = parseResult.isTie(msg.result_code);
    let isPlayer = parseResult.isPlayer(msg.result_code);
    let isBankPair = parseResult.isBankPair(msg.result_code);
    let isPlayerPair = parseResult.isPlayerPair(msg.result_code);
    let isSmallTiger = parseResult.isSmallTiger(msg.result_code);   // 这里变成老虎
    let isBigTiger = parseResult.isBigTiger(msg.result_code);
    let isLucky7_4 = parseResult.isLucky7_4(msg.result_code);
    let isLucky7_5 = parseResult.isLucky7_5(msg.result_code);
    let isLucky7_6 = parseResult.isLucky7_6(msg.result_code);
    let isPerfect = parseResult.isPerfect(msg.result_code);

    msg.strPai = "";
    if(isBank)msg.strPai += "庄 "
    if(isTie)msg.strPai += "和 "
    if(isPlayer)msg.strPai += "闲 "
    if(isBankPair)msg.strPai += "庄对 "
    if(isPlayerPair)msg.strPai += "闲对 "
    if(isPerfect)msg.strPai += "完美 "
    if(isSmallTiger)msg.strPai += "小老虎 "
    if(isBigTiger)msg.strPai += "大老虎 "
    if(isLucky7_4 || isLucky7_5 || isLucky7_6)msg.strPai += "幸运7 "

    if(msg.result_code){
        msg.kj = msg.result_code;
        
        let r = rInfo.parameter_setup;
        let total_yl = 0;
        let all_bets = [];
        let all_item_yl = {zyl:0,hyl:0,xyl:0,zdyl:0,xdyl:0,lyl:0,kyl:0,myl:0,qyl:0};   

        let obj = {group_nickname:msg.group_nickname };
        let row = await playerDao.getRealPlayerName(obj);
        let real_player = [];
        if(row.data && row.data.length > 0 ){
            row.data.forEach(item => {
                real_player.push(item.playername);
            })
        }

        for (let i in res){
            let bet = {t_xz:0,t_yl:0,t_fh:0,zyl:0,hyl:0,xyl:0,zdyl:0,xdyl:0,lyl:0,kyl:0,myl:0,qyl:0,zx_xml:0,sb_xml:0,xz_yl:0,sb_yl:0,yxxz:0};  // 每个人的盈亏情况
            if( isBank &&  res[i].z > 0 ){
                bet.zyl +=  res[i].z * r.banker_odds/100;   // 庄嬴利
                bet.zyl = bet.zyl >= 0 ? Math.floor(bet.zyl) : Math.trunc(bet.zyl);
                bet.t_fh += res[i].z + bet.zyl;
            }       

            if( isTie ){
                bet.hyl += res[i].h * r.tie_odds/100 ;
                bet.hyl = bet.hyl >= 0 ? Math.floor(bet.hyl) : Math.trunc(bet.hyl);
                bet.t_fh += res[i].h + bet.hyl  + res[i].z + res[i].x  ;   // 开和返本,不返庄对闲对;   
            }    
            
            if( isPlayer &&  res[i].x > 0 ){
                bet.xyl +=  res[i].x * r.player_odds/100;   // 闲嬴利
                bet.xyl = bet.xyl >= 0 ? Math.floor(bet.xyl) : Math.trunc(bet.xyl);
                bet.t_fh += res[i].x + bet.xyl;
            }    

            if( isBankPair &&  res[i].zd > 0 ){
                bet.zdyl += res[i].zd * r.pair_odds/100;   // 庄对嬴利
                bet.zdyl = bet.zdyl >= 0 ? Math.floor(bet.zdyl) : Math.trunc(bet.zdyl);
                bet.t_fh += res[i].zd + bet.zdyl;
            }    

            if( isPlayerPair &&  res[i].xd > 0 ){
                bet.xdyl +=  res[i].xd * r.pair_odds/100;   // 闲对嬴利
                bet.xdyl = bet.xdyl >= 0 ? Math.floor(bet.xdyl) : Math.trunc(bet.xdyl);
                bet.t_fh += res[i].xd + bet.xdyl;
            }    
            
            // 幸运六统一下注到 l，按开奖结果的牌张数选择赔率。
            if( (isSmallTiger || isBigTiger) && res[i].l > 0 ){
                const lucky6Odds = isBigTiger ? r.lucky_6_3_odds : r.lucky_6_2_odds;
                bet.lyl += res[i].l * lucky6Odds/100;
                bet.lyl = bet.lyl >= 0 ? Math.floor(bet.lyl) : Math.trunc(bet.lyl);
                bet.t_fh += res[i].l + bet.lyl;
            }    

            if( isBigTiger && res[i].k > 0 ){                
                bet.kyl +=  res[i].k * r.lucky_6_3_odds/100;    // 幸运6嬴利,这里改成大老虎
                bet.kyl = bet.kyl >= 0 ? Math.floor(bet.kyl) : Math.trunc(bet.kyl);
                bet.t_fh += res[i].k + bet.kyl;
            }    

            if(isLucky7_4 && res[i].q > 0){
                bet.qyl +=  res[i].q * r.lucky7_4_odds/100;    // 幸运7嬴利(四张牌) lucky7_4_odds:四张牌
                bet.qyl = bet.qyl >= 0 ? Math.floor(bet.qyl) : Math.trunc(bet.qyl);
                bet.t_fh += res[i].q + bet.qyl;
            }

            if(isLucky7_5 && res[i].q > 0){
                bet.qyl +=  res[i].q * r.lucky7_5_odds/100;    // 幸运7嬴利(五张牌) lucky7_5_odds:五张牌
                bet.qyl = bet.qyl >= 0 ? Math.floor(bet.qyl) : Math.trunc(bet.qyl);
                bet.t_fh += res[i].q + bet.qyl;
            }

            if( isLucky7_6 && res[i].q > 0 ){
                bet.qyl +=  res[i].q * r.lucky7_6_odds/100;    // 幸运7嬴利(六张牌) lucky7_6_odds:六张牌
                bet.qyl = bet.qyl >= 0 ? Math.floor(bet.qyl) : Math.trunc(bet.qyl);
                bet.t_fh += res[i].q + bet.qyl;
            }

            if( isPerfect &&  res[i].m > 0 ){
                bet.myl +=  res[i].m * r.perfect_pair/100;      // 完美嬴利
                bet.myl = bet.myl >= 0 ? Math.floor(bet.myl) : Math.trunc(bet.myl);
                bet.t_fh += res[i].m + bet.myl;
            }    

            if(isTie){
                bet.zyl = 0;
                bet.xyl = 0;
            }else{
                bet.zyl = bet.zyl == 0 ? -res[i].z : bet.zyl;
                bet.xyl = bet.xyl == 0 ? -res[i].x : bet.xyl;
            }

            bet.hyl = bet.hyl == 0 ? -res[i].h : bet.hyl;
            bet.zdyl = bet.zdyl == 0 ? -res[i].zd : bet.zdyl;
            bet.xdyl = bet.xdyl == 0 ? -res[i].xd : bet.xdyl;
            bet.myl = bet.myl == 0 ? -res[i].m : bet.myl;
            bet.lyl = bet.lyl == 0 ? -res[i].l : bet.lyl;
            bet.kyl = bet.kyl == 0 ? -res[i].k : bet.kyl;
            bet.qyl = bet.qyl == 0 ? -res[i].q : bet.qyl;

            // 三宝洗码量，三宝输钱的话才有
            bet.sb_xml = bet.zdyl < 0 ? res[i].zd : 
                         bet.hyl < 0 ? res[i].h : 
                         bet.xdyl < 0 ? res[i].xd : 
                         bet.lyl < 0 ? res[i].l :
                         bet.kyl < 0 ? res[i].k :
                         bet.qyl < 0 ? res[i].q :
                         bet.myl < 0 ? res[i].m : 0 ;

            // 庄闲洗码量算最后一条，这里先全部填写，后面才统计一把其它条清0
            bet.zx_xml = bet.zyl < 0 ? res[i].z : bet.xyl < 0 ? res[i].x : 0 ;

            // 累加所有人各项盈利(只含真实玩家)
            if(real_player.includes(res[i].userName)){
                all_item_yl.zyl += bet.zyl;
                all_item_yl.xyl += bet.xyl;
                all_item_yl.hyl += bet.hyl;
                all_item_yl.zdyl += bet.zdyl;
                all_item_yl.xdyl += bet.xdyl;
                all_item_yl.myl += bet.myl;
                all_item_yl.lyl += bet.lyl;
                all_item_yl.kyl += bet.kyl;
                all_item_yl.qyl += bet.qyl;
            }

            bet.t_xz = res[i].z + res[i].x + res[i].h + res[i].zd + res[i].xd + res[i].l + res[i].k + res[i].m + res[i].q;
            bet.t_yl = bet.t_fh - bet.t_xz;
            bet.xml_d = bet.zx_xml + bet.sb_xml;
            bet.xml_s = 0;
            bet.xz_yl = bet.zyl + bet.xyl;   // 庄闲洗码量盈亏
            bet.sb_yl = bet.zdyl + bet.hyl + bet.xdyl + bet.lyl + bet.kyl + bet.myl + bet.qyl;  // 三宝盈亏
            bet.id = res[i].Id;
            bet.userId = res[i].userId;
            total_yl += bet.t_yl;

            // 重新开奖只修改结算结果，不改变原局已经确认的有效下注。
            if(msg.is_re_settlement){
                bet.yxxz = Number(res[i].yxxz) || 0;
            // 正常开奖：开和时庄闲有效下注为0。
            }else if(isTie && (res[i].z > 0 || res[i].x > 0)){
                bet.yxxz = 0;
            }else{
                bet.yxxz = bet.t_xz;
            }

            all_bets.push(bet);
        }

        if(res.length > 0){
            // 统计局汇总,因为是没有结算前的,所以要加上各项盈利
            await fill_jc_detail(msg,rInfo,all_item_yl);
         
            // 更新开奖结果
            for(let item of all_bets){
                await userDao.updateResult(msg,item);
            }

            setTimeout(()=>{
                sendToGameFront(rInfo,{type:7 ,msg:{shoe:msg.cc,round:msg.jc,message:"分数表有变化"}});
            },3000);
        }

        // 所有玩家余额和有效下注均成功落库后，立即累计本局积分。
        // 即使重试时已经没有未结算下注，也会检查并补齐 closed=1 的待处理记录。
        // 积分属于可补偿的附加流程，不能阻断开奖记录和路单写入。
        // 即时累计失败时保留待处理状态，由 MoveDataToLogGame 后台任务补偿。
        try {
            const pointResult = await playerDao.updatePointsAfterSettlement(msg, rInfo);
            if (pointResult.err) {
                console.error(
                    "[开奖积分累计失败，等待后台补偿]",
                    pointResult.err.message || pointResult.err
                );
            }
        } catch (pointErr) {
            console.error(
                "[开奖积分累计异常，等待后台补偿]",
                pointErr && pointErr.message ? pointErr.message : pointErr
            );
        }

        if(res.length > 0){
            // 积分完成后再刷新当前营业日汇总，使报表立即读到 gameshist.points。
            let totalResult = await financialInquiriesDao.total_gameshist_day({
                group_nickname: msg.group_nickname || rInfo.group_nickname,
                statistics_date: rInfo.statistics_date
            });
            if (totalResult.err) {
                console.error("开奖后实时汇总失败:", totalResult.err);
            }
        }

        sendToGameFront(rInfo,{type:7 ,msg:{shoe:msg.cc,round:msg.jc,message:"分数表有变化"}});
    }
    return {code:200,msg:"ok"};
}

function sendToGameFront(rInfo,msg) {
    sendToFront.sendNoticeToGameClient(
        rInfo.chat_group_nickname || rInfo.group_nickname,
        msg
    );
};

async function fill_jc_detail(msg,rInfo,all_item_yl){
    msg.statistics_date = rInfo.statistics_date;
    const res = await userDao.getJcTotal(msg);
    if (!res.data || res.data.length === 0 || !res.data[0].group_nickname || !res.data[0].cc) {
        return;
    }

    const numberValue = value => {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    };
    const r = res.data[0];
    const numericFields = [
        'z', 'x', 'h', 'zd', 'xd', 'l', 'k', 'm', 'q',
        'g_z', 'g_x', 'g_h', 'g_zd', 'g_xd', 'g_l', 'g_k', 'g_m', 'g_q'
    ];
    numericFields.forEach(field => {
        r[field] = numberValue(r[field]);
    });

    // 因为查询发生在玩家结算前，所以这里使用本次已计算好的真实玩家盈亏。
    r.z_yl = numberValue(all_item_yl.zyl);
    r.x_yl = numberValue(all_item_yl.xyl);
    r.h_yl = numberValue(all_item_yl.hyl);
    r.zd_yl = numberValue(all_item_yl.zdyl);
    r.xd_yl = numberValue(all_item_yl.xdyl);
    r.l_yl = numberValue(all_item_yl.lyl);
    r.k_yl = numberValue(all_item_yl.kyl);
    r.m_yl = numberValue(all_item_yl.myl);
    r.q_yl = numberValue(all_item_yl.qyl);

    r.tsbl = r.h + r.zd + r.xd + r.m + r.l + r.k + r.q;
    r.sbltyk = -(
        r.h_yl + r.zd_yl + r.xd_yl + r.m_yl +
        r.l_yl + r.k_yl + r.q_yl
    );
    r.sblspyk = 0;

    // 先扣个人占成，再计算庄闲对冲与上盘方向。
    r.zxdc = 0;
    r.spm = '庄';
    const z = Math.max(0, r.z - r.g_z);
    const x = Math.max(0, r.x - r.g_x);
    if (r.z > 0 && r.x > 0) {
        if (z > x) {
            r.zxdc = x;
            r.sp = z - x;
            r.spm = '庄';
        } else {
            r.zxdc = z;
            r.sp = x - z;
            r.spm = '闲';
        }
    } else if (r.z > 0) {
        r.sp = z;
        r.spm = '庄';
    } else {
        r.sp = x;
        r.spm = '闲';
    }

    // 台占只占对冲后的单边余额，并记录到实际方向。
    r.d_z = 0;
    r.d_x = 0;
    if (r.sp > 0) {
        const tabletopRatio = Math.max(
            0,
            numberValue(rInfo.parameter_setup.pb_tabletop_occupies_proportion)
        );
        const tabletopMax = Math.max(
            0,
            numberValue(rInfo.parameter_setup.pb_tabletop_occupies_proportion_max_limit)
        );
        let tabletopBet = Math.floor(tabletopRatio / 100 * r.sp);
        tabletopBet = Math.min(tabletopBet, tabletopMax);
        tabletopBet = Math.min(tabletopBet, r.sp);

        if (r.spm === '庄') r.d_z = tabletopBet;
        else r.d_x = tabletopBet;
        r.sp -= tabletopBet;
    }
    r.tzx = r.d_z + r.d_x;

    const minBetAmount = Math.max(
        0,
        numberValue(rInfo.parameter_setup.pb_min_bet_amount)
    );
    if (r.sp < minBetAmount) {
        r.lt = r.sp;
        r.sp = 0;
    } else {
        const changeSetting = rInfo.parameter_setup.change_settings;
        const unit = changeSetting === '万' ? 10000
            : changeSetting === '千' ? 1000
            : changeSetting === '百' ? 100
            : changeSetting === '十' ? 10
            : 0;
        r.lt = unit > 0 ? r.sp % unit : 0;
        r.sp -= r.lt;
    }

    console.log("=======================r2:=======================",r);
    const yk = settlement_jc_bjl(msg.result_code,rInfo.parameter_setup,r);
    r.zyk = yk.t_yl;
    r.xzyk = yk.t_xzyl;
    r.gyk = yk.g_yl;
    r.ltyk = yk.t_ltyl;
    r.dcyk = yk.t_dcyl;
    r.spzsyk = 0;
    r.xztyk = yk.t_xztyl;
    r.xzspyk = yk.t_xzspyl;
    r.spxm = yk.t_spxm;

    r.group_nickname = msg.group_nickname || rInfo.group_nickname;
    r.cc = msg.cc;
    r.jc = msg.jc;
    r.kj = msg.kj;
    r.statistics_date = rInfo.statistics_date;

    // insertJcTotal 会替换同一营业日、同一靴局的旧汇总，并按差额更新台筹码。
    await userDao.insertJcTotal(r);
    sendToGameFront(rInfo,{type:8 ,msg:"利润汇总有变化"});
}

let settlement_jc_bjl = (result_code,parameter_setup,re) => {
    
    let isBank = parseResult.isBank(result_code);
    let isTie = parseResult.isTie(result_code)
    let isPlayer = parseResult.isPlayer(result_code)
    let isBankPair = parseResult.isBankPair(result_code)
    let isPlayerPair = parseResult.isPlayerPair(result_code)
    let isSmallTiger = parseResult.isSmallTiger(result_code)
    let isBigTiger = parseResult.isBigTiger(result_code)
    let isPerfect = parseResult.isPerfect(result_code)
    let isLucky7_4 = parseResult.isLucky7_4(result_code)
    let isLucky7_5 = parseResult.isLucky7_5(result_code)
    let isLucky7_6 = parseResult.isLucky7_6(result_code)
    const toNumber = value => {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    };
    re = { ...re };
    [
        'z', 'x', 'h', 'zd', 'xd', 'l', 'k', 'm', 'q',
        'g_z', 'g_x', 'd_z', 'd_x', 'zxdc', 'lt', 'sp'
    ].forEach(field => {
        re[field] = toNumber(re[field]);
    });
    const r = { ...parameter_setup };
    [
        'banker_odds', 'player_odds', 'tie_odds', 'pair_odds',
        'lucky_6_2_odds', 'lucky_6_3_odds', 'perfect_pair',
        'lucky7_4_odds', 'lucky7_5_odds', 'lucky7_6_odds'
    ].forEach(field => {
        r[field] = toNumber(r[field]);
    });

    // 注意： 现在有个占和台占都只针对庄闲
    let bet = {
        t_yl:0,          // 总盈利
        t_xzyl:0,        // 闲庄盈利
        g_yl:0,          // 个盈利
        t_dcyl:0,        // 对冲盈利
        t_ltyl:0,        // 零头盈利
        t_xzspyl:0,      // 闲庄上盘盈利
        t_xztyl:0,       // 闲庄台盈利
        t_spzsyl:0,      // 上盘抽水盈利 
        t_spxm:0,        // 上盘洗码

        t_fh:0,          // 总返还
        g_fh:0,          // 个返还
        xz_fh:0,         // 闲庄返还
        dc_fh:0,         // 对冲返还
        lt_fh:0,         // 零头返还 
        xzt_fh:0,        // 闲庄台返还
        xzspyl_fh:0      // 闲庄上盘返还
    };    

    // 上盘买庄开闲，或上盘买闲开庄时，输掉的上盘金额计入洗码。
    // 该计算不能依赖 re.z/re.x 是否大于0，否则单边下注时会漏算。
    if(re.sp > 0 && ((re.spm == '庄' && isPlayer) || (re.spm == '闲' && isBank))){
        bet.t_spxm = re.sp;
    }

    if( isBank ){
        bet.t_fh += re.z + re.z * r.banker_odds/100;      
        bet.g_fh += re.g_z + re.g_z * r.banker_odds/100;    
        bet.xz_fh += re.z + re.z * r.banker_odds/100;  
        bet.dc_fh += re.zxdc + re.zxdc * r.banker_odds/100; 
        bet.xzt_fh += re.d_z + re.d_z * r.banker_odds/100;
        if(re.spm == '庄'){   // 如果上盘买庄
            bet.xzspyl_fh += re.sp + re.sp * r.banker_odds/100;
            bet.lt_fh += re.lt + re.lt * r.banker_odds/100;             // 零头返
            // bet.t_spzsyl += re.sp * (1 - r.banker_odds/100)          // 上盘抽水盈利,不关平台
        }
    }    

    if( isTie ){
        bet.t_fh += re.h + re.h * r.tie_odds/100 + re.z + re.x;      
        bet.g_fh += re.g_z + re.g_x;   
        bet.xz_fh += re.z + re.x;  
        bet.dc_fh += re.zxdc * 2;    // 因为对冲是庄闲都是一个数
        bet.lt_fh += re.lt;
        bet.xzt_fh += re.d_z + re.d_x;
        bet.xzspyl_fh += re.sp;
    }
    
    if( isPlayer &&  re.x > 0 ){
        bet.t_fh +=  re.x + re.x * r.player_odds/100;    
        bet.g_fh +=  re.g_x + re.g_x * r.player_odds/100;    
        bet.xz_fh += re.x + re.x * r.player_odds/100;   
        bet.dc_fh += re.zxdc + re.zxdc * r.player_odds/100;  
        bet.xzt_fh += re.d_x + re.d_x * r.player_odds/100;
        if(re.spm == '闲'){
            bet.lt_fh += re.lt + re.lt * r.player_odds/100;   
            bet.xzspyl_fh += re.sp + re.sp * r.player_odds/100;
            console.log("xzspyl_fh:",bet.xzspyl_fh)
        }
    }    

    if( isBankPair &&  re.zd > 0 ){
        bet.t_fh +=  re.zd + re.zd * r.pair_odds/100;     
    }    

    if( isPlayerPair &&  re.xd > 0 ){
        bet.t_fh += re.xd + re.xd * r.pair_odds/100;
    }    
        
    // 汇总与玩家结算一致：同一笔 l 下注按两张/三张牌赔率返还。
    if( (isSmallTiger || isBigTiger) && re.l > 0 ){
        const lucky6Odds = isBigTiger ? r.lucky_6_3_odds : r.lucky_6_2_odds;
        bet.t_fh += re.l + re.l * lucky6Odds/100;
    }    

    if( isBigTiger && re.k > 0 ){
        bet.t_fh += re.k + re.k * r.lucky_6_3_odds/100;
    }    

    if(isLucky7_4 && re.q > 0){
        bet.t_fh += re.q + re.q * r.lucky7_4_odds/100;
    }

    if(isLucky7_5 && re.q > 0){
        bet.t_fh += re.q + re.q * r.lucky7_5_odds/100;
    }

    if(isLucky7_6 && re.q > 0){
        bet.t_fh += re.q + re.q * r.lucky7_6_odds/100;
    }

    if( isPerfect &&  re.m > 0 ){
        bet.t_fh +=  re.m + re.m * r.perfect_pair/100;     
        //bet.g_fh += re.g_m +  re.g_m * r.perfect_pair/100;   
    }    

    // 总下注
    bet.t_xz = re.z + re.x + re.h + re.zd + re.xd + re.l + re.m + re.q + re.k;
    // 个下注和台下注(当前版本只算庄闲)
    bet.g_xz = re.g_z + re.g_x;   // + re.g_h + re.g_zd + re.g_xd + re.g_l + re.g_m + re.g_q;

    // 盈亏都是反过来，因为是针对平台 
    bet.t_yl = -Math.floor(bet.t_fh - bet.t_xz);
    bet.g_yl = -Math.floor(bet.g_fh - bet.g_xz);         // 个占盈亏也是反过来  
    bet.t_xzyl = -Math.floor(bet.xz_fh - (re.z + re.x));
    bet.t_dcyl = Math.floor(re.zxdc*2 - bet.dc_fh);      // 对冲盈亏是针对平台
    bet.t_ltyl = -Math.floor(bet.lt_fh - re.lt);         // 零头盈亏也是反过来,因为是针对平台   
    const tabletopBet = re.d_x + re.d_z;
    bet.t_xztyl = -Math.floor(bet.xzt_fh - tabletopBet);    // 台盈亏也是反过来
    bet.t_xzspyl = Math.floor(bet.xzspyl_fh - re.sp);    // 闲庄上盘返还
    return bet;
}
