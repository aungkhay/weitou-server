var GMResponse = function(code,rType,roomId,msg, data) {
    this.code = code;   // String()
    this.msg = msg;
    this.rType = rType ? String(rType) : "";
    this.roomId = roomId ? String(roomId) : "";
    this.data = data ? data : "";
};

module.exports = GMResponse;
