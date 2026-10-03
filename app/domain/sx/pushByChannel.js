  let pushMsg = require('../pushMsg-min');
  let GMResponse = require('../GMResponse');
  module.exports = {
    pushByChannel: function(code,msg,data,rInfo){
        let response = new GMResponse(code,rInfo.rType,rInfo.Id,msg, data);
        let cb={};
        pushMsg.pushByChannel("onMsg",rInfo.rType + "_game_" + rInfo.Id,response,cb);
    }
}