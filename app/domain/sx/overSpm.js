const MONEY_SCALE = 1;

function toMoneyUnits(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    return Math.round((amount + Number.EPSILON) * MONEY_SCALE);
}

function fromMoneyUnits(value) {
    return value;
}

/**
 * 将指定方向需要减持的下注按玩家原下注比例减持。
 *
 * minimum_amount_sold 只决定玩家是否参加减持，不是减持后的保底金额：
 * 原下注小于或等于该值的玩家完全不动；其余玩家按比例缩减。
 * 当前下注和积分字段均为整数，使用最大余数法分配取整差，保证最终合计精确。
 */
function settleOverBet(playerBets, maxRoomLimit, minimumAmountSold) {
    const maxUnits = toMoneyUnits(maxRoomLimit);
    const minimumUnits = toMoneyUnits(minimumAmountSold);
    const players = (Array.isArray(playerBets) ? playerBets : []).map((player, index) => {
        const originalUnits = toMoneyUnits(player.betAmount);
        return {
            userId: player.userId,
            index,
            originalUnits,
            finalUnits: originalUnits,
            remainder: 0,
            isProtected: originalUnits <= minimumUnits
        };
    });

    const totalUnits = players.reduce((sum, player) => sum + player.originalUnits, 0);
    if (maxUnits <= 0 || totalUnits <= maxUnits) {
        return players.map(player => ({
            userId: player.userId,
            finalBet: fromMoneyUnits(player.originalUnits),
            reducedAmount: 0
        }));
    }

    const protectedUnits = players
        .filter(player => player.isProtected)
        .reduce((sum, player) => sum + player.originalUnits, 0);
    const eligiblePlayers = players.filter(player => !player.isProtected);
    const eligibleUnits = eligiblePlayers.reduce((sum, player) => sum + player.originalUnits, 0);
    const targetEligibleUnits = Math.max(0, Math.min(eligibleUnits, maxUnits - protectedUnits));

    if (eligibleUnits > 0 && targetEligibleUnits < eligibleUnits) {
        let allocatedUnits = 0;
        for (const player of eligiblePlayers) {
            const exactUnits = player.originalUnits * targetEligibleUnits / eligibleUnits;
            player.finalUnits = Math.floor(exactUnits);
            player.remainder = exactUnits - player.finalUnits;
            allocatedUnits += player.finalUnits;
        }

        let unitsLeft = targetEligibleUnits - allocatedUnits;
        const remainderOrder = [...eligiblePlayers].sort((left, right) => {
            if (right.remainder !== left.remainder) return right.remainder - left.remainder;
            const userCompare = String(left.userId).localeCompare(String(right.userId));
            return userCompare !== 0 ? userCompare : left.index - right.index;
        });

        for (let index = 0; index < unitsLeft; index++) {
            remainderOrder[index % remainderOrder.length].finalUnits += 1;
        }
    }

    return players.map(player => ({
        userId: player.userId,
        finalBet: fromMoneyUnits(player.finalUnits),
        reducedAmount: fromMoneyUnits(player.originalUnits - player.finalUnits)
    }));
}

/**
 * 与 data_query.js /get_spm_info 完全相同的最终上盘算法。
 * 顺序：个人占成 -> 庄闲对冲 -> 台占 -> 最小上盘 -> 零头。
 */
function calculateSpmInfo(summary, parameterSetup) {
    const source = summary || {};
    const setup = parameterSetup || {};
    const numberValue = value => {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    };

    const totalBanker = numberValue(source.z);
    const totalPlayer = numberValue(source.x);
    const banker = totalBanker - numberValue(source.g_z);
    const player = totalPlayer - numberValue(source.g_x);
    let spm = "庄";
    let sp = 0;

    if (totalBanker > 0 && totalPlayer > 0) {
        if (banker > player) {
            sp = banker - player;
            spm = "庄";
        } else {
            sp = player - banker;
            spm = "闲";
        }
    } else if (totalBanker > 0) {
        sp = banker;
        spm = "庄";
    } else {
        sp = player;
        spm = "闲";
    }

    let tabletopBet = 0;
    if (sp > 0) {
        tabletopBet = Math.floor(
            numberValue(setup.pb_tabletop_occupies_proportion) / 100 * sp
        );
        const tabletopMax = numberValue(
            setup.pb_tabletop_occupies_proportion_max_limit
        );
        if (tabletopBet > tabletopMax) tabletopBet = tabletopMax;
        sp -= tabletopBet;
    }

    let smallChange = 0;
    if (sp < numberValue(setup.pb_min_bet_amount)) {
        smallChange = sp;
        sp = 0;
    } else {
        const changeSetting = setup.change_settings;
        const unit = changeSetting === "万" ? 10000
            : changeSetting === "千" ? 1000
                : changeSetting === "百" ? 100
                    : changeSetting === "十" ? 10
                        : 0;
        smallChange = unit !== 0 ? sp % unit : 0;
        sp = unit !== 0 ? sp - smallChange : sp;
    }

    return {
        spm,
        sp: Math.max(0, sp),
        tabletopBet: Math.max(0, tabletopBet),
        smallChange: Math.max(0, smallChange)
    };
}

function calculateSpExcess(finalSp, maxBetAmount) {
    const spUnits = toMoneyUnits(finalSp);
    const maxUnits = toMoneyUnits(maxBetAmount);
    return fromMoneyUnits(Math.max(0, spUnits - maxUnits));
}

module.exports = { settleOverBet, calculateSpmInfo, calculateSpExcess };

  
