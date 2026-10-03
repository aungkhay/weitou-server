let pomelo = require("pomelo");
/**
 * Init app for client.
 */
let app = pomelo.createApp();
let fs = require("fs");
let userFilter = require("./app/domain/userFilter");
app.set("name", "bjl");

// app configuration
app.loadConfig("mysql", app.getBase() + "/config/mysql.json");       // 添加配置
app.loadConfig("config", app.getBase() + "/config/config.json");     // 添加配置

// 连接redis 
let redis = require("redis");
const config = app.get("config");
let client = redis.createClient(config.redis.port, config.redis.host, {auth_pass: config.redis.pwd}); // 连接     45.141.69.222
client.on("error", function(err) {
   console.error("Redis:Error:" + err);
});
app.set("redis", client); // app访问接口

// 连接redis 
let client2 = redis.createClient(config.redis2.port, config.redis2.host, {auth_pass: config.redis2.pwd}); // 连接     45.141.69.222
client2.on("error", function(err) {
   console.error("Redis:Error:" + err);
});
app.set("redis2", client2); // app访问接口

// 连接redlock
const ioredis = require('ioredis');
const Redlock = require('redlock');
const client1 = new ioredis({port:config.redis.port, host:config.redis.host,password:config.redis.pwd}); 
const redlock = new Redlock([client1]);
app.set("redlock", redlock);

app.configure("production|development", function() {
  let Helper = require("./app/dao/mysql/mysqlHelper");       // -min
  let sqlHelper = new Helper(app);
  app.set("sqlHelper", sqlHelper);                       
});

app.configure("production|development", "master", function() {});

app.configure("production|development", "connector|gate|bjl", function() {
  app.set("connectorConfig", {
    connector: pomelo.connectors.hybridconnector,  
    heartbeat: 5,        // 心跳发送间隔（单位：秒）
    timeout: 60,         // 服务端未收到心跳的判定超时时间（单位：秒）
    disconnectOnTimeout: true , // 超时后是否主动断开连接
    useProtobuf: false,
    useDict: true,
  });
});

// 单独为网关服务器挂载特定的 http 路由组件（保留你原本的业务）
app.configure("production|development", "gate", function() {
    require("./app/service/httpserver");
});

app.configure("production|development", "connector", function() {
    require("./app/service/socketserver");
});

app.configure('production|development', function () {
  app.filter(pomelo.filters.timeout());
});

//todo:filter
app.configure('production|development','bjl|dx|nn|tts|xjh|lh|sg|ty|dt', function () {
  app.filter(userFilter());
})

// start app
app.start();

process.on("uncaughtException", function(err) {
  console.error(" Caught exception: " + err.stack);
});























