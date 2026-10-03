// Run with: node app/test/accountLoginSession.test.js
// Uses isolated Redis/WebSocket doubles; never connects to live services.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const tokenService = require('../util/token');
const Code = require('../util/code');
const md5 = require('js-md5');
const secret = 'account-login-test-secret';
const quiet = { log() {}, error() {} };

function load(file, dependencies, extra = {}) {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
        module, exports: module.exports, console: quiet, Buffer,
        require: name => Object.prototype.hasOwnProperty.call(dependencies, name)
            ? dependencies[name] : require(name), ...extra
    }, { filename: file });
    return module.exports;
}

async function main() {
    const values = new Map();
    const subscribers = [];
    let redisError = false;
    let holdRead = null;
    const redis = {
        get(key, cb) {
            if (redisError) return cb(new Error('redis unavailable'));
            if (holdRead) return holdRead(key, cb);
            cb(null, values.get(key) || null);
        },
        eval(script, n, key, value, ttl, channel, event, cb) {
            if (redisError) return cb(new Error('redis unavailable'));
            assert.equal(ttl, 200 * 60 * 60);
            values.set(key, value);
            subscribers.forEach(sub => sub.emit('message', channel, event));
            cb(null, 1);
        },
        duplicate() {
            const sub = new EventEmitter();
            sub.subscribe = () => {};
            sub.quit = () => {};
            subscribers.push(sub);
            return sub;
        }
    };
    const rpcSessions = [];
    const kickedSessionIds = [];
    const sessionService = {
        getByUid: uid => rpcSessions.filter(s => s.uid == uid),
        forEachSession: fn => rpcSessions.slice().forEach(fn),
        kickBySessionId: (id, reason, cb) => {
            kickedSessionIds.push(id);
            const index = rpcSessions.findIndex(s => s.id === id);
            if (index !== -1) rpcSessions.splice(index, 1);
            if (cb) cb();
        }
    };
    const locks = [];
    const redlock = { lock: async key => {
        locks.push(key);
        return { unlock: async () => {} };
    } };
    const pomelo = { app: { get: key => ({ redis, sessionService, redlock })[key] } };
    const sessions = load('util/loginSession.js', { pomelo });
    const userDao = {
        getAdminById: async uid => ({ data: { Id: Number(uid), permissions: uid == 3 ? 1 : 2 } }),
        getAdminByName: async () => ({ data: { Id: 1, permissions: 2, salt: 'salt', password: md5('saltpw') } }),
        editUserLoginInfo: async () => {}
    };
    const deps = {
        '../../util/token': tokenService, '../../dao/userDao': userDao,
        '../../util/code': Code, '../../../config/session': { secret },
        '../../util/loginSession': sessions
    };
    const auth = load('service/route/auth.js', deps);
    assert.equal((await auth.auth('')).err, Code.ENTRY.FA_TOKEN_INVALID);
    const tokenA = tokenService.create(1, Date.now(), secret);
    const tokenB = tokenService.create(1, Date.now(), secret);
    const tokenOther = tokenService.create(2, Date.now(), secret);
    assert.equal((await auth.auth(tokenA)).err, Code.ENTRY.FA_LOGIN_REPLACED);
    await sessions.register(1, tokenA);
    await sessions.register(2, tokenOther);
    assert((await auth.auth(tokenA)).data);
    assert.notEqual(values.get('game:login-token:1'), tokenA);
    assert((await auth.auth(tokenService.create(3, Date.now(), secret))).data, 'agent login unaffected');

    const timers = [];
    class Server extends EventEmitter {
        constructor() { super(); this.clients = new Set(); Server.instance = this; }
    }
    const wsLib = { Server, OPEN: 1, CLOSED: 3 };
    const globals = {};
    load('service/socketserver.js', {
        ws: wsLib, '../../config/config.json': { http: { wsport: 0 } },
        '../service/route/auth': auth, '../util/loginSession': sessions,
        '../util/code': Code, pomelo
    }, { global: globals,
        setInterval: fn => { timers.push(fn); return 1; },
        setTimeout: () => ({ unref() {} })
    });
    const wss = Server.instance;
    function socket() {
        const ws = new EventEmitter();
        ws.readyState = 1; ws.messages = [];
        ws.send = (msg, cb) => { ws.messages.push(JSON.parse(msg)); if (cb) cb(); };
        ws.close = code => { ws.closeCode = code; ws.readyState = 3; ws.emit('close'); };
        ws.terminate = () => ws.close(1006);
        ws.ping = () => {};
        wss.clients.add(ws); wss.emit('connection', ws);
        return ws;
    }
    async function join(ws, token, clientType = 'game', uid = 'forged') {
        await ws.listeners('message')[0](JSON.stringify({ action: 'joinTable', tableId: 'T1', clientType, token, uid }));
    }
    const old1 = socket(), old2 = socket(), other = socket(), control = socket();
    await join(old1, tokenA); await join(old2, tokenA);
    await join(other, tokenOther); await join(control, null, 'control', '1');
    assert.equal(old1.uid, 1, 'must use authenticated ID, not client uid');
    assert.equal(old1.readyState, 1); assert.equal(old2.readyState, 1, 'same login permits multiple sockets');
    const rpcSettings = { loginAccountId: '1', loginTokenHash: sessions.fingerprint(tokenA) };
    const rpcSession = { id: 10, uid: 1, get: key => rpcSettings[key] };
    rpcSessions.push(rpcSession);
    await sessions.register(1, tokenB);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(old1.closeCode, 4401); assert.equal(old2.closeCode, 4401);
    assert.equal(old1.messages[0].type, 'kicked_out');
    assert.deepEqual(kickedSessionIds, [10], 'Pomelo sessions also kicked by account login');
    assert.equal(other.readyState, 1); assert.equal(control.readyState, 1);
    assert.equal((await auth.auth(tokenA)).err, Code.ENTRY.FA_LOGIN_REPLACED);
    const filter = load('domain/userFilter.js', { '../util/code': Code, '../util/loginSession': sessions })();
    let filterError;
    await filter.before({}, rpcSession, err => { filterError = err; });
    assert.equal(filterError, Code.ENTRY.FA_LOGIN_REPLACED, 'stale in-flight RPC rejected');
    rpcSettings.loginTokenHash = sessions.fingerprint(tokenB);
    await filter.before({}, rpcSession, err => { filterError = err; });
    assert.equal(filterError, undefined, 'current RPC permitted');
    const reconnect = socket(); await join(reconnect, tokenA);
    assert.equal(reconnect.closeCode, 4401, 'old token cannot reconnect');
    const newSocket = socket(); await join(newSocket, tokenB);
    assert.equal(newSocket.readyState, 1);
    subscribers[0].emit('message', 'game:account-login', JSON.stringify({ uid: '1' }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(newSocket.readyState, 1, 'late notifications read latest login');

    // A pending stale read must not kick a connection which joined after its snapshot.
    let release;
    holdRead = (key, cb) => { release = () => cb(null, 'older-fingerprint'); };
    subscribers[0].emit('message', 'game:account-login', JSON.stringify({ uid: '1' }));
    holdRead = null;
    const justJoined = socket(); await join(justJoined, tokenB);
    release(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(justJoined.readyState, 1);

    redisError = true;
    assert.equal((await auth.auth(tokenB)).err, Code.ENTRY.FA_SESSION_UNAVAILABLE);
    await filter.before({}, rpcSession, err => { filterError = err; });
    assert.equal(filterError, Code.ENTRY.FA_SESSION_UNAVAILABLE);
    await assert.rejects(sessions.register(1, tokenA), /redis unavailable/);
    redisError = false;
    assert(await sessions.isCurrent(1, tokenB), 'failed login store must preserve current login');

    // /user/login replaces sessions only after valid credentials; caller userName is not the key.
    const routes = {};
    const router = { post: (url, handler) => { routes[url] = handler; } };
    load('service/route/user.js', {
        express: { Router: () => router }, '../../dao/userDao': userDao,
        '../../util/token': tokenService, pomelo, '../../../config/session': { secret },
        'js-md5': md5, '../../util/utils': { getClientIP: () => '127.0.0.1' },
        '../middleware/ipWhitelist': () => {}, '../../util/loginSession': sessions
    });
    let response;
    const res = { send: value => { response = value; return value; } };
    await routes['/login']({ body: { username: 'alice', userName: 'spoofed', password: 'bad' } }, res);
    assert.equal(response.code, 500); assert(await sessions.isCurrent(1, tokenB));
    await routes['/login']({ body: { username: 'alice', userName: 'spoofed', password: 'pw' } }, res);
    assert.equal(response.code, 200); assert.equal(locks.pop(), 'login:1');
    assert(await sessions.isCurrent(1, response.data.token));
    assert(!await sessions.isCurrent(1, tokenB));

    // A dropped Pub/Sub notification is recovered on the heartbeat cycle.
    const latest = socket(); await join(latest, response.data.token);
    values.set('game:login-token:1', sessions.fingerprint(tokenA));
    timers[0](); await new Promise(resolve => setImmediate(resolve));
    assert.equal(latest.closeCode, 4401);

    // Control-tool logins coexist and never replace the game's current fingerprint.
    const gameHash = values.get('game:login-token:1');
    await routes['/control_login']({ body: { username: 'alice', password: 'pw' } }, res);
    assert.equal(response.code, 200);
    const controlA = response.data.token;
    await routes['/control_login']({ body: { username: 'alice', password: 'pw' } }, res);
    const controlB = response.data.token;
    assert.notEqual(controlA, controlB);
    assert.equal(values.get('game:login-token:1'), gameHash);
    assert.equal(tokenService.parse(controlA, secret).clientType, 'control');
    assert.equal(tokenService.parse(controlA.slice(0, -1) + (controlA.endsWith('0') ? '1' : '0'), secret), null);
    assert.equal(tokenService.parse('control.' + tokenA + '.' + '0'.repeat(64), secret), null);
    for (const controlToken of [controlA, controlB]) {
        assert((await auth.auth(controlToken, { allowControl: true })).data);
        assert.equal((await auth.auth(controlToken)).err, Code.ENTRY.FA_TOKEN_SCOPE);
        assert.equal((await auth.auth(controlToken.split('.')[1])).err, Code.ENTRY.FA_LOGIN_REPLACED,
            'stripping the scope wrapper does not yield a usable game session');
    }
    const gameConnection = socket();
    await join(gameConnection, tokenA);
    await routes['/control_login']({ body: { username: 'alice', password: 'pw' } }, res);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(gameConnection.readyState, 1, 'tool login must not kick the game');
    await routes['/login']({ body: { username: 'alice', password: 'pw', clientType: 'control' } }, res);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(gameConnection.closeCode, 4401, 'request-body flags cannot bypass game replacement');
    assert.equal(tokenService.parse(response.data.token, secret).clientType, undefined);
    for (const controlToken of [controlA, controlB]) {
        assert((await auth.auth(controlToken, { allowControl: true })).data, 'game relogin does not invalidate tool tokens');
    }
    const unauthorizedGameSocket = socket(); await join(unauthorizedGameSocket, controlA);
    assert.equal(unauthorizedGameSocket.clientType, null);
    assert.equal(unauthorizedGameSocket.messages[0].errCode, Code.ENTRY.FA_TOKEN_SCOPE);
    redisError = true;
    assert((await auth.auth(controlA, { allowControl: true })).data, 'tool login is independent of game-session Redis');
    redisError = false;

    const httpSource = fs.readFileSync(path.join(__dirname, '../service/httpserver.js'), 'utf8');
    const middlewareContext = { auth, chkIp: async () => true, console: quiet };
    vm.runInNewContext(httpSource.slice(httpSource.indexOf('async function tokenMiddleware('),
        httpSource.indexOf('// 统一应用拦截器')), middlewareContext);
    async function httpCheck(url, token, shouldPass, method = 'POST') {
        let passed = false, status, reply;
        const responseStub = { status: s => { status = s; return responseStub; }, json: r => { reply = r; } };
        await middlewareContext.tokenMiddleware({ method, path: url, headers: { token },
            socket: { remoteAddress: '127.0.0.1' }, body: { allowControl: true } }, responseStub, () => { passed = true; });
        assert.equal(passed, shouldPass, url);
        if (!shouldPass) { assert.equal(status, 403); assert.equal(reply.errCode, Code.ENTRY.FA_TOKEN_SCOPE); }
    }
    await httpCheck('/opt/send_index', controlA, true);
    await httpCheck('/system/get_group_pull_data_by_nickname', controlB, true);
    await httpCheck('/opt/send_index/', controlA, true);
    await httpCheck('/opt/send_index', controlA, false, 'GET');
    await httpCheck('/opt/desk_operation', controlA, false);
    await httpCheck('/ht/financial_inquiries/zc_details_inquiry', controlB, false);
    assert.equal((await auth.auth(tokenService.createControl(1, Date.now() - 201 * 60 * 60 * 1000, secret),
        { allowControl: true })).err, Code.ENTRY.FA_TOKEN_EXPIRE);
    console.log('PASS: account replacement, old-token rejection, RPC/WebSocket isolation, control login coexistence, game/control independence, signed scope and HTTP allowlist, expiration and Redis failures');
}

main().catch(err => { console.error(err); process.exitCode = 1; });
