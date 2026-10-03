module.exports = {
    resetResult:function(rInfo){ 
        switch(rInfo.rType){
            case "bjl":
                rInfo.result={
                    posCard:"",
                    who:1,
                    pos:1,
                    pCard:[],
                    bCard:[],
                    r:{win:0,pair:0},
                    isComplete:0
                };
                break;
            case "dx":
                rInfo.result={
                    dices:[],
                    isComplete:0
                };
                break;
            case "lh":
                rInfo.result={
                    who:1,
                    tCard:"",
                    dCard:"",
                    rdCard:"",
                    dPoint:0,
                    tPoint:0,
                    isComplete:0      
                };
                break;
            case "nn":
                rInfo.result={
                    posCard:"",
                    who:0,
                    pos:1,
                    b:{card:[],cow:0,win:0},
                    p1:{card:[],cow:0,win:0},
                    p2:{card:[],cow:0,win:0},
                    p3:{card:[],cow:0,win:0},
                    isComplete:0
                };
                break;
            case "tts":
                rInfo.result={
                    posCard:"",
                    who:0,
                    pos:1,
                    b:{cards:[],point:0,win:0},
                    p1:{cards:[],point:0,win:0},
                    p2:{cards:[],point:0,win:0},
                    p3:{cards:[],point:0,win:0},
                    p4:{cards:[],point:0,win:0},
                    isComplete:0
                };
                break;
            case "xjh":
                rInfo.result={
                    who:1,
                    rCards:[],
                    bCards:[],
                    rR:0,
                    bR:0,
                    win:0,
                    isComplete:0      
                };
                break;
            case "sg":
                rInfo.result={
                    posCard:"",
                    who:0,
                    pos:1,
                    b:{card:[],cow:0,win:0},
                    p1:{card:[],cow:0,win:0},
                    p2:{card:[],cow:0,win:0},
                    p3:{card:[],cow:0,win:0},
                    isComplete:0
                };
                break;    
        }
    },

    getN:function(rType,i){
        let d = new Date();
        let h = d.getHours();
        let a = [0,300,500,700,800,1500,2000,3000,5000,10000];
        let b = [0,0,0,200,500,800,3000,6000,10000];
        let e = [0,0,200,500,1000,2000];
        let f = [0,0,100,200,300,500,800];
        let r1 = Math.floor(Math.random()*a.length);
        let r2 = Math.floor(Math.random()*b.length);
        let r3 = Math.floor(Math.random()*e.length);
        let r4 = Math.floor(Math.random()*f.length);
        let n1 = h >= 2 && h <= 7 ? b[r2] : a[r1];
        let n2 = h >= 2 && h <= 7 ? e[r3] : f[r4];
        if(Math.floor(Math.random()*3) == 1)return 0;
        switch(rType){
            case "bjl":
              if(i == 1 && Math.floor(Math.random() * 30) < 5)return n1;  
               return i == 3 || i == 4 ? 50 : i == 1 ? 0 : n1;
            case "lh":
              if(i == 1 && Math.floor(Math.random() * 30 ) < 5 )return n1;  
              return i==1 ? 0 : n1;
            case "dx":  
              if(i == 30 && Math.floor(Math.random() * 30) == 8)return n2;  
              return n = i==30 ? 0 : n2;
            case "nn":
              return n2; 
            case "tts":
              return n2;  
            case "xjh":
              return n2;  
            case "sg":
              return n2;  
        }   
    },

    getMaxBs:function(rType){
        switch(rType){
            case "nn": 
              return 3;
            case "tts":
              return 3;  
            case "sg":
              return 3;    
            default:  
              return 0;
        }   
    },
    chkLimit:function(rType,totalbet,sBl,maxBs,splitLimit){
        switch(rType){
            case "bjl":
                return  totalbet[0] > 0 && totalbet[0] < splitLimit[1] ||
                        totalbet[1] > 0 && totalbet[1] < splitLimit[1] ||
                        totalbet[2] > 0 && totalbet[2] < splitLimit[1] ||
                        totalbet[3] > 0 && totalbet[3] < splitLimit[1] ||
                        totalbet[4] > 0 && totalbet[4] < splitLimit[1] ||
                        totalbet[5] > 0 && totalbet[5] < splitLimit[1] ||
                        totalbet[6] > 0 && totalbet[6] < splitLimit[1] ||
                        totalbet[1]*8>splitLimit[0] || 
                        Math.abs(totalbet[0]-totalbet[2])>splitLimit[0] || 
                        (totalbet[3]+totalbet[4])*11>splitLimit[0] ||
                        Math.abs(totalbet[5] * sBl[5]-totalbet[6]*sBl[6])>splitLimit[0] 

            case "lh": 
                 return totalbet[0] > 0 && totalbet[0] < splitLimit[1] ||
                        totalbet[1] > 0 && totalbet[1] < splitLimit[1] ||
                        totalbet[2] > 0 && totalbet[2] < splitLimit[1] ||
                        totalbet[3] > 0 && totalbet[3] < splitLimit[1] ||
                        totalbet[4] > 0 && totalbet[4] < splitLimit[1] ||
                        totalbet[5] > 0 && totalbet[5] < splitLimit[1] ||
                        totalbet[6] > 0 && totalbet[6] < splitLimit[1] ||
                        Math.abs(totalbet[0] - totalbet[2]) > splitLimit[0] ||  
                        Math.abs(totalbet[3] - totalbet[4]) > splitLimit[0] || 
                        Math.abs(totalbet[5] * sBl[5] - totalbet[6] * sBl[6]) > splitLimit[0] ||
                        totalbet[1] * 10 > splitLimit[0];
            case "xjh":
                return  Math.abs(totalbet[0]-totalbet[2])>splitLimit[0] ||  
                        Math.abs(totalbet[3]-totalbet[4])>splitLimit[0] || 
                        Math.abs(totalbet[5]-totalbet[6])>splitLimit[0] ||
                        totalbet[1]*sBl[1]>splitLimit[0];
            case "dx":  
                for(let i=0;i<totalbet.length-1;i++){
                    if(totalbet[i]>0){
                        if((i==0 || i==13) && totalbet[i]*sBl[5]>splitLimit[0])return true;
                        if((i==1 || i==12) && totalbet[i]*sBl[6]>splitLimit[0])return true;
                        if((i==2 || i==11) && totalbet[i]*sBl[7]>splitLimit[0])return true;
                        if((i==3 || i==10) && totalbet[i]*sBl[8]>splitLimit[0])return true;
                        if((i==4 || i==9) && totalbet[i]*sBl[9]>splitLimit[0])return true;
                        if((i==5 || i==6 || i==7 || i==8) && totalbet[i]*sBl[10]>splitLimit[0])return true;
                        if(i>=16 && i<=21 && totalbet[i]*sBl[13]>splitLimit[0])return true;                   // 按最大的赔率算(一般3倍)
                        if(i>=24 && i<=29 && totalbet[i]*sBl[3]>splitLimit[0])return true;                    // 开同点(1-6某点)
                        if(i==30 && totalbet[i]*sBl[2]>splitLimit[0])return true;                             // 开同点(任一点)
                        if(i>=31 && i<=36 && totalbet[i]*sBl[1]>splitLimit[0])return true;                    // 开同点(1-6某点)
                        if(i>=37 && i<=51 && totalbet[i]*sBl[4]>splitLimit[0])return true;                    // 开两点相同
                    }
                }
                if (Math.abs(totalbet[14]-totalbet[22])>splitLimit[0])return true;                           // 大小
                if (Math.abs(totalbet[15]-totalbet[23])>splitLimit[0])return true;                           // 单双
                return false;
            case "nn" :
                return (
                    Math.abs(totalbet[0]+totalbet[2] - totalbet[1]-totalbet[3]) > splitLimit[0] ||
                    Math.abs(totalbet[4]+totalbet[6] - totalbet[5]-totalbet[7]) > splitLimit[0] ||
                    Math.abs(totalbet[8]+totalbet[10] - totalbet[9]- totalbet[11]) > splitLimit[0]
                  );
            case "tts":
                console.log(totalbet,maxBs,splitLimit[0],splitLimit[1]);
                return totalbet[0]+totalbet[1]>splitLimit[0]||totalbet[2]+totalbet[3]>splitLimit[0]||
                       totalbet[4]+totalbet[5]>splitLimit[0]||totalbet[6]+totalbet[7]>splitLimit[0]
            case "sg" :
                return (
                    Math.abs(totalbet[0]+totalbet[2] - totalbet[1]-totalbet[3]) > splitLimit[0] ||
                    Math.abs(totalbet[4]+totalbet[6] - totalbet[5]-totalbet[7]) > splitLimit[0] ||
                    Math.abs(totalbet[8]+totalbet[10] - totalbet[9]- totalbet[11]) > splitLimit[0]
                );           
        }   
    },
    
    getPkKind_bjl:function(msg){                   // msg.result{win: 1.闲  2.庄  3.和  pair: 4.闲对 5.庄对  8庄闲对}  
        let pkKind = {};
        let nn = 0;
        let isBankPair = false;
        let isPlayerPair = false;
        if(msg.result.win == 1)nn=3;               // 闲  荷官端发过来的:1.闲  2.庄  3.和
        if(msg.result.win == 3)nn=2;               // 和
        if(msg.result.win == 2)nn=1;               // 庄
        if(msg.result.pair == 4)isPlayerPair = true;        // 闲对
        if(msg.result.pair == 5)isBankPair = true;          // 庄对
        if(msg.result.pair == 8){
           isBankPair = true; 
           isPlayerPair = true;
        }
        let isBit = false;
        pkKind={nn:nn,isBankPair:isBankPair,isPlayerPair:isPlayerPair,kj:getPkResult(msg),isBit:isBit};
        return pkKind;
    },

    getPk_nn:function(pkgroup) {
        var pk = "";
        for (let index = 0; index < 4; index++) {
            for (let i = 0; i < pkgroup[index].length; i++) {
               pk += pkgroup[index][i].color + pkgroup[index][i].value + ",";
            }
            if (pk != "") pk = pk.substr(0, pk.length - 1);
            pk += "$";
        }
        if (pk != "") pk = pk.substr(0, pk.length - 1);
        return pk;
    },
    
    getPk_sg:function(pkgroup) {
        var pk = "";
        for (let index = 0; index < 4; index++) {
            for (let i = 0; i < pkgroup[index].length; i++) {
               pk += pkgroup[index][i].color + pkgroup[index][i].value + ",";
            }
            if (pk != "") pk = pk.substr(0, pk.length - 1);
            pk += "$";
        }
        if (pk != "") pk = pk.substr(0, pk.length - 1);
        return pk;
    },
    
    getPkKind_nn : function(pk) {
        // 牛牛(2) > 有分(1) > 没分(0)      在本游戏省略 四花,> 五小(5) > 五花(4)>炸弹(6) 
        //split1 = Split("牛一,牛二,牛三,牛四,牛五,牛六,牛七,牛八,牛九,牛牛,炸弹牛,无牛", ",")   '牛一 至 牛九(a至i)   牛牛,炸弹,无牛(jkl)
        var strPk = "";
        for (var i = 0; i < 4; i++) {
          var t = pk[i];
          if (t.nntype == 1) strPk += String.fromCharCode(96 + t.niuN);
          if (t.nntype == 2) strPk += "j";
          if (t.nntype == 0) strPk += "l";
          if (t.nntype == 6) strPk += "k";
        }
        return strPk;
    },
    getPkKind_sg : function(pk) {
       // a 0点,b 2点,c 3点,d 4点...,j 9点 , k 大三公,l 小三公, m 混三公
        console.log("pk:",pk);
        var strPk = "";
        for (var i = 0; i < 4; i++) {
          var t = pk[i];
          if (t.pkType == 1) strPk += String.fromCharCode(97 + t.point);
          if (t.pkType == 4) strPk += "k";
          if (t.pkType == 3) strPk += "l";
          if (t.pkType == 2) strPk += "m";
        }
        console.log("strPk:",strPk);
        return strPk;
    },
    isHaveTwoPoint_dx : function(point,n1,n2){
        var str1=point.p1 +","+point.p2+","+point.p3;
        return str1.indexOf(n1)>=0 && str1.indexOf(n2)>=0;
    },
    isTwoSamePoint_dx : function(point,n){
        return point.p1==point.p2 && point.p1==n || point.p1==point.p3 && point.p1==n ||
               point.p3==point.p2 && point.p3==n
    },
    chkHavePointNum_dx : function(point,n){                         //检测开n有多少个色子
        var sum=0;
        if(point.p1==n)sum++;
        if(point.p2==n)sum++;
        if(point.p3==n)sum++;
        return sum;
    },
    comparePk_tts : function(obj1,obj2){                          //obj1:庄家牌   对子(白板最大)
        obj1.one=obj1.one==0?0.5:obj1.one;
        obj1.two=obj1.two==0?0.5:obj1.two;
        obj2.one=obj2.one==0?0.5:obj2.one;
        obj2.two=obj2.two==0?0.5:obj2.two;
        let point1=(obj1.one+obj1.two)%10;
        let point2=(obj2.one+obj2.two)%10;
        if(obj1.one==obj1.two)
            point1=obj1.one!=0.5?10+obj1.one:20;                              //白板对子最大:当20点
        if(obj2.one==obj2.two)
            point2=obj2.one!=0.5?10+obj2.one:20;
        if(point2==0)return 1;                                                //闲家0点直接输
        if (point1==point2){                                                  //点数相同
            point1=obj1.one>obj1.two?obj1.one:obj1.two;
            point2=obj2.one>obj2.two?obj2.one:obj2.two;
        }
        return point1>point2?1:point1==point2?2:3;                            //1庄赢,2和,3闲赢
    },
    getMuti_tts : function(obj1){                                 //取倍数
        obj1.one=obj1.one==0?0.5:obj1.one;
        obj1.two=obj1.two==0?0.5:obj1.two;
        let point1=(obj1.one+obj1.two)%10;
        return obj1.one==obj1.two?3:point1>=7?2:1;
    },
    getPkKind_tts : function(obj){
        //对子 0-9(a-j),0点(k),1点(l),2点(m),3点(n),4点(o),5点(p),6点(q),7点(r),8点(s),9点(t),1点半(1),2点半(2),3点半(3),4点半(4),5点半(5),6点半(6),7点半(7),8点半(8),9点半(9)
        let strPk="";
        for (let i in obj) {
            obj1=obj[i];
            if (obj1.one==obj1.two){      //对子
               strPk+=String.fromCharCode(97+obj1.one);            
            }else{
               obj1.one=obj1.one==0?0.5:obj1.one;
               obj1.two=obj1.two==0?0.5:obj1.two;
               let point1=(obj1.one+obj1.two)%10;
               let intP=Math.floor(point1);
               if(intP==point1){
                  strPk+=String.fromCharCode(107+point1);
               }else{
                  strPk+=intP;
               }                                                                                                                                                                                                                                                                                                                                                                                                                                 
            }
        }
        return strPk;
    },
    effectiveBet:function(rType,kj,totalbet,maxBs){
        let m=0;
        let n=0;
        var muti=1;
        switch(rType){
            case "bjl":
                if(kj == "l" || kj =="k" || kj == "j" || kj == "i"){                                 //开和,没有洗码量 
                    return totalbet[3]+totalbet[4];
                }else{                                  
                    return Math.abs(totalbet[0]-totalbet[2])+totalbet[1]+totalbet[3]+totalbet[4];
                }
            case "lh":
                return  kj=="b"?0:Math.abs(totalbet[0]-totalbet[2])+totalbet[1]+
                        Math.abs(totalbet[3]-totalbet[4])+
                        Math.abs(totalbet[5]-totalbet[6]);
            case "dx":  
                let sum=0;
                for(let i=0;i<=51;i++)
                    if(i!=14 && i!=15 && i!=22 && i!=23)sum+=totalbet[i];
                sum+=Math.abs(totalbet[14]-totalbet[22])+Math.abs(totalbet[15]-totalbet[23]);
                return sum;
            case "nn" :
                muti=kj.split("-")[1];
                for (let i = 0; i < totalbet.length - 1; i++) {
                  if (i == 0 || i == 1 || i == 4 || i == 5 || i == 8 || i == 9) {         // 翻倍洗码
                    let n = i==0 || i==1 ? 0 : i==4 || i==5 ? 1 : 2;
                    m += totalbet[i]/maxBs*Number(muti.substr(n,1));
                    n++;
                  } else {
                     m += totalbet[i];                                                    // 平倍洗码,直接算
                  } 
                }
                return m;
            case "tts":
                let splitKj=kj.split("-");                                                                                       //如:kj="2002-3112"
                for(let i=0;i<totalbet.length-1;i++){
                    if(i==0 || i==2 || i==4 || i==6){                                                                            //输赢
                        let n = i/2;
                        let a = Number(splitKj[1].substr(n,1));                                                                    //a=该位置为开奖倍数
                        m += totalbet[i]/maxBs*a;        
                    }else{
                        m += totalbet[i];                                                                        //平倍洗码,直接算
                    }
                }
                return m;
            case "sg" :
                muti=kj.split("-")[1];
                for (let i = 0; i < totalbet.length - 1; i++) {
                    if (i == 0 || i == 1 || i == 4 || i == 5 || i == 8 || i == 9) {       // 翻倍洗码
                        let n = i==0 || i==1 ? 0 : i==4 || i==5 ? 1 : 2;
                        m += totalbet[i]/maxBs*Number(muti.substr(n,1));
                        n++;
                    } else {
                        m += totalbet[i];                                                 //　平倍洗码,直接算
                    } 
                }
                return m;    
        }
    },
    //  kj:  i:和 j:和 闲对 k:和 庄对 l:和 闲对 庄对  大小单双对子:赢口不有洗码,输口才有洗码   下和： 开和时没有洗码，开其它的时候有洗码
    getXml : function(yl,yxxz,rType,kj,totalbet,bl){
        let tWin=0;
        let spbl = bl.split(",");
        switch(rType){  
            case "nn" :
                return {s:0,d:0}; 
            case "bjl":                                           
                if(yl > 0){
                    let kj2 = kj.split("_")[0];
                    if(['i','j','k','l'].indexOf(kj2) >= 0){                    // 开和是不返庄对闲对,返其它
                        tWin += Math.abs(totalbet[4] + totalbet[3]);
                    }else{    
                        tWin += Math.abs(totalbet[0]*spbl[2] - totalbet[2]);   // 庄抽水后再算洗码,开和因返庄闲，所以开和庄闲不能算洗码量
                    }
                }
                return yl>0?{s:0,d:tWin}:{s:yl==0?0:-yl,d:yl==0?0:-yl};  
            case "lh":
                if(yl > 0){
                    tWin += totalbet[0]*spbl[0] + totalbet[2]*spbl[2];   // 抽水后再算洗码量
                }
                return yl>0?{s:0,d:tWin}:{s:yl==0?0:-yl,d:yl==0?0:-yl};  
        }
    }
}


function getPkResult(msg){    
    //a:庄 b:庄 闲对 c:庄 庄对 d:庄 闲对 庄对      
    //e:闲 f:闲 闲对 g:闲 庄对 h:闲 闲对 庄对 
    //i:和 j:和 闲对 k:和 庄对 l:和 闲对 庄对
    let kj="";
    let w = msg.result.win;
    let p = msg.result.pair;
    if(w == 1){
       kj = p == 8 ? "h" : p == 5 ? "g" : p == 4 ? "f" : "e";
    }
    if(w == 2){
       kj = p == 8 ? "d" : p == 5 ? "c" : p == 4 ? "b" : "a";
    }
    if(w == 3){
       kj = p == 8 ? "l" : p == 5 ? "k" : p == 4 ? "j" : "i";
    }  
    return kj;
}

function time_range(beginTime, endTime) {
	var strb = beginTime.split(":");
	if (strb.length != 2) {
	       return false;
	}
	
	var stre = endTime.split(":");
	if (stre.length != 2) {
          return false;
    }
   
    var b = new Date();
    var e = new Date();
    var n = new Date();
    
    b.setHours(strb[0]);
    b.setMinutes(strb[1]);
    e.setHours(stre[0]);
    e.setMinutes(stre[1]);
   
    if (n.getTime() - b.getTime() > 0 && n.getTime() - e.getTime() < 0) {
		return true;
    } else {
       return false;
	}
}　　　