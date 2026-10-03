let CODE = require("../util/code");
const loginSession = require('../util/loginSession');
module.exports = function() {
    return new Filter();
}

var Filter = function() {};

Filter.prototype.before = async function (msg, session, next) {
    if(!session.uid){
      next(CODE.GAME.NO_LOGIN.code,CODE.GAME.NO_LOGIN.msg);
      return;
    }
    const accountId = session.get('loginAccountId');
    if (accountId) {
        try {
            const current = await loginSession.currentFingerprint(accountId);
            if (!current || current !== session.get('loginTokenHash')) {
                return next(CODE.ENTRY.FA_LOGIN_REPLACED, {code:CODE.ENTRY.FA_LOGIN_REPLACED,msg:'账号已在其他终端登录，请重新登录'});
            }
        } catch (err) {
            return next(CODE.ENTRY.FA_SESSION_UNAVAILABLE, {code:CODE.ENTRY.FA_SESSION_UNAVAILABLE,msg:'登录状态校验暂不可用'});
        }
    }
    next();
};
  
Filter.prototype.after = function (err, msg, session, resp, next) {
    next(err);
};

