var crypto = require('crypto');

/**
 * Create token by uid. Encrypt uid and timestamp to get a token.
 * 
 * @param  {String} uid user id
 * @param  {String|Number} timestamp
 * @param  {String} pwd encrypt password
 * @return {String}     token string
 */

module.exports.create = function(uid, timestamp, pwd) {
    var msg = uid + '|' + timestamp;
    // derive 32-byte key from password
    const key = crypto.createHash('sha256').update(String(pwd)).digest();
    const iv = crypto.randomBytes(16); // 16 bytes IV for AES-256-CBC
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let enc = cipher.update(msg, 'utf8', 'hex');
    enc += cipher.final('hex');
    // prepend iv (hex) so parse can recover it
    return iv.toString('hex') + enc;
};

// 控制工具的作用域由服务器签名，不能通过请求参数给游戏 token 加免踢标记。
module.exports.createControl = function(uid, timestamp, pwd) {
    const encrypted = module.exports.create(uid, timestamp, pwd);
    const payload = 'control.' + encrypted;
    const signature = crypto.createHmac('sha256', String(pwd)).update(payload).digest('hex');
    return payload + '.' + signature;
};

/**
 * Parse token to validate it and get the uid and timestamp.
 * 
 * @param  {String} token token string
 * @param  {String} pwd   decrypt password
 * @return {Object}  uid and timestamp that exported from token. null for illegal token.     
 */
module.exports.parse = function(token, pwd) {
    let isControl = false;
    if (typeof token !== 'string') return null;
    if (token.startsWith('control.')) {
        const parts = token.split('.');
        if (parts.length !== 3 || !/^[a-f0-9]{64}$/.test(parts[2])) return null;
        const expected = crypto.createHmac('sha256', String(pwd))
            .update(parts[0] + '.' + parts[1]).digest();
        if (!crypto.timingSafeEqual(expected, Buffer.from(parts[2], 'hex'))) return null;
        token = parts[1];
        isControl = true;
    }
    // token must contain iv (32 hex chars for 16 bytes) + cipherHex
    if (!token || token.length <= 32) return null;
    try {
        const ivHex = token.slice(0, 32);
        const encHex = token.slice(32);
        const iv = Buffer.from(ivHex, 'hex');
        const key = crypto.createHash('sha256').update(String(pwd)).digest();
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let dec = decipher.update(encHex, 'hex', 'utf8');
        dec += decipher.final('utf8');
        // console.log("dec:"+dec);
        const ts = dec.split('|');
        if (ts.length !== 2) return null;
        const result = {uid: ts[0], timestamp: Number(ts[1])};
        if (isControl) result.clientType = 'control';
        return result;
    } catch(err) {
        console.error('[token] fail to decrypt token.', err.message);
        return null;
    }
};

module.exports.create2 = function(uid, timestamp, pwd) {
	var msg = uid + '|' + timestamp;
	var cipher = crypto.createCipher('aes256', pwd);
	var enc = cipher.update(msg, 'utf8', 'hex');
	enc += cipher.final('hex');
	return enc;
};

/**
 * Parse token to validate it and get the uid and timestamp.
 * 
 * @param  {String} token token string
 * @param  {String} pwd   decrypt password
 * @return {Object}  uid and timestamp that exported from token. null for illegal token.     
 */
module.exports.parse2 = function(token, pwd) {
	var decipher = crypto.createDecipher('aes256', pwd);
	var dec;
	try {
		dec = decipher.update(token, 'hex', 'utf8');
		dec += decipher.final('utf8');
	} catch(err) {
		console.error('[token] fail to decrypt token. %j',err, token);
		return null;
	}
	console.log("dec:"+dec);
	var ts = dec.split('|');
	if(ts.length !== 2) {
		// illegal token
		return null;
	}
	return {uid: ts[0], timestamp: Number(ts[1])};
};
