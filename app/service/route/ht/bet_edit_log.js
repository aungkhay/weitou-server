let express = require('express');
let router = express.Router();
let userDao = require('../../../dao/userDao');
let moment = require('moment');

module.exports = router;

function parseJson(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch (err) {
        return fallback;
    }
}

// 后台查询手工修改下注的审计日志。
router.post('/get_bet_edit_log', async function(req, res) {
    try {
        const msg = req.body.data ? req.body.data : req.body;
        const result = await userDao.getBetEditLogList(msg);
        if (result.err || !result.data) {
            return res.send({ code: 500, msg: '获取失败', data: null });
        }

        result.data.list = result.data.list.map(item => ({
            ...item,
            original_record_ids: parseJson(item.original_record_ids, []),
            before_bet_data: parseJson(item.before_bet_data, {}),
            after_bet_data: parseJson(item.after_bet_data, {}),
            created_at: moment(item.created_at).format('YYYY-MM-DD HH:mm:ss')
        }));

        return res.send({ code: 200, msg: '获取成功', data: result.data });
    } catch (err) {
        console.error('get bet edit log error:', err);
        return res.send({ code: 500, msg: '服务器繁忙', data: null });
    }
});
