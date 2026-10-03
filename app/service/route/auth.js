var tokenService = require('../../util/token');
var userDao = require('../../dao/userDao');    //-min
var Code = require('../../util/code');
var session_key = require('../../../config/session').secret;
const loginSession = require('../../util/loginSession');

var DEFAULT_EXPIRE = 200 * 60 * 60 * 1000;	// default session expire time: 6 hours   : 6 * 60 * 60 * 1000;

var pro = module.exports;

/**
 * Auth token and check whether expire.
 *
 * @param  {String}   token  token  string
 * @param  {Function} cb
 * @return {Void}
 */
pro.auth = async function(token, options = {}) {
	var res = tokenService.parse(token, session_key);

	if(!res) {
		return {err:Code.ENTRY.FA_TOKEN_INVALID,data:null};
	}
	if(!checkExpire(res,DEFAULT_EXPIRE)) {
		return {err:Code.ENTRY.FA_TOKEN_EXPIRE,data:null};
	}
	const isControl = res.clientType === 'control';
	if (isControl && options.allowControl !== true) {
		return {err:Code.ENTRY.FA_TOKEN_SCOPE,msg:'上传工具凭证不能用于此接口或游戏连接',data:null};
	}
	let user = await userDao.getAdminById(res.uid);
	if(user.err) {
		return {err:user.err,data:null};
	}
	if (user.data && Number(user.data.permissions) === 2 && !isControl) {
		try {
			if (!await loginSession.isCurrent(user.data.Id, token)) {
				return {err:Code.ENTRY.FA_LOGIN_REPLACED,msg:'账号已在其他终端登录或登录已失效，请重新登录',data:null};
			}
		} catch (err) {
			return {err:Code.ENTRY.FA_SESSION_UNAVAILABLE,msg:'登录状态校验暂不可用，请稍后重试',data:null};
		}
	}
	return {err:null,data:user.data};
};

/**
 * Check the token whether expire.
 *
 * @param  {Object} token  token info
 * @param  {Number} expire expire time
 * @return {Boolean}       true for not expire and false for expire
 */
var checkExpire = function(token, expire) {
	if(expire < 0) {
		// negative expire means never expire
		return true;
	}
	return (Date.now() - token.timestamp) < expire;
};
