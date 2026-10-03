// sendGroupMessage.js
const crypto = require('crypto');
const axios = require('axios'); // 需要安装: npm install axios

// 配置信息 - 使用您的实际配置
const config = {
  appId: 'AvMSzREXTT',                    // 您的机器人应用ID
  secret: '8e22f5c43f7cf25c655501baebc9e295cbc404505b5c16c460ef63342b1697ea',  // 您的机器人secret
  baseUrl: 'https://bot.paopaochat.com',  // 您的专属接口源
};

/**
 * 计算请求体的SHA256哈希值
 * @param {Object} body - 请求体对象
 * @returns {string} SHA256哈希值的十六进制字符串
 */
function calculateBodySha256(body) {
  // 如果有请求体，转换为JSON字符串并计算SHA256
  if (body && Object.keys(body).length > 0) {
    const bodyString = JSON.stringify(body);
    return crypto.createHash('sha256').update(bodyString, 'utf8').digest('hex');
  }
  return '';
}

/**
 * 生成16位十六进制随机字符串
 * @returns {string} 16位十六进制随机字符串
 */
function generateNonce() {
  return crypto.randomBytes(8).toString('hex'); // 8字节 = 16个十六进制字符
}

/**
 * 生成请求签名
 * @param {Object} params - 签名参数
 * @returns {string} 签名值
 */
function generateSignature(params) {
  const { appId, timestamp, nonce, method, path, bodySha256 } = params;
  
  // 步骤1: 构造待签名字符串
  let signStr = `${appId}\n${timestamp}\n${nonce}\n${method}\n${path}`;
  
  // 如果有bodySha256，添加到签名字符串
  if (bodySha256) {
    signStr += `\n${bodySha256}`;
  }
  
  console.log('待签名字符串:', signStr.replace(/\n/g, '\\n'));
  
  // 步骤2: 使用HMAC-SHA256签名
  const hmac = crypto.createHmac('sha256', config.secret);
  hmac.update(signStr, 'utf8');
  const signature = hmac.digest('hex');
  
  console.log('生成的签名:', signature);
  return signature;
}

/**
 * 发送HTTP请求（带签名认证）
 * @param {string} method - HTTP方法 (GET/POST)
 * @param {string} path - API路径
 * @param {Object} data - 请求体数据
 * @returns {Promise} 响应数据
 */
async function sendRequest(method, path, data = null) {
  // 生成公共请求头参数
  const timestamp = Date.now().toString(); // 毫秒级时间戳
  const nonce = generateNonce();
  
  // 计算bodySha256（如果有请求体）
  const bodySha256 = data ? calculateBodySha256(data) : '';
  
  // 生成签名
  const signature = generateSignature({
    appId: config.appId,
    timestamp,
    nonce,
    method: method.toUpperCase(),
    path,
    bodySha256
  });
  
  // 构建请求头
  const headers = {
    'x-appid': config.appId,
    'x-timestamp': timestamp,
    'x-nonce': nonce,
    'x-signature': signature,
    'Content-Type': 'application/json'
  };
  
  // 构建请求配置
  const url = `${config.baseUrl}${path}`;
  const requestConfig = {
    method: method.toUpperCase(),
    url: url,
    headers: headers,
    timeout: 10000 // 10秒超时
  };
  
  // 如果是POST请求且有数据，添加请求体
  if (method.toUpperCase() === 'POST' && data) {
    requestConfig.data = data;
  }
  
  
  try {
    const response = await axios(requestConfig);
    console.log('响应状态:', response.status);
    console.log('响应数据:', JSON.stringify(response.data, null, 2));
    
    // 检查业务状态码
    if (response.data.code === 200) {
      console.log("request data:",response.data)
      return response.data;
    } else {
      throw new Error(`API错误: ${response.data.msg} (code: ${response.data.code})`);
    }
  } catch (error) {
    if (error.response) {
      // 服务器返回了错误状态码
      console.error('HTTP错误状态:', error.response.status);
      console.error('错误响应数据:', JSON.stringify(error.response.data, null, 2));
      throw new Error(`HTTP错误 ${error.response.status}: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      // 请求发送了但没有收到响应
      console.error('未收到响应:', error.request);
      throw new Error('网络错误，未收到响应');
    } else {
      // 请求配置出错
      console.error('请求配置错误:', error.message);
      throw error;
    }
  }
}

/**
 * 向群聊发送消息
 * @param {string} chatId - 群聊ID
 * @param {string} content - 消息内容
 * @param {Array} atIds - @的用户openId列表（可选）
 * @returns {Promise} 发送结果
 */
async function sendGroupMessage(chatId, content, atIds = []) {
  console.log(`开始向群聊 ${chatId} 发送消息...`);
  
  const path = '/chat/bot/api/message/send';
  
  const requestBody = {
    chatType: 2, // 2表示群聊
    chatId: chatId,
    msgType: 2, // 1表示文本消息
    body: content,
  };
  
  // 如果有@用户，添加到请求体中
  if (atIds && atIds.length > 0) {
    requestBody.atIds = atIds;
  }
  
  try {
    const result = await sendRequest('POST', path, requestBody);
    console.log('✅ 消息发送成功! 消息ID:', result);
    return result;
  } catch (error) {
    console.error('❌ 消息发送失败:', error.message);
    throw error;
  }
}

/**
 * 获取群聊信息
 * @param {Array} chatIds - 群聊ID列表
 * @returns {Promise} 群聊信息
 */
async function getGroupInfo(chatIds) {
  console.log('获取群聊信息...');
  
  const path = '/chat/info';
  
  const requestBody = {
    list: [
      {
        type: 2, // 2表示群聊
        chatIds: chatIds
      }
    ]
  };
  
  try {
    const result = await sendRequest('POST', path, requestBody);
    console.log('✅ 群聊信息获取成功');
    return result;
  } catch (error) {
    console.error('❌ 获取群聊信息失败:', error.message);
    throw error;
  }
}

/**
 * 编辑已发送的消息
 * @param {string} chatId - 群聊ID
 * @param {number} msgId - 消息ID
 * @param {string} newContent - 新消息内容
 * @returns {Promise} 编辑结果
 */
async function refreshMessage(chatId, msgId, newContent) {
  console.log(`开始编辑消息 ${msgId}...`);
  
  const path = '/chat/bot/api/message/refresh';
  
  const requestBody = {
    chatType: 2, // 2表示群聊
    chatId: chatId,
    msgId: msgId,
    msgType: 1, // 1表示文本消息
    body: newContent
  };
  
  try {
    const result = await sendRequest('POST', path, requestBody);
    console.log('✅ 消息编辑成功');
    return result;
  } catch (error) {
    console.error('❌ 消息编辑失败:', error.message);
    throw error;
  }
}

/**
 * 禁言群成员
 * @param {string} chatId - 群聊ID
 * @param {string} uid - 用户openId
 * @param {boolean} ban - true禁言，false解除禁言
 */
async function banGroupMember(chatId, uid, ban) {
  console.log(`${ban ? '禁言' : '解除禁言'}用户 ${uid}...`);
  
  const path = '/chat/group/member/ban/op';
  
  const requestBody = {
    chatId: chatId,
    uid: uid,
    ban: ban
  };
  
  try {
    const result = await sendRequest('POST', path, requestBody);
    console.log(`✅ 用户${ban ? '禁言' : '解除禁言'}成功`);
    return result;
  } catch (error) {
    console.error(`❌ 用户${ban ? '禁言' : '解除禁言'}失败:`, error.message);
    throw error;
  }
}

/**
 * 将成员踢出群聊
 * @param {string} chatId - 群聊ID
 * @param {Array} uids - 要踢出的用户openId列表
 * @param {number} clientId - 客户端ID
 */
async function kickGroupMembers(chatId, uids, clientId = 1) {
  console.log(`将用户踢出群聊...`);
  
  const path = '/chat/group/del/op';
  
  const requestBody = {
    chatId: chatId,
    uids: uids,
    clientId: clientId
  };
  
  try {
    const result = await sendRequest('POST', path, requestBody);
    console.log(`✅ 踢出用户成功`);
    return result;
  } catch (error) {
    console.error(`❌ 踢出用户失败:`, error.message);
    throw error;
  }
}

/**
 * 设置群聊全员禁言
 * @param {string} chatId - 群聊ID
 * @param {boolean} mute - true开启全员禁言
 * @param {boolean} ban - true禁言，false取消禁言
 */
async function setGroupMute(chatId, mute, ban) {
  console.log(`设置群聊全员禁言...`);
  
  const path = '/chat/group/mute2';
  
  const requestBody = {
    chatId: chatId,
    mute: mute,
    ban: ban
  };
  
  try {
    const result = await sendRequest('POST', path, requestBody);
    console.log(`✅ 设置群聊全员禁言成功`);
    return result;
  } catch (error) {
    console.error(`❌ 设置群聊全员禁言失败:`, error.message);
    throw error;
  }
}

/**
 * 测试函数 - 演示如何使用
 */
async function main() {
  try {
    console.log('🤖 机器人名称:', 'hhbot');
    console.log('🤖 机器人用户名:', 'VB7E6LdJJ5_bot');
    console.log('='.repeat(50));
    
    // 请替换为实际的群聊ID
    const groupChatId = '558785096472068096'; // 请替换为你要发送的群聊ID
    
    // 示例1: 向群聊发送普通消息
    console.log('\n📨 示例1: 发送普通群消息');
    const message = '大家好，我是机器人hhbot，很高兴为大家服务！';
    const sendResult = await sendGroupMessage(groupChatId, message);
    
    // 示例2: 获取群聊信息
    console.log('\n📊 示例2: 获取群聊信息');
    try {
      const groupInfo = await getGroupInfo([groupChatId]);
      if (groupInfo.data && groupInfo.data.length > 0) {
        const group = groupInfo.data[0].group;
        if (group) {
          console.log(`群聊名称: ${group.name || '未知'}`);
          console.log(`群聊图标: ${group.icon || '无'}`);
          console.log(`可查看历史消息数: ${group.viewHistoryMsgCount || 0}`);
        }
      }
    } catch (error) {
      console.log('获取群聊信息失败，可能没有权限或群聊不存在');
    }
    
    // 示例3: 编辑刚刚发送的消息
    if (sendResult && sendResult.data && sendResult.data.msgId) {
      console.log('\n✏️ 示例3: 编辑消息');
      await refreshMessage(groupChatId, sendResult.data.msgId, '这是编辑后的消息内容 - 机器人已更新此消息');
    }
    
    console.log('\n✨ 所有操作完成！');
    
  } catch (error) {
    console.error('❌ 程序执行出错:', error);
  }
}

// 如果直接运行此文件，执行main函数
if (require.main === module) {
  // 检查axios是否安装
  try {
    require.resolve('axios');
    main();
  } catch (e) {
    console.error('请先安装axios: npm install axios');
    console.log('安装命令: npm install axios');
  }
}

// 导出函数供其他模块使用
module.exports = {
  sendGroupMessage,
  getGroupInfo,
  refreshMessage,
  banGroupMember,
  kickGroupMembers,
  setGroupMute,
  sendRequest
};