const financial =  require("../../../dao/financialInquiriesDao"); 

module.exports = function(app) {
  return new Cron(app);
};

var Cron = function(app) {
  this.app = app;
  this.Config = app.get('config');
  this.running = false;
};

Cron.prototype.rank = async  function() {
    if (this.running) return;
    this.running = true;
    try {
        // 返回日期字符串，避免 DATE 经驱动转换为 JS Date 后引入时区偏移。
        const rows = await this.app.get('sqlHelper').query("bjl", `
            SELECT DATE_FORMAT(MAX(statistics_date), '%Y-%m-%d') AS statistics_date
            FROM group_chat_setup
        `, []);
        const statisticsDate = rows && rows[0] && rows[0].statistics_date;
        // 无营业日时不能退回无条件的全历史汇总。
        if (!statisticsDate) return;

        console.log("----------统计定时任务启动------------", statisticsDate);
        const result = await financial.total_gameshist_day({
            statistics_date: statisticsDate
        });
        if (result && result.err) {
            console.error("统计定时任务失败:", result.err);
        }
    } catch (err) {
        console.error("统计定时任务异常:", err);
    } finally {
        this.running = false;
    }
};

