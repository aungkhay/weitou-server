const md5 = require("js-md5");
let util = require("../util/utils");
let a = require("../../config/token");
const parseResult = require("../domain/sx/parseResult");
let bet = parseResult.parseBetStrToArray('ds');
console.log (md5("1bd3603e70" + md5("abc985623")));


