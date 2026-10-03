const async = require('async');
/**
 * mysql连接管理接口集
 */

var mysqlHelper = function(app){
	this.pools = {};
    var mysqlConfig = app.get('mysql');
	for (var k in mysqlConfig) {
		var _pool = this.createMysqlPool(k, mysqlConfig[k]);
        this.pools[k] = _pool;
	}
};

module.exports = mysqlHelper;
/**
 * 创建Mysql连接池对象 * @param {String} dbname 连接池名称
 * @param {JSON} cfg 配置数据
 */
mysqlHelper.prototype.createMysqlPool = function (dbname, cfg) {
	//var mysqlConfig = app.get('mysql');
	var mysql = require('mysql');
	var pool  = mysql.createPool({
		host: cfg.host,
		user: cfg.user,
        port: cfg.port,
		password: cfg.password,
		database: cfg.database
	});
    return pool;
};

/* 执行Mysql命令
 * @param {String} dbname 数据库分库名称(指配置文件里配置的名称)
 * @param {String} sql Statement The sql need to excute.
 * @param {Object} args The args for the sql.
 * @param {fuction} cb Callback function.
 * 
 */
mysqlHelper.prototype.query = function(dbname,sql, args) {                                          //可以改成sql，callback两个参数
    var pool = this.pools[dbname];
    let a = JSON.stringify(args);
    return new Promise((resolve, reject) => {
        if(!chkIsParaCorrect(a)){
            reject("错误参数:" + a);
            console.log("错误参数:" + a)
            return;
        }
        pool.getConnection((err, conn) => {
            if (err) {
                console.error('===============执行Mysql命令时报错: %s================',sql,args, err.stack);
                reject(err);
            } else {
                conn.query(sql, args, (err, data) => {
                    pool.releaseConnection(conn);
                    if (err) {
                        reject(err);
                    } else {
                        resolve(data);
                    }
              });
            }
        })
    })
};


function chkIsParaCorrect(a){
    a = a.toLowerCase();
    if(a.indexOf("ifram")>=0 || a.indexOf("truncate")>=0 || a.indexOf("delete")>=0 || a.indexOf("drop")>=0 
    || a.indexOf("select")>=0 || a.indexOf("delay")>=0 || a.indexOf("update")>=0 || a.indexOf("insert")>=0
    || a.indexOf("in bool")>=0 || a.indexOf('case when')>=0 || a.indexOf('information_schema')>=0 || a.indexOf('alter')>=0 ){
        console.log("a:",a);
        return false;
    }else{
        return true;
    }
}

mysqlHelper.prototype.buildSummarySQL = function(table, fields, condition) {
    let parts = ['COUNT(*) as total_count'];
    fields.forEach(f => {
        parts.push(`IFNULL(SUM(${f}),0) as total_${f}`);
    });

    return `SELECT ${parts.join(',')} FROM ${table} WHERE ${condition}`;
}

mysqlHelper.prototype.beginTransaction = function(callback) {
    this.pools["bjl"].getConnection(callback);
}

// 下面用序列封装事务
mysqlHelper.prototype.execTrans = function(sqlparamsEntities, callback) {
    let insertId=0;
    this.pools["bjl"].getConnection(function(err, connection) {
        if (err) {
            return callback(err, null);
        }
        connection.beginTransaction(function (err) {
            if (err) {
                return callback(err, null);
            }
            console.log("开始执行transaction，共执行" + sqlparamsEntities.length + "条数据");
            var funcAry = [];
            sqlparamsEntities.forEach(function (sql_param) {
                var temp = function (cb) {
                    var sql = sql_param.sql;
                    var param = sql_param.params;
                    connection.query(sql, param, function (tErr, rows, fields) {
                        if (tErr) {
                            connection.rollback(function () {
                                console.log("事务失败，" + sql_param + "，ERROR：" + tErr);
                                throw tErr;
                            });
                        } else {
                            return cb(null, 'ok');
                        }
                    })
                };
                funcAry.push(temp);
            });

            async.series(funcAry, function (err, result) {
                if (err) {
                    connection.rollback(function (err) {
                        console.log("transaction error: " + err);
                        connection.release();
                        return callback(err, null);
                    });
                } else {
                    connection.commit(function (err, info) {
                        if (err) {
                            console.log("执行事务失败，" + err);
                            connection.rollback(function (err) {
                                console.log("transaction error: " + err);
                                connection.release();
                                return callback(err, null);
                            });
                        } else {
                            connection.release();
                            return callback(null, "ok");
                        }
                    })
                }
            })
        });
    });
}

mysqlHelper.prototype.tranExecSync = function (dbname, sqlArr) {
    const self = this;
    return new Promise((resolve, reject) => {
        self.pools[dbname].getConnection(function (err, connection) {
            if (err) {
                return reject(err);
            }
            connection.beginTransaction(async beginErr => {
                if (beginErr) {
                    connection.release();
                    return reject(beginErr);
                }

                const rollback = () => new Promise(done => {
                    connection.rollback(() => done());
                });

                try {
                    // 同一事务内顺序执行，避免并发 SQL 之间出现依赖竞态。
                    for (const { sql, params } of sqlArr) {
                        console.log(sql, params);
                        const rows = await new Promise((queryResolve, queryReject) => {
                            connection.query(sql, params, function (queryErr, queryRows) {
                                if (queryErr) return queryReject(queryErr);
                                queryResolve(queryRows);
                            });
                        });

                        console.log("AffectedRows =====>", rows && rows.affectedRows);
                        if (rows && typeof rows.affectedRows === "number" && rows.affectedRows === 0) {
                            await rollback();
                            connection.release();
                            console.log('数据操作回滚');
                            return resolve(false);
                        }
                    }

                    // 必须等 COMMIT 完成后再释放连接、通知调用方。
                    await new Promise((commitResolve, commitReject) => {
                        connection.commit(commitErr => {
                            if (commitErr) return commitReject(commitErr);
                            commitResolve();
                        });
                    });

                    connection.release();
                    console.log('\x1b[32m执行事务成功\x1b[0m');
                    resolve(true);
                } catch (transactionErr) {
                    await rollback();
                    connection.release();
                    console.log('事务失败，已回滚：' + transactionErr);
                    reject(transactionErr);
                }
            });
        });
    });
};


mysqlHelper.prototype._getNewSqlParamEntity=function(sql, params, callback) {
    if (callback) {
        return callback(null, {
            sql: sql,
            params: params
        });
    }
    return {
        sql: sql,
        params: params
    };
}
