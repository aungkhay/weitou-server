module.exports.beforeStartup = function(app, cb) {
    // do some operations before application start up
    cb();
};
 
module.exports.afterStartup = function(app, cb) {
    // do some operations after application start up
    cb();
};

module.exports.beforeShutdown = function(app, cb) {
    // do some operations before application shutdown down
    cb();
};

module.exports.afterStartAll = function(app) {
    let pomelo = require('pomelo');
    setTimeout(() => {
        pomelo.app.rpc.bjl.bjlRemote.autoCreateRoom(pomelo.app, function(res) {
          console.log("自动创建百家乐房间结果:", res);
        })
    }, 3000);
};