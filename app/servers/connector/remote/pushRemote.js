// 后端 connector 服务器专用远程代理 (pushRemote.js)
module.exports = function(app) {
    return new Remote(app);
};

var Remote = function(app) {
    this.app = app;
};

/**
 * 🌟 供外部进程（如 bjl 游戏服务器）跨进程调用的专属 RPC 接口
 */
Remote.prototype.pushNoticeToClient = function(tableId, content, cb) {
    //console.log(`【RPC 接收成功】收到来自游戏进程的广播请求,发放插件端。目标桌号: ${tableId}`);

    // 🌟 核心看这里：直接调用我们在同一个进程（connector）里调通的原生 WebSocket 全局群发方法！
    if (tableId!="all#") {
        global.pushMessageToTable(tableId, content);
    } else if (global.broadcastToAllTables) {
        // 如果是全量大喇叭大广播公告
        global.broadcastToAllTables(content);
    }

    // 顺畅返回给发起调用的游戏服务器一个成功的 RPC 回执
    cb(null, { status: "ok" });
};

// 停止统计时由游戏进程调用：清理指定桌台的全局/单桌历史，并通知在线控制端清空显示。
Remote.prototype.clearNoticeHistory = function(tableId, cb) {
    if (!global.clearControlHistory) {
        return cb(null, { status: "not_ready", tableId: tableId });
    }

    const result = global.clearControlHistory(tableId, true, true, true);
    cb(null, result);
};

// pushMessageToGameRoom
Remote.prototype.pushNoticeToGameClient = function(tableId, content, cb) {
    console.log(`【RPC 接收成功】收到来自游戏进程的广播请求，发往主持端，目标桌号: ${tableId}`);
    if (tableId!="all#") {
        global.pushMessageToGameRoom(tableId, content);
    } else if (global.broadcastToAllGameRooms) {
        // 如果是全量大喇叭大广播公告
        global.broadcastToAllGameRooms(content);
    }
    cb(null, { status: "ok" });
};
