var Code = require('../../../util/code');
var dispatcher = require('../../../util/dispatcher');
/**
 * Gate handler that dispatch user to connectors.
 */
module.exports = function(app) {
	return new GateHandler(app);
};

var GateHandler = function(app) {
	this.app = app;
	this.dispatcher = dispatcher;
	if(!this.app)
		logger.error(app);
};

GateHandler.prototype.queryEntry = function(msg, session, next) {
	var uid = msg.uid;
	if (!uid) {
		next(null, {
			code: Code.FAIL
		});
		return;
	}
	var connectors = this.app.getServersByType('connector');
	if (!connectors || connectors.length === 0) {
		next(null, {
			code: Code.GATE.NO_SERVER_AVAILABLE
		});
		return;
	}
	var res = this.dispatcher.dispatch(uid, connectors);
	next(null, {
		code: Code.OK,
		host: res.host,             //res.host, "ctgmboss.com"  不知为何放在配置文件里读不出     
		port: res.clientPort
	});
};

