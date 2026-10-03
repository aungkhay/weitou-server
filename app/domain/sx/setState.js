  let pomelo = require('pomelo');
  let redis = pomelo.app.get("redis");
  module.exports = {
    setStateRedis: function(rInfo) {
        let data = {time:rInfo.time,gameState:rInfo.gameState,result:rInfo.result};
        redis.set(rInfo.stateRedisKey,JSON.stringify(data));   // 缓存游戏状态
    }   
}