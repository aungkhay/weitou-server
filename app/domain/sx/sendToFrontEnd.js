let pomelo = require('pomelo');
module.exports = {
    sendNoticeToClient: function( groupNickname, msg) {
        let callback = function(err, res) {};
        pomelo.app.rpc.connector.pushRemote.pushNoticeToClient(1, groupNickname, msg, callback);
    },
    sendNoticeToGameClient: function( groupNickname, msg) {
        let callback = function(err, res) {};
        pomelo.app.rpc.connector.pushRemote.pushNoticeToGameClient(1, groupNickname, msg, callback);
    },
    clearNoticeHistory: function(groupNickname) {
        let callback = function(err, res) {
            if (err) {
                console.error(`[停止统计清缓存] 桌台 [${groupNickname}] WebSocket 缓存清理失败:`, err);
            }
        };
        pomelo.app.rpc.connector.pushRemote.clearNoticeHistory(1, groupNickname, callback);
    }
}
