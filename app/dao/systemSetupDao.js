let pomelo = require("pomelo");
let systemSetupDao = module.exports;
let mysql = pomelo.app.get("sqlHelper");

systemSetupDao.editPw = async function (msg) {
  let sql = "update user_admin set password = ? where username = ?";
  let args = [msg.pw,msg.userName];
  try {
      let res = await mysql.query("bjl", sql, args);
      return { err: null, data: res };
  } catch (err) {
      console.error("err:", JSON.stringify(err));
      return { err: err, data: null };
  }
};