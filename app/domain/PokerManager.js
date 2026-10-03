var PokerManager = function() {
  this.pokers = [];
};

module.exports = PokerManager;

PokerManager.prototype.recreatePoker = function(hasJoker) {
  for (var index = 1; index <= 13; index++) {
    var arrColor = ["A", "B", "C", "D"];
    for (var color = 0; color < 4; color++) {
      var card = {
        color: arrColor[color],
        value: index
      };
      this.pokers.push(card);
    }
  }

  if (hasJoker) {
    var jokerLittle = {
      color: "F",
      value: -1
    };
    this.pokers.push(jokerLittle);

    var jokerBig = {
      color: "E",
      value: 0
    };
    this.pokers.push(jokerBig);
  }
};

//洗牌
PokerManager.prototype.randomPoker = function() {
  //随机轮训5次洗牌
  for (var index = 0; index < 5; index++) {
    //与随机顺序的牌置换位置
    for (var cindex = 0; cindex < this.pokers.length; cindex++) {
      var temp = this.pokers[cindex];
      var rindex = Math.floor(Math.random() * this.pokers.length);
      this.pokers[cindex] = this.pokers[rindex];
      this.pokers[rindex] = temp;
    }
  }
};

PokerManager.prototype.getPokers = function() {
  return this.pokers;
};

//发一张牌
PokerManager.prototype.dealOnePoker = function() {
  return this.pokers.pop();
};

//发count张牌
PokerManager.prototype.dealSomePoker = function(count) {
  var somepk = this.pokers.slice(-count); //slice ѡȡһ������
  this.pokers.splice(-count, count); //spliceɾ��һ������
  //console.log("-------------------->somePk:",somepk);
  return somepk;
};

//static method

//for 牛牛
//计算牌面大小

//pokers -> 5张牌数组
PokerManager.nnResultForPoker = function(pokers) {
  //1 遍历所有元素，设置nnValue(大于10都设置为10)
  //顺便统计五花、四花(>10)、五小(<10)、炸弹条件满足情况
  var total = 0;
  //nntype表示用户牌型
  //炸弹(6) > 五小(5) > 五花(4) > 四花(3) > 牛牛(2) > 有分(1) > 没分(0)    
  //注意:在现在程序中只有牛牛(2) > 有分(1) > 没分(0),没有四花以上牌型
  var nntype = 0;
  var wuxiaoCount = 0;   //小于5的牌张数
  var zhadanDic = {};
  var tenCount = 0;      //等于10的牌张数
  var huaCount = 0;      //大于10的牌张数
  var p = PokerManager.getMaxPointOrColor(pokers);

  for (var index = 0; index < pokers.length; index++) {
    var pk = pokers[index];
    pk.nnValue = Number(pk.value) > 10 ? 10 : Number(pk.value);
    total += Number(pk.nnValue);
    
    zhadanDic[pk.value] =
      zhadanDic[pk.value] == undefined ? 1 : zhadanDic[pk.value] + 1;

    if (pk.value == 10) {
      tenCount++;
    }

    if (pk.value > 10) {
      huaCount++;
    }
  }
  var res = {};

  //2 炸弹
  /*
    for (var key in zhadanDic) {
        if (zhadanDic.hasOwnProperty(key)) {
            var element = zhadanDic[key];
            if (element == 4) {
                nntype = 6;
                res.nntype = nntype;
                res.niuN = key;     //ը����ʱ��niuN��ֵ��ը����
                res.pIndex1 = -1;
                res.pIndex2 = -1;
                res.nMaxPoint=p.nMaxPoint;
                res.strColor=p.strColor;
                return res;
            }
        }
    }
    */

  //3 五小 (暂时不用)
  if (wuxiaoCount == 5 && total <= 10) {
    //nntype = 5;
    //res.nntype = nntype;
    //res.niuN = 0;     //��С��ʱ��Ϊ0
    //res.pIndex1 = -1;
    //res.pIndex2 = -1;
    //res.nMaxPoint=p.nMaxPoint;
    //res.strColor=p.strColor;
    //return res;
  }

  //4 五花 (暂时不用)
  if (huaCount == 5) {
    //nntype = 4;
    //res.nntype = nntype;
    //res.niuN = 0;     //��С��ʱ��Ϊ0
    //res.pIndex1 = -1;
    //res.pIndex2 = -1;
    //res.nMaxPoint=p.nMaxPoint;
    //res.strColor=p.strColor;
    //return res;
  }

  //5 四花 (暂时不用)
  if (huaCount == 4 && tenCount == 1) {
    //nntype = 3;
    //res.nntype = nntype;
    //res.niuN = 0;     
    //res.pIndex1 = -1;
    //res.pIndex2 = -1;
    //return res;
  }

  //6 牛牛
  var niuN = total % 10;
  var hasNiu = false;
  for (var index = 0; index < pokers.length; index++) {
    for (var sec = index + 1; sec < pokers.length; sec++) {
      var pkf = pokers[index];
      var pkl = pokers[sec];
      var testN = (pkf.nnValue + pkl.nnValue) % 10;
      if (testN == niuN) {
         hasNiu = true;
        if (niuN == 0) {
          res.nntype = 2;
        } else {
          res.nntype = 1;
        }
        res.niuN = niuN;
        res.pIndex1 = index;
        res.pIndex2 = sec;
        res.nMaxPoint = p.nMaxPoint;
        res.strColor = p.strColor;
        break;
      }
    }
    if (hasNiu) {
      break;
    }
  }

  //没牛
  if (!hasNiu) {
    res.nntype = 0;
    res.niuN = -1;
    res.pIndex1 = -1;
    res.pIndex2 = -1;
    res.nMaxPoint = p.nMaxPoint;
    res.strColor = p.strColor;
  }
  return res;
};

PokerManager.getMaxPointOrColor = function(pk) {
  //取某副扑克的最大点数和花色
  var nMaxPoint = Number(pk[0].value);
  var strColor;
  var Point = {};
  for (var index = 1; index < pk.length; index++) {
      if (nMaxPoint < Number(pk[index].value)) nMaxPoint = Number(pk[index].value);
  }
  strColor = "d";
  for (var index = 0; index < pk.length; index++) {
    if (pk[index].value == nMaxPoint) {
       if (pk[index].color.charCodeAt(0) < strColor.charCodeAt(0))
          strColor = pk[index].color;
    }
  }
  Point.nMaxPoint = nMaxPoint;
  Point.strColor = strColor;
  return Point;
};

//pk1 > pk2 -> 1;
//pk1 = pk2 -> 0;
/**
 *
 *
 * @param {*} pk1
 * @param {*} pk2
 * @returns
 */
PokerManager.nnComparePoker = function(pk1, pk2) {
  if (pk1.nntype > pk2.nntype) {
    return 1;
  } else if (pk1.nntype == pk2.nntype) {
    if (pk1.niuN > pk2.niuN) {
      return 1;
    } else if (pk1.niuN == pk2.niuN) {
      if (pk1.nMaxPoint > pk2.nMaxPoint) {
        //牌型相同的比较点数
        return 1;
      } else if (pk1.nMaxPoint == pk2.nMaxPoint) {
        if (pk1.strColor.charCodeAt(0) < pk2.strColor.charCodeAt(0)) {
          //点数相同比较花色
          return 1;
        } else {
          return -1;
        }
      } else {
        return -1;
      }
    } else {
      return -1;
    }
  } else {
    return -1;
  }
};

/*
 nntype表示用户牌型,
 炸弹(6) > 五小(5) > 五花(4) > 四花(3) > 牛牛(2) > 有分(1) > 没分(0)
 本游戏现在只有:牛牛(2) > 有分(1) > 没分(0),没有炸弹,五小,五花,四花牌型
 牌型翻倍情况：
 无分和牛1，牛2，牛3，牛4，牛5，牛6： 1倍
 牛7，牛8，牛9： 2倍
 牛牛： 3倍
 四花： 3倍
 五花： 3倍
 五小： 3倍
 炸弹： 3倍
 */

PokerManager.nnResultMuti = function(nnResult) {
  switch (nnResult.nntype) {
    case 2:
      return 3;
    case 1: {
      if (nnResult.niuN > 6) {
        return 2;
      } else return 1;
    }
    case 0:
      return 1;
    default:
      return 1;
  }
};

// 以下是 炸金花 游戏
PokerManager.xjhResultForPoker = function(pokers) {
  // nntype表示用户牌型
  // 三条(6) > 同花顺(5) > 同花(4) > 杂顺(3) > 对子(2) > 杂花(1) > 特殊(0:杂花235)       杂花235（平时为最小的牌型，当遇上对家三条时，大于三条);
  var xjhType = 0;
  var res = {};
  if (pokers[0].rank == pokers[1].rank &&  pokers[1].rank == pokers[2].value) {
     res.xjhType = 6;
     res.nMaxPoint = pokers[0].rank;
     res.nSecondPoint = pokers[1].rank;                   // rank=value
     if (pokers[0].rank == 1) res.nMaxPoint = 14;         // 有A则A最大
     return res;
  }
  let a = [pokers[0].rank, pokers[1].rank, pokers[2].rank];
  a.sort();
  res.nSecondPoint = pokers[1].rank;                       // 第二个点的大小
  if (
    ((a[2] - a[1] == 1 && a[1] - a[0] == 1) ||
      (a[0] == 1 && a[1] == 12 && a[2] == 13)) &&
    pokers[0].suit == pokers[1].suit &&                     // suit==color
    pokers[1].suit == pokers[2].suit
  ) {
    //注意: QKA
    res.xjhType = 5;
    res.nMaxPoint = a[2];
    if (a[0] == 1 && a[1] == 12) res.nMaxPoint = 14;        // AKQ A是14
    return res;
  }
  if (
    pokers[0].color == pokers[1].color &&
    pokers[1].color == pokers[2].color
  ) {
    res.xjhType = 4;
    res.nMaxPoint = a[2];
    if (a[0] == 1) res.nMaxPoint = 14; //有A则A最大
    return res;
  }
  if (
    (a[2] - a[1] == 1 && a[1] - a[0] == 1) ||
    (a[0] == 1 && a[1] == 12 && a[2] == 13)
  ) {
    //注意: QKA
    res.xjhType = 3;
    res.nMaxPoint = a[2];
    if (a[0] == 1 && a[1] == 12) res.nMaxPoint = 14;         // AKQ A是14  32A:A是1  
    return res;
  }
  if (a[2] == a[1] || a[1] == a[0]) {                       // 对子
    res.xjhType = 2;
    res.nMaxPoint = a[1];                                   // 对子点数
    res.nSecondPoint=a[2]==a[1]?a[0]:a[1]==a[0]?a[2]:a[0];  // 单牌的点数
    if (a[1] == 1) res.nMaxPoint = 14;                      // 有A则A最大
    return res;
  }
  if (a[0] == 2 && a[1] == 3 && a[2] == 5) {
    res.xjhType = 0;
    res.nMaxPoint = a[2];
    if (a[0] == 1) res.nMaxPoint = 14;                     // 有A则A最大
    return res;
  } else {
    res.xjhType = 1;
    res.nMaxPoint = a[2];
    if (a[0] == 1) res.nMaxPoint = 14;                    // 有A则A最大
    return res;
  }
};

// 以下是3公
// nntype表示用户牌型
// 大三公 4 > 小三公 3 > 混三公 2 > 点数 1
PokerManager.sgResultForPoker = function(pokers) {  
  var res = {};
  if(pokers[0].value == pokers[1].value &&  pokers[1].value == pokers[2].value) {
    res.pkType = pokers[0].value>10?4:3;
    res.nMaxPoint = pokers[0].value;
    return res;
  }
  let b = pokers; 
  b.sort(sortBy("value"));
  let a=[b[0].value,b[1].value,b[2].value];
  if(a[0] >10  && a[1] >10 && a[2] > 10) {
    res.pkType = 2;
    res.nMaxPoint = a[2];
    res.color = pokers[2].color;
    if(a[2]==a[1]){                   // 点数相同比较花色
       res.color = pokers[2].color.charCodeAt(0) < pokers[1].color.charCodeAt(0)?pokers[2].color:pokers[1].color;
    }
    return res;
  }
  let sum=0;
  res.nMaxPoint = a[2];
  res.pkType = 1;
  if (a[2]>10){sum++;a[2]=0};
  if (a[1]>10){sum++;a[1]=0};
  if (a[0]>10){sum++;a[0]=0};
  res.gNum = sum;           // gong牌数
  res.point=(a[0]+a[1]+a[2])%10;
  res.color=pokers[2].color;
  if(a[2]==a[1]){           // 点数相同比较花色
     res.color = pokers[2].color.charCodeAt(0) < pokers[1].color.charCodeAt(0)?pokers[2].color:pokers[1].color;
  }
  return res;
}

PokerManager.sgCompare = function(obj1,obj2) {    // 比较大小
  if(obj1.pkType > obj2.pkType){
    return true;
  }else{
    if(obj1.pkType == obj2.pkType){
        switch (obj1.pkType){
            case 4 || 3:
              return obj1.nMaxPoint > obj2.nMaxPoint;
            case 2:
              return  obj1.nMaxPoint!=obj2.nMaxPoint?obj1.nMaxPoint>obj2.nMaxPoint:obj1.color.charCodeAt(0)<obj2.color.charCodeAt(0); 
            case 1:
                if(obj1.point!=obj2.point){
                  return obj1.point>obj2.point;
                }else{
                   //点数相同则先比较gong牌数，gong牌数相等则比较最大牌点数，点数相同，比花色
                  if(obj1.gNum!=obj2.gNum){
                    return obj1.gNum>obj2.gNum;
                  }else{
                     //点数相同则先比较gong牌数，gong牌数相等则比较最大牌点数，最大牌点数相同，比花色
                    return obj1.nMaxPoint!=obj2.nMaxPoint?obj1.nMaxPoint>obj2.nMaxPoint:obj1.color.charCodeAt(0)<obj2.color.charCodeAt(0);
                  }
                }
        }
    }else{
        return false;
    }
  }
}

PokerManager.sgResultMuti = function(sgResult) {
  switch (sgResult.pkType) {
    case 4:
      return 3;
    case 3:
      return 3; 
    case 2:
      return 3;  
    case 1: {
      if (sgResult.point > 6) {
        return 2;
      } else return 1;
    }
  }
};

function sortBy(field) {
  return function(a,b) {
      return a[field] - b[field];
  }
}