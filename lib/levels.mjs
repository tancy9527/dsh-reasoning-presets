/**
 * 推理等级（reasoning effort）语义层。
 *
 * 这里刻意与 `@earendil-works/pi-ai` 的 `getSupportedThinkingLevels()` 判据保持一致：
 *   - 目录里 `thinkingLevelMap[level] === null`  → 该档不支持
 *   - `xhigh` / `max` 必须显式声明（undefined 视为不支持）
 *   - 其余基础档位 undefined 视为「支持，按档位名直接下发」
 *
 * DSH 侧 `llm-pi-ai` 的 `reasoningEfforts` 反过来是「声明即支持」：
 *   - 写了档位 → 支持，值就是下发给厂商的线上取值
 *   - 没写档位 → 固定为 null（不支持）
 *   - `off: null` 是唯一例外：表示「支持关闭，关闭时不发任何参数」
 * 所以 `effortsFor()` 是 `supportedLevels()` 的精确逆运算。
 */

export const THINKING_LEVELS = Object.freeze([
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
]);

export const LEVEL_LABELS = Object.freeze({
	off: "关闭",
	minimal: "极简",
	low: "低",
	medium: "中",
	high: "高",
	xhigh: "极高",
	max: "最大",
});

/** 该模型支持的档位（按升级顺序）。 */
export function supportedLevels(model) {
	if (!model || model.reasoning === false) return [];
	const map = model.thinkingLevelMap ?? {};
	return THINKING_LEVELS.filter((level) => {
		const wire = map[level];
		if (wire === null) return false;
		if (level === "xhigh" || level === "max") return wire !== undefined;
		return true;
	});
}

/**
 * 把目录里的模型描述翻译成 DSH 配置里的 `reasoningEfforts`。
 * 非推理模型返回 `false`（对应配置写 `reasoningEfforts: false`）。
 */
export function effortsFor(model) {
	if (!model || model.reasoning === false) return false;
	const map = model.thinkingLevelMap ?? {};
	const efforts = {};
	for (const level of supportedLevels(model)) {
		const wire = map[level];
		if (level === "off") {
			efforts.off = typeof wire === "string" ? wire : null;
			continue;
		}
		efforts[level] = typeof wire === "string" ? wire : level;
	}
	return Object.keys(efforts).length > 0 ? efforts : false;
}

/**
 * 选一个「默认档」。
 *
 * 为什么要默认档：DSH 菜单里 `defaultEffort` 缺失时会多出一项 `Default`，
 * 选中它就等于不发送任何 reasoningEffort。对 GLM-5.3 这类「禁止关闭思考」的
 * 模型，这一步会被厂商以 400 拒绝 —— 所以给路由配一个明确默认档更安全。
 */
export function pickDefaultLevel(levels, preferred = ["high", "medium", "max", "low"]) {
	const list = (Array.isArray(levels) ? levels : []).filter((level) => level !== "off");
	if (list.length === 0) return undefined;
	for (const want of preferred) if (list.includes(want)) return want;
	return list[Math.floor((list.length - 1) / 2)];
}

/** 多模型取交集，用于「整个路由共用一个默认档」。 */
export function commonLevels(levelLists) {
	const lists = levelLists.filter((levels) => Array.isArray(levels) && levels.length > 0);
	if (lists.length === 0) return [];
	return THINKING_LEVELS.filter((level) => lists.every((levels) => levels.includes(level)));
}

/** 人读的档位串：`低/高/最大`（按档位深浅排序，与输入顺序无关）。 */
export function labelLevels(levels) {
	const sorted = [...(levels ?? [])].sort(
		(left, right) => THINKING_LEVELS.indexOf(left) - THINKING_LEVELS.indexOf(right),
	);
	return sorted.map((level) => LEVEL_LABELS[level] ?? level).join("/");
}
