// 简洁稳健的 IP 白名单中间件，支持从 options / config / 数据库 动态获取列表（优先级：options -> config -> db）
// 支持单个 IPv4 精确匹配和 CIDR（简单实现），兼容 ::ffff: IPv4 映射
const Config = require('../../../config/config');
const userDao = require('../../dao/userDao');

function ipToLong(ip) {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}

function cidrContains(cidr, ip) {
  const [range, bits] = cidr.split('/');
  if (!range || !bits) return false;
  const mask = ~(2 ** (32 - Number(bits)) - 1) >>> 0;
  return (ipToLong(range) & mask) === (ipToLong(ip) & mask);
}

function normalizeRemoteIp(req) {
  let ip = '';
  const xff = req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'];
  if (xff) ip = xff.split(',')[0].trim();
  if (!ip) ip = req.ip || (req.connection && req.connection.remoteAddress) || (req.socket && req.socket.remoteAddress) || '';
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
  // 去掉端口号（IPv6 或 IPv4:port）
  if (ip.includes(':') && ip.indexOf('.') === -1) {
    // 可能是原生 IPv6，不做处理
    return ip;
  }
  if (ip.includes(':')) ip = ip.split(':')[0];
  return ip;
}

module.exports = function ipWhitelistMiddleware(options = {}) {
  // 返回实际中间件（可为 async）
  return async function (req, res, next) {
    try {
      // 优先使用传入的 options.list
      let list = Array.isArray(options.list) && options.list.length ? options.list.slice() : [];

      // 其次使用 config 中的白名单（若未传 options.list）
      if (!list.length) {
        const cfgList = (Config && Config.paopaochat && Config.paopaochat.ipWhitelist) || [];
        if (Array.isArray(cfgList) && cfgList.length) list = cfgList.slice();
      }

      // 最后尝试从数据库动态加载（仅在前两者都没有时，且 userDao 提供方法）
      if (!list.length) {
        try {
          if (userDao && typeof userDao.getIpWhiteList === 'function') {
            const dbRes = await userDao.getIpWhiteList({});
            const payload = dbRes && dbRes.data ? dbRes.data : dbRes;
            const raw = payload && (payload.ipWhiteList || payload.ipWhileList || payload.ip_list || payload.iplist);
            if (raw && typeof raw === 'string') {
              list = raw.split(',').map(s => s.trim()).filter(Boolean);
            } else if (Array.isArray(raw)) {
              list = raw.map(s => String(s).trim()).filter(Boolean);
            }
          }
        } catch (e) {
          console.warn('ipWhitelist: load from db failed, continue with existing list', e && e.message ? e.message : e);
        }
      }

      // normalize list entries
      list = (list || []).map(it => String(it || '').trim()).filter(Boolean);
      const remoteIp = normalizeRemoteIp(req);
      console.log("remoteIp:",remoteIp);
      if (!remoteIp) {
        console.warn('ipWhitelist: cannot determine remote ip for request', req.path);
        return res.status(403).send('forbidden');
      }

      // 如果白名单为空，默认允许（可改为 deny-by-default）
      if (list.length === 0) return next();

      const allowed = list.some(entry => {
        if (!entry) return false;
        // 单个 ip 精确匹配
        if (!entry.includes('/')) return entry === remoteIp;
        // CIDR 支持（仅IPv4）
        try { return cidrContains(entry, remoteIp); } catch (e) { return false; }
      });

      if (allowed) return next();

      console.warn(`ipWhitelist: forbidden ip=${remoteIp} path=${req.path}`);
      return res.status(403).send('forbidden');
    } catch (err) {
      console.error('ipWhitelist middleware error:', err && err.message ? err.message : err);
      return res.status(500).send('internal error');
      }
  };
};