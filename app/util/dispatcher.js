module.exports.dispatch = function(uid, connectors) {
	if(!connectors.length)return;
	var index = Number(uid) % connectors.length;
	return connectors[index];
};
