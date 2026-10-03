let config = require('../../config/config');
let port = config.http.port;
let express = require("express");
const cors = require("cors");
const util = require("../util/utils")

// 路由引入
let opt = require("./route/opt");
let user = require("./route/user");
let system = require("./route/system");
let player = require("./route/player");
let data_query = require("./route/data_query");

let bussioness_setup = require("./route/ht/bussioness_setup");
let player_option = require("./route/ht/player_option");
let desk_option = require("./route/ht/desk_option");
let system_setup = require("./route/ht/system_setup");
let bank_business = require("./route/ht/bank_business");
let office_business = require("./route/ht/office_business");
let financial_inquiries = require("./route/ht/financial_inquiries");
let financial_statistics = require("./route/ht/financial_statistics");
let points_business = require("./route/ht/points_business");             
let points_exchange = require("./route/ht/points_exchange");             
let agent_business = require("./route/ht/agent_business");               
let virtual_bet = require("./route/ht/virtual_bet");
let bet_edit_log = require("./route/ht/bet_edit_log");

let auth = require("../service/route/auth");
let cache = require("../dao/Cache"); // 如果 chkIp 要用，记得保留

let app = express();

// 1. 中间件配置（精简并移到最上方）
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'token']
}));
app.use(express.json()); // 替代了 bodyParser.json()
app.use(express.urlencoded({ extended: false }));
app.use("/statics", express.static(config.imgPath[config.imgPath.curSystem]));


// 鉴权中间件
async function tokenMiddleware(req, res, next) {
    // 预检请求直接放行
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }


    // 修复问题2：使用 req.path 过滤参数，防止匹配失效
    const noChkPaths = ["/user/login", "/user/control_login", "/user/agent_login", "/user/regist", "/opt/bot"];
    // 如果是静态资源或白名单，直接放行
    if (req.path.startsWith("/statics") || noChkPaths.includes(req.path)) {
        return next();
    }

    // IP 黑名单拦截（修复问题4：真正派上用场）
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();
    
    let isWhiteIp = await chkIp(clientIp);
    if (!isWhiteIp) {
        return res.status(403).json({ status: 403, msg: "IP blocked" });
    }

    // Token 验证
    let token = req.headers.token || '';
    if (!token) {
        return res.status(403).json({ status: 403, msg: "token is missing" });
    }

    // 异步鉴权（注意：如果 auth.auth 依然很慢，必须去优化 auth.auth 方法内部的逻辑，如加 Redis 缓存）
    // 工具 token 只放行已确认的上传工具接口，不能进入游戏/管理业务。
    const controlPaths = ['/opt/send_index', '/system/get_group_pull_data_by_nickname'];
    const allowControl = req.method === 'POST' && controlPaths.includes(req.path.replace(/\/+$/, ''));
    let r = await auth.auth(token, { allowControl });
    if (!r || !r.data) {
        const status = r && r.err === '1005' ? 503 : 403;
        return res.status(status).json({ status, msg: r && r.msg || "token is invalid or expired", errCode: r ? r.err : 1001 });
    }

    // 修复问题5：为了防止 GET 请求崩溃，统一挂载到 req.user 上，而不是 req.body
    req.user = {
        userId: r.data.Id,
        userName: r.data.username
    };
    req.body.userId = r.data.Id;
    req.body.userName = r.data.username;
    
    // if (req.body) {
    //     if (req.body.startTime) req.body.startTime = util.toDateYMD(req.body.startTime);
    //     if (req.body.start_time) req.body.start_time = util.toDateYMD(req.body.start_time);
    // }

    // 打印日志（生产环境高并发时建议关闭，很吃磁盘I/O和网络响应）
    const hiddenPaths = [
        "/get_profit_score",
        "/get_player",
        "/get_score_option_record"
    ];

    if (!hiddenPaths.some(path => req.path.includes(path))) {
        console.log(`${req.path} - Body:`, req.body);
    }
    //console.log(`${req.path} - Body:`, req.body);

    next();
}

// 统一应用拦截器
app.use(tokenMiddleware);

// IP 检查函数
async function chkIp(ip){
    try {
        let redis_res = await cache.get("ipBlackList");
        if (redis_res !== null) {
            if (redis_res.indexOf(ip) !== -1) return false;
        }
    } catch (e) {
        console.error("Redis check IP error:", e);
    }
    return true;
}

// 2. 路由挂载
app.use("/opt", opt);
app.use("/user", user);
app.use("/system", system);
app.use("/player", player);
app.use("/data_query", data_query);

// ht 路由
app.use("/ht/bussioness_setup", bussioness_setup);   
app.use("/ht/player_option", player_option);
app.use("/ht/desk_option", desk_option);
app.use("/ht/system_setup", system_setup);
app.use("/ht/bank_business", bank_business);                
app.use("/ht/office_business", office_business);            
app.use("/ht/financial_inquiries", financial_inquiries);    
app.use("/ht/financial_statistics", financial_statistics);  
app.use("/ht/points_business", points_business);            
app.use("/ht/points_exchange", points_exchange);            
app.use("/ht/agent_business", agent_business);             
app.use("/ht/virtual_bet", virtual_bet);
app.use("/ht/bet_edit_log", bet_edit_log);

// 3. 启动监听（放在最后，确保所有配置及路由加载完毕）
app.listen(port, () => {
    console.log("------------------------------------------------------------->app start:", port);
});
