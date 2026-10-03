let pomelo = require('pomelo');
const GMResponse = require('../GMResponse');
const redlock = pomelo.app.get('redlock');
let userDao = require('../../dao/userDao');  
let playerDao = require('../../dao/playerDao');  
let systemDao = require('../../dao/systemDao');
let logger = require('pomelo-logger').getLogger('my-log', __filename);
const GAMESTATE = require('../../util/gameMsg');
const CODE = require('../../util/code').GAME;
let parseResult = require('./parseResult');
const sendToFront = require('./sendToFrontEnd');
const e = require('express');

module.exports = {
    tempBetCache: {},
    pendingImportNotices: {},

    doBet: async function(msg, rInfo, strTempBet, areaNum, redis, cb) {
        // opt.js 提前发现的错误不立即提示，暂存到导表阶段统一发送。
        // 提示入队不参与下注锁，避免锁竞争导致提示丢失。
        if (msg.deferredImportNotice) {
            const tableId = rInfo.Id;
            if (!this.pendingImportNotices[tableId]) {
                this.pendingImportNotices[tableId] = [];
            }
            const pendingNotice = {
                msgId: msg.msgId,
                msg: String(msg.deferredImportNotice)
            };
            const alreadyQueued = this.pendingImportNotices[tableId].some(
                item =>
                    String(item.msgId) === String(pendingNotice.msgId) &&
                    item.msg === pendingNotice.msg
            );
            if (!alreadyQueued) {
                this.pendingImportNotices[tableId].push(pendingNotice);
            }
            console.log(
                (alreadyQueued ? "[跳过重复导表提示] tableId=" : "[导表提示入队] tableId=") + tableId +
                ", msgId=" + msg.msgId +
                ", msg=" + msg.deferredImportNotice
            );
            cb(new GMResponse("200", rInfo.rType, rInfo.Id, "提示已加入导表队列"));
            return;
        }

        const lock = await redlock.lock("doBet:" + msg.username, 2000);
        //try {
            let msgBet = msg.bet;
            let data = { bet: msgBet };

            // 同一局可能发送多张停止下注图片，第一张之后的下注不能立即丢弃。
            // 先统一进入缓存，flushBetsToDb 再按最后一张停止图片的 msgId 过滤。

            // ✅ 【仅保留】空值检查
            if (msg.bet == '') {
                lock.unlock();
                cb(new GMResponse(CODE.BET_FAULT.code, rInfo.rType, rInfo.Id, CODE.BET_FAULT.msg, data));
                return;
            }

            // ✅ 【删除】所有其他检查，改为先获取用户信息并缓存
            let user = await userDao.getUserByName(msg.username);
            user = user.data;
            
            // ✅ 如果用户不存在，提示但不缓存
            if (!user) {
                lock.unlock();
                console.error("用户不存在:", msg.username);
                cb(new GMResponse(CODE.NO_USER.code, rInfo.rType, rInfo.Id, CODE.NO_USER.msg, data));
                return;
            }

            msg.userId = user.Id;
            msg.xzmx = msg.bet;
            // 保留客户发来的原始下注字串，供失败缓存和后续重试使用。
            msg.originalXzmx = msg.bet;

            msg.bet = parseResult.parseBetStrToArray(msg.bet);
            console.log(
                "解析后的首个下注类型:",
                Array.isArray(msg.bet) && msg.bet[0]
                    ? msg.bet[0].type
                    : null
            );

            /*
            * 处理“改注”和“撤销”控制命令。
            */
            if (
                Array.isArray(msg.bet) &&
                msg.bet.length > 0 &&
                (
                    msg.bet[0].type === "改" ||
                    msg.bet[0].type === "撤销"
                )
            ) {
                const operationType = msg.bet[0].type;

                // “撤z / 撤xd / C和”等带玩法的撤销，只删除指定类型。
                // 和改单一样，撤销也必须等导表时按最终停止下注线判定。
                if (operationType === "撤销" && msg.bet.length > 1) {
                    const cancelTargets = msg.bet.slice(1);
                    const cancellationKeys = this.getCancellationKeysFromBetArray(cancelTargets);

                    if (cancellationKeys.length === 0) {
                        lock.unlock();
                        cb(new GMResponse(
                            CODE.BET_FAULT.code,
                            rInfo.rType,
                            rInfo.Id,
                            "撤销类型不正确",
                            data
                        ));
                        return;
                    }

                    msg.cancelBetKeysBeforeImport = cancellationKeys;
                    msg.controlOperation = "撤销指定类型";
                    msg.bet = [];
                }

                // 单独“撤 / 撤销 / C”是整单撤销，作为清空边界缓存。
                if (operationType === "撤销" && msg.bet.length === 1) {
                    msg.clearAllBeforeImport = true;
                    msg.controlOperation = "整单撤销";
                    msg.bet = [];
                }

                /*
                 * 改单不能在收到消息时立即删除旧注。
                 * 同一局可能有多张停止下注图，只有导表时才能按
                 * 最终 lastStopMsgId 确认该改单是否在有效时间窗内。
                 */
                if (operationType === "改") {
                    msg.clearAllBeforeImport = true;
                    msg.controlOperation = "改单";
                    msg.bet = msg.bet.slice(1);
                }
            }
           
            // ✅ 标记梭哈信息
            msg.hasSuo = msg.bet.some(b => String(b.type).indexOf('梭') !== -1);
            console.log("[梭哈标记] userId=" + user.Id + ", hasSuo=" + msg.hasSuo);

            console.log("解析后的下注命令:",msg.bet);

            // ✅ 计算总下注金额
            let totalbet = this.GetTotalBet(msg.bet, areaNum);

            // ✅ 构建缓存消息
            msg.xz = totalbet;
            msg.userId = user.Id;
            msg.rType = rInfo.rType;
            msg.roomId = rInfo.Id;
            msg.roomName = rInfo.roomName;
            msg.loginip = user.loginip;
            msg.yxxz = 0;
            msg.gx = user.gx;
            msg.reference_name = user.reference_name;
            msg.terminal = user.terminal;
            msg.xm_type = user.xm_type == 0 ? "双边":"单边";
            msg.g_zx = 0;
            msg.g_yl = 0;
            msg.ye = user.score;
            msg.statistics_date = rInfo.statistics_date;

            // cc、jc 不在下注时写入缓存，避免修改上一局开奖结果期间
            // 把下注错误地记录到被修改的局数。这里只用于记录日志。
            const currentBetJc = rInfo.quick_mode === 1
                ? rInfo.quickModeJc
                : rInfo.jc;
            let cs = rInfo.cc + "-" + currentBetJc;

            // ✅ 存入内存缓存（使用 userId 作为键）
            const tableId = rInfo.Id;
            if (!this.tempBetCache[tableId]) {
                this.tempBetCache[tableId] = {};
            }
            if (!this.tempBetCache[tableId][msg.userId]) {
                this.tempBetCache[tableId][msg.userId] = [];
            }

            // 客户端消息可能自带 cc、jc，缓存时也必须明确排除。
            // 本条下注实际所属的场次、局次由 flushBetsToDb 导表时统一确定。
            const cacheMsg = { ...msg };
            delete cacheMsg.cc;
            delete cacheMsg.jc;

            this.tempBetCache[tableId][msg.userId].push({
                ...cacheMsg,
                cachedAt: Date.now()
            });

            console.log("[内存缓存] 下注已存入：tableId=" + tableId + ", userId=" + msg.userId + ", msgId=" + msg.msgId + ", 缓存数量=" + this.tempBetCache[tableId][msg.userId].length);

            lock.unlock();
            // ✅ 直接返回缓存成功
            cb(new GMResponse(CODE.BET_SUCCESS.code, rInfo.rType, rInfo.Id, CODE.BET_SUCCESS.msg, data));
            
            if (user.is_hide == 1 && user.score > 0) {
                let obj = {
                    is_hide: 0,
                    group_nickname: msg.group_nickname,
                    name: msg.username,
                }
                playerDao.hidePlayer(obj);
                console.log("====================>选手显示成功:",msg.username );
                sendToFront.sendNoticeToClient(rInfo.chat_group_nickname, { type: 1, msg: msg.username + "隐藏选手显示成功" });
                sendToFront.sendNoticeToGameClient("all#", {type:9});
            }

            logger.info("dobet={userId:" + msg.userId + "," + "cc:" + cs + "," + "bet:" + msg.xzmx + ",gameType:" + rInfo.rType + ",result:内存缓存成功}");
        // } catch(err){
        //     lock.unlock();
        //     console.log("err:",JSON.stringify(err));
        //     cb(new GMResponse(CODE.BET_FAULT.code,rInfo.rType,rInfo.Id, CODE.BET_FAULT.msg,data));
        //     logger.error("dobet err=" + JSON.stringify(err));
        // }    
    },


    // 一个投注项会覆盖哪些旧类型。庄、闲共用 zx；组合梭哈会覆盖其包含的所有单项。
    getBetReplacementKeys: function(type) {
        const map = {
            '庄': ['zx'], '闲': ['zx'], '庄梭': ['zx'], '闲梭': ['zx'],
            '和': ['h'], '和梭': ['h'],
            '庄对': ['zd'], '庄对梭': ['zd'],
            '闲对': ['xd'], '闲对梭': ['xd'],
            '小老虎': ['l'], '小老虎梭': ['l'],
            '大老虎': ['k'], '大老虎梭': ['k'],
            '幸运七': ['q'], '幸运七梭': ['q'],
            '完美': ['m'], '完美梭': ['m'],
            '对子梭': ['zd', 'xd'],
            '老虎梭': ['l', 'k'],
            '三宝梭': ['zd', 'xd', 'h'],
            '四宝梭': ['zd', 'xd', 'h', 'm'],
            // 兼容解析器尚未转为中文的短码
            'zds': ['zd'], 'xds': ['xd'],
            'qs': ['q'], 'ms': ['m'],
            'ds': ['zd', 'xd'], 'n': ['l', 'k'],
            'sbs': ['zd', 'xd', 'h'], 'bbs': ['zd', 'xd', 'h', 'm']
        };
        return map[String(type || '')] || [];
    },

    // 撤销使用精确玩法键：撤庄只删庄，不会把闲一起删除。
    getBetCancellationKeys: function(type) {
        const map = {
            '庄': ['z'], '庄梭': ['z'],
            '闲': ['x'], '闲梭': ['x'],
            '和': ['h'], '和梭': ['h'],
            '庄对': ['zd'], '庄对梭': ['zd'],
            '闲对': ['xd'], '闲对梭': ['xd'],
            '小老虎': ['l'], '小老虎梭': ['l'],
            '大老虎': ['k'], '大老虎梭': ['k'],
            '幸运七': ['q'], '幸运七梭': ['q'],
            '完美': ['m'], '完美梭': ['m'],
            '对子': ['zd', 'xd'], '对子梭': ['zd', 'xd'],
            '老虎梭': ['l', 'k'],
            '三宝': ['zd', 'xd', 'h'], '三宝梭': ['zd', 'xd', 'h'],
            '四宝': ['zd', 'xd', 'h', 'm'], '四宝梭': ['zd', 'xd', 'h', 'm']
        };
        return map[String(type || '')] || [];
    },

    getCancellationKeysFromBetArray: function(betArray) {
        const keys = new Set();
        for (const item of (Array.isArray(betArray) ? betArray : [])) {
            for (const key of this.getBetCancellationKeys(item && item.type)) keys.add(key);
        }
        return Array.from(keys);
    },

    getReplacementKeysFromBetArray: function(betArray) {
        const keys = new Set();
        for (const item of (Array.isArray(betArray) ? betArray : [])) {
            for (const key of this.getBetReplacementKeys(item && item.type)) keys.add(key);
        }
        return Array.from(keys);
    },

    // 当前一条消息内，同类型也只保留最后出现的一项。
    keepLastBetPerType: function(betArray) {
        if (!Array.isArray(betArray)) return [];
        const seen = new Set();
        const keptReverse = [];

        for (let i = betArray.length - 1; i >= 0; i--) {
            const item = betArray[i];
            const keys = this.getBetReplacementKeys(item && item.type);
            if (keys.length === 0) {
                keptReverse.push(item);
                continue;
            }
            if (!this.canBetItemReplacePrevious(item)) {
                keptReverse.push(item);
                continue;
            }
            if (keys.some(key => seen.has(key))) continue;
            keys.forEach(key => seen.add(key));
            keptReverse.push(item);
        }
        return keptReverse.reverse();
    },

    // 无金额或非正金额的普通下注只用于逐项提示，不能覆盖前面的有效下注。
    // 梭哈不显式带金额，仍属于有效的覆盖指令。
    canBetItemReplacePrevious: function(item) {
        if (!item || !item.type) return false;
        if (String(item.type).indexOf('梭') !== -1) return true;
        const amount = Number(item.amount);
        return Number.isFinite(amount) && amount > 0;
    },

    // 导入数据库前，按 msgId 顺序只保留每种类型最后出现的一项。
    // 遇到有效改单时，改单之前的缓存注单全部作废。
    // 只处理本次准备导入的缓存快照，不会在收到下注时提前删除缓存。
    prepareLatestBetsForFlush: function(betList) {
        if (!Array.isArray(betList)) return [];

        const seen = new Set();
        const resultReverse = [];

        for (let i = betList.length - 1; i >= 0; i--) {
            const betMsg = betList[i];
            if (!betMsg || !Array.isArray(betMsg.bet)) continue;

            const keptItemsReverse = [];

            for (let j = betMsg.bet.length - 1; j >= 0; j--) {
                const item = betMsg.bet[j];
                const keys = this.getBetReplacementKeys(item && item.type);
                const canReplacePrevious = this.canBetItemReplacePrevious(item);

                if (
                    canReplacePrevious &&
                    keys.length > 0 &&
                    keys.some(key => seen.has(key))
                ) {
                    continue;
                }

                if (canReplacePrevious) {
                    keys.forEach(key => seen.add(key));
                }
                keptItemsReverse.push({ ...item });
            }

            const keptItems = keptItemsReverse.reverse();
            if (keptItems.length === 0) {
                // 空解析结果仍须保留到导表阶段，届时统一提示格式错误。
                if (
                    betMsg.bet.length === 0 ||
                    betMsg.clearAllBeforeImport === true
                ) {
                    resultReverse.push({
                        ...betMsg,
                        originalXzmx: betMsg.originalXzmx || betMsg.xzmx,
                        bet: [],
                        xz: 0,
                        xzmx: "",
                        hasSuo: false
                    });
                }
                if (betMsg.clearAllBeforeImport) {
                    break;
                }
                continue;
            }

            resultReverse.push({
                ...betMsg,
                // 兼容服务更新前已经存在的缓存数据。
                originalXzmx: betMsg.originalXzmx || betMsg.xzmx,
                bet: keptItems,
                xz: keptItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
                xzmx: keptItems.map(item => String(item.type) + String(Number(item.amount) || 0)).join(''),
                hasSuo: keptItems.some(item => String(item.type || '').indexOf('梭') !== -1)
            });

            if (betMsg.clearAllBeforeImport) {
                break;
            }
        }

        return resultReverse.reverse();
    },

    // 仅在导入单项之前，删除数据库中同类型旧注并退款。
    removeDbDuplicateBeforeImport: async function(userId, betMsg, betItem, rInfo) {
        const replacementKeys = this.getBetReplacementKeys(betItem && betItem.type);

        if (replacementKeys.length === 0) {
            return { err: null, data: { refund: 0, deletedIds: [] } };
        }

        return await userDao.removeExistingBetTypes({
            userId: Number(userId),
            roomId: betMsg.roomId || rInfo.Id,
            rType: betMsg.rType || rInfo.rType,
            cc: betMsg.cc !== undefined ? betMsg.cc : rInfo.cc,
            jc: betMsg.jc !== undefined
                ? betMsg.jc
                : (rInfo.quick_mode === 1 ? rInfo.quickModeJc : rInfo.jc),
            group_nickname: betMsg.group_nickname || rInfo.group_nickname,
            statistics_date: betMsg.statistics_date || rInfo.statistics_date,
            replacementKeys
        });
    },

    // 从缓存中精确移除指定类型。组合梭哈只标记被撤销的子类型，
    // 导入时仍按原组合比例计算其余部分。
    removeBetTypesFromCache: function(tableId, userId, replacementKeys) {
        if (!this.tempBetCache[tableId] || !this.tempBetCache[tableId][userId]) {
            return;
        }

        const betList = this.tempBetCache[tableId][userId];
        const keySet = new Set(replacementKeys || []);
        let removedItemCount = 0;

        for (let i = betList.length - 1; i >= 0; i--) {
            const betMsg = betList[i];
            if (!betMsg || !Array.isArray(betMsg.bet)) continue;

            const remaining = [];
            for (const item of betMsg.bet) {
                const alreadyCancelled = new Set(
                    Array.isArray(item && item.cancelledBetKeys)
                        ? item.cancelledBetKeys
                        : []
                );
                const activeItemKeys = this
                    .getBetCancellationKeys(item && item.type)
                    .filter(key => !alreadyCancelled.has(key));
                const keysToCancel = activeItemKeys.filter(key => keySet.has(key));

                if (keysToCancel.length === 0) {
                    remaining.push(item);
                    continue;
                }

                removedItemCount += keysToCancel.length;
                if (keysToCancel.length < activeItemKeys.length) {
                    keysToCancel.forEach(key => alreadyCancelled.add(key));
                    remaining.push({
                        ...item,
                        cancelledBetKeys: Array.from(alreadyCancelled)
                    });
                }
            }

            if (remaining.length === 0) {
                betList.splice(i, 1);
            } else if (remaining.length !== betMsg.bet.length) {
                betMsg.bet = remaining;
                betMsg.xz = remaining.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                betMsg.xzmx = remaining.map(item => String(item.type) + String(Number(item.amount) || 0)).join('');
                betMsg.hasSuo = remaining.some(item => String(item.type).indexOf('梭') !== -1);
            }
        }

        console.log("[内存缓存] 精确移除同类型旧注项目数=" + removedItemCount);
    },

    // ✅ 新增：清除指定 tableId 和 userId 的缓存下注
    clearUserBetCacheForTable: function(tableId, userId) {
        if (this.tempBetCache[tableId] && this.tempBetCache[tableId][userId]) {
            const count = this.tempBetCache[tableId][userId].length;
            delete this.tempBetCache[tableId][userId];
            console.log("[清除缓存] tableId=" + tableId + ", userId=" + userId + ", 清除缓存数量=" + count);
        }
    },

    // 停止下注后批量入库：
    // 重复下注只在正式导入过程中逐项判断，不在停止下注后额外清理。
    // 1. 成功入库的下注从缓存删除
    // 2. 未成功的下注继续保留
    // 3. 如果整桌全部成功，删除整桌缓存
    // 4. 开奖时再统一强制删除整桌缓存
  flushBetsToDb: async function (tableId, rInfo) {
    const getOriginalBetText = betMsg => String(
        (betMsg && (betMsg.originalXzmx || betMsg.xzmx)) || ""
    );
    const noticeChannelName =
        rInfo.chat_group_nickname || rInfo.group_nickname;

    // 本次导入的相同提示只发送一次；下一次导入会重新允许提示。
    const sentImportNotices = new Set();
    const sendImportNotice = notice => {
        const noticeKey =
            String(notice && notice.type) + "|" +
            String(notice && notice.msg ? notice.msg : "");
        if (sentImportNotices.has(noticeKey)) {
            console.log(
                "[本次导入跳过重复提示] tableId=" + tableId +
                ", msg=" + (notice && notice.msg ? notice.msg : "")
            );
            return false;
        }
        sentImportNotices.add(noticeKey);
        sendToFront.sendNoticeToClient(noticeChannelName, notice);
        return true;
    };

    // 只取走导表开始前已经入队的提示。本批提示发送一次后即消费，
    // 避免前端重复调用导表接口时不断重放同一条消息。
    // 删除动作必须在发送前完成；发送过程中若有新提示入队，会进入新的数组，
    // 留待下一次导表发送，不会被本次误删。
    const pendingNotices = this.pendingImportNotices[tableId] || [];
    if (this.pendingImportNotices[tableId]) {
        delete this.pendingImportNotices[tableId];
    }
    console.log(
        "[导表提示发送] tableId=" + tableId +
        ", channel=" + noticeChannelName +
        ", count=" + pendingNotices.length
    );
    for (const notice of pendingNotices) {
        sendImportNotice({ type: 1, msg: notice.msg });
    }

    const tableCache = this.tempBetCache[tableId];

    if (
        !tableCache ||
        Object.keys(tableCache).length === 0
    ) {
        console.log(
            "[批量入库] tableId=" +
            tableId +
            " 无缓存下注"
        );

        return {
            code: 200,
            count: 0,
            retainedCount: 0,
            warnings: [],
            errors: []
        };
    }

    /*
     * 在导表开始时固定本次下注所属的场次、局次。
     * 必须在第一个 await 之前完成，确保导表过程中新增的下注
     * 不会被误归入本次导表。
     */
    const flushCc = Number(rInfo.cc);
    const flushJc = Number(
        rInfo.quick_mode === 1
            ? rInfo.quickModeJc
            : rInfo.jc
    );

    /*
     * 保存本次开始导表时的缓存快照。
     * 导表过程中新增的下注不会丢失。
     */
    const processingCache = {};

    for (
        const [userId, betList]
        of Object.entries(tableCache)
    ) {
        const processingList =
            Array.isArray(betList)
                ? [...betList]
                : [];

        /*
         * 修改快照中原下注对象的 cc、jc，保留对象引用不变。
         * 后续依赖对象引用区分原缓存与导表期间新增下注，
         * 因此这里不能把每条下注复制成新对象。
         */
        for (const betMsg of processingList) {
            if (!betMsg) {
                continue;
            }

            betMsg.cc = flushCc;
            betMsg.jc = flushJc;
        }

        processingCache[userId] =
            processingList;
    }

    console.log(
        "[批量入库局数确认] tableId=" +
        tableId +
        ", cc=" +
        flushCc +
        ", jc=" +
        flushJc
    );

    const sortedBetsByUser = {};
    const failedBetsByUser = {};
    const userIdSet = new Set();

    /*
     * 按玩家整理下注，并按 msgId 排序。
     */
    for (
        const [userId, betList]
        of Object.entries(processingCache)
    ) {
        const userKey = String(userId);
        const validBets = [];

        userIdSet.add(userKey);

        for (const betMsg of betList) {
            if (
                betMsg &&
                betMsg.msgId !== undefined &&
                betMsg.msgId !== null &&
                betMsg.msgId !== ""
            ) {
                validBets.push(betMsg);
            } else {
                /*
                 * 没有 msgId 的下注无法判断时间，
                 * 单独保留在失败缓存。
                 */
                if (!failedBetsByUser[userKey]) {
                    failedBetsByUser[userKey] = [];
                }

                failedBetsByUser[userKey].push(
                    betMsg
                );
            }
        }

        validBets.sort((a, b) => {
            try {
                const msgIdA =
                    BigInt(a.msgId || 0);

                const msgIdB =
                    BigInt(b.msgId || 0);

                if (msgIdA < msgIdB) {
                    return -1;
                }

                if (msgIdA > msgIdB) {
                    return 1;
                }

                return 0;
            } catch (err) {
                console.error(
                    "[下注排序异常] userId=" +
                    userKey +
                    ", error=" +
                    err.message
                );

                return 0;
            }
        });

        sortedBetsByUser[userKey] =
            validBets;
    }

    /*
     * 查询玩家资料。
     */
    const userMap = {};
    const userIdArray =
        Array.from(userIdSet);

    try {
        const usersRes =
            await userDao.getUserByIds(
                userIdArray
            );

        if (
            usersRes &&
            Array.isArray(usersRes.data)
        ) {
            for (const user of usersRes.data) {
                userMap[String(user.Id)] =
                    user;
            }
        }
    } catch (err) {
        console.error(
            "[批量查询用户失败] " +
            err.message
        );

        /*
         * 批量查询失败时逐个查询。
         */
        for (const userId of userIdArray) {
            try {
                const userRes =
                    await userDao.getUserById(
                        userId
                    );

                if (
                    userRes &&
                    userRes.data
                ) {
                    userMap[String(userId)] =
                        userRes.data;
                }
            } catch (queryErr) {
                console.error(
                    "[查询用户失败] userId=" +
                    userId +
                    ", error=" +
                    queryErr.message
                );
            }
        }
    }

    let totalCount = 0;
    let retainedCount = 0;

    const errorList = [];
    const warnings = [];
    const scoreDeductMap = {};
    const successfulUsers = [];
    const retainedUsers = [];

    /*
     * 单独保留一个失败的下注项目。
     *
     * 注意：
     * 这里保留的是：
     *
     * [
     *   { type: "闲", amount: 300 }
     * ]
     *
     * 不会重新保留原始的：
     *
     * [
     *   { type: "庄", amount: 600 },
     *   { type: "闲", amount: 300 }
     * ]
     */
    const retainBetItem = (
        userId,
        originalBetMsg,
        betItem
    ) => {
        const userKey = String(userId);

        if (!failedBetsByUser[userKey]) {
            failedBetsByUser[userKey] = [];
        }

        const amount =
            Number(betItem.amount) || 0;

        const originalXzmx = String(
            originalBetMsg.originalXzmx ||
            originalBetMsg.xzmx ||
            (String(betItem.type) + String(amount))
        );

        const retainedMsg = {
            ...originalBetMsg,

            bet: [
                {
                    ...betItem,
                    amount
                }
            ],

            xz: amount,

            /*
             * 失败缓存只保留当前项目。
             */
            // xzmx 保留客户最初发来的完整字串。
            xzmx: originalXzmx,
            originalXzmx: originalXzmx,

            /*
             * 梭哈已经换算成实际金额后，
             * 重试时不能再重新梭一次。
             */
            hasSuo: false,

            retainedAt: Date.now()
        };

        failedBetsByUser[userKey].push(
            retainedMsg
        );

        retainedCount++;
    };

    /*
     * 整条原始消息保留。
     * 仅用于尚未进入逐项处理的异常情况。
     */
    const retainOriginalBet = (
        userId,
        betMsg
    ) => {
        const userKey = String(userId);

        if (!failedBetsByUser[userKey]) {
            failedBetsByUser[userKey] = [];
        }

        failedBetsByUser[userKey].push(
            betMsg
        );

        retainedCount++;
    };

    try {
        for (
            const [userId, betList]
            of Object.entries(
                sortedBetsByUser
            )
        ) {
            const userKey =
                String(userId);

            const baseUser =
                userMap[userKey];

            /*
             * 玩家不存在时，保留该玩家所有下注。
             */
            if (!baseUser) {
                // 缓存中的重复类型只在正式导入时判断并过滤。
                const importBetList = this.prepareLatestBetsForFlush(betList);

                for (const betMsg of importBetList) {
                    retainOriginalBet(
                        userKey,
                        betMsg
                    );
                }

                errorList.push({
                    userId: userKey,
                    error: "用户不存在"
                });

                retainedUsers.push(
                    userKey
                );

                console.error(
                    "[批量入库] 用户不存在，保留缓存: userId=" +
                    userKey
                );

                sendImportNotice(
                    {
                        type: 1,
                        msg:
                            "选手ID " +
                            userKey +
                            " 不存在，请检查群管备注"
                    }
                );

                continue;
            }

            const userName =
                baseUser.username ||
                "未知用户";

            /*
             * 必须先按开始下注和最后一张停止下注图片过滤时间窗口，
             * 再按投注槽位保留最后一注。
             * 否则截止前的有效下注可能被截止后的同类型下注覆盖后一起丢失。
             */
            const timeValidBetList = [];

            for (const betMsg of betList) {
                const originalBetText = getOriginalBetText(betMsg);
                let msgId;

                try {
                    msgId = BigInt(betMsg.msgId);
                } catch (msgIdErr) {
                    warnings.push({
                        userId: userKey,
                        userName,
                        bet: originalBetText,
                        reason: "消息ID无效"
                    });
                    continue;
                }

                const afterStop =
                    rInfo.lastStopMsgId &&
                    BigInt(rInfo.lastStopMsgId) < msgId;

                const beforeStart =
                    rInfo.startMsgId &&
                    BigInt(rInfo.startMsgId) > msgId;

                if (afterStop || beforeStart) {
                    const warnMsg =
                        userName +
                        " 非下注时间不能下注，下注命令：" +
                        originalBetText;

                    sendImportNotice(
                        {
                            type: 1,
                            msg: warnMsg
                        }
                    );

                    warnings.push({
                        userId: userKey,
                        userName,
                        bet: originalBetText,
                        reason: "非下注时间"
                    });
                    continue;
                }

                timeValidBetList.push(betMsg);
            }

            /*
             * 例如先下 zs、后下 x100：庄梭和闲都属于 zx 槽位，
             * 最终只导入有效时间窗口内最后出现的一注。
             */
            const importBetList = this.prepareLatestBetsForFlush(timeValidBetList);

            let userLock = null;

            /*
             * 同一个玩家可能同时在不同台桌导表。
             */
            try {
                userLock =
                    await redlock.lock(
                        "flushBet:user:" +
                        userKey,
                        30000
                    );
            } catch (lockErr) {
                console.error(
                    "[玩家导表加锁失败] userId=" +
                    userKey +
                    ", error=" +
                    lockErr.message
                );

                for (const betMsg of importBetList) {
                    retainOriginalBet(
                        userKey,
                        betMsg
                    );
                }

                errorList.push({
                    userId: userKey,
                    userName:
                        baseUser.username,
                    error:
                        "玩家正在其他台桌导表"
                });

                retainedUsers.push(
                    userKey
                );

                continue;
            }

            let userSuccessCount = 0;
            let userFailedCount = 0;
            let userTotalBet = 0;

            try {
                console.log(
                    "[用户导表开始] userId=" +
                    userKey +
                    ", userName=" +
                    userName +
                    ", 消息数=" +
                    importBetList.length
                );

                for (const betMsg of importBetList) {
                    const originalBetText = getOriginalBetText(betMsg);
                    /*
                     * 先检查消息格式。
                     */
                    if (
                        /\s/.test(
                            String(
                                betMsg.xzmx || ""
                            )
                        )
                    ) {
                        const warnMsg =
                            userName +
                            " 下注命令格式不正确：" +
                            originalBetText;

                        sendImportNotice(
                            {
                                type: 1,
                                msg: warnMsg
                            }
                        );

                        warnings.push({
                            userId: userKey,
                            userName,
                            bet: originalBetText,
                            reason: "格式不正确"
                        });

                        retainOriginalBet(userKey, betMsg);
                        continue;
                    }

                    let finalBet =
                        Array.isArray(betMsg.bet)
                            ? betMsg.bet.map(
                                item => ({
                                    ...item
                                })
                            )
                            : [];

                    const invalidTypeBets = finalBet.filter(
                        item => !item || !item.type
                    );
                    const validTypeBets = finalBet.filter(
                        item => item && item.type
                    );
                    const isValidBet = validTypeBets.length > 0;

                    const deferredCancelKeys =
                        Array.isArray(betMsg.cancelBetKeysBeforeImport)
                            ? betMsg.cancelBetKeysBeforeImport
                            : [];

                    const isDeferredControl =
                        betMsg.clearAllBeforeImport === true ||
                        deferredCancelKeys.length > 0;

                    const isControlOnly =
                        isDeferredControl &&
                        finalBet.length === 0;

                    if (!isValidBet && !isControlOnly) {
                        const warnMsg =
                            userName +
                            " 下注命令格式不正确：" +
                            originalBetText;

                        sendImportNotice(
                            {
                                type: 1,
                                msg: warnMsg
                            }
                        );

                        warnings.push({
                            userId: userKey,
                            userName,
                            bet: originalBetText,
                            reason:
                                "下注格式无效"
                        });

                        retainOriginalBet(userKey, betMsg);
                        continue;
                    }

                    /*
                     * 混合指令按单项处理：未知玩法提示格式错误，合法玩法继续导入。
                     * 例如 x1000p1000 会导入 x1000，并对 p1000 给出格式提示；
                     * 不能保留整条原始指令重试，否则合法部分会被重复导入。
                     */
                    if (invalidTypeBets.length > 0 && validTypeBets.length > 0) {
                        for (const invalidItem of invalidTypeBets) {
                            const invalidCommand =
                                String(invalidItem && invalidItem.rawType || "未知玩法") +
                                (invalidItem && invalidItem.amount !== null && invalidItem.amount !== undefined
                                    ? String(invalidItem.amount)
                                    : "");
                            const warnMsg =
                                userName +
                                " 下注命令格式不正确：" +
                                invalidCommand;

                            sendImportNotice({
                                type: 1,
                                msg: warnMsg
                            });

                            warnings.push({
                                userId: userKey,
                                userName,
                                bet: invalidCommand,
                                reason: "下注格式无效"
                            });
                        }

                        finalBet = validTypeBets;
                    }

                    /*
                     * 改单和整单撤销的清理必须放在时间窗过滤之后。
                     * 这样停止下注后的 Gx100、C、撤都只会提示非下注时间，
                     * 不会删除截止前已经导入的下注。
                     */
                    if (betMsg.clearAllBeforeImport === true) {
                        let clearRes;

                        try {
                            clearRes = await userDao.cleanPlayerBettingRecord({
                                cc: betMsg.cc,
                                jc: betMsg.jc,
                                player_name: userName,
                                group_nickname:
                                    betMsg.group_nickname ||
                                    rInfo.group_nickname
                            });
                        } catch (clearErr) {
                            clearRes = { err: clearErr, data: null };
                        }

                        if (!clearRes || clearRes.err) {
                            retainOriginalBet(userKey, betMsg);
                            userFailedCount++;
                            errorList.push({
                                userId: userKey,
                                userName,
                                bet: originalBetText,
                                error:
                                    clearRes && clearRes.err
                                        ? String(clearRes.err.message || clearRes.err)
                                        : "控制指令清除原下注失败"
                            });
                            continue;
                        }

                        console.log(
                            "[整单控制清理成功] operation=" +
                            (betMsg.controlOperation || "改单") +
                            ", userId=" +
                            userKey +
                            ", msgId=" +
                            betMsg.msgId
                        );

                        if (isControlOnly) {
                            continue;
                        }
                    }

                    /*
                     * 指定玩法撤销同样延迟到时间窗过滤之后执行。
                     * cancellation key 使用 z/x 等精确字段，不会把庄和闲一起删除。
                     */
                    if (deferredCancelKeys.length > 0) {
                        let cancelRes;

                        try {
                            cancelRes = await userDao.removeExistingBetTypes({
                                userId: Number(userKey),
                                roomId: betMsg.roomId || rInfo.Id,
                                rType: betMsg.rType || rInfo.rType,
                                cc: betMsg.cc,
                                jc: betMsg.jc,
                                group_nickname:
                                    betMsg.group_nickname ||
                                    rInfo.group_nickname,
                                statistics_date:
                                    betMsg.statistics_date ||
                                    rInfo.statistics_date,
                                replacementKeys: deferredCancelKeys
                            });
                        } catch (cancelErr) {
                            cancelRes = { err: cancelErr, data: null };
                        }

                        if (!cancelRes || cancelRes.err) {
                            retainOriginalBet(userKey, betMsg);
                            userFailedCount++;
                            errorList.push({
                                userId: userKey,
                                userName,
                                bet: originalBetText,
                                error:
                                    cancelRes && cancelRes.err
                                        ? String(cancelRes.err.message || cancelRes.err)
                                        : "撤销指定类型失败"
                            });
                            continue;
                        }

                        console.log(
                            "[指定类型撤销成功] userId=" +
                            userKey +
                            ", msgId=" +
                            betMsg.msgId +
                            ", types=" +
                            deferredCancelKeys.join(",")
                        );

                        if (isControlOnly) {
                            continue;
                        }
                    }

                    /*
                     * 梭哈必须按照导表时的最新余额计算。
                     */
                    let originalHasAllInBet = false;
                    try {
                        const originalParsedBet =
                            parseResult.parseBetStrToArray(originalBetText);
                        originalHasAllInBet =
                            Array.isArray(originalParsedBet) &&
                            originalParsedBet.some(item =>
                                String(item && item.type || "").indexOf("梭") !== -1
                            );
                    } catch (parseOriginalErr) {
                        originalHasAllInBet = false;
                    }

                    const hasAllInBet =
                        betMsg.hasSuo === true ||
                        originalHasAllInBet ||
                        finalBet.some(item =>
                            String(item && item.type || "").indexOf("梭") !== -1
                        );

                    if (hasAllInBet) {
                        const latestUserRes =
                            await userDao.getUserById(
                                userKey
                            );

                        const latestUser =
                            latestUserRes &&
                            latestUserRes.data
                                ? latestUserRes.data
                                : null;

                        if (!latestUser) {
                            retainOriginalBet(
                                userKey,
                                betMsg
                            );

                            userFailedCount++;

                            errorList.push({
                                userId: userKey,
                                userName,
                                bet: originalBetText,
                                error:
                                    "梭哈时读取余额失败"
                            });

                            continue;
                        }

                        const latestScore =
                            Number(
                                latestUser.score
                            ) || 0;

                        /*
                         * 零余额梭哈不能继续换算成金额 0，否则后续会误报
                         * “下注无效”。它本质上是余额不足，提示应与普通下注一致。
                         */
                        if (latestScore <= 0) {
                            const warnMsg =
                                userName +
                                " 余额不足，下注：" +
                                originalBetText +
                                "，当前余额：" +
                                latestScore;

                            sendImportNotice({
                                type: 1,
                                msg: warnMsg
                            });

                            warnings.push({
                                userId: userKey,
                                userName,
                                bet: originalBetText,
                                reason: "余额不足",
                                requiredScore: null,
                                currentScore: latestScore
                            });

                            retainOriginalBet(userKey, betMsg);
                            userFailedCount++;
                            continue;
                        }

                        finalBet =
                            this.processShuoTypeAtFlush(
                                finalBet,
                                latestScore
                            );
                    }

                    /*
                     * 核心修改：
                     * 每一个投注项目单独判断、单独入库。
                     */
                    for (
                        const betItem
                        of finalBet
                    ) {
                        const itemAmount =
                            Number(
                                betItem.amount
                            ) || 0;

                        const itemName =
                            String(
                                betItem.type
                            ) +
                            String(
                                itemAmount
                            );

                        /*
                         * 单项金额检查。
                         */
                        if (
                            !Number.isFinite(
                                itemAmount
                            ) ||
                            itemAmount <= 0
                        ) {
                            const invalidBetType = String(
                                betItem.type ||
                                betItem.rawType ||
                                "未知玩法"
                            );
                            const warnMsg =
                                userName +
                                " " +
                                invalidBetType +
                                "下注无效";

                            sendImportNotice(
                                {
                                    type: 1,
                                    msg: warnMsg
                                }
                            );

                            warnings.push({
                                userId: userKey,
                                userName,
                                bet: invalidBetType,
                                reason:
                                    "下注金额无效"
                            });

                            continue;
                        }

                        /*
                         * 每个项目单独检查限红。
                         */
                        const itemLimitMsg = {
                            ...betMsg,

                            bet: [
                                {
                                    ...betItem,
                                    amount:
                                        itemAmount
                                }
                            ],

                            xz: itemAmount,
                            xzmx: itemName,
                            hasSuo: false
                        };

                        const isOverLimit =
                            await this.chkLimit(
                                itemLimitMsg,
                                rInfo
                            );

                        if (isOverLimit) {
                            const warnMsg =
                                userName +
                                " 下注超过限红：" +
                                originalBetText;

                            sendImportNotice(
                                {
                                    type: 1,
                                    msg: warnMsg
                                }
                            );

                            warnings.push({
                                userId: userKey,
                                userName,
                                bet: originalBetText,
                                reason: "超过限红"
                            });

                            retainBetItem(userKey, betMsg, betItem);
                            continue;
                        }

                        const isMinLimit =
                            await this.chkMinLimit(
                                itemLimitMsg,
                                rInfo
                            );

                        if (isMinLimit) {
                            const warnMsg =
                                userName +
                                " 下注低于最小限注：" +
                                itemName;

                            sendImportNotice(
                                {
                                    type: 1,
                                    msg: warnMsg
                                }
                            );

                            warnings.push({
                                userId: userKey,
                                userName,
                                bet: itemName,
                                originalBet: originalBetText,
                                reason:
                                    "低于最小下注要求"
                            });

                            continue;
                        }

                        /*
                         * 当前项目入库前，先删除数据库中同类型旧注。
                         * 删除旧注会退款，因此必须在退款完成后再读取实时余额。
                         */
                        let replaceRes;

                        try {
                            replaceRes = await this.removeDbDuplicateBeforeImport(
                                userKey,
                                betMsg,
                                { ...betItem, amount: itemAmount },
                                rInfo
                            );
                        } catch (replaceErr) {
                            replaceRes = { err: replaceErr, data: null };
                        }

                        if (!replaceRes || replaceRes.err) {
                            retainBetItem(userKey, betMsg, betItem);
                            userFailedCount++;

                            errorList.push({
                                userId: userKey,
                                userName,
                                bet: originalBetText,
                                error: replaceRes && replaceRes.err
                                     ? String(replaceRes.err.message || replaceRes.err)
                                    : "删除数据库同类型旧注失败"
                            });
                            continue;
                        }

                        /*
                         * 当前项目入库前，重新读取数据库余额。
                         */
                        let latestUserRes;

                        try {
                            latestUserRes =
                                await userDao.getUserById(
                                    userKey
                                );
                        } catch (queryErr) {
                            latestUserRes = null;

                            console.error(
                                "[读取实时余额异常] userId=" +
                                userKey +
                                ", bet=" +
                                itemName +
                                ", error=" +
                                queryErr.message
                            );
                        }

                        const latestUser =
                            latestUserRes &&
                            latestUserRes.data
                                ? latestUserRes.data
                                : null;

                        /*
                         * 数据库查询异常属于临时异常，
                         * 当前项目单独保留。
                         */
                        if (!latestUser) {
                            retainBetItem(
                                userKey,
                                betMsg,
                                betItem
                            );

                            userFailedCount++;

                            errorList.push({
                                userId: userKey,
                                userName,
                                bet: originalBetText,
                                error:
                                    "读取实时余额失败"
                            });

                            continue;
                        }

                        const currentUserScore = Number(latestUser.score) || 0;

                        /*
                         * 单项余额判断。
                         *
                         * 例如余额700：
                         *
                         * 庄600：700 >= 600，成功；
                         * 闲300：重新查询余额为100，
                         *        100 < 300，余额不足。
                         */
                        if (currentUserScore < itemAmount) {
                            const balanceCategory = betItem.balanceCategory
                                ? String(betItem.balanceCategory)
                                : "";
                            const warnMsg =
                                userName +
                                " " +
                                balanceCategory +
                                "余额不足，下注：" +
                                originalBetText +
                                "，当前余额：" +
                                currentUserScore;

                            sendImportNotice(
                                {
                                    type: 1,
                                    msg: warnMsg
                                }
                            );

                            warnings.push({
                                userId: userKey,
                                userName,
                                bet: originalBetText,
                                reason: "余额不足",
                                balanceCategory:
                                    balanceCategory || null,
                                requiredScore:
                                    itemAmount,
                                currentScore:
                                    currentUserScore
                            });

                            /*
                             * 只保留余额不足的当前项目。
                             * 已经成功的前置项目不会再次缓存。
                             */
                            retainBetItem(
                                userKey,
                                betMsg,
                                betItem
                            );

                            userFailedCount++;

                            continue;
                        }

                        /*
                         * fillBetInfo 每次只接收一个投注项目。
                         */
                        const itemMsgToSave = {
                            ...betMsg,

                            userId:
                                Number(userKey),

                            username:
                                latestUser.username ||
                                userName,

                            bet: [
                                {
                                    ...betItem,
                                    amount:
                                        itemAmount
                                }
                            ],

                            xz: itemAmount,
                            xzmx: itemName,

                            ye: currentUserScore,
                            before_bet_ye:
                                currentUserScore,

                            hasSuo: false
                        };

                        let saveRes;

                        try {
                            saveRes =
                                await userDao.fillBetInfo(
                                    itemMsgToSave
                                );
                        } catch (saveErr) {
                            saveRes = {err:saveErr.message,data: null};
                        }

                        if (saveRes && saveRes.data) {
                            totalCount++;
                            userSuccessCount++;
                            userTotalBet +=
                                itemAmount;

                            console.log(
                                "[单项入库成功] userId=" +
                                userKey +
                                ", msgId=" +
                                betMsg.msgId +
                                ", bet=" +
                                itemName +
                                ", 入库前余额=" +
                                currentUserScore +
                                ", 预计剩余余额=" +
                                (
                                    currentUserScore -
                                    itemAmount
                                )
                            );
                        } else {
                            const errorMessage =
                                saveRes &&
                                saveRes.err
                                    ? String(
                                        saveRes.err
                                    )
                                    : "fillBetInfo返回失败";

                            /*
                             * 数据库入库失败时，
                             * 只保留当前失败项目。
                             */
                            retainBetItem(
                                userKey,
                                betMsg,
                                betItem
                            );

                            userFailedCount++;

                            errorList.push({
                                userId: userKey,
                                userName,
                                bet: originalBetText,
                                error:
                                    errorMessage
                            });

                            console.error(
                                "[单项入库失败] userId=" +
                                userKey +
                                ", bet=" +
                                itemName +
                                ", error=" +
                                errorMessage
                            );
                        }
                    }
                }

                if (userTotalBet > 0) {
                    scoreDeductMap[userKey] =
                        (
                            scoreDeductMap[
                                userKey
                            ] || 0
                        ) + userTotalBet;
                }

                if (userFailedCount === 0) {
                    successfulUsers.push(
                        userKey
                    );
                } else {
                    retainedUsers.push(
                        userKey
                    );
                }

                console.log(
                    "[用户导表完成] userId=" +
                    userKey +
                    ", 成功项目数=" +
                    userSuccessCount +
                    ", 失败项目数=" +
                    userFailedCount +
                    ", 成功金额=" +
                    userTotalBet
                );
            } catch (userErr) {
                console.error(
                    "[玩家导表异常] userId=" +
                    userKey +
                    ", error=" +
                    userErr.message
                );

                errorList.push({
                    userId: userKey,
                    userName,
                    error: userErr.message
                });

                retainedUsers.push(
                    userKey
                );
            } finally {
                if (userLock) {
                    try {
                        await userLock.unlock();
                    } catch (unlockErr) {
                        console.error(
                            "[释放玩家导表锁失败] userId=" +
                            userKey +
                            ", error=" +
                            unlockErr.message
                        );
                    }
                }
            }
        }

        /*
         * 重新构建当前桌缓存：
         *
         * 1. 加入本次失败的单项下注；
         * 2. 加入 flush 执行期间的新下注；
         * 3. 已成功下注不再放回。
         */
        const latestTableCache =
            this.tempBetCache[tableId] || {};

        const nextTableCache = {};

        /*
         * 加入失败项目。
         */
        for (
            const [userId, failedList]
            of Object.entries(
                failedBetsByUser
            )
        ) {
            if (
                Array.isArray(failedList) &&
                failedList.length > 0
            ) {
                nextTableCache[userId] = [
                    ...failedList
                ];
            }
        }

        /*
         * 保留导表过程中新增的下注。
         */
        for (
            const [userId, latestList]
            of Object.entries(
                latestTableCache
            )
        ) {
            if (!Array.isArray(latestList)) {
                continue;
            }

            const originalList =
                processingCache[userId] || [];

            const originalSet =
                new Set(originalList);

            const newDuringFlush =
                latestList.filter(
                    bet =>
                        !originalSet.has(bet)
                );

            if (
                newDuringFlush.length > 0
            ) {
                if (!nextTableCache[userId]) {
                    nextTableCache[userId] =
                        [];
                }

                nextTableCache[userId].push(
                    ...newDuringFlush
                );
            }
        }

        /*
         * 去除同一个对象的重复缓存。
         */
        for (const userId of Object.keys(nextTableCache)) {
            nextTableCache[userId] =
                Array.from(
                    new Set(
                        nextTableCache[userId]
                    )
                );
        }

        if (Object.keys(nextTableCache).length === 0) {
            delete this.tempBetCache[
                tableId
            ];
            console.log(
                "[批量缓存全部成功，整桌缓存已删除] tableId=" +
                tableId
            );
        } else {
            this.tempBetCache[tableId] =
                nextTableCache;

            const remainingBetCount =
                Object.values(
                    nextTableCache
                ).reduce(
                    (sum, list) =>
                        sum +
                        (
                            Array.isArray(list)
                                ? list.length
                                : 0
                        ),
                    0
                );

            console.log(
                "[批量缓存部分保留] tableId=" +
                tableId +
                ", 玩家数=" +
                Object.keys(
                    nextTableCache
                ).length +
                ", 下注项目数=" +
                remainingBetCount
            );
        }

        return {
            code: 200,
            count: totalCount,
            retainedCount,
            deducted: scoreDeductMap,
            successfulUsers,
            retainedUsers,
            errors: errorList,
            warnings
        };
    } catch (err) {
        /*
         * 外层异常不清空原缓存。
         */
        console.error(
            "[批量入库致命异常] " +
            err.message
        );

        sendToFront.sendNoticeToGameClient(
            noticeChannelName,
            {
                type: 1,
                msg:
                    "导表异常：" +
                    err.message
            }
        );

        return {
            code: 500,
            count: totalCount,
            retainedCount,
            deducted: scoreDeductMap,
            successfulUsers,
            retainedUsers,
            errors: errorList,
            warnings,
            error: err.message
        };
    }
},

    // ✅ 新增：在入库时处理梭哈，根据当时用户余额计算
    processShuoTypeAtFlush: function(betArray, userCurrentScore) {
        const parsed = Array.isArray(betArray) ? betArray.map(e => ({ ...e })) : [];
        const isShuoType = (type) => type && String(type).indexOf('梭') !== -1;
        
        // 计算梭哈之前的总额
        let preAllInTotal = 0;
        for (let i = 0; i < parsed.length; i++) {
            const it = parsed[i];
            if (isShuoType(it.type)) break;
            const amt = Number(it.amount);
            if (!isNaN(amt) && amt > 0) preAllInTotal += amt;
        }
        
        // 剩余可梭金额，防负数（基于入库时的用户余额）
        const remain = Math.max(0, userCurrentScore - preAllInTotal);
        console.log("[梭哈计算] preAllInTotal=" + preAllInTotal + ", userScore=" + userCurrentScore + ", remain=" + remain);

        // 生成新的注单数组
        const out = [];
        for (const e of parsed) {
            const cancelledKeys = new Set(
                Array.isArray(e.cancelledBetKeys) ? e.cancelledBetKeys : []
            );
            if (e.type === "庄梭") { out.push({ ...e, type: "庄", amount: remain }); continue; }
            if (e.type === "闲梭") { out.push({ ...e, type: "闲", amount: remain }); continue; }
            if (e.type === "和梭") { out.push({ ...e, type: "和", amount: remain }); continue; }
            if (e.type === "大老虎梭") { out.push({ ...e, type: "大老虎", amount: remain }); continue; }
            if (e.type === "小老虎梭") { out.push({ ...e, type: "小老虎", amount: remain }); continue; }
            if (e.type === "完美梭") { out.push({ ...e, type: "完美", amount: remain }); continue; }
            if (e.type === "幸运七梭") { out.push({ ...e, type: "幸运七", amount: remain }); continue; }
            if (e.type === "庄对梭") { out.push({ ...e, type: "庄对", amount: Math.floor(remain) }); continue; }
            if (e.type === "闲对梭") { out.push({ ...e, type: "闲对", amount: Math.floor(remain) }); continue; }
            if (e.type === "对子梭") {
                const half = Math.floor(remain / 2);
                if (!cancelledKeys.has('zd')) {
                    out.push({ ...e, type: "庄对", amount: half });
                }
                if (!cancelledKeys.has('xd')) {
                    out.push({ ...e, type: "闲对", amount: remain - half });
                }
                continue;
            }
            if (e.type === "老虎梭") {
                const half = Math.floor(remain / 2);
                if (!cancelledKeys.has('l')) {
                    out.push({ ...e, type: "小老虎", amount: half });
                }
                if (!cancelledKeys.has('k')) {
                    out.push({ ...e, type: "大老虎", amount: remain - half });
                }
                continue;
            }
            if (e.type === "三宝梭") {
                const half = Math.floor(remain / 3);
                if (!cancelledKeys.has('zd')) {
                    out.push({ ...e, type: "庄对", amount: half });
                }
                if (!cancelledKeys.has('xd')) {
                    out.push({ ...e, type: "闲对", amount: half });
                }
                if (!cancelledKeys.has('h')) {
                    out.push({ ...e, type: "和", amount: remain - 2 * half });
                }
                continue;
            }
            if (e.type === "四宝梭") {
                const baseAmount = Math.floor(remain / 4);
                const remainder = remain - baseAmount * 4;
                if (!cancelledKeys.has('zd')) {
                    out.push({ ...e, type: "庄对", amount: baseAmount });
                }
                if (!cancelledKeys.has('xd')) {
                    out.push({ ...e, type: "闲对", amount: baseAmount });
                }
                if (!cancelledKeys.has('h')) {
                    out.push({ ...e, type: "和", amount: baseAmount });
                }
                if (!cancelledKeys.has('m')) {
                    out.push({ ...e, type: "完美", amount: baseAmount + remainder });
                }
                continue;
            }
            
            out.push({ ...e });
        }
        return out;
    },

    // 检测限红
    chkLimit: async function (msg, rInfo) {
        let objBet = msg.bet;
        
        if (!rInfo.parameter_setup) {
            let parameter_setup = await systemDao.getParameter(msg);
            rInfo.parameter_setup = parameter_setup.data[0];
        }
        let r = rInfo.parameter_setup;
        
        // 修正：使用 for...of 遍历数组，或者使用 Object.values/forEach
        if (Array.isArray(objBet)) {
            for (let element of objBet) {
                if(element.amount <= 0)return true;

                if (element.type == '庄' || element.type == "闲") {
                    if ( element.amount > r.pb_max_limit) {
                        return true;
                    }
                }
                if (element.type == "庄对" || element.type == "闲对" || element.type == "和") {
                    if ( element.amount > r.sanbao_max_limit) {
                        return true;
                    }
                }
                if (element.type == "小老虎") {
                    if (element.amount > r.lucky6_2_max_limit) {
                        return true;
                    }
                }
                if (element.type == "大老虎") {
                    if (element.amount > r.lucky6_3_max_limit) {
                        return true;
                    }
                }
                if (element.type == "幸运七") {   // 幸运七
                    if (element.amount > r.lucky7_max_limit) {
                        return true;
                    }
                }
                if (element.type == "完美") {
                    if (element.amount > r.perfect_max_limit) {
                        return true;
                    }
                }

            }
        } else {
            // 如果 objBet 是对象，使用 Object.values 遍历
            for (let element of Object.values(objBet)) {
                // 同上逻辑
            }
        }
        return false;
    },

    // 检测限红
    chkMinLimit: async function (msg, rInfo) {
        let objBet = msg.bet;
        
        if (!rInfo.parameter_setup) {
            let parameter_setup = await systemDao.getParameter(msg);
            rInfo.parameter_setup = parameter_setup.data[0];
        }
        let r = rInfo.parameter_setup;
        
        // 修正：使用 for...of 遍历数组，或者使用 Object.values/forEach
        if (Array.isArray(objBet)) {
            for (let element of objBet) {
                console.log("element:", element);
                
                if(element.amount <= 0)return true;

                if (element.type == '庄' || element.type == "闲") {
                    if (element.amount < r.pb_min_limit) {
                        return true;
                    }
                }
                if (element.type == "庄对" || element.type == "闲对" || element.type == "和") {
                    if (element.amount < r.sanbao_min_limit ) {
                        return true;
                    }
                }
                if (element.type == "小老虎") {
                    if (element.amount < r.lucky6_2_min_limit) {
                        return true;
                    }
                }
                if (element.type == "大老虎") {
                    if (element.amount < r.lucky6_3_min_limit) {
                        return true;
                    }
                }
                if (element.type == "幸运七" || element.type == "幸运7") {
                    if (element.amount < r.lucky7_min_limit ) {
                        return true;
                    }
                }
                if (element.type == "完美") {
                    if (element.amount < r.perfect_min_limit ) {
                        return true;
                    }
                }
            }
        } else {
            // 如果 objBet 是对象，使用 Object.values 遍历
            for (let element of Object.values(objBet)) {
                // 同上逻辑
            }
        }
        return false;
    },
    convertBet: async function(msg){
        msg.bet = msg.bet.replace(/2\^/g,"1^");
        msg.bet = msg.bet.replace(/3\^/g,"2^");
        msg.bet = msg.bet.replace(/5\^/g,"3^");
    },

    // 检测庄闲下注，如果有庄闲类型的下注，返回true，否则返回false
    chkZxBet: async function(betArr) {
        let obj = {hasZxBet:false,totalBetScore:0};
        betArr.forEach(element => {
            if (element.type === '庄' || element.type === '闲' || element.type === '庄梭' || element.type === '闲梭') {
                obj.hasZxBet = true;
            }
            obj.totalBetScore += element.amount;
        });
        return obj;
    },
    // ✅ 清空指定 tableId 的所有缓存
    clearBetCache: function(tableId) {
        if (this.tempBetCache[tableId]) {
            const count = Object.keys(this.tempBetCache[tableId]).length;
            delete this.tempBetCache[tableId];
            console.log("[清空缓存] tableId=" + tableId + ", 清空用户数=" + count);
        }
        if (this.pendingImportNotices[tableId]) {
            delete this.pendingImportNotices[tableId];
            console.log("[清空导表提示] tableId=" + tableId);
        }
    },

    GetTotalBet: function(objBet){
        let total = 0;
        objBet.forEach(element => {
            if(element.type && element.amount){
                total += element.amount
            }
        });
        return total;
    },

}

/**
 * 将类型归一化为主项（梭与非梭、短码与中文都映射到同一主项）
 * 支持短码和中文，例如: 'z','zs','庄','庄梭' -> 'z' 或 '庄'（保持原格式）
 */
function normalizeMainType(type) {
    if (!type && type !== 0) return type;
    const t = String(type).trim();
    // 短码优先映射为英文短码主项
    const map = {
        // 庄/庄梭
        'z': 'z', 'zs': 'z', '庄': 'z', '庄梭': 'z',
        // 闲/闲梭
        'x': 'x', 'xs': 'x', '闲': 'x', '闲梭': 'x',
        // 小/大老虎
        'l': 'l', 'ls': 'l', '小老虎': 'l', '小老虎梭': 'l',
        'k': 'k', 'ks': 'k', '大老虎': 'k', '大老虎梭': 'k', '老虎': 'n', '老虎梭': 'n',
        // 对子类
        'zd': 'zd', 'zds': 'zd', '庄对': 'zd', '庄对梭': 'zd',
        'xd': 'xd', 'xds': 'xd', '闲对': 'xd', '闲对梭': 'xd',
        // 其他主项直接映射自身短码/中文
        'h': 'h', 'hs': 'h', '和': 'h', '和梭': 'h',
        'm': 'm', 'ms': 'm', '完美': 'm', '完美梭': 'm',
        'q': 'q', 'qs': 'q', '幸运七': 'q', '幸运七梭': 'q'
    };
    return map[t] || t;
}

/**
 * 按主项只保留最后一注（支持短码或中文 type）
 * typesToKeepLast 可选：指定只对哪些主项生效（传入短码/中文），为空数组则对所有主项生效
 */
function keepLastBetsByType(betItems, typesToKeepLast = []) {
    if (!Array.isArray(betItems) || betItems.length === 0) return betItems;
    const applyAll = !Array.isArray(typesToKeepLast) || typesToKeepLast.length === 0;
    // 归一化 typesToKeepLast 到主项 key 集合
    const wantSet = new Set();
    if (!applyAll) {
        for (const tt of typesToKeepLast) {
            wantSet.add(normalizeMainType(tt));
        }
    }

    const lastIndex = Object.create(null);
    betItems.forEach((b, i) => {
        if (!b || !b.type) return;
        const main = normalizeMainType(b.type);
        if (applyAll || wantSet.has(main)) {
            lastIndex[main] = i; // 记录最后出现位置
        }
    });

    return betItems.filter((b, i) => {
        if (!b || !b.type) return true;
        const main = normalizeMainType(b.type);
        if (applyAll) {
            return lastIndex[main] === i;
        }
        if (wantSet.has(main)) {
            return lastIndex[main] === i;
        }
        return true;
    });
}

