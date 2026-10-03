// 在 JSON.parse 前保留超出安全范围的整数字面量；跳过字符串中的数字。
module.exports = function parseMessageResponse(raw) {
    if (typeof raw !== 'string') return raw;
    return JSON.parse(raw.replace(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, token => {
        if (/^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token))) {
            return '"' + token + '"';
        }
        return token;
    }));
};
