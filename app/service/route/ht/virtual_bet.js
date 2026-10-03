let express = require('express');
let router = express.Router();
let pomelo = require('pomelo');
let redlock = pomelo.app.get('redlock');
let virtualBetDao = require('../../../dao/virtualBetDao');
let virtualBetToken = require('../../../../config/token');

module.exports = router;

router.post('/get_bot_list', async function(req, res) {
    try {
        const msg = req.body.data ? req.body.data : req.body;
        if (!msg.group_nickname) {
            return res.send({ code: 500, msg: '必须提供群昵称', data: null });
        }

        const result = await virtualBetDao.getBotConfigList(msg);
        if (result.err) {
            return res.send({ code: 500, msg: String(result.err.message || result.err), data: null });
        }

        const list = result.data.map(item => ({
            ...item,
            other_types: String(item.other_types || '').split(',').filter(Boolean),
            credential_ready: Boolean(virtualBetToken[item.player_name])
        }));
        return res.send({ code: 200, msg: '获取成功', data: list });
    } catch (err) {
        console.error('get virtual bet bot list error:', err);
        return res.send({ code: 500, msg: '服务器繁忙', data: null });
    }
});

router.post('/save_bot_config', async function(req, res) {
    //try {
        const payload = req.body.data ? req.body.data : req.body;
        const msg = { ...payload, userName: req.body.userName || payload.userName };
        const lockId = msg.userId || msg.player_name || 'unknown';
        await redlock.lock(`save_virtual_bet_bot:${msg.group_nickname}:${lockId}`, 1000);

        const result = await virtualBetDao.saveBotConfig(msg);
        if (result.err) {
            return res.send({ code: 500, msg: String(result.err.message || result.err), data: null });
        }
        return res.send({ code: 200, msg: '设置成功，下一局生效', data: result.data });
    // } catch (err) {
    //     console.error('save virtual bet bot config error:', JSON.stringify(err));
    //     return res.send({ code: 500, msg: '服务器繁忙', data: null });
    // }
});

router.post('/set_bot_enabled', async function(req, res) {
    try {
        const payload = req.body.data ? req.body.data : req.body;
        const msg = { ...payload, userName: req.body.userName || payload.userName };
        const lockId = msg.userId || msg.player_name || 'unknown';
        await redlock.lock(`enable_virtual_bet_bot:${msg.group_nickname}:${lockId}`, 1000);

        const result = await virtualBetDao.setBotEnabled(msg);
        if (result.err) {
            return res.send({ code: 500, msg: String(result.err.message || result.err), data: null });
        }
        return res.send({ code: 200, msg: '设置成功，下一局生效', data: result.data });
    } catch (err) {
        console.error('set virtual bet bot enabled error:', err);
        return res.send({ code: 500, msg: '服务器繁忙', data: null });
    }
});
