const assert = require("assert");
const {
    settleOverBet,
    calculateSpmInfo,
    calculateSpExcess
} = require("./overSpm");

function total(results, field) {
    return Number(results.reduce((sum, item) => sum + Number(item[field] || 0), 0).toFixed(2));
}

const example = settleOverBet([
    { userId: "张三", betAmount: 6000 },
    { userId: "李四", betAmount: 5000 },
    { userId: "赵五", betAmount: 3000 }
], 10000, 3000);
assert.deepStrictEqual(example, [
    { userId: "张三", finalBet: 3818, reducedAmount: 2182 },
    { userId: "李四", finalBet: 3182, reducedAmount: 1818 },
    { userId: "赵五", finalBet: 3000, reducedAmount: 0 }
]);
assert.strictEqual(total(example, "finalBet"), 10000);
assert.strictEqual(total(example, "reducedAmount"), 4000);

const withinLimit = settleOverBet([
    { userId: 1, betAmount: 4000 },
    { userId: 2, betAmount: 3000 }
], 10000, 3000);
assert.strictEqual(total(withinLimit, "finalBet"), 7000);
assert.strictEqual(total(withinLimit, "reducedAmount"), 0);

const protectedPlayersExceedLimit = settleOverBet([
    { userId: 1, betAmount: 3000 },
    { userId: 2, betAmount: 3000 },
    { userId: 3, betAmount: 3000 },
    { userId: 4, betAmount: 3000 },
    { userId: 5, betAmount: 5000 }
], 10000, 3000);
assert.strictEqual(protectedPlayersExceedLimit[4].finalBet, 0);
assert.strictEqual(protectedPlayersExceedLimit[4].reducedAmount, 5000);
assert.strictEqual(total(protectedPlayersExceedLimit, "finalBet"), 12000);

const rounding = settleOverBet([
    { userId: 1, betAmount: 1 },
    { userId: 2, betAmount: 1 },
    { userId: 3, betAmount: 1 }
], 1, 0);
assert.strictEqual(total(rounding, "finalBet"), 1);
assert.strictEqual(total(rounding, "reducedAmount"), 2);

// 最终 sp 超过限红多少，就只从最终 spm 方向减掉多少。
const upperPlate = calculateSpmInfo({ z: 14000, x: 3000 }, {
    pb_tabletop_occupies_proportion: 0,
    pb_tabletop_occupies_proportion_max_limit: 0,
    pb_min_bet_amount: 0,
    change_settings: ""
});
const upperExcess = upperPlate.sp - 10000;
const upperReduction = settleOverBet([
    { userId: "张三", betAmount: 6000 },
    { userId: "李四", betAmount: 5000 },
    { userId: "赵五", betAmount: 3000 }
], 14000 - upperExcess, 3000);
assert.strictEqual(total(upperReduction, "reducedAmount"), 1000);
assert.strictEqual(upperPlate.spm, "庄");
assert.strictEqual(upperPlate.sp, 11000);
assert.strictEqual(total(upperReduction, "finalBet") - 3000, 10000);

// 最终 sp=1500、限红=1000，只减超出的500，不按总投注减。
assert.strictEqual(calculateSpExcess(1500, 1000), 500);
const exactFiveHundredReduction = settleOverBet([
    { userId: "张三", betAmount: 900 },
    { userId: "李四", betAmount: 600 }
], 1500 - calculateSpExcess(1500, 1000), 0);
assert.strictEqual(total(exactFiveHundredReduction, "reducedAmount"), 500);
assert.strictEqual(total(exactFiveHundredReduction, "finalBet"), 1000);

// /get_spm_info 的完整口径：个人占成、台占、最小上盘、零头。
assert.deepStrictEqual(calculateSpmInfo({
    z: 20000,
    x: 5000,
    g_z: 2000,
    g_x: 500
}, {
    pb_tabletop_occupies_proportion: 10,
    pb_tabletop_occupies_proportion_max_limit: 1000,
    pb_min_bet_amount: 3500,
    change_settings: "百"
}), {
    spm: "庄",
    sp: 12500,
    tabletopBet: 1000,
    smallChange: 0
});
assert.deepStrictEqual(calculateSpmInfo({
    z: 5000,
    x: 12000,
    g_z: 0,
    g_x: 1000
}, {
    pb_tabletop_occupies_proportion: 10,
    pb_tabletop_occupies_proportion_max_limit: 500,
    pb_min_bet_amount: 6000,
    change_settings: "百"
}), {
    spm: "闲",
    sp: 0,
    tabletopBet: 500,
    smallChange: 5500
});

console.log("overSpm tests passed");
