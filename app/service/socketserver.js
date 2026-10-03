const WebSocket = require('ws');
const config = require('../../config/config.json');
const wss = new WebSocket.Server({
    port: config.http.wsport,
    perMessageDeflate: {
        zlibDeflateOptions: {
            level: 6
        }
    }
});
const auth = require("../service/route/auth");
const loginSession = require('../util/loginSession');
const pomelo = require('pomelo');
const Code = require('../util/code');

// 核心数据结构 A：存放【控制端】物理桌子的实时在线客户端集合
const tableGroups = new Map();

// 🌟 核心数据结构 AA【全新独立】：存放【游戏端】游戏桌/房间的实时在线客户端集合
const gameGroups = new Map();

// 核心数据结构 B：控制端单桌历史缓存（20秒严格动态衰减销毁）
const tableHistoryCaches = new Map();

// 核心数据结构 C：控制端全服广播按桌分组永久历史缓存
const globalHistoryCachesByTable = new Map();

console.log('【两端业务彻底隔离网关】（专属游戏桌与专属推送版）已在端口启动...');
// ================= WebSocket增强 =================

const MAX_HISTORY_LENGTH = 200;
const HEARTBEAT_INTERVAL = 30000;

// 控制端实时包需要保留原业务对象供旧版 C# 判断 type；历史补包则只应保存
// 最终 msg 文本，否则 C# 历史分支会把 { type, msg } 整段 JSON 显示在信息窗口。
function getControlDisplayMessage(content) {
    let value = content;

    for (let depth = 0; depth < 3; depth++) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            if (Object.prototype.hasOwnProperty.call(value, 'msg')) {
                value = value.msg;
                continue;
            }
            return JSON.stringify(value);
        }

        if (typeof value !== 'string') {
            return value === undefined || value === null ? '' : String(value);
        }

        // 兼容历史上被 HTML 编码过的 JSON（例如空格被写成 &#x20;）。
        value = value
            .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCodePoint(parseInt(hex, 16)))
            .replace(/&#(\d+);/g, (match, decimal) => String.fromCodePoint(parseInt(decimal, 10)))
            .replace(/&quot;/gi, '"')
            .replace(/&apos;/gi, "'")
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&amp;/gi, '&');

        const text = value.trim();
        if (!text) return '';

        try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object') {
                value = parsed;
                continue;
            }
        } catch (err) {}

        return value;
    }

    return typeof value === 'string' ? value : JSON.stringify(value);
}


// 统一发送
function safeSend(ws, data) {

    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
    }

    try {

        ws.send(data, (err)=>{

            if(err){
                try{
                    ws.terminate();
                }catch(e){}
            }

        });

    } catch(e){

        try{
            ws.terminate();
        }catch(err){}

    }
}

// 统一清理控制端历史。全局广播历史也是按桌保存，因此只会影响指定桌台。
global.clearControlHistory = function(tableId, clearGlobal, clearTable, notifyClients) {
    if (tableId === undefined || tableId === null || tableId === '') {
        return { status: 'invalid_table' };
    }

    const result = {
        status: 'ok',
        tableId: tableId,
        globalCleared: false,
        tableCleared: false,
        notifiedClients: 0
    };

    if (clearGlobal && globalHistoryCachesByTable.has(tableId)) {
        globalHistoryCachesByTable.delete(tableId);
        result.globalCleared = true;
        console.log(`【清理控制端全局缓存】已彻底擦除物理桌子 [${tableId}] 的全服大喇叭缓存。`);
    }

    if (clearTable && tableHistoryCaches.has(tableId)) {
        tableHistoryCaches.delete(tableId);
        result.tableCleared = true;
        console.log(`【清理控制端单桌缓存】已彻底擦除物理桌子 [${tableId}] 的单桌历史缓存。`);
    }

    if (notifyClients && tableGroups.has(tableId)) {
        const packageData = JSON.stringify({
            type: 'clearHistory',
            tableId: tableId,
            time: new Date().getTime()
        });
        tableGroups.get(tableId).forEach(function each(client) {
            safeSend(client, packageData);
            result.notifiedClients++;
        });
    }

    return result;
};

function kickGameSocket(ws, message) {
    leaveCurrentGameTable(ws);
    ws.loginAccountId = null;
    safeSend(ws, JSON.stringify({
        type: 'kicked_out', status: 403,
        errCode: Code.ENTRY.FA_LOGIN_REPLACED,
        msg: message || '您的账号已在其他终端登录，请重新登录'
    }));
    try { ws.close(4401, 'Login replaced'); } catch (err) { ws.terminate(); }
    const timer = setTimeout(() => {
        if (ws.readyState !== WebSocket.CLOSED) ws.terminate();
    }, 1000);
    timer.unref();
}

async function checkAccountConnections(uid) {
    // 先拍摄连接快照，再读取当前登录，避免旧通知误踢读取期间新加入的连接。
    const sockets = [...wss.clients]
        .filter(ws => ws.clientType === 'game' && ws.loginAccountId === String(uid))
        .map(ws => ({ ws, hash: ws.loginTokenHash }));
    const service = pomelo.app.get('sessionService');
    const sessions = service ? (service.getByUid(uid) || [])
        .filter(session => session.get('loginAccountId') === String(uid))
        .map(session => ({ session, hash: session.get('loginTokenHash') })) : [];
    if (!sockets.length && !sessions.length) return;
    const current = await loginSession.currentFingerprint(uid);
    for (const { ws, hash } of sockets) {
        if (ws.loginAccountId === String(uid) && ws.loginTokenHash === hash && hash !== current) {
            kickGameSocket(ws);
        }
    }
    for (const { session, hash } of sessions) {
        if (session.get('loginTokenHash') === hash && hash !== current) {
            service.kickBySessionId(session.id, { reason: '账号已在其他终端登录', errCode: Code.ENTRY.FA_LOGIN_REPLACED }, () => {});
        }
    }
}

const loginSubscriber = loginSession.subscribe(checkAccountConnections);
wss.on('close', () => loginSubscriber.quit());

function checkOnlineLogins() {
    const accountIds = new Set();
    wss.clients.forEach(ws => {
        if (ws.clientType === 'game' && ws.loginAccountId) accountIds.add(ws.loginAccountId);
    });
    const service = pomelo.app.get('sessionService');
    if (service) service.forEachSession(session => {
        if (session.get('loginAccountId')) accountIds.add(session.get('loginAccountId'));
    });
    accountIds.forEach(uid => checkAccountConnections(uid).catch(err => {
        // Redis 暂时故障不批量踢人；HTTP/RPC 校验仍拒绝未经确认的操作。
        console.error('[登录状态复核失败]', err.message);
    }));
}

// 心跳检测
setInterval(()=>{

    // Pub/Sub 断线漏消息时，心跳周期再次核验，旧登录不能持续接收游戏推送。
    checkOnlineLogins();

    wss.clients.forEach(ws=>{

        if(ws.isAlive === false){

            console.log(
              "[Heartbeat] 清理死连接"
            );

            return ws.terminate();
        }


        ws.isAlive=false;


        try{
            ws.ping();
        }
        catch(e){}

    });


}, HEARTBEAT_INTERVAL);


wss.on('connection', function connection(ws) {
     // 心跳状态
    ws.isAlive=true;
    ws.on('pong',()=>{
        ws.isAlive=true;
    });

    ws.currentTableId = null;
    ws.uid = null;          
    ws.clientType = null;   
    ws.loginAccountId = null;
    ws.loginTokenHash = null;

    ws.on('message', async function message(rawData) {
        try {
            const packet = JSON.parse(rawData);
            
            // 🌟 控制 A：前端/游戏端发来“申请加入某张桌子”
            if (packet.action === 'joinTable') {
                const tableId = packet.tableId;
                const uid = packet.uid;
                const token = packet.token;
                const clientType = packet.clientType || 'control'; // 'control'控制端，'game'游戏端
              

                // -------------------------------------------------------------
                // 🚀【分支处理一】：如果是游戏端连入，走全套独立的游戏线逻辑
                // -------------------------------------------------------------
                if (clientType === 'game') {
                    let r = await auth.auth(token); 
                    if (!r || !r.data) {
                        if (r && r.err === Code.ENTRY.FA_LOGIN_REPLACED) {
                            return kickGameSocket(ws, r.msg);
                        }
                        return safeSend(ws, JSON.stringify({ status: r && r.err === Code.ENTRY.FA_SESSION_UNAVAILABLE ? 503 : 403, msg: r && r.msg || "token is invalid or expired", errCode: r ? r.err : 1001 }));
                    }
                    // 同一次登录可有多条连接。互踢仅由 /user/login 更换 token 触发。

                    // 从旧的游戏房间安全移除
                    leaveCurrentGameTable(ws);
                    leaveCurrentTable(ws);

                    // 动态给连接句柄挂载凭证
                    ws.uid = r.data.Id; // 身份来自 token，不能相信客户端自行填写的 uid。
                    ws.clientType = 'game';
                    ws.loginAccountId = Number(r.data.permissions) === 2 ? String(r.data.Id) : null;
                    ws.loginTokenHash = loginSession.fingerprint(token);
                    ws.currentTableId = tableId; // 此时对游戏端来说，这个代表它的游戏房间号/游戏桌号

                    // 编入游戏端专属的集合
                    if (!gameGroups.has(tableId)) {
                        gameGroups.set(tableId, new Set());
                    }
                    gameGroups.get(tableId).add(ws);

                    // 覆盖鉴权查询期间恰好发生新登录、订阅通知先于入组的竞态。
                    if (ws.loginAccountId) await checkAccountConnections(ws.loginAccountId);

                    console.log(`🎮 [游戏玩家] 用户 ${uid} 成功进入了游戏桌/房间: ${tableId}`);

                    return; // 🌟 游戏线处理完毕，坚决直接中断返回！绝对不给它发控制端的补包历史
                }

                // -------------------------------------------------------------
                // 🛠️【分支处理二】：如果是控制端连入，走原本的控制端大厅逻辑
                // -------------------------------------------------------------
                // 控制端允许同一账号同时连接同一张桌。
                // tableGroups 使用 Set 保存每一条物理连接，后续桌台消息会分别
                // 推送给这些连接，不能因为 uid 相同而关闭其中任何一条。

                // 从旧控制桌安全移除
                leaveCurrentTable(ws);
                leaveCurrentGameTable(ws);
                ws.loginAccountId = null;
                ws.loginTokenHash = null;

                ws.uid = uid;
                ws.clientType = 'control';
                ws.currentTableId = tableId; 

                if (!tableGroups.has(tableId)) {
                    tableGroups.set(tableId, new Set());
                }
                tableGroups.get(tableId).add(ws);
                
                console.log(`🛠️ [控制台] 用户 ${uid} 成功进入了物理控制桌: ${tableId}`);

                // 控制端特有的“断网重连历史补包分流”
                const currentTableHistory = tableHistoryCaches.get(tableId) || [];
                const currentGlobalHistory = globalHistoryCachesByTable.get(tableId) || [];
                const combinedHistory = [...currentGlobalHistory, ...currentTableHistory];
                combinedHistory.sort((a, b) => a.time - b.time);

                if (combinedHistory.length > 0) {
                    console.log(`[🚀 重连历史补发] 正在为物理桌 [${tableId}] 的控制端用户 ${uid} 补发 ${combinedHistory.length} 条数据...`);
                    safeSend(ws, JSON.stringify({
                        type: 'historyMsg',
                        list: combinedHistory
                    }));
                }
            }

            // 控制 B：接收到前端发来的清除指令时，擦除控制端的全局缓存或单桌缓存（手动清除）
            if (packet.action === 'clearGlobalCache' || packet.action === 'clearTableCache') {
                const tableId = packet.tableId || ws.currentTableId;
                if (!tableId) return;

                global.clearControlHistory(
                    tableId,
                    packet.action === 'clearGlobalCache',
                    packet.action === 'clearTableCache',
                    false
                );
            }

        } catch (err) {
            console.error('解析前端控制包失败:', err);
        }
    });
    ws.on('close', function() {
        const uid = ws.uid || '未知';
        const type = ws.clientType || '未知';
        const tid = ws.currentTableId || '无';
        
        if (type === 'game') {
            leaveCurrentGameTable(ws);
            console.log(`玩家 ${uid} 断开游戏桌 [${tid}] 的物理连接，已从游戏集合中安全注销。`);
        } else {
            leaveCurrentTable(ws);
            console.log(`控制端 ${uid} 断开物理桌 [${tid}] 的物理连接，已从控制集合中安全移除。`);
        }
    });
});

// 退出当前物理控制桌的辅助函数
function leaveCurrentTable(ws) {
    if (ws.currentTableId && tableGroups.has(ws.currentTableId)) {
        tableGroups.get(ws.currentTableId).delete(ws);
        if (tableGroups.get(ws.currentTableId).size === 0) {
            tableGroups.delete(ws.currentTableId);
        }
    }
}

// 🌟【全新独立】：退出当前游戏桌的辅助函数
function leaveCurrentGameTable(ws) {
    if (ws.currentTableId && gameGroups.has(ws.currentTableId)) {
        gameGroups.get(ws.currentTableId).delete(ws);
        if (gameGroups.get(ws.currentTableId).size === 0) {
            gameGroups.delete(ws.currentTableId);
        }
    }
}

// =========================================================================
// 🌟 专属接口 C【全新增加】：专门向指定的“游戏桌/房间”下发纯净的游戏业务指令数据
// =========================================================================
global.pushMessageToGameRoom = function(gameTableId, gameContent, customType = "gameData") {
    // 组装完全属于游戏端的独立格式包，不掺杂任何控制端的字段
    let gamePackageObj = {
        type: customType, // 比如传入 "gameScore", "gameStart", "dealCards"
        gameTableId: gameTableId,
        msg: gameContent,
        time: new Date().getTime()
    };

    console.log(`[🎮 游戏专属推送直连通道] 正在向游戏桌 [${gameTableId}] 精准投递数据...`);

    // 如果当前游戏桌没人在线，直接拦截拦截返回
    if (!gameGroups.has(gameTableId)) {
        console.log(`[🎮 游戏通道提示] 游戏桌 [${gameTableId}] 当前无玩家在线，静默取消下发。`);
        return;
    }

    let packageData = JSON.stringify(gamePackageObj);
    // 🌟 只对游戏专属集合进行推送，100% 隔离控制端，控制端绝对不会收到！
    gameGroups.get(gameTableId).forEach(function each(gameClient) {
        if (gameClient.readyState === 1) { 
            gameClient.send(packageData, (err) => { if (err) gameClient.terminate(); });
        }
    });
};

// 新增：游戏端全服广播（向所有在线游戏桌/房间的玩家投递）
global.broadcastToAllGameRooms = function(content, customType = "gameGlobal") {

    const packageObj = {
        type: customType,
        msg: content,
        time: Date.now()
    };

    if (gameGroups.size === 0) {
        console.log("【游戏端广播】当前无在线游戏桌，取消广播。");
        return;
    }

    const packageData = JSON.stringify(packageObj);

    gameGroups.forEach((clientSet, tableId) => {

        clientSet.forEach((client)=>{

            safeSend(client, packageData);

        });

    });

};

// =========================================================================
// 接口 A（原版保留）：物理控制端专属按桌精准推送（不影响任何游戏客户端）
// =========================================================================
global.pushMessageToTable = function(tableId, content) {
    let packageObj = {
        type: "tableMsg", 
        tableId: tableId,
        msg: content,
        time: new Date().getTime()
    };

    const historyPackageObj = {
        ...packageObj,
        msg: getControlDisplayMessage(content)
    };

    // 不再自动衰减删除：由前端/管理员通过 clearTableCache 手动清理
    if (!tableHistoryCaches.has(tableId)) {
        tableHistoryCaches.set(tableId, []);
    }
    tableHistoryCaches.get(tableId).push(historyPackageObj);
    if(tableHistoryCaches.get(tableId).length > MAX_HISTORY_LENGTH){
        tableHistoryCaches
            .get(tableId)
            .shift();
    }

    // 注释掉自动 20 秒清除逻辑，改为手动清除以配合客户端“仅手动删除”要求
    /*
    setTimeout(function() {
        if (tableHistoryCaches.has(tableId)) {
            const cacheAfter20s = tableHistoryCaches.get(tableId);
            const index = cacheAfter20s.indexOf(packageObj);
            if (index > -1) cacheAfter20s.splice(index, 1); 
            if (cacheAfter20s.length === 0) tableHistoryCaches.delete(tableId);
        }
    }, 20000);
    */

    if (!tableGroups.has(tableId)) return;

    let packageData = JSON.stringify(packageObj);
    // 🌟 只发给控制端集合，100% 隔离游戏玩家
    tableGroups.get(tableId).forEach(function each(client) {
        safeSend(client, packageData);
    });
};

// =========================================================================
// 接口 B（原版保留）：全服控制大喇叭大喇叭（只对活跃的控制物理桌生效）
// =========================================================================
global.broadcastToAllTables = function(content) {
    let packageObj = {
        type: "globalMsg", 
        tableId: "ALL",
        msg: content,
        time: new Date().getTime()
    };

    const historyPackageObj = {
        ...packageObj,
        msg: getControlDisplayMessage(content)
    };

    //console.log(`【控制端全服广播】影子化永久缓存并发送: ${content}`);

    tableGroups.forEach(function(clientSet, tableId) {
        if (!globalHistoryCachesByTable.has(tableId)) {
            globalHistoryCachesByTable.set(tableId, []);
        }
        globalHistoryCachesByTable.get(tableId).push(historyPackageObj);

        let packageData = JSON.stringify(packageObj);
        clientSet.forEach(function each(client) {
            safeSend(client, packageData);
        });
    });
};
