let data =  {
appId: 'AvMSzREXTT',
chatId: 602567500072222700,
chatType: 2,
groupRole: 2,
msg: '{"packetId":0,"cardChatId":0,"orderId":0,"beAppealContent":"","about":"","channel":"","atIds":[],"deviceId":"af65e4ac31354ac2be36f49667537fd4","callType":0,"cUserId":0,"recordId":"","clientType":0,"price":"","id":"6a0d37bb0bd1ea58d75db805","unSend":false,"height":0,"mute":false,"eventType":0,"forwardChatId":0,"customUrl":"","size":0,"inviterId":0,"status":0,"callDuration":0,"msgType":1,"toUid":0,"chatId":602567500072222720,"orderEvent":0,"sellContent":"","sysId":0,"msgExpireTime":86400,"latitude":0.0,"galleryType":0,"icon":"","msgId":636618219397840896,"cTime":1779251123837,"gms":[],"useType":0,"senderId":"user_39259487838c474fa4b159a4f8b5eefc","top":false,"callStatus":0,"galleryMediaType":0,"place":"","cancelReason":0,"applyIdStr":"","thumbnailUrl":"","eId":0,"side":0,"address":"","clientId":22254967041163264,"userId":0,"advertId":0,"expiresAt":1779337531439,"tradeCurr":0,"url":"","gfs":[],"cNickname":"","width":0,"md5":"","forwardUserId":0,"atUsers":[],"businessId":0,"editTime":0,"orderTabId":0,"applyId":0,"orderTime":0,"members":[],"replyId":0,"sTime":1779251131439,"longitude":0.0,"packetType":0,"fiatCurr":0,"appealContent":"","count":0,"forwardGroupName":"","coinId":0,"expireTime":0,"forwardChatType":0,"name":"","records":[],"link":"","editId":0,"remark":"","title":"","content":"/remark @刘 刘","duration":0,"buyContent":"","photoUrl":"","amount":"","quantity":"","cIcon":"","userName":"","appealId":0,"inviterName":"","time":0,"applyUsers":[],"user":{"uid":0,"name":""}}',
nickname: '小明',
type: 1,
virtualUid: 'user_39259487838c474fa4b159a4f8b5eefc'
}
data.msg = data.msg.replace(/"chatId":(\d+)/, '"chatId":"$1"');
data.msg = JSON.parse(data.msg);
const { chatType, groupRole} = data;
const {  chatId, clientId, content,nickname } = data.msg;
// 要字符串比较
console.log(BigInt("676462443316117505") > BigInt("676462443316117500"))