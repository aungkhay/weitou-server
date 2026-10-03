const { sendGroupMessage, uploadFile,sendRequest } = require('./sendGroupMessage.js');
const fs = require('fs').promises; // 🚀 升级为异步文件操作，提升整体并发速度
const fsSync = require('fs');      // 仅用于 existsSync 检查
const sharp = require('sharp'); 
const crypto = require('crypto');  // 🚀 引入加密模块用于计算 sha256
const FormData = require('form-data');
const systemDao = require('../dao/systemDao.js');
// ✅ 读取 mac_token.json
const macTokenConfig = require("../../config/mac_token.json");
const cache = require('../dao/Cache.js');

var sendChat = module.exports;

async function getMacNameFromGroupChat(chatId) {
  let msg = {chat_id:chatId};
  let r = await cache.get("pull_table_nickname_" + chatId);

  if (r) {
    //console.log("拉表机器人缓存命中:", `${chatId}:${r}`);
    return r;
  }

  let res = await systemDao.getGroupPullDataSetupByChatId(msg);
  if(res && res.data && res.data.length > 0) {
    await cache.set(`pull_table_nickname_${chatId}`, res.data[0].pull_table_nickname);
    return res.data[0].pull_table_nickname;
  }
  console.error("========没有找到拉表机器人========")
  return null;
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
    return {
      width: width > 0 ? width : 640,
      height: height > 0 ? height : 360,
      duration: duration
    };
  } catch (err) {
    console.error('[MP4 尺寸/时长解析失败]，使用默认值:', err.message);
    return { width: 640, height: 360, duration: 0 }; 
  }
}

sendChat.sendTextMessage = async function(message, groupId , config = null) {
  try {
    if(!config){
       let mac_name = await getMacNameFromGroupChat(groupId);
       if(mac_name){
          config = macTokenConfig[mac_name] || null;
          //console.log("====================拉表机器人配置====================",mac_name,config);
       }
    }
    let res = await sendGroupMessage(groupId, message, {}, config);
    console.log(`发送数据${message},返回结果：${JSON.stringify(res)}`);
  } catch (error) {
    console.error('❌ 发送失败:', error.message);
  }
}

sendChat.sendImageMessage = async function(filePath, fileName, groupId, options = {}) {
   if (options.config == null) {
       let mac_name = await getMacNameFromGroupChat(groupId);
       if(mac_name){
          options.config = macTokenConfig[mac_name] || null;
          //console.log("====================拉表机器人配置====================",mac_name,options.config);
       }
    }
  // 内部辅助：动态计算 Buffer 的 SHA-256（用于新版接口及秒传校验）
  const calcBufferSha256 = (buffer) => {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  };

  // 🔄 深度整合：自闭环的物理重试上传逻辑，直接内聚新版接口规范
  const uploadWithRetry = async (fileBuffer, fileName, contentType, attempts = 3, delayMs = 500) => {
    let lastError;
    const uploadApiPath = '/storage/bot/api/msg/file/upload';

    // 1. ✨ 新增：使用 sha256 算法获取要上传文件的 hash 值（新接口必填参数）
    const fileSha256 = calcBufferSha256(fileBuffer);

    // 2. 将 FormData 构建移到外面，防止重试时重复开辟内存空间
    const form = new FormData();
    form.append('file', fileBuffer, { filename: fileName, contentType: contentType });
    form.append('sha256', fileSha256); // ✨ 新增：将计算好的 hash 值放入表单中

    for (let i = 0; i < attempts; i++) {
      try {
        // 3. 完美调用外部环境的 sendRequest 函数
        const response = await sendRequest('POST', uploadApiPath, form, true, options.config);
        if (response && response.data) {
          return response.data; // 直接交付核心 data 节点（内含 name, thName, coverName）
        }
        throw new Error('服务器返回的结构中未包含 data 节点');
      } catch (err) {
        lastError = err;
        console.warn(`[物理上传重试] 第 ${i + 1} 次失败: ${err.message}`);
        // 指数退避延迟
        await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)));
      }
    }
    throw new Error(`重试 ${attempts} 次后物理上传仍然失败。原因: ${lastError.message}`);
  };

  try {
    if (!fsSync.existsSync(filePath)) {
      return { err: 'FILE_NOT_FOUND', data: null, message: `文件不存在: ${filePath}` };
    }

    // 1. 异步读取本地文件
    let fileBuffer = await fs.readFile(filePath);
    let ext = (fileName || '').split('.').pop().toLowerCase();
    const isVideo = (ext === 'mp4');
    // 根据扩展名安全匹配 Content-Type 协议头
    let  uploadContentType = isVideo ? 'video/mp4' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    let  uploadFileName = fileName;
    
    // 2. 计算文件的初始哈希值
    let currentSha256 = calcBufferSha256(fileBuffer);
    let finalMediaData = null; 
    let isSecUpload = false; 

    // 3. 🚀 核心逻辑：调用 FileCheck 接口进行秒传判定
    try {
      const checkResult = await sendRequest('GET', '/storage/bot/api/msg/file/hash/check', { sha256: currentSha256 }, false, config);
      console.log(`[HashCheck 结果] ${JSON.stringify(checkResult)}`);
      
      if (checkResult && checkResult.data && (checkResult.data.exists === "true" || checkResult.data.exists === true)) {
        finalMediaData = checkResult.data.uploadRes || {};
        isSecUpload = true;
       
        // ================= 【🌟 核心层级补齐与对齐防线】 =================
        if (!finalMediaData.width || !finalMediaData.height || 
            finalMediaData.width === 'null' || finalMediaData.width === null || 
            Number(finalMediaData.width) === 0) {
          try {
            // 直接利用内存里已经加载好的原始本地 fileBuffer 现场读取真实比例，满血复活！
            const secMeta = await sharp(fileBuffer).metadata();
            finalMediaData.width = secMeta.width || 800;
            finalMediaData.height = secMeta.height || 600;
            //console.log(`[秒传比例纠偏成功] 成功拦截云端 null 脏数据，本地已重置真实比例: ${finalMediaData.width}x${finalMediaData.height}`);
          } catch (secErr) {
            //console.error('[秒传本地校准异常，降级使用默认流]', secErr.message);
          }
        } 

        //console.log(`[秒传成功] 命中云端哈希! 彻底跳过本地解析与物理上传。文件名: ${fileName}`);
      } else {
        //console.log(`[秒传跳过] 接口返回文件不存在，进入常规上传流程。`);
      }
    } catch (hashErr) {
      //console.warn(`[HashCheck 异常] 查验指纹失败，自动降级为常规解析上传:`, hashErr.message);
    }


    // 4. 🚀 核心逻辑：如果未命中秒传，则在本地解析、压缩并上传
    if (!isSecUpload) {
      let localWidth = 800;
      let localHeight = 600;
      let localDuration = 0;

      if (isVideo) {
        // 本地流式解析 MP4 视频宽高与时长
        const videoInfo = getMp4FileInfo(fileBuffer);
        localWidth = videoInfo.width;
        localHeight = videoInfo.height;
        localDuration = videoInfo.duration;
      } else {
        // 📸 图片智能分流高保真压缩（安卓兼容性强化 + GIF/PNG 透明度保护）
        try {
          const sharpInstance = sharp(fileBuffer);
          const metadata = await sharpInstance.metadata();
          
          const originWidth = metadata.width || 800;
          const originHeight = metadata.height || 600;
          const format = metadata.format || ext; // 获取原始格式

          let targetWidth = originWidth;
          let targetHeight = originHeight;

          // ✅ 防止极端宽高比（安卓容易崩溃）
          const aspectRatio = originWidth / originHeight;
          if (aspectRatio > 3 || aspectRatio < 0.33) {
            //console.log(`[宽高比纠偏] 原始比例 ${aspectRatio.toFixed(2)}, 进行智能裁剪`);
            if (aspectRatio > 3) {
              targetHeight = Math.min(originHeight, 600);
              targetWidth = Math.round(targetHeight * aspectRatio);
            } else {
              targetWidth = Math.min(originWidth, 600);
              targetHeight = Math.round(targetWidth / aspectRatio);
            }
          }

          if (originWidth > 1000) {
            targetWidth = 1000;
            targetHeight = Math.round((originHeight * 1000) / originWidth);
          }

          if (targetHeight > 2000) {
            const ratio = 2000 / targetHeight;
            targetHeight = 2000;
            targetWidth = Math.round(targetWidth * ratio);
          }

          // ✅ GIF/PNG 特殊处理：保留透明度，防止黑影
        if (format === 'gif') {

            // GIF 动图必须保留，不能经过 sharp
            //console.log('[GIF保护] 保留原始GIF动画，不进行转换');

            fileBuffer = await fs.readFile(filePath);

            localWidth = originWidth;
            localHeight = originHeight;

          }
          else if (format === 'png') {

            //console.log('[PNG处理] 保留透明度压缩');

            fileBuffer = await sharpInstance
              .resize({
                width: targetWidth,
                height: targetHeight,
                fit:'inside',
                background:{
                  r:0,
                  g:0,
                  b:0,
                  alpha:0
                }
              })
              .png({
                compressionLevel:9,
                palette:false
              })
              .toBuffer();

          } else if (format === 'jpeg' || originWidth >= originHeight) {
              fileBuffer = await sharpInstance
              .resize({
                width: targetWidth,
                height: targetHeight,
                fit: 'inside',
                background: { r: 255, g: 255, b: 255 }
              })
              .jpeg({
                quality: 85,
                chromaSubsampling: '4:2:0',
                progressive: false
              })
              .toBuffer();

            uploadFileName = fileName.replace(/\.[^.]+$/i, '.jpg');
            uploadContentType = 'image/jpeg';
              
            //console.log(`[JPEG 压缩成功] 质量 85, 进度式编码已启用`);
          }
          // ✅ 其他格式（WebP、SVG 等）：转换为 JPEG
          else {
            fileBuffer = await sharpInstance
              .resize({ width: targetWidth, height: targetHeight, fit: 'inside', background: { r: 255, g: 255, b: 255 } })
              .jpeg({ quality: 85, chromaSubsampling: '4:2:0', progressive: true })
              .toBuffer();
            
            //console.log(`[格式转换] 已将 ${format} 转换为 JPEG`);
          }
          
          const newMetadata = await sharp(fileBuffer).metadata();
          localWidth = newMetadata.width || targetWidth;
          localHeight = newMetadata.height || targetHeight;

          // 💡 重新洗一次 sha256 校验码
          currentSha256 = calcBufferSha256(fileBuffer);
          //console.log(`[图片压缩完成] 尺寸: ${localWidth}x${localHeight}, 大小: ${(fileBuffer.length / 1024).toFixed(2)} KB, 格式: ${newMetadata.format}`);

        } catch (err) {
          //console.error('[图片压制错误，降级使用原始格式]', err.message);
          // ✅ 降级方案：使用原始图片，仅调整尺寸
          try {
            const fallbackBuffer = await sharp(fileBuffer)
              .resize({ width: 800, height: 600, fit: 'inside', background: { r: 255, g: 255, b: 255 } })
              .png({ palette: false, quality: 85 })
              .toBuffer();
            
            fileBuffer = fallbackBuffer;
            currentSha256 = calcBufferSha256(fileBuffer);
            localWidth = 800;
            localHeight = 600;
            //console.log('[降级压缩成功]');
          } catch (fallbackErr) {
            //console.error('[降级失败，使用原始图片]', fallbackErr.message);
            // 使用原始图片，不压缩
          }
        }
      }

      // 执行闭环内的物理直传
      let uploadResult;
      try {
        uploadResult = await uploadWithRetry(fileBuffer, uploadFileName, uploadContentType, options.uploadAttempts || 3, options.uploadRetryDelay || 500);
      } catch (err) {
        console.error('❌ 文件物理上传失败:', err?.message || err);
        return { err: 'UPLOAD_FAILED', data: null, message: err?.message || '上传失败' };
      }

      if (!uploadResult || !uploadResult.name) {
        return { err: 'UPLOAD_INVALID_RESULT', data: null };
      }


      // 完美合并与对齐新接口返回的 thName 和 coverName 字段
      finalMediaData = {
        name: uploadResult.name,
        thName: uploadResult.thName || "",
        coverName: uploadResult.coverName || "", 
        width: localWidth,
        height: localHeight,
        size: uploadResult.size || fileBuffer.length, 
        duration: localDuration
      };
      //console.log('✅ 文件物理上传成功:', finalMediaData.name);
    }

    // 5. 🚀 核心逻辑：组装 Payload，100% 像素级对齐后端强类型接收规范
    let msgOptions = {};

    if (isVideo) {
      msgOptions = {
        msgType: 13,                                         
        name: String(finalMediaData.name),                  
        coverName: String(finalMediaData.coverName || ""),   
        width: Math.round(Number(finalMediaData.width || options.width || 640)),
        height: Math.round(Number(finalMediaData.height || options.height || 360)),
        size: Math.round(Number(finalMediaData.size || fileBuffer.length)),
        duration: Math.round(Number(finalMediaData.duration || options.duration || 5)) 
      };
    } else {
      let safeWidth = Number(finalMediaData.width);
      let safeHeight = Number(finalMediaData.height);

      if (!safeWidth || safeWidth <= 0) {
          safeWidth = 800;
      }

      if (!safeHeight || safeHeight <= 0) {
          safeHeight = 600;
      }

      msgOptions = {
        msgType: 2,                                         
        name: String(finalMediaData.name),                  
        thName: String(finalMediaData.thName || finalMediaData.name),        // 
        width: safeWidth,   // Math.round(Number(finalMediaData.width || 800)),
        height: safeHeight, // Math.round(Number(finalMediaData.height || 600)),
        size: Math.round(Number(finalMediaData.size || fileBuffer.length)), 
        duration: 0                                         
      };
    }

   //console.log(`[调试] 最终下发 Payload (是否秒传: ${isSecUpload}):`, JSON.stringify(msgOptions));

    // 6. 发送群消息
    try {
      const sendRes = await sendGroupMessage(groupId, '', msgOptions, options.config);
      if (sendRes && sendRes.err) {
        console.error('sendGroupMessage 返回错误:', sendRes.err);
        return { err: 'SEND_FAILED', data: null, message: sendRes.err };
      }
      console.log("发送群消息成功:", sendRes);
      return { err: null, data: sendRes || 'sent' };
    } catch (err) {
      console.error('发送群消息失败:', err?.message || err);
      return { err: 'SEND_EXCEPTION', data: null, message: err?.message || '发送失败' };
    }

  } catch (err) {
    console.error('文件整体发送逻辑异常:', err?.message || err);
    return { err: 'FAILED', data: null, message: err?.message || '未知错误' };
  }
}


