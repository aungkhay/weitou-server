const crypto = require('crypto');
const pomelo = require('pomelo');

const CHANNEL = 'game:account-login';
const TOKEN_LIFETIME_SECONDS = 200 * 60 * 60;
const keyFor = uid => 'game:login-token:' + String(uid);
const fingerprint = token => crypto.createHash('sha256').update(String(token)).digest('hex');

function currentFingerprint(uid) {
    return new Promise((resolve, reject) => {
        pomelo.app.get('redis').get(keyFor(uid), (err, value) => {
            if (err) return reject(err);
            resolve(value);
        });
    });
}

async function isCurrent(uid, token) {
    const current = await currentFingerprint(uid);
    // Redis 中不存在当前登录时也不放行，避免旧 token 在过期/缓存丢失后复活。
    return Boolean(current && token && current === fingerprint(token));
}

function register(uid, token) {
    // 原子保存当前 token 指纹并通知所有 connector；不在 Redis 消息中传明文 token。
    const script = `
        redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
        redis.call('PUBLISH', ARGV[3], ARGV[4])
        return 1
    `;
    return new Promise((resolve, reject) => {
        pomelo.app.get('redis').eval(script, 1, keyFor(uid), fingerprint(token),
            TOKEN_LIFETIME_SECONDS, CHANNEL, JSON.stringify({ uid: String(uid) }), (err, result) => {
                if (err) return reject(err);
                resolve(result);
            });
    });
}

function subscribe(onLogin) {
    const subscriber = pomelo.app.get('redis').duplicate();
    subscriber.on('error', err => console.error('[账号互踢订阅失败]', err.message));
    subscriber.on('message', (channel, content) => {
        if (channel !== CHANNEL) return;
        try {
            const event = JSON.parse(content);
            if (!event || typeof event.uid !== 'string') return;
            Promise.resolve(onLogin(event.uid)).catch(err => {
                console.error('[账号互踢处理失败]', err.message);
            });
        } catch (err) {
            console.error('[账号互踢消息无效]', err.message);
        }
    });
    subscriber.subscribe(CHANNEL);
    return subscriber;
}

module.exports = { fingerprint, currentFingerprint, isCurrent, register, subscribe };
