const userDao =  require("../../../dao/userDao"); 

module.exports = function(app) {
  return new Cron(app);
};

var Cron = function(app) {
  
  this.app = app;
  this.Config = app.get('config');
};

Cron.prototype.rank = async  function() {
    //console.log("----------定时任务启动------------");
};

