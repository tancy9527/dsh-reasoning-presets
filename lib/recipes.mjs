/**
 * 家族规则（family recipes）
 *
 * 为什么需要它：pi-ai 自带的模型目录只认识「官方型号 id」。中转站/新发布的型号
 * （`glm-5.3-flash`、`claude-opus-5`、`claude-sonnet-5-5` …）不在目录里，
 * 于是路由拿不到 reasoning/compat，菜单里就永远没有滑条。
 *
 * 这里按「厂商家族的命名规律」补上最小可信的知识：协议、compat、可选档位、默认档。
 * 只在目录查不到该型号时才会用到（见 audit.mjs 的 fixDoc），因此不会覆盖目录里的精确信息。
 */

/** 各家族共用的档位集合（顺序即菜单顺序）。 */
const LEVELS = {
	claudeFull: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
	claudeBasic: ["off", "low", "medium", "high"],
	glm53: ["low", "high", "max"],
	glm52: ["off", "low", "high", "max"],
};

/** 档位数组 → reasoningEfforts 字典；off 用 null 表示「关闭时不发送任何思考参数」。 */
function toEfforts(levels, wire = {}) {
	const efforts = {};
	for (const level of levels) {
		if (level === "off") {
			efforts.off = wire.off ?? null;
			continue;
		}
		efforts[level] = wire[level] ?? level;
	}
	return efforts;
}

/**
 * 家族表。每项：
 * - id/label：给人的名字
 * - match(modelId)：型号 id 是否属于该家族
 * - api：该家族必须使用的协议
 * - compat：路由级 compat（只写被该协议接受的字段，其余会被 llm-pi-ai 静默忽略）
 * - defaultEffort：建议默认档
 * - levels(modelId)：该型号支持的档位数组
 */
export const FAMILIES = [
	{
		id: "zhipu-glm",
		label: "智谱 GLM（open.bigmodel.cn / api.z.ai）",
		match: (id) => /^glm-/i.test(id),
		api: "openai-completions",
		compat: {
			supportsStore: false,
			supportsDeveloperRole: false,
			supportsReasoningEffort: true,
			maxTokensField: "max_tokens",
			thinkingFormat: "zai",
			supportsStrictMode: true,
		},
		defaultEffort: "high",
		// 目录里属于「厂商自己」的 provider id：这些条目的能力描述可信度最高
		vendorProviders: ["zai", "zai-coding-cn"],
		// GLM 的「放弃思考」在线上写作 reasoning_effort: "none"
		wire: { off: "none" },
		levels(id) {
			// GLM-5.3 / 5.3-Flash / 5.3-FlashX：官方只接受 low/high/max，且不允许关闭思考
			if (/^glm-5(\.3|-turbo)/i.test(id)) return LEVELS.glm53;
			// GLM-5.2 及更早：支持 none（放弃思考）= off
			if (/^glm-5\.2/i.test(id) || /^glm-5(\.1)?$/.test(id)) return LEVELS.glm52;
			// GLM-4.x 的 reasoning_effort 支持不明确，交给用户自己写
			return null;
		},
	},
	{
		id: "anthropic-claude",
		label: "Anthropic Claude（官方 / 中转）",
		match: (id) => /^claude-/i.test(id),
		api: "anthropic-messages",
		compat: {},
		defaultEffort: "high",
		// anthropic 目录里的条目是厂商自己出的，可信度最高
		vendorProviders: ["anthropic"],
		levels(id) {
			// 5.x 的 opus / sonnet / fable 支持完整六档 + 关闭
			if (/claude-(opus|sonnet|fable)-5/i.test(id) || /claude-5/i.test(id)) return LEVELS.claudeFull;
			// haiku 更保守：只给基础档，避免 xhigh/max 被上游拒绝
			if (/claude-haiku/i.test(id)) return LEVELS.claudeBasic;
			return LEVELS.claudeBasic;
		},
	},
];

/** 按型号 id（可选再按 api 过滤）找家族。 */
export function familyOf(modelId, api) {
	const id = String(modelId);
	for (const family of FAMILIES) {
		if (api && family.api !== api) continue;
		if (family.match(id)) return family;
	}
	return undefined;
}

/**
 * 家族规则给出的修复建议：{ family, api, compat, efforts, levels, defaultEffort }。
 * 型号不属于任何家族、或该家族对这款型号没有可靠信息时返回 undefined。
 */
export function recipeFor(model, api) {
	const family = familyOf(model.id, api);
	if (!family) return undefined;
	const levels = family.levels(String(model.id));
	if (!levels || levels.length === 0) return undefined;
	return {
		family,
		api: family.api,
		compat: { ...family.compat },
		levels: [...levels],
		efforts: toEfforts(levels, family.wire ?? {}),
		defaultEffort: family.defaultEffort,
	};
}
