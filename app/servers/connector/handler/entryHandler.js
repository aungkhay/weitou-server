const Code = require('../../../util/code');
const auth = require('../../../util/auth');
const userDao = require('../../../dao/userDao');            //-min
const GMResponse= require('../../../domain/GMResponse');
const pomelo = require('pomelo');
const logger = require('pomelo-logger').getLogger('my-log', __filename);
let redlock = pomelo.app.get('redlock');
const async = require('async');
const loginSession = require('../../../util/loginSession');

module.exports = function(app) {
    return new Handler(app);
};

var Handler = function(app) {
    this.app = app;
    this.redis = app.get("redis");
    if(!this.app)logger.error(app);
};

var pro = Handler.prototype;

/**
 * New client entry game server. Check token and bind user info into session.
 *
 * @param  {Object}   msg     request message
 * @param  {Object}   session current session object
 * @param  {Function} next    next stemp callback
 * @return {Void}
 */

pro.entry = async function(msg, session, next) {         // 进入取房间信息
    console.log("entryHandler entry:", msg.rType, msg.roomId);
    let token = msg.token;
    let self = this;
    let rType = msg.rType;   
    let roomId = msg.roomId;
    let sessionService = this.app.get('sessionService');
    if(!token) {
        next(new Error('invalid entry request: empty token'), {code: Code.FAIL});
        return;
    }
    let user = await auth.auth(token);
    if(!user.data){
        return next(null, {code: user.err || Code.ENTRY.FA_USER_NOT_EXIST,msg:user.msg || "查无此账号"});
    }
    user = user.data;

    async.waterfall([
        function(cb) {
           // 同 token 的页面/连接不互踢；账号新登录由跨进程通知关闭旧 token 会话。
           if (Number(user.permissions) === 2) return cb();
           sessionService.kick(user.Id,cb);
        },
        function(cb) {
            session.bind(user.Id, cb);
        },
        function(cb) {
            session.set("userId",user.Id);
            session.set("username",user.username);
            if (Number(user.permissions) === 2) {
                session.set('loginAccountId', String(user.Id));
                session.set('loginTokenHash', loginSession.fingerprint(token));
            }
            session.pushAll(cb);
            session.on('closed', onUserLeave.bind(null, self.app));
        },
    ],async function(err) {
        if(err) {
            console.log("------------entry err:-------------"+err);
            next(err, {code: Code.FAIL});
            return;
        }
        if (Number(user.permissions) === 2) {
            try {
                if (!await loginSession.isCurrent(user.Id, token)) {
                    next(null, {code:Code.ENTRY.FA_LOGIN_REPLACED,msg:'账号已在其他终端登录，请重新登录'});
                    return sessionService.kickBySessionId(session.id, () => {});
                }
            } catch (sessionErr) {
                next(null, {code:Code.ENTRY.FA_SESSION_UNAVAILABLE,msg:'登录状态校验暂不可用'});
                return sessionService.kickBySessionId(session.id, () => {});
            }
        }
        console.log('entry success!!!!');
        next(null,new GMResponse(200,rType,roomId,'登录成功',null));
        // next(null, { 
        //     code: 200, 
        //     msg: "ok" 
        // });
    })

}

var onUserLeave = function (app, session) {
    if(!session || !session.uid) {
        console.log("leave: not session || session.uid");
        return;
    }
};

var doExitAllChannel = function(session,app,userId){
    app.rpc.bjl.bjlRemote.leave(session,userId,app.get("serverId"),function(err,res){});
    app.rpc.lh.lhRemote.leave(session,userId,app.get("serverId"),function(err,res){});
}

pro.getYe=function(msg,session,next){                  
    var userId = session.get("userId");
    if (!!userId)msg.userId = userId;
    msg.player_type = session.get("player_type");
    userDao.getYeById(msg,function(err,res){
        let data = {result:false};
        if(res != null){
           data = {result:true,ye:res.ye}
        }
        next(null, new GMResponse(106,"","",'获取余额',data));
    })
}

setOnLineState = function(msg){                  
    userDao.setOnLineState(msg,function(err,res,res2){})
}
