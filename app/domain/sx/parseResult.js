// 数字 → 字母
const NUM_TO_CHAR = {
  1: 'l',   // 无牛
  2: 'a',
  3: 'b',
  4: 'c',
  5: 'd',
  6: 'e',
  7: 'f',
  8: 'g',
  9: 'h',
  10: 'i',
  11: 'j',  // 牛牛
  12: 'm',  // 五花牛
  13: 'k',  // 炸弹（如果你后面有）
  14: 'n'   // 五小牛（如果你后面有）
};

const CHAR_TO_NUM = Object.fromEntries(
  Object.entries(NUM_TO_CHAR).map(([k, v]) => [v, Number(k)])
);

module.exports = {
    parseResult(code) {
            const map = [
                [1, '庄赢'],
                [2, '闲赢'],
                [4, '和'],
                [8, '庄对'],
                [16, '闲对'],
                [32, '小老虎'],
                [64, '大老虎'],
                [128, '完美'],
                [256, '幸运7_4'],
                [512, '幸运7_5'],
                [1024, '幸运7_6']
            ];

            return map
                .filter(([value]) => (code & value) === value)
                .map(([, name]) => name)
                .join(' ');
    },

    parseResult_code(code) {
        const isZhuang = (code & 1) === 1;
        const isXian   = (code & 2) === 2;
        const isHe     = (code & 4) === 4;

        const hasZhuangPair = (code & 8) === 8;
        const hasXianPair   = (code & 16) === 16;

        if (isZhuang) {
            if (hasZhuangPair && hasXianPair) return 'd';
            if (hasZhuangPair) return 'c';
            if (hasXianPair) return 'b';
            return 'a';
        }

        if (isXian) {
            if (hasZhuangPair && hasXianPair) return 'h';
            if (hasZhuangPair) return 'g';
            if (hasXianPair) return 'f';
            return 'e';
        }

        if (isHe) {
            if (hasZhuangPair && hasXianPair) return 'l';
            if (hasZhuangPair) return 'k';
            if (hasXianPair) return 'j';
            return 'i';
        }
        return '';
    },

    isBank(code) { return (code & 1) === 1; },
    isPlayer(code) { return (code & 2) === 2; },
    isTie(code) { return (code & 4) === 4; },
    isBankPair(code) { return (code & 8) === 8; },
    isPlayerPair(code) { return (code & 16) === 16; },

    isLucky6_2(code) { return (code & 32) === 32; },
    isLucky6_3(code) { return (code & 64) === 64; },
    isSmallTiger(code) { return this.isLucky6_2(code); },
    isBigTiger(code) { return this.isLucky6_3(code); },

    isPerfect(code) { return (code & 128) === 128; },
    isLucky7_4(code) { return (code & 256) === 256; },
    isLucky7_5(code) { return (code & 512) === 512; },
    isLucky7_6(code) { return (code & 1024) === 1024; },

    cardIDToName(cardID){
        if (cardID === -1 || cardID === 15) return "";
        let card = "";
        if (cardID >= 1 && cardID <= 13) card = "c" + cardID;
        else if (cardID >= 21 && cardID <= 33) card = "d" + (cardID - 20);
        else if (cardID >= 41 && cardID <= 53) card = "b" + (cardID - 40);
        else if (cardID >= 61 && cardID <= 73) card = "a" + (cardID - 60);
        return card;
    },

    getPkResult(msg){
        let kj = msg.kj;
        let o = {w:0,p:0};
        o.w = ['h','g','f','e'].indexOf(kj)>=0?1:['d','c','b','a'].indexOf(kj) >=0 ? 2 : 3;
        o.p = ['h','d','l'].indexOf(kj)>=0?8:['g','c','k'].indexOf(kj)>=0?5:['f','b','j'].indexOf(kj)>=0?4:0;
        return o;
    },

    parseNiuNiuResult(code) {
        const str = String(code);
        if (![7, 8].includes(str.length)) {
            throw new Error('数字结果码必须是 7 或 8 位');
        }

        let offset = 0;
        let x3, x2, x1, banker;

        if (str.length === 7) {
            x3 = '0' + str[0];
            offset = 1;
        } else {
            x3 = str.slice(0, 2);
            offset = 2;
        }

        x2 = str.slice(offset, offset + 2);
        x1 = str.slice(offset + 2, offset + 4);
        banker = str.slice(offset + 4, offset + 6);

        const bankerNum = parseInt(banker, 10);

        const players = [x1, x2, x3].map(v => {
            let n = parseInt(v, 10);
            let win = 0;
            if (n >= 21) {
                n -= 20;
                win = 1;
            }
            return { type: n, win };
        });

        return (
            NUM_TO_CHAR[bankerNum] +
            players.map(p => NUM_TO_CHAR[p.type]).join('') +
            '-' +
            players.map(p => p.win).join('')
        );
    },

    parseBetStrToObj(str) {
        const regex = /(\d+)\^(\d+)/g;
        let result = {};
        let match;
        while ((match = regex.exec(str)) !== null) {
            const key = match[1];
            const value = parseInt(match[2], 10);
            switch (key) {
            case '1': result.bank = value; break;
            case '2': result.tie = value; break;
            case '3': result.player = value; break;
            case '4': result.bankPair = value; break;
            case '5': result.playerPair = value; break;
            case '6': result.lucky6 = value; break;
            case '7': result.perfect = value; break;
            case '8': result.pair = value; break;
            default: break;
            }
        }
        return result;
    },

    parseBetStrToArray(betString) {
        let s = String(betString || "");

        s = s.replace(/(\d+)\s*[wW万]/g, (m, a) => String(Number(a) * 10000));
        //s = s.replace(/(\d+)\s*[kK千]/g, (m, a) => String(Number(a) * 1000));

        const betTypes = {
            "Z": "z", "H": "h", "X": "x",
            "ZD": "zd", "XD": "xd",
            "D": "pair", "DZ": "pair",
            "L": "l", "K": "k",
            "Q": "q", "M": "m",
            "SB": "sb", "BB": "bb",
            "ZS": "zs", "SZ": "zs",
            "XS": "xs", "SX": "xs",
            "HS": "hs", "SH": "hs",
            "G": "g", "C": "cancel",
            "N": "n", "LS": "ls", "KS": "ks", "QS": "qs", "MS": "ms", "NS": "n",
            "ZDS": "zds", "XDS": "xds",
            "DS": "ds", "DZS": "ds",
            "SBS": "sbs", "SSB": "sbs", "BBS": "bbs",
            // 兼容“梭”前置短码，保留原有后置短码规则不变。
            "SZD": "zds", "SXD": "xds", "SK": "ks", "SQ": "qs", "SD": "ds", "SN": "n",

            "Z对": "zd", "X对": "xd",
            "庄": "z", "和": "h", "闲": "x",
            "庄对": "zd", "闲对": "xd",
            "对子": "pair", "对": "pair",
            "小老虎": "l", "大老虎": "k",
            "幸运七": "q", "完美": "m","完美对": "m",
            "三宝": "sb", "四宝": "bb",
            "改": "g", "撤": "cancel", "撤销": "cancel",

            "庄梭": "zs", "闲梭": "xs", "和梭": "hs",
            "庄梭哈": "zs", "闲梭哈": "xs", "和梭哈": "hs",
            "庄S": "zs", "闲S": "xs", "和S": "hs",
            "小老虎梭": "ls", "大老虎梭": "ks","老虎梭":"n",
            "小老虎梭哈": "ls", "大老虎梭哈": "ks","老虎梭哈":"n",
            "小老虎S": "ls", "大老虎S": "ks", "老虎S": "n",

            "幸运七梭": "qs", "完美梭": "ms","完美对梭": "ms",
            "幸运七梭哈": "qs", "完美梭哈": "ms","完美对梭哈": "ms",
            "幸运七S": "qs", "完美S": "ms","完美对S": "ms",
            "庄对梭": "zds", "闲对梭": "xds",
            "庄对梭哈": "zds", "闲对梭哈": "xds",
            "庄对S": "zds", "闲对S": "xds",
            "对子梭": "ds", "三宝梭": "sbs", "四宝梭": "bbs",
            "对子梭哈": "ds", "三宝梭哈": "sbs", "四宝梭哈": "bbs",
            "对子S": "ds", "对S": "ds", "三宝S": "sbs", "四宝S": "bbs"
        };

        // 仅兼容已知普通玩法的“类型+w/万+数字”，例如 zw1、xdw2、bb万1。
        // 不使用泛化字母匹配，避免改变梭哈、撤注、改单及未知指令的含义。
        const typeBeforeWanPattern = /(小老虎|大老虎|幸运七|庄对|闲对|对子|三宝|四宝|Z对|X对|ZD|XD|DZ|SB|BB|庄|和|闲|对|Z|H|X|D|L|K|Q|M)[wW万](\d+)/gi;
        s = s.replace(typeBeforeWanPattern, (match, rawType, amount) => {
            return rawType + String(Number(amount) * 10000);
        });

        // 短码 -> 中文显示名
        const TYPE_NAME = {
            z: "庄", x: "闲", h: "和",
            zd: "庄对", xd: "闲对",
            pair: "对子",
            l: "小老虎", k: "大老虎",
            ls: "小老虎梭", ks: "大老虎梭", n: "老虎梭",
            zds: "庄对梭", xds: "闲对梭",
            q: "幸运七", m: "完美",
            qs: "幸运七梭", ms: "完美梭",
            sb: "三宝", bb: "四宝", bbs: "四宝梭",
            zs: "庄梭", xs: "闲梭", hs: "和梭",
            ds: "对子梭", sbs: "三宝梭",
            cancel: "撤销", g: "改"
        };

        const bets = [];

        // 兼容所有已有玩法的后置撤销写法，例如 hc、庄对撤、四宝撤销。
        // 仅当前 betTypes 白名单中的玩法可以触发，未知类型仍走原有判断。
        const postfixCancelMatch = /^\s*(.+?)\s*(撤销|撤|C)\s*$/i.exec(s);
        if (postfixCancelMatch) {
            const rawCancelTarget = postfixCancelMatch[1].trim();
            const upperCancelTarget = rawCancelTarget.toUpperCase();
            const mappedCancelTarget =
                betTypes[upperCancelTarget] || betTypes[rawCancelTarget];
            const isTigerPairTarget =
                upperCancelTarget === "N" || rawCancelTarget === "老虎";

            if (
                isTigerPairTarget ||
                (mappedCancelTarget && mappedCancelTarget !== "cancel" && mappedCancelTarget !== "g")
            ) {
                s = "撤" + rawCancelTarget;
            }
        }

        const cancelMatch = /撤销|[撤C]/i.exec(s);
        const changeMatch = /[改G]/i.exec(s);

        let startPos = 0;
        let operationLength = 0;
        let operationType = null;

        if (cancelMatch && changeMatch) {
            if (cancelMatch.index <= changeMatch.index) {
                startPos = cancelMatch.index; operationLength = cancelMatch[0].length; operationType = "撤销";
            } else {
                startPos = changeMatch.index; operationLength = changeMatch[0].length; operationType = "改";
            }
        } else if (cancelMatch) {
            startPos = cancelMatch.index; operationLength = cancelMatch[0].length; operationType = "撤销";
        } else if (changeMatch) {
            startPos = changeMatch.index; operationLength = changeMatch[0].length; operationType = "改";
        }

        if (operationType) {
            bets.push({ type: operationType, amount: null });
            s = s.substring(startPos + operationLength);
        }

        // 连写下注需要按已知类型做最长匹配，例如：
        // zsx100  -> zs, x, 100
        // 庄梭闲100 -> 庄梭, 闲, 100
        // 只有整段都能拆成合法类型时才拆分，避免把 qwe100 误认成 q + 未知字符。
        const aliases = Object.keys(betTypes).sort((a, b) => b.length - a.length);
        const splitKnownTypeRun = (raw) => {
            const upperRaw = raw.toUpperCase();
            const memo = new Map();

            const walk = (pos) => {
                if (pos === raw.length) return [];
                if (memo.has(pos)) return memo.get(pos);

                for (const alias of aliases) {
                    const end = pos + alias.length;
                    if (upperRaw.slice(pos, end) !== alias.toUpperCase()) continue;

                    const rest = walk(end);
                    if (rest !== null) {
                        const result = [raw.slice(pos, end), ...rest];
                        memo.set(pos, result);
                        return result;
                    }
                }

                memo.set(pos, null);
                return null;
            };

            return walk(0) || [raw];
        };

        let tokens = (s.match(/\d+|[A-Za-z\u4e00-\u9fa5]+/g) || []).flatMap(token => {
            return /^\d+$/.test(token) ? [token] : splitKnownTypeRun(token);
        });

        // 梭哈类型本身不带金额。兼容“zs100x”这种把普通下注金额写在
        // 梭哈类型和普通类型之间的格式，将其规范为“zs x 100”。
        const allInTypes = new Set(["zs", "xs", "hs", "ls", "ks", "qs", "ms", "zds", "xds", "ds", "sbs", "bbs", "n"]);
        const isAllInToken = (rawToken, mappedType) => {
            // n/老虎后面可以直接带金额，表示小老虎和大老虎各下注该金额；
            // 只有 ns、老虎梭等明确梭哈写法才按老虎梭处理。
            const rawUpper = String(rawToken || "").toUpperCase();
            if (mappedType === "n" && (rawUpper === "N" || rawToken === "老虎")) {
                return false;
            }
            return allInTypes.has(mappedType);
        };
        const normalizedTokens = [];
        for (let idx = 0; idx < tokens.length; idx++) {
            const current = tokens[idx];
            const mappedCurrent = betTypes[String(current).toUpperCase()] || betTypes[current];
            const amountBetween = tokens[idx + 1];
            const followingType = tokens[idx + 2];
            const mappedFollowing = betTypes[String(followingType || "").toUpperCase()] || betTypes[followingType];

            if (
                isAllInToken(current, mappedCurrent) &&
                /^\d+$/.test(String(amountBetween || "")) &&
                mappedFollowing &&
                !isAllInToken(followingType, mappedFollowing)
            ) {
                normalizedTokens.push(current, followingType, amountBetween);
                idx += 2;
                continue;
            }

            normalizedTokens.push(current);
        }
        tokens = normalizedTokens;
        let i = 0;

        while (i < tokens.length) {
            const token = tokens[i];
            let typeRaw;
            let amount = null;

            if (/^\d+$/.test(token)) {
                // 兼容金额写在玩法前面，例如 100x、100xd、100sb。
                // 只有后续是已知玩法时才反转，避免把 100qwe 误认成有效下注。
                const followingRaw = tokens[i + 1];
                const followingType = betTypes[String(followingRaw || "").toUpperCase()] || betTypes[followingRaw];
                if (!followingType) { i++; continue; }

                typeRaw = String(followingRaw);
                amount = parseInt(token, 10);
                i += 2;
            } else {
                typeRaw = String(token);
                if (i + 1 < tokens.length && /^\d+$/.test(tokens[i + 1])) {
                    amount = parseInt(tokens[i + 1], 10);
                    i += 2;
                } else {
                    i++;
                }
            }

            const typeUpper = typeRaw.toUpperCase();

            if (typeUpper === "D" || typeUpper === "DZ" || typeRaw === "对子" || typeRaw === "对") {
                if (amount !== null) {
                    // 保留组合玩法来源。导表仍按庄对、闲对逐项入库，
                    // 但余额不足时需要提示“对子余额不足”。
                    bets.push({ type: "zd", amount, balanceCategory: "对子" });
                    bets.push({ type: "xd", amount, balanceCategory: "对子" });
                } else if (operationType === "撤销") {
                    bets.push({ type: "pair", amount: null });
                } else {
                    bets.push({ type: null, amount: null, rawType: typeRaw });
                }
                continue;
            }

            if (typeUpper === "N" || typeRaw === "N" || typeRaw === "老虎") {
                if (amount !== null) {
                    bets.push({ type: "l", amount });
                    bets.push({ type: "k", amount });
                } else if (operationType === "撤销") {
                    bets.push({ type: "n", amount: null });
                } else {
                    bets.push({ type: null, amount: null, rawType: typeRaw });
                }
                continue;
            }

            if (typeUpper === "SB" || typeRaw === "三宝") {
                if (amount !== null) {
                    bets.push({ type: "zd", amount });
                    bets.push({ type: "xd", amount });
                    bets.push({ type: "h", amount });
                } else if (operationType === "撤销") {
                    bets.push({ type: "sb", amount: null });
                } else {
                    bets.push({ type: null, amount: null, rawType: typeRaw });
                }
                continue;
            }

            if (typeUpper === "BB" || typeRaw === "四宝") {
                if (amount !== null) {
                    bets.push({ type: "zd", amount });
                    bets.push({ type: "xd", amount });
                    bets.push({ type: "h", amount });
                    bets.push({ type: "m", amount });
                } else if (operationType === "撤销") {
                    bets.push({ type: "bb", amount: null });
                } else {
                    bets.push({ type: "bb", amount: null });
                }
                continue;
            }

            if (
                ["DS","DZS","SBS","BBS"].includes(typeUpper) ||
                ["对子梭","对梭","三宝梭","四宝梭"].includes(typeRaw)
            ) {
                const mapped = betTypes[typeUpper] || betTypes[typeRaw];
                bets.push({ type: mapped || null, amount: null });
                continue;
            }

            const mappedType = betTypes[typeUpper] || betTypes[typeRaw];
            if (!mappedType) {
                bets.push({ type: null, amount, rawType: typeRaw });
                continue;
            }

            bets.push({ type: mappedType, amount });
        }

        try {
            let lastValidMainIndex = -1;
            // 庄、闲及其梭哈形式都属于同一个庄闲槽位。
            // 只有有效的新下注才能覆盖旧注；例如 z10000x 中的 x 没有金额，
            // 必须保留 z10000，并把 x 作为无效单项留到导表时提示。
            const mainSet = new Set(["z", "x", "zs", "xs"]);
            const allInMainSet = new Set(["zs", "xs"]);
            const isValidMainBet = item => {
                if (!item || !mainSet.has(item.type)) return false;
                if (allInMainSet.has(item.type)) return true;
                const amount = Number(item.amount);
                return Number.isFinite(amount) && amount > 0;
            };
            for (let idx = 0; idx < bets.length; idx++) {
                const item = bets[idx];
                if (!item) continue;
                if (isValidMainBet(item)) lastValidMainIndex = idx;
            }

            const filtered = bets.filter((item, idx) => {
                if (!item) return false;
                if (isValidMainBet(item)) return idx === lastValidMainIndex;
                // 无金额等无效主注不参与覆盖，但仍保留用于逐项错误提示。
                if (mainSet.has(item.type)) return true;
                return true;
            });

            // 最终返回时把短码转换为中文显示（保留 rawType/amount）
            return filtered.map(it => {
                if (!it) return it;
                // 操作类型（改/撤销）保持不变
                if (!it.type) return it;
                // 若已是中文则保留
                if (TYPE_NAME[it.type] === undefined && /[\u4e00-\u9fa5]/.test(it.type)) return it;
                // 转换短码为中文
                const display = TYPE_NAME[it.type] || it.type;
                return Object.assign({}, it, { type: display });
            });
        } catch (err) {
            console.error("parseBetStrToArray 异常:", err);
            return bets;
        }
    }
};
