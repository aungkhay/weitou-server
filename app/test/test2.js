// simple-example.js
const { sendGroupMessage,getGroupInfo } = require('./sendGroupMessage');

// 简单的发送消息函数
async function sendSimpleMessage() {
  // 替换为实际的群聊ID
const groupId = '614169580335529984'; // ⚠️ 请替换为你要发送的群聊ID 602567500072222720
  
  // 要发送的消息内容
//   const message = `大家好！我是机器人 hhbot
// 当前时间: ${new Date().toLocaleString('zh-CN')}
// 很高兴和大家交流！`;
     const message = "1111";  

  try {
    console.log('开始发送消息...');
    const result = await sendGroupMessage(groupId, message);
    console.log('✅ 消息发送成功！');
    console.log('消息ID:', result.data.msgId);
    // let s = await getGroupInfo(groupId);
    // console.log('s=',s);
  } catch (error) {
    console.error('❌ 发送失败:', error.message);
  }
}

// 执行发送
sendSimpleMessage();