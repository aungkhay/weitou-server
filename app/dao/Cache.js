var pomelo = require("pomelo");
var client = pomelo.app.get("redis");
client.on("error",function(err){
    console.log(err);
});

function Cache() {}

let text = async(key)=>{
    let doc = await new Promise( (resolve) => {
        client.get(key,function(err, res){
            return resolve(res);
        });
    });
    return JSON.parse(doc);
};

let getKeys = async(key)=>{
    let doc = await new Promise( (resolve) => {
        client.keys(key,function(err, res){
            return resolve(res);
        });
    });
    return doc;
};

Cache.set = function(key, value) {
    value = JSON.stringify(value);
    return client.set(key, value, function(err){
        if (err) {
            console.error(err);
        }
    });
};
 
Cache.get = async(key)=>{
    return await text(key);
};
 
Cache.keys = async(key)=>{
    return await getKeys(key);
}

Cache.expire = function(key, time) {
    return client.expire(key, time);
};

// 原子写入：仅当 key 不存在时写入，并设置过期时间。
// 返回 true 表示本次成功写入，false 表示该 key 已存在。
Cache.setIfAbsent = function(key, value, seconds) {
    value = JSON.stringify(value);
    return new Promise((resolve, reject) => {
        client.set(key, value, 'EX', seconds, 'NX', function(err, result) {
            if (err) {
                reject(err);
                return;
            }
            resolve(result === 'OK');
        });
    });
};
 
module.exports = Cache;
