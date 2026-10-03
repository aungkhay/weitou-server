var utils = module.exports;
const fs = require('fs');
const moment = require('moment');
var isPrintFlag = false;
utils.invokeCallback = function(cb) {
	if(!!cb && typeof cb === 'function') {
		cb.apply(null, Array.prototype.slice.call(arguments, 1));
	}
};

/**
 * clone an object
 */
utils.clone = function(origin) {
	if(!origin) {
		return;
	}
	var obj = {};
	for(var f in origin) {
		if(origin.hasOwnProperty(f)) {
			obj[f] = origin[f];
		}
	}
	return obj;
};

utils.size = function(obj) {
	if(!obj) {
		return 0;
	}
	var size = 0;
	for(var f in obj) {
		if(obj.hasOwnProperty(f)) {
			size++;
		}
	}
	return size;
};

// print the file name and the line number ~ begin
function getStack(){
	var orig = Error.prepareStackTrace;
	Error.prepareStackTrace = function(_, stack) {
		return stack;
	};
	var err = new Error();
	Error.captureStackTrace(err, arguments.callee);
	var stack = err.stack;
	Error.prepareStackTrace = orig;
	return stack;
}

function getFileName(stack) {
	return stack[1].getFileName();
}

function getLineNumber(stack){
	return stack[1].getLineNumber();
}

utils.deleteFile = function(path){
    fs.unlink(path, (err) => {
        if (err) {
            console.error('删除失败:', err);
        } else {
            console.log('图片已删除:',path);
        }
    });
}

utils.myPrint = function() {
	if (isPrintFlag) {
		var len = arguments.length;
		if(len <= 0) {
			return;
		}
		var stack = getStack();
		var aimStr = '\'' + getFileName(stack) + '\' @' + getLineNumber(stack) + ' :\n';
		for(var i = 0; i < len; ++i) {
			aimStr += arguments[i] + ' ';
		}
		console.log('\n' + aimStr);
	}
};

utils.unique = function(arr) {
    return Array.from(new Set(arr))
}

// print the file name and the line number ~ end

utils.transDate=function(date1){
	if(!date1)return '';
	// return date1.toLocaleDateString().replace(/\//g, "-") + " " + date1.toTimeString().substr(0, 8);
	return moment(date1).format("YYYY-MM-DD HH:mm:ss");
}

utils.getDate=function(n) {                                    // n=   1.今天 2.昨天 3.本星期  4.上星期  5.本月  6.上月
	var now = new Date(); //当前日期
	var nowDayOfWeek = now.getDay(); //今天本周的第几天
	var nowDay = now.getDate(); //当前日
	var nowMonth = now.getMonth(); //当前月
	var nextMonth = now.getMonth() + 1;
	var nowYear = now.getYear(); //当前年
	nowYear += nowYear < 2000 ? 1900 : 0;

	var lastMonthDate = new Date(); //上月日期
	lastMonthDate.setDate(1);
	lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
	var lastYear = lastMonthDate.getYear();
	var lastMonth = lastMonthDate.getMonth();

	if (n == 1)
	  return {
		d1: new Date(nowYear, nowMonth, nowDay),
		d2: new Date(nowYear, nowMonth, nowDay + 1),
	  };
	if (n == 2)
	  return {
		d1: new Date(nowYear, nowMonth, nowDay - 1),
		d2: new Date(nowYear, nowMonth, nowDay),
	  };
	if (n == 3)
	  return {
		d1: new Date(nowYear, nowMonth, nowDay - nowDayOfWeek + 1),
		d2: new Date(nowYear, nowMonth, nowDay + (6 - nowDayOfWeek + 2)),
	  };
	if (n == 4)
	  return {
		d1: new Date(new Date(nowYear, nowMonth, nowDay - nowDayOfWeek - 6)),
		d2: new Date(nowYear, nowMonth, nowDay + (6 - nowDayOfWeek - 5)),
	  };
	if (n == 5)
	  return {
		d1: new Date(nowYear, nowMonth, 1),
		d2: new Date(nowYear, nextMonth, 1),
	  };
	if (n == 6)
	  return {
		d1: new Date(nowYear, lastMonth, 1),
		d2: new Date(nowYear, nowMonth, 1),
	  };
  }

  utils.toDateYMD = function(val) {
		if (val === undefined || val === null || val === '') return val;
		
		// 转为字符串并去掉两端空格
		const s = String(val).trim();

		// 1. 严格匹配带分隔符的日期（如 2026-03-25, 2026/3/5, 2026.03.25）
		// 避免了误切纯数字时间戳的问题
		const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
		if (m) {
			const yyyy = m[1];
			const mm = ('0' + m[2]).slice(-2);
			const dd = ('0' + m[3]).slice(-2);
			return `${yyyy}-${mm}-${dd}`;
		}

		// 2. 回退到 Date 解析（能完美处理 13位纯数字时间戳 和 标准ISO时间）
		// 如果是纯数字字符串，先转为数字类型
		const num = Number(s);
		const d = !isNaN(num) ? new Date(num) : new Date(s);

		if (!isNaN(d.getTime())) {
			const yyyy = d.getFullYear();
			const mm = ('0' + (d.getMonth() + 1)).slice(-2);
			const dd = ('0' + d.getDate()).slice(-2);
			return `${yyyy}-${mm}-${dd}`;
		}

		return val;
	}

  // 判断当前时间是否在最近十分钟之内的
  utils.isTimeLessThanTenMinutes = function(timeString) {
  // 当前时间
  const currentTime = new Date();

  // 解析传入的时间字符串并转换为 Date 对象
  const inputTime = new Date(timeString);

  // 获取当前时间的 10 分钟前的时间
  const tenMinutesAgo = new Date(currentTime - 10 * 60 * 1000);

  // 判断输入时间是否小于当前时间的 10 分钟前
  return inputTime >= tenMinutesAgo && inputTime <= currentTime;
}

  utils.getClientIP = function(req) {
    let ip = req.headers['x-forwarded-for'] ||
    req.ip ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.connection.socket.remoteAddress || '';
    console.log("ip:",ip);
    if(ip.indexOf(":")>=0){
        ip = ip.split(':')[3]
    }
    return ip;
};

utils.getDomain = function(req){                 // 获得域名
    let domain = req.headers['referer'].match(/^(\w+:\/\/)?([^\/]+)/i);
    domain = domain ? domain[2].split(':')[0].split('.').slice(-2).join('.') : null;
    return domain;
}