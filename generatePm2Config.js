/**
 * Created by superzhan on 2018/3/19.
 *
 * 根据pomelo 的 servers.json 生成 pm2 启动文件
 */

var masterJsonFile = require('../game-server/config/master.json');
var serversJosnFile = require('../game-server/config/servers.json');

//pomelo 源码目录
var cwd='./game-server';

//配置运行环境 development production
var envType= 'development';

//模板数据
var processConfigType =   {
    "name"        : "",
    "script"      : "app.js",
    "args"        :  [],
    "watch": false,
    "out_file": "./logs/app.log",
    "error_file": "./logs/err.log",
    "cwd": "",
    "merge_logs": true,
    "exec_mode": "fork_mode",
};


//最后的结果数据
var resultJson={};
resultJson.apps=new Array();

var  clone = function(origin) {
    if(!origin) {
        return;
    }
    var obj = {};
    for(var f in origin) {
        obj[f] = origin[f];
    }
    return obj;
};

//
var masterConfig = masterJsonFile[envType];
var serversConfig = serversJosnFile[envType];

//生成master 的配置
var pm2Master = clone( processConfigType );
pm2Master.name="master";
pm2Master.args = new Array();
pm2Master.args.push('serverType=master');
pm2Master.args.push('id='+masterConfig.id);
pm2Master.args.push('host='+masterConfig.host);
pm2Master.args.push('port='+masterConfig.port);
pm2Master.args.push('env='+envType);
pm2Master.args.push('mode=stand-alone');
pm2Master.cwd= cwd;
pm2Master.out_file = './logs/'+masterConfig.id+"_app.log";
pm2Master.error_file='./logs'+masterConfig.id+'_error.log';
resultJson.apps.push(pm2Master);

//生成当个服务器的配置
for(serverType in serversConfig)
{
    var servers = serversConfig[serverType];
    for(var i=0;i<servers.length;++i)
    {
        var singleServer= servers[i];

        var appPm2Config =  clone(processConfigType);
        appPm2Config.name=singleServer.id;
        appPm2Config.args= new Array();
        appPm2Config.args.push('env='+envType);
        appPm2Config.args.push('id='+singleServer.id);
        appPm2Config.args.push('port='+singleServer.port);
        appPm2Config.args.push('host='+singleServer.host);
        appPm2Config.args.push('serverType='+serverType);

        if(singleServer.frontend !=null)
        {
            appPm2Config.args.push('frontend='+ singleServer.frontend);
            appPm2Config.args.push('clientPort='+singleServer.clientPort);
        }

        appPm2Config.cwd= cwd;
        appPm2Config.out_file = './logs/'+ singleServer.id+'_app.log';
        appPm2Config.error_file = './logs/'+singleServer.id+'_error.log';

        resultJson.apps.push(appPm2Config);
    }
}



//生成结果数据
var resultFileStr = JSON.stringify(resultJson);
//console.log(resultFileStr);

var fs = require('fs');

fs.writeFile('../pomeloPm2Start.json', resultFileStr, function (err) {
    if (err) {
        console.log(err);
    } else {
        console.log('finish genereate Server pm2 config');
    }
});