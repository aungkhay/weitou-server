// sendGroupMessage.js
const crypto = require('crypto');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const FormData = require('form-data');
let Config = require("../../config/config.json").paopaochat;
const http = require('http');
const https = require('https');

// ==================== 配置 ====================
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const TEMP_UPLOAD_DIR = path.join(os.tmpdir(), 'bot-uploads');
const MAX_CONCURRENT_UPLOADS = 3;
const UPLOAD_RETRY_TIMES = 3;

fs.mkdir(TEMP_UPLOAD_DIR, { recursive: true }).catch(console.log);

// ==================== Axios高性能连接池配置 ====================
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 5000, // 延长心跳，保持连接不销毁
  maxSockets: 50,       // 并发不高，50 足够
  maxFreeSockets: 10
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 5000,
  maxSockets: 50,
  maxFreeSockets: 10
});

const apiClient = axios.create({
  timeout: 30000,
  httpAgent,
  httpsAgent,
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
  headers: {
    Connection: 'keep-alive'
  }
});

// ==================== Multer 内存配置 ====================
// 因为并发不高，直接放内存（Memory）比写到硬盘再读取要快得多
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
    'image/webp', 'image/bmp', 'video/mp4'
  ];
  if (allowedMimes.includes(file.mimetype)) cb(null, true);
  else cb(new Error(`不支持的文件类型: ${file.mimetype}`), false);
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter
}).single('file'); // 假定前端上传的字段名叫 'file'

const uploadMiddleware = (req, res, fieldName = 'file') => new Promise((resolve, reject) => {
  upload.single(fieldName)(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        switch (err.code) {
          case 'LIMIT_FILE_SIZE': reject(new Error(`文件过大，最大允许 ${MAX_FILE_SIZE/1024}KB`)); break;
          case 'LIMIT_FILE_COUNT': reject(new Error('文件数量过多')); break;
          case 'LIMIT_UNEXPECTED_FILE': reject(new Error('意外的文件字段')); break;
          default: reject(new Error(`Multer错误: ${err.message}`));
        }
      } else reject(err);
    } else resolve(req);
  });
});

// ==================== 签名认证 ====================
function calculateBodySha256(body) {
  if (body && Object.keys(body).length > 0) {
    return crypto.createHash('sha256').update(JSON.stringify(body), 'utf8').digest('hex');
  }
  return '';
}

function generateNonce() { 
  return crypto.randomBytes(8).toString('hex'); 
}

function generateSignature({ appId, timestamp, nonce, method, path, bodySha256, virtualConfig = null }) {
  let signStr = `${appId}\n${timestamp}\n${nonce}\n${method}\n${path}`;
  if (bodySha256) signStr += `\n${bodySha256}`;
  let config = virtualConfig || Config;
  return crypto.createHmac('sha256', config.secret).update(signStr, 'utf8').digest('hex');
}

// ...existing code...
async function sendRequest(method, path, data = null, isFileUpload = false, virtualConfig = null) {
  const timestamp = Date.now().toString();
  const nonce = generateNonce();
  let bodySha256 = '';
  let bodyString = null;

  if (method.toUpperCase() === 'POST' && !isFileUpload && data) {
    bodyString = JSON.stringify(data);
    bodySha256 = crypto.createHash('sha256').update(bodyString).digest('hex');
  }

  let config = virtualConfig || Config;
  
  const signature = generateSignature({
    appId: config.appId, timestamp, nonce, method: method.toUpperCase(), path, bodySha256, virtualConfig
  });

  const headers = {
    'x-appid': config.appId,
    'x-timestamp': timestamp,
    'x-nonce': nonce,
    'x-signature': signature
  };
  
  const requestConfig = { 
    method: method.toUpperCase(),
    url: `${config.baseUrl}${path}`,
    timeout: 30000,
    maxRedirects: 0, // 💡 极其重要：防止 Node 环境下 Axios 顺着文件流尝试重定向导致卡死
    httpAgent,       // 💡 极其重要：复用 TCP 连接，省去每次上传重连的几秒延迟
    httpsAgent
  };
  if (path === '/chat/bot/api/message/send') {
    requestConfig.transformResponse = [require('../util/parseMessageResponse')];
  }

  if (method.toUpperCase() === 'POST' && data) {
    if (isFileUpload && data instanceof FormData) {
      requestConfig.data = data;
      // 合并 FormData 头部
      requestConfig.headers = { ...headers, ...data.getHeaders() };

      // --- 新增：为 FormData 预计算 Content-Length，避免 chunked 传输（异步） ---
      try {
        const getLength = () => new Promise((res, rej) => data.getLength((err, len) => err ? rej(err) : res(len)));
        const length = await getLength();
        if (length && typeof length === 'number') {
          requestConfig.headers['Content-Length'] = String(length);
        }
      } catch (lenErr) {
        // 无法计算长度则忽略（仍会使用 chunked），但记录以便排查
        console.warn('[sendRequest] 无法计算 FormData 长度，使用 chunked:', lenErr.message);
      }
      // --------------------------------------------------------------------
    } else {
      headers['Content-Type'] = 'application/json; charset=utf-8';
      requestConfig.headers = headers;
      requestConfig.data = bodyString;
    }
  } else if (method.toUpperCase() === 'GET' && data) {
    requestConfig.headers = headers;
    requestConfig.params = data; 
  } else {
    requestConfig.headers = headers;
  }
  
  try {
    const response = await apiClient(requestConfig);
    if (response.data && (response.data.code === 200 || response.data.code === 0)) {
      return response.data;
    } else {
      throw new Error(`API错误: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    if (error.response) {
      throw new Error(`HTTP错误 ${error.response.status}: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * 适配新版接口的上传函数（支持图片和 MP4 视频）
 * @param {Buffer} fileBuffer 文件的二进制 Buffer
 * @param {string} filename 文件名（带后缀，如 'test.png' 或 'video.mp4'）
 * @param {string} contentType 文件类型（如 'image/png' 或 'video/mp4'）
 * @param {string} uploadApiPath 上传接口路径，固定传：'/storage/bot/api/msg/file/upload'
 * @param {number} retryTimes 最大重试次数
 */
async function uploadFileWithRetry(fileBuffer, filename, contentType, uploadApiPath, retryTimes = UPLOAD_RETRY_TIMES) {
  let lastError;

  // 1. ✨ 新增：使用 sha256 算法获取要上传文件的 hash 值（新接口必填参数）
  const fileSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // 2. 构建 FormData 表单数据
  const form = new FormData();
  form.append('file', fileBuffer, { filename: filename, contentType: contentType });
  form.append('sha256', fileSha256); // ✨ 新增：将计算好的 hash 值放入表单中

  // 3. 执行带退避机制的重试循环
  for (let i = 0; i < retryTimes; i++) {
    try {
      // 💡 核心改动提示：如果你的网关签名（generateSignature）要求文件上传时的 bodySha256 
      // 必须为文件本身的 sha256 传值，请在此处将 fileSha256 传给 sendRequest 内部处理。
      // 目前 sendRequest 内部 isFileUpload 为 true 时 bodySha256 默认为空字符串。
      const result = await sendRequest('POST', uploadApiPath, form, true);
      return result;
    } catch (error) {
      lastError = error;
      console.warn(`[上传重试] 第 ${i + 1} 次失败: ${error.message}`);
      // 等待短暂退避再重试
      await new Promise(r => setTimeout(r, 200 * (i + 1)));
    }
  }
  throw new Error(`重试 ${retryTimes} 次后上传仍然失败。原因: ${lastError.message}`);
}


// ==================== 文件类型检测 ====================
function detectFileType(buffer) {
  if (!buffer || buffer.length < 4) return 'unknown';
  const header = buffer.slice(0, 4).toString('hex');
  if (header.startsWith('ffd8')) return 'jpg';
  if (header.startsWith('89504e47')) return 'png';
  if (header.startsWith('47494638')) return 'gif';
  if (header.startsWith('424d')) return 'bmp';
  if (header.startsWith('00000018') || header.startsWith('00000020')) return 'mp4';
  return 'unknown';
}


const imageSize = require('image-size'); // 引入图片长宽解析

// ==================== 媒体尺寸/时长解析 ====================
function getImageDimensions(buffer) {
  try {
    const dimensions = imageSize(buffer);
    return {
      width: dimensions.width || 800,
      height: dimensions.height || 600
    };
  } catch (err) {
    return { width: 800, height: 600 };
  }
}

// ==================== 动态获取图片的宽高 ====================
function getImageDimensions(buffer) {
  try {
    const dimensions = imageSize(buffer);
    return {
      width: dimensions.width || 800,
      height: dimensions.height || 600
    };
  } catch (err) {
    console.error('[图片尺寸解析失败]，使用默认值:', err.message);
    return { width: 800, height: 600 }; // 降级兜底
  }
}

function getMp4FileInfo(buffer) {
  try {
    let width = 0, height = 0, duration = 0;
    let offset = 0;
    while (offset < buffer.length - 8) {
      const size = buffer.readUInt32BE(offset);
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      if (type === 'mvhd') {
        const currentPos = offset + 8;
        const timescale = buffer.readUInt32BE(currentPos + 12);
        const durationTicks = buffer.readUInt32BE(currentPos + 16);
        if (timescale > 0) duration = Math.round(durationTicks / timescale);
        offset += size;
      } else if (type === 'tkhd') {
        const currentPos = offset + 8;
        width = buffer.readUInt16BE(currentPos + 76);
        height = buffer.readUInt16BE(currentPos + 80);
        offset += size;
        if (width > 0 && height > 0) break;
      } else {
        if (size < 8) break;
        offset += size;
      }
    }
    return { width: width > 0 ? width : 640, height: height > 0 ? height : 360, duration };
  } catch (err) {
    return { width: 640, height: 360, duration: 0 };
  }
}

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png',
    '.gif':'image/gif', '.bmp':'image/bmp', '.webp':'image/webp',
    '.mp4':'video/mp4'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// ==================== 文件上传 ====================
async function uploadFile(fileData, filename) {
  if (!Buffer.isBuffer(fileData)) {
    throw new Error('fileData必须是Buffer');
  }

  if (fileData.length > MAX_FILE_SIZE) {
    throw new Error(
      `文件过大 ${(fileData.length / 1024 / 1024).toFixed(2)}MB`
    );
  }

  const ext = path.extname(filename).toLowerCase();
  const safeFilename = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;

  const formData = new FormData();

  formData.append(
    'file',
    fileData,
    {
      filename: safeFilename,
      contentType: getMimeType(filename)
    }
  );

  formData.append(
    'originalName',
    Buffer.from(filename).toString('base64')
  );

  formData.append(
    'fileSize',
    String(fileData.length)
  );

  const result = await sendRequest(
    'POST',
    '/storage/bot/api/msg/file/upload',
    formData,
    true
  );

  if (!result?.data) {
    throw new Error('上传失败，返回数据为空');
  }

  console.log(`[上传成功] ${filename}\n`);
  return result.data;
}

// ==================== 批量上传控制 ====================
class ConcurrencyLimit {
  constructor(limit) {
    this.limit = limit;
    this.running = 0;
    this.queue = [];
  }

  async run(fn) {
    while (this.running >= this.limit) {
      await new Promise(resolve => this.queue.push(resolve));
    }
    
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      const resolve = this.queue.shift();
      if (resolve) resolve();
    }
  }
}

async function uploadFilesParallel(fileArray) {
  const limiter = new ConcurrencyLimit(MAX_CONCURRENT_UPLOADS);
  
  const uploadTasks = fileArray.map((file, index) => 
    limiter.run(async () => {
      try {
        console.log(`[批量上传] ${index + 1}/${fileArray.length}: ${file.name}`);
        return await uploadFileWithRetry(file.buffer, file.name);
      } catch (error) {
        console.error(`[批量上传失败] ${file.name}: ${error.message}`);
        throw error;
      }
    })
  );

  return Promise.all(uploadTasks);
}

// ==================== 消息发送 ====================  
async function sendGroupMessage(chatId, content, options = {}, virtualConfig = null) {
  const apiPath = '/chat/bot/api/message/send';
  if(!options || !options.msgType) options.msgType = 1;

  const requestBody = { chatType: 2, chatId, msgType: options.msgType };

  console.log(`[消息发送] chatId=${chatId}, msgType=${options.msgType}`);

  switch (options.msgType) {
    case 1: 
      requestBody.body = content; 
      break;
    case 2:
      requestBody.body = '';
      requestBody.name = options.name;
      requestBody.thName = options.thName;
      requestBody.width = options.width || 1920;     //800
      requestBody.height = options.height || 1080;   //600
      requestBody.size = options.size;
      break;
    case 13:
      requestBody.body = '';
      requestBody.name = options.name;
      requestBody.coverName = options.coverName;
      requestBody.width = options.width || 640;
      requestBody.height = options.height || 360;
      requestBody.duration = options.duration || 0;
      requestBody.size = options.size;
      break;
    default: throw new Error(`不支持的消息类型: ${options.msgType}`);
  }

  if (options.atIds && options.atIds.length > 0) requestBody.ats = options.atIds;

  return await sendRequest('POST', apiPath, requestBody, false, virtualConfig);
}

// ==================== 发送媒体消息 ====================
async function sendMediaMessage(
  chatId,
  fileBuffer,
  fileName,
  options = {}
) {
  if (!Buffer.isBuffer(fileBuffer)) {
    throw new Error('文件必须为Buffer');
  }

  const ext = path.extname(fileName).toLowerCase();
  const isVideo = ext === '.mp4';


  // 带重试的上传
  const uploadResult = await uploadFileWithRetry(fileBuffer, fileName);

  const msgOptions = {
    name: uploadResult.name,
    size: uploadResult.size
  };

  if (isVideo) {
    msgOptions.msgType = 13;
    msgOptions.coverName = uploadResult.thName;
    msgOptions.width = options.width || 640;
    msgOptions.height = options.height || 360;
    msgOptions.duration = options.duration || 0;
  } else {
    msgOptions.msgType = 2;
    msgOptions.thName = uploadResult.thName;
    msgOptions.width = options.width || 800;
    msgOptions.height = options.height || 600;
  }

  return sendGroupMessage(chatId, '', msgOptions);
}

// ==================== 其他功能 ====================
async function getGroupInfo(chatIds) {
  console.log('获取群聊信息...');
  const requestBody = {
    list: [{
      type: 2,
      chatIds: chatIds
    }]
  };
  
  try {
    const result = await sendRequest('POST', '/chat/info', requestBody);
    return result;
  } catch (error) {
    console.error('❌ 获取群聊信息失败:', error.message);
    throw error;
  }
}

async function refreshMessage(chatId, msgId, newContent) {
  const requestBody = {
    chatType: 2,
    chatId: chatId,
    msgId: msgId,
    msgType: 1,
    body: newContent
  };
  
  try {
    const result = await sendRequest('POST', '/chat/bot/api/message/refresh', requestBody);
    console.log('✅ 消息编辑成功');
    return result;
  } catch (error) {
    console.error('❌ 消息编辑失败:', error.message);
    throw error;
  }
}

async function banGroupMember(chatId, uid, ban) {
  console.log(`${ban ? '禁言' : '解除禁言'}用户 ${uid}...`);
  const requestBody = {
    chatId: chatId,
    uid: uid,
    ban: ban
  };
  
  try {
    const result = await sendRequest('POST', '/chat/group/member/ban/op', requestBody);
    console.log(`✅ 用户${ban ? '禁言' : '解除禁言'}成功`);
    return result;
  } catch (error) {
    console.error(`❌ 用户${ban ? '禁言' : '解除禁言'}失败:`, error.message);
    throw error;
  }
}

async function kickGroupMembers(chatId, uids, clientId = 1) {
  console.log(`将用户踢出群聊...`);
  const requestBody = {
    chatId: chatId,
    uids: uids,
    clientId: clientId
  };
  
  try {
    const result = await sendRequest('POST', '/chat/group/del/op', requestBody);
    console.log(`✅ 踢出用户成功`);
    return result;
  } catch (error) {
    console.error(`❌ 踢出用户失败:`, error.message);
    throw error;
  }
}

async function setGroupMute(chatId, mute, ban) {
  console.log(`设置群聊全员禁言...`);
  const requestBody = {
    chatId: chatId,
    mute: mute,
    ban: ban
  };
  
  try {
    const result = await sendRequest('POST', '/chat/group/mute2', requestBody);
    console.log(`✅ 设置群聊全员禁言成功`);
    return result;
  } catch (error) {
    console.error(`❌ 设置群聊全员禁言失败:`, error.message);
    throw error;
  }
}

// ==================== 导出 ====================
module.exports = {
  sendGroupMessage,
  getGroupInfo,
  refreshMessage,
  banGroupMember,
  kickGroupMembers,
  setGroupMute,
  uploadFile,
  uploadFileWithRetry,
  uploadFilesParallel,
  sendMediaMessage,
  sendRequest,
  upload,
  uploadMiddleware,
  MAX_FILE_SIZE,
  ConcurrencyLimit
};
