import assert from "node:assert/strict";
import test from "node:test";

import {
	THINKING_LEVELS,
	commonLevels,
	effortsFor,
	labelLevels,
	pickDefaultLevel,
	supportedLevels,
} from "../lib/levels.mjs";

const GLM53 = {
	id: "glm-5.3",
	reasoning: true,
	thinkingLevelMap: { off: null, minimal: null, low: "low", medium: null, high: "high", xhigh: null, max: "max" },
};
const GLM52 = {
	id: "glm-5.2",
	reasoning: true,
	thinkingLevelMap: { off: "none", minimal: null, low: "low", medium: null, high: "high", xhigh: null, max: "max" },
};
const PLAIN = { id: "glm-4-flash", reasoning: false };

test("档位顺序与 pi-ai 一致", () => {
	assert.deepEqual(THINKING_LEVELS, ["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
});

test("supportedLevels 按 pi-ai 规则排除 null 与未声明的扩展档", () => {
	assert.deepEqual(supportedLevels(GLM53), ["low", "high", "max"]);
	assert.deepEqual(supportedLevels(GLM52), ["off", "low", "high", "max"]);
	assert.deepEqual(supportedLevels(PLAIN), []);
});

test("effortsFor 是 supportedLevels 的精确逆运算", () => {
	assert.deepEqual(effortsFor(GLM53), { low: "low", high: "high", max: "max" });
	assert.deepEqual(effortsFor(GLM52), { off: "none", low: "low", high: "high", max: "max" });
	assert.equal(effortsFor(PLAIN), false);
});

test("off 没有线上取值时写 null（关闭即不发送 thinking）", () => {
	const model = { id: "x", reasoning: true, thinkingLevelMap: { off: undefined } };
	// 基础档 undefined 视为支持；xhigh/max 必须显式声明，所以不出现
	assert.deepEqual(supportedLevels(model), ["off", "minimal", "low", "medium", "high"]);
	assert.equal(effortsFor(model).off, null);
});

test("pickDefaultLevel 优先 high，其次 medium / max / low", () => {
	assert.equal(pickDefaultLevel(["low", "high", "max"]), "high");
	assert.equal(pickDefaultLevel(["low", "max"]), "max");
	assert.equal(pickDefaultLevel(["low"]), "low");
	assert.equal(pickDefaultLevel(["off"]), undefined);
});

test("commonLevels 取交集并保持顺序", () => {
	assert.deepEqual(commonLevels([["low", "high", "max"], ["high", "max"]]), ["high", "max"]);
	assert.deepEqual(commonLevels([["low"], ["high"]]), []);
});

test("labelLevels 输出中文标签", () => {
	assert.match(labelLevels(["low", "high", "max"]), /低/);
});
