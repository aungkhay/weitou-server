const CODE = require('../../util/code').GAME;
const GAMESTATE = require('../..//util/gameMsg');
const HG_TRANS = require('../../util/hgTrans');
let pushMsg = require('../pushMsg-min');
let GMResponse = require('../GMResponse');
let PokerManager = require('../PokerManager');
let pomelo = require('pomelo');
let redis = pomelo.app.get("redis");
let push = require("./pushByChannel")
let setState = require("./setState");
let parseResult = require("./parseResult");

module.exports = {
    openPk:function(msg,rInfo,cb){ 
        if(rInfo.rType != "nn"){
            setTimeout(() => {                                               // 视频延时
                doOpenPk(msg,rInfo,cb);
            }, 1000);
        }else{
            setTimeout(() => {    
                doOpenPk_nn(msg,rInfo,cb);
            }, 1000);    
        }
    }
}

function doOpenPk(msg,rInfo,cb){
    if(rInfo.rType == "bjl")openPk_bjl(msg,rInfo,cb);
    if(rInfo.rType == "lh")openPk_lh(msg,rInfo,cb);
}

function doOpenPk_nn(msg,rInfo,cb){
    openPk_nn(msg,rInfo,cb);
}

// 2022-1-44 其它荷官台改成0是没有发牌,10是原来的0,即白板 , 注意: 推筒子只有三门闲
function openPk_tts(msg,rInfo,cb) {
    let isComplete=0;
    let b_card=[],p1_card=[],p2_card=[],p3_card=[],p4_card=[];
    if(msg.isOtherHg){
        if(!!msg.newVersion){   
            let r=rInfo.result;
            let obj=msg.who==1?r.p1.cards:msg.who==2?r.p2.cards:msg.who==3?r.p3.cards:r.b.cards;
            obj.push(msg.card==10?0:msg.card);
            b_card=r.b.cards;
            p1_card=r.p1.cards;
            p2_card=r.p2.cards;
            p3_card=r.p3.cards;
            console.log("obj:",obj);
        }else{
            console.log("msg:",msg);
            b_card = msg.result.b.cards;
            p1_card = msg.result.p1.cards;
            p2_card = msg.result.p2.cards;
            p3_card = msg.result.p3.cards;
            if(!!msg.result.p4)p4_card = msg.result.p4.cards;    
            for(let i=1;i>=0;i--){
                if(b_card[i]==0)b_card.splice(i,1); 
                if(p1_card[i]==0)p1_card.splice(i,1);
                if(p2_card[i]==0)p2_card.splice(i,1);
                if(p3_card[i]==0)p3_card.splice(i,1);                 
                if(b_card[i] && b_card[i]==10)b_card[i]=0;
                if(p1_card[i] && p1_card[i]==10)p1_card[i]=0;
                if(p2_card[i] && p2_card[i]==10)p2_card[i]=0;
                if(p3_card[i] && p3_card[i]==10)p3_card[i]=0;
            }
        }
    }else{
      let r=rInfo.result;
      let w=r.who;
      w==1?r.p1.cards.push(msg.card):w==2?r.p2.cards.push(msg.card):w==3?r.p3.cards.push(msg.card):r.b.cards.push(msg.card);
      r.who++;
      if(r.who>4)r.who=1; 
      w=r.who;
      r.pos=w==1?r.p1.cards.length+1:w==2?r.p2.cards.length+1:w==3?r.p3.cards.length+1:r.b.cards.length+1;
      b_card=r.b.cards;
      p1_card=r.p1.cards;
      p2_card=r.p2.cards;
      p3_card=r.p3.cards;
      console.log("b_card:",r.who,b_card,p1_card,p2_card,p3_card);
      //p4_card=r.p4.cards;
      if(b_card.length >= 2 && p1_card.length >= 2 && p2_card.length >= 2 && p3_card.length >= 2 ){
          let res = getCow_tts(r);
          r.b.cards.point = res[0].point;
          r.p1.cards.point = res[1].point;
          r.p1.cards.win = res[1].win;
          r.p2.cards.point = res[2].point;
          r.p2.cards.win = res[2].win;
          r.p3.cards.point = res[3].point;
          r.p3.cards.win = res[3].win;
          //r.p4.cards.point=res[3].point;
          //r.p4.cards.win=res[3].win;
          isComplete=1;
          r.who=0;
      }
      r.isComplete = isComplete;
    }
    // 发回前端
    var card = {b:b_card,p1:p1_card,p2:p2_card,p3:p3_card};   // ,p4:p4_card
    var data2 = {state: GAMESTATE.KJ,pk: card};    
    if(msg.isOtherHg && msg.diffTime<=15 || !msg.isOtherHg)push.pushByChannel(CODE.OPEN_ONE_PK.code, CODE.OPEN_ONE_PK.msg, data2,rInfo);
    var data={};
    if (!msg.isOtherHg){
        data={gameId:msg.gameId,result:rInfo.result};
        setState.setStateRedis(rInfo) // 缓存游戏状态
    }        
    var response = new GMResponse(CODE.OPEN_ONE_PK.code,rInfo.rType,rInfo.Id,CODE.OPEN_ONE_PK.msg,data);    
    cb(response);     
}

// 牌位置(cardArea): 0=头牌 1~5=庄牌 11~15=闲 1 牌 21~25=闲 2 牌 31~35=闲 3 牌
function openPk_nn(msg,rInfo,cb){
  let isComplete = 0;
  let b_card = [] , p1_card = [] , p2_card=[] , p3_card = [];
  if(msg.isOtherHg){   // 凯旋
    let r = rInfo.result;
    if(!r)r = {b:{},p1:{},p2:{},p3:{}};
    if(!r.b.card)r.b.card = ["","","","",""];
    if(!r.p1.card)r.p1.card = ["","","","",""];
    if(!r.p2.card)r.p2.card = ["","","","",""];
    if(!r.p3.card)r.p3.card = ["","","","",""];
    if(msg.cardArea >= 1 && msg.cardArea <= 5)r.b.card[(msg.cardArea - 1) % 6] = parseResult.cardIDToName(msg.cardID);
    if(msg.cardArea >= 11 && msg.cardArea <= 15)r.b.card[(msg.cardArea - 11) % 6] = parseResult.cardIDToName(msg.cardID);
    if(msg.cardArea >= 21 && msg.cardArea <= 25)r.b.card[(msg.cardArea - 21) % 6] = parseResult.cardIDToName(msg.cardID);
    if(msg.cardArea >= 31 && msg.cardArea <= 35)r.b.card[(msg.cardArea - 31) % 6] = parseResult.cardIDToName(msg.cardID);
    b_card = r.b.card;
    p1_card = r.p1.card;
    p2_card = r.p2.card;
    p3_card = r.p3.card;
  }else{
    let r = rInfo.result;
    let w = r.who;
    w == 1 && r.p1.card ? r.p1.card.push(msg.card) : w == 2 ? r.p2.card.push(msg.card) : w == 3 ? r.p3.card.push(msg.card) : r.b.card.push(msg.card);
    r.who++;
    if(r.who > 4) r.who = 1;
    w = r.who;
    r.pos = w==1 ? r.p1.card.length+1 : w==2 ? r.p2.card.length + 1 : w==3 ? r.p3.card.length + 1 : r.b.card.length + 1;
    b_card = r.b.card;
    p1_card = r.p1.card;
    p2_card = r.p2.card;
    p3_card = r.p3.card;
    if(b_card.length>=5 && p1_card.length>=5 && p2_card.length>=5 && p3_card.length>=5){
        let res = getCow_nn(r);
        r.b.cow = res[0].cow;
        r.p1.cow = res[1].cow;
        r.p1.win = res[1].win;
        r.p2.cow = res[2].cow;
        r.p2.win = res[2].win;
        r.p3.cow = res[3].cow;
        r.p3.win = res[3].win;
        r.who = 0;
        isComplete = 1;
    }
    r.isComplete = isComplete;
  }
  // 发回前端
  var card = {b: b_card , p1 : p1_card , p2 : p2_card , p3 : p3_card , pos:[rInfo.result.posCard]};   // ,p4:p4_card
  var data2 = {state: GAMESTATE.KJ,pk: card};          
  push.pushByChannel(CODE.OPEN_ONE_PK.code, CODE.OPEN_ONE_PK.msg, data2,rInfo); 
  var data = {};
  if (!msg.isOtherHg){
      data = {gameId:msg.gameId,result:rInfo.result};
      setState.setStateRedis(rInfo) // 缓存游戏状态
  }          
  console.log("openPk_nn:data:",data)
  return cb( new GMResponse(CODE.OPEN_ONE_PK.code,rInfo.rType,rInfo.Id,CODE.OPEN_ONE_PK.msg,data));  
}

function openPk_sg(msg,rInfo,cb){
    let isComplete=0;
    let b_card=[],p1_card=[],p2_card=[],p3_card=[];
    if(msg.isOtherHg){
      b_card = msg.result.b.cards;
      p1_card = msg.result.p1.cards;
      p2_card = msg.result.p2.cards;
      p3_card = msg.result.p3.cards;
      for(let i = 0;i < b_card.length;i++){
        b_card[i] = HG_TRANS.pkTrans(b_card[i]);
        p1_card[i] = HG_TRANS.pkTrans(p1_card[i]);
        p2_card[i] = HG_TRANS.pkTrans(p2_card[i]);
        p3_card[i] = HG_TRANS.pkTrans(p3_card[i]);
      }
    }else{
      let r=rInfo.result;
      let w=r.who;
      w==1 && r.p1.card?r.p1.card.push(msg.card):w==2?r.p2.card.push(msg.card):w==3?r.p3.card.push(msg.card):r.b.card.push(msg.card);
      r.who++;
      if(r.who>4)r.who=1;
      w=r.who;
      r.pos=w==1?r.p1.card.length+1:w==2?r.p2.card.length+1:w==3?r.p3.card.length+1:r.b.card.length+1;
      b_card=r.b.card;
      p1_card=r.p1.card;
      p2_card=r.p2.card;
      p3_card=r.p3.card;
      if(b_card.length>=3 && p1_card.length>=3 && p2_card.length>=3 && p3_card.length>=3){
          let res=getCow_sg(r);
          r.b.cow=res[0].cow;
          r.p1.cow=res[1].cow;
          r.p1.win=res[1].win;
          r.p2.cow=res[2].cow;
          r.p2.win=res[2].win;
          r.p3.cow=res[3].cow;
          r.p3.win=res[3].win;
          r.who=0;
          r.pos=0;
          isComplete=1;
      }
      r.isComplete=isComplete;
    }
    // 发回前端
    var card={b:b_card,p1:p1_card,p2:p2_card,p3:p3_card};
    var data2 = {state: GAMESTATE.KJ,pk: card};          
    if(msg.isOtherHg && msg.diffTime<=15 || !msg.isOtherHg)push.pushByChannel(CODE.OPEN_ONE_PK.code, CODE.OPEN_ONE_PK.msg, data2,rInfo)
    var data={};
    if (!msg.isOtherHg){
        data={gameId:msg.gameId,result:rInfo.result};
        setState.setStateRedis(rInfo) // 缓存游戏状态
    }          
    var response = new GMResponse(CODE.OPEN_ONE_PK.code,rInfo.rType,rInfo.Id,CODE.OPEN_ONE_PK.msg,data);    
    cb(response);
  }

function openPk_dx(msg,rInfo,cb){
    if(!msg.dices){cb(null);return};
    let dices = msg.dices;
    rInfo.time=0;
    // 发回前端
    let data2 = {state: GAMESTATE.KJ,dices: dices};          
    if(msg.isOtherHg && msg.diffTime<=15 || !msg.isOtherHg)
       push.pushByChannel(CODE.OPEN_ONE_PK.code, CODE.OPEN_ONE_PK.msg, data2,rInfo);                   
    rInfo.result.dices=dices;
    let point=dices[0]+dices[1]+dices[2];
    rInfo.result.win=dices[0]==dices[1] && dices[1]==dices[2]?2:point<=10?1:0;                   //0大  1小  2同
    rInfo.result.isComplete=1;
    let data = { gameId:msg.gameId,result: rInfo.result};
    let response = new GMResponse(CODE.OPEN_PK2.code, rInfo.rType, rInfo.Id,CODE.OPEN_PK2.msg, data);    //翻牌     83
    cb(response);
}

function openPk_lh(msg,rInfo,cb){
    let point = {};
    let dCard="",tCard = "";
    // 牌位置(cardArea): 1 = 龙的牌，2 = 虎的牌。
    if(msg.isOtherHg){
        let r = rInfo.result;
        if(!r.pCard)r.dCard = "";
        if(!r.bCard)r.tCard = "";
        let data = {gameId:msg.gameId,result:{dCard:r.dCard,tCard:r.tCard,r:{},isComplete:0}};
        if(msg.cardArea == 1)r.dCard = parseResult.cardIDToName(msg.cardID);
        if(msg.cardArea == 2)r.tCard = parseResult.cardIDToName(msg.cardID);
        this.pushByChannel(CODE.OPEN_ONE_PK.code, CODE.OPEN_ONE_PK.msg, data);    
        cb(null);
    }else{
        if(rInfo.result.who==1){
            rInfo.result.who=2;
            rInfo.result.dCard=msg.card;
        }else{
            rInfo.result.who=0;
            rInfo.result.tCard=msg.card;
        }
        dCard=rInfo.result.dCard;
        tCard=rInfo.result.tCard;
    }
    if(dCard!="")point.p1=Number(dCard.substr(1,dCard.length-1));
    if(tCard!="")point.p2=Number(tCard.substr(1,tCard.length-1));
    let data2 = {state: 3,pk:{dCard:dCard,tCard:tCard},point:point};          
    if(msg.isOtherHg && msg.diffTime<=15 || !msg.isOtherHg)push.pushByChannel(CODE.OPEN_ONE_PK.code, CODE.OPEN_ONE_PK.msg, data2,rInfo); // 翻牌     83
    let data = {};
    if (!msg.isOtherHg){
        let isComplete=rInfo.result.who == 0 ? 1 : 0;
        rInfo.result.isComplete = isComplete;
        if(isComplete){
            let dColor = dCard.substr(0,1).charCodeAt(0);   //.color.charCodeAt(0) < strColor.charCodeAt(0))
            let tColor = tCard.substr(0,1).charCodeAt(0);
            let r = point.p1 > point.p2 ? 1 : point.p1 < point.p2?2:dColor<tColor?1:dColor>tColor?2:3;
            rInfo.result.r = r;
        }
        rInfo.result.dCard = dCard;
        rInfo.result.tCard = tCard;
        rInfo.result.dPoint = point.p1;
        rInfo.result.tPoint = point.p2;
        data={gameId:msg.gameId,result:rInfo.result};
        setState.setStateRedis(rInfo); // 缓存游戏状态
    }
    var response = new GMResponse(CODE.OPEN_ONE_PK.code,rInfo.rType,rInfo.Id,CODE.OPEN_ONE_PK.msg,data);    
    cb(response);
}

// 牌位置(cardArea): 1 3 5 = 闲的牌，2 4 6 = 庄的牌。
// 如果结果为扑克牌时01 ~ 13=梅花 A~K 21 ~33=方块 A~K 41 ~53=红心 A~K 61 ~73=黑桃 A~K -1 or 15=空值(清除牌)
// 收到服务器消息: "data":{"areaID":651,"gameNo":13369550,"gameNoRound":2,"cardArea":1,"cardID":0,}
function openPk_bjl(msg,rInfo,cb){
    if(msg.isOtherHg){          // 凯旋(只推最新发的牌)
        let r = rInfo.result;
        if(!r.pCard)r.pCard = ["","",""];
        if(!r.bCard)r.bCard = ["","",""];
        let data = {gameId:msg.gameId,result:{pCard:r.pCard,bCard:r.bCard,r:{},isComplete:0}};
        if([1,3,5].indexOf(msg.cardArea))r.pCard[(msg.cardArea-1) / 2] = parseResult.cardIDToName(msg.cardID);
        if([2,4,6].indexOf(msg.cardArea))r.bCard[msg.cardArea / 2 - 1] = parseResult.cardIDToName(msg.cardID);
        this.pushByChannel(CODE.OPEN_ONE_PK.code, CODE.OPEN_ONE_PK.msg, data);    
        cb(null);
    }else{               
        let r = rInfo.result;
        let t = rInfo.CARDS_TYPE;
        if(r.who == 1)r.pCard.push(msg.card);
        if(r.who == 2)r.bCard.push(msg.card);
        if(rInfo.CARDS_TYPE == 0)r.pos=r.pos==0?2:r.pos==1?3:2;  
        if(t==0){           // 0为闲一张 庄一张 1为闲两张 庄两张 2为前四张一起发
            r.who = r.who == 1 ? 2 : 1;
            r.pos = r.who == 1 ? r.pCard.length + 1 : r.bCard.length + 1;
            if (r.pos > 3)r.pos = 3; 
        }
        if(t==1){
            r.who = r.pCard.length == 1 ? 1 : 2;
            r.pos = r.who == 1 ? r.pCard.length + 1 : r.bCard.length + 1;
        }
        if(r.pCard.length == 2 && r.bCard.length == 2 && !chkAdjunctionCard(rInfo,r.pCard,r.bCard)){     // 如果都发两张了，判断增牌
            rInfo.result.isComplete = 1;
        }
        if(r.pCard.length == 3 && r.who == 1){                // 判断第二次补牌
            adjunctionCard(rInfo,msg,cb);
        }
        if(r.bCard.length == 3 && r.who == 2){                
            rInfo.result.isComplete = 1;
        }
        console.log("openPk_bjl:",r,msg);
        sendAdjunctionCard(rInfo,msg,rInfo.result.isComplete,r.pCard,r.bCard,cb); 
    }
};

function getCow_tts(r){
    let a = new Array();
    let res = [];
    for (let i = 0; i < 4; i++){
      let cards=i==0?r.b.cards:i==1?r.p1.cards:i==2?r.p2.cards:r.p3.cards;
      let point=(cards[0]+cards[1])%10;
      if (cards[0]==cards[1])point=cards[0]==0?point+=20:point+=10;
      let obj={point:point,one:cards[0],two:cards[1]};                             
      if(i!=0){
        let n=sxShare.comparePk_tts(res[0],obj);    // n = 1庄赢,2和,3闲赢
        obj.win=n==1?0:n==3?1:2;
      }
      res.push(obj);
    }
    return res;
}

function getCow_nn(r){
    let a = new Array();
    let res=[];
    for (let i = 0; i < 4; i++){
      let card=i==0?r.b.card:i==1?r.p1.card:i==2?r.p2.card:r.p3.card;
      a[i] = [];
      for (let j=0;j<5;j++){
        let oCard = {
          color: card[j].substr(0, 1),
          value: Number(card[j].substr(1, card[j].length - 1))
        };
        a[i].push(oCard);
      }
      let obj=PokerManager.nnResultForPoker(a[i]);
      obj.cow=obj.nntype==2?10:obj.nntype==0?0:obj.niuN;           // 10牛牛,0无牛,niuN牛n 
      if(i!=0)obj.win=PokerManager.nnComparePoker(obj,res[0]);     // nWin>0庄家输
      res.push(obj);
    }
    return res;
}

function getCow_sg(r){
    let a = new Array();
    let res=[];
    for (let i = 0; i < 4; i++){
      let card=i==0?r.b.card:i==1?r.p1.card:i==2?r.p2.card:r.p3.card;
      a[i] = [];
      for (let j=0;j<3;j++){
        let oCard = {
          color: card[j].substr(0, 1),
          value: Number(card[j].substr(1, card[j].length - 1))
        };
        a[i].push(oCard);
      }
      let obj=PokerManager.sgResultForPoker(a[i]);
      obj.cow=obj.pkType==4?10:obj.pkType==3?11:obj.pkType==2?12:obj.point;                                              // 大三公 10 > 小三公 11 > 混三公 12 > 点数 n
      if(i!=0){
        let win=PokerManager.sgCompare(obj,res[0]);
        obj.win=!!win?1:0;          // nWin>0庄家输
      }
      res.push(obj);
    }
    return res;
}

function openPk_xjh(msg,rInfo,cb){
  let b_card=[],r_card=[];
  if(msg.isOtherHg){
    b_card = msg.result.bCards;
    r_card = msg.result.rCards;
    for(let i = 0;i < b_card.length;i++){
      b_card[i] = HG_TRANS.pkTrans(b_card[i]);
      r_card[i] = HG_TRANS.pkTrans(r_card[i]);
    }
  }

  // 发回前端
  let card={bCard:b_card,rCard:r_card};
  let data2 = {state: GAMESTATE.KJ,pk: card};          
  if(msg.isOtherHg && msg.diffTime<=15 || !msg.isOtherHg)push.pushByChannel(rInfo,CODE.OPEN_ONE_PK.code, CODE.OPEN_ONE_PK.msg, data2,rInfo); // 翻牌     83 
  var data={};
  if (!msg.isOtherHg){
      data={gameId:msg.gameId,result:rInfo.result};
      setState.setStateRedis(rInfo); // 缓存游戏状态
  }          
  var response = new GMResponse(CODE.OPEN_ONE_PK.code,rInfo.rType,rInfo.Id,CODE.OPEN_ONE_PK.msg,data);    
  cb(response);
}

function sendAdjunctionCard(rInfo,msg,isComplete,pCard,bCard,cb){
    let r = rInfo.result;
    let data={gameId:msg.gameId,result:{pCard:pCard,bCard:bCard,r:{},isComplete:isComplete}};
    if(!isComplete){
        data.result.who=r.who;
        data.result.pos=r.pos;
    }else{
        data.result.pCount=HG_TRANS.getCardCount(pCard);
        data.result.bCount=HG_TRANS.getCardCount(bCard);
        data.result.r.win=data.result.pCount>data.result.bCount?1:data.result.pCount<data.result.bCount?2:3;
        let pPair=HG_TRANS.chkPair(pCard);
        let bPair=HG_TRANS.chkPair(bCard);
        data.result.r.pair=pPair && bPair?8:pPair?4:bPair?5:0;
    }
    rInfo.result=data.result;
    setState.setStateRedis(rInfo); // 缓存游戏状态
    var response = new GMResponse(CODE.OPEN_ONE_PK.code,rInfo.rType,rInfo.Id,CODE.OPEN_ONE_PK.msg,data);
    cb(response); 
    if(msg.isOtherHg && msg.diffTime<=15 || !msg.isOtherHg)push.pushByChannel(CODE.OPEN_ONE_PK.code, CODE.OPEN_ONE_PK.msg, data,rInfo);                                          //翻单张牌       08
}

function chkAdjunctionCard(rInfo,pCard,bCard){  // 第一次
    let sumP=HG_TRANS.getCardCount(pCard);
    let sumB=HG_TRANS.getCardCount(bCard);
    if (sumP<6 && sumB<8){
        rInfo.result.who=1;
        rInfo.result.pos=3;
        return true;
    }
    if(sumB<6 && sumP<8){
        rInfo.result.who=2;
        rInfo.result.pos=3; 
        return true;
    }
    return false;
}

function chkAdjunctionCard2(rInfo,pCard,bCard){  // 检测第二次增牌,庄家补牌
    let pk3=!!pCard[2]?HG_TRANS.getCardValue(pCard[2]):-1;  
    let m=HG_TRANS.getCardCount(bCard);
    let isAdd=false;
    if(m<3)isAdd=true;
    if(m==3 && pk3!=8)isAdd=true;
    if(m==4 && pk3!=0 && pk3!=1 && pk3!=8 && pk3!=9)isAdd=true;
    if(m==5 && pk3!=0 && pk3!=1 && pk3!=2 && pk3!=3 && pk3!=8 && pk3!=9)isAdd=true;
    if(m==6 && (pk3==6 || pk3==7))isAdd=true;
    if(isAdd){
        rInfo.result.who=2;
        rInfo.result.pos=3; 
    }
    return isAdd;
}

function transCard(cards){
    let sCard=[];
    for(let i=0;i<cards.length;i++){
        let p = cards[i];
        let suit = p.suit=="S"?"a":p.suit=="H"?"b":p.suit=="C"?"c":"d";
        sCard.push(suit+p.rank);
    }
    return sCard;
}

function adjunctionCard(rInfo,msg,cb) {         // 检测第二次增牌
    rInfo.time=0;
    rInfo.isOtherHg = msg.isOtherHg;
    let r = rInfo.result;
    //if(r.who==1)r.pCard.push(msg.card);
    //if(r.who==2)r.bCard.push(msg.card);
    if(r.who == 1 && chkAdjunctionCard2(rInfo,r.pCard,r.bCard)){
       r.who = 2;
       r.pos = 3; 
    }else{
       rInfo.result.isComplete = 1;
    }
}

function transMsg_lh(msg){
    let data={result:{r:{}}};
    let arrPk = msg.pk.split(",");
    // 如果是发牌
    if(arrPk[0]!=0){        
        let d = {suit:arrPk[0].substr(0,1),rank:arrPk[0].substr(1,card.length-1)};
        let t = {suit:arrPk[1].substr(0,1),rank:arrPk[1].substr(1,card.length-1)};
        data.result.win = d.rank>t.rank?1:d.rank<t.rank?2:d.suit>t.suit?1:d.suit<t.suit?2:3;
        // S:黑桃  ,H:红桃  , C:梅花  ,D:方块
        let nn = data.result.win;
        nn = nn==1?1:nn==2?3:2;                  // a:龙  b:和  c:虎
        data.kj = (nn==1?"a":nn==2?"b":"c")      // 开奖结果(转成统一)
        msg.result.win = nn;
    }else{

    }
    return data;
}

function transMsg_bjl(msg){
    msg.result = {};
    let data = {result:{r:{}}};
    // 遍历所有牌,初始化结果对象，保证顺序
    const pCard = playerAreas.map(area => {
        const card = msg.cardArr.find(c => c.cardArea === area);
        return parseResult.cardIDToName(card.cardID);
    });

    const bCard = bankerAreas.map(area => {
        const card = msg.cardArr.find(c => c.cardArea === area);
        return parseResult.cardIDToName(card.cardID);
    });

    data.result.pCard = pCard;
    data.result.bCard = bCard;
    data.result.pCount = msg.playerScore;  // HG_TRANS.getCardCount(pCard);
    data.result.bCount = msg.bankerScore;  // HG_TRANS.getCardCount(bCard);
    if(msg.result){         
        // 没有点牌,只点庄闲,反推
        msg.kj = parseResult.parseResult_code(msg.result); 
        let o = parseResult.getPkResult(msg);
        data.result.r.win = o.w;
        data.result.r.pair = o.p;
        msg.result.win = data.result.r.win;
        msg.result.pair = data.result.r.pair;
    }
    return data;
}

function transMsg_xjh(msg){
    let data={result:{}};
    let pCard = [];
    let bCard = [];
    bCard = transCard(msg.dragon);    // 龙
    rCard = transCard(msg.phoenix);   // 凤
    data.result.pCard = pCard;
    data.result.bCard = rCard;
    let dragon=PokerManager.xjhResultForPoker(msg.dragon);
    let phoenix=PokerManager.xjhResultForPoker(msg.phoenix);
    
    msg.result.win = data.result.r.win;
    msg.result.pair = data.result.r.pair;
    msg.kj = getPkResult(msg); 
    return data;
}

