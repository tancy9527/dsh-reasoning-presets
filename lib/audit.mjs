/**
 * 审计 + 修复：让每一条 llm-pi-ai 路由都「有档位可调」。
 *
 * 判据只有一条 —— DSH 的滑块来自模型的 `reasoning.efforts`，而该字段由
 * `llm-pi-ai` 解析配置得到：
 *   - 路由 id 与 pi-ai 目录同名 → 模型按 id 继承目录里的 reasoning/compat（无需手写）
 *   - 路由 id 自定义（如 `glm`）  → 目录不回填，必须显式写 reasoningEfforts
 *   - 写了 models 列表也没关系：同名 id 仍按 id 继承，只有目录里没有的型号才要手写
 * 所以「缺滑块」的根因永远是：自定义路由 + 手写模型 + 没写 reasoningEfforts。
 */

import {
	THINKING_LEVELS,
	commonLevels,
	effortsFor,
	pickDefaultLevel,
	supportedLevels,
} from "./levels.mjs";
import {
	ensureProvidersConfig,
	normalizeModels,
	normalizeProviderConfig,
	providersConfig,
} from "./patch.mjs";
import { PROVIDER_META } from "./presets.mjs";
import { recipeFor } from "./recipes.mjs";

/** 目录命中是否来自「厂商自己」的 provider（聚合商条目不算权威）。 */
function isVendorMatch(recipe, match) {
	const vendorProviders = recipe.family.vendorProviders ?? [];
	return vendorProviders.includes(match.provider?.id);
}

/**
 * 各 wire 协议在 DSH 配置里可写的 compat 字段。
 * 名字必须与 dsh-llm-pi-ai 的 COMPAT_GATES 一致，写错会被 Config 直接拒绝。
 */
export const API_COMPAT_FIELDS = {
	"openai-completions": [
		"supportsStore",
		"supportsDeveloperRole",
		"supportsReasoningEffort",
		"supportsUsageInStreaming",
		"supportsFinishReason",
		"maxTokensField",
		"requiresToolResultName",
		"requiresAssistantAfterToolResult",
		"requiresThinkingAsText",
		"requiresReasoningContentOnAssistantMessages",
		"thinkingFormat",
		"supportsThinkingTokenBudget",
		"thinkingTokenBudgetField",
		"supportsStrictMode",
		"cacheControlFormat",
		"supportsLongCacheRetention",
	],
	"openai-responses": [
		"supportsDeveloperRole",
		"supportsMaxOutputTokens",
		"supportsStrictMode",
		"supportsLongCacheRetention",
	],
};

function derivedCompat(model, api) {
	const allowed = API_COMPAT_FIELDS[api];
	if (!allowed) return {};
	const out = {};
	for (const field of allowed) {
		const value = model.compat?.[field];
		if (value !== undefined && value !== null) out[field] = value;
	}
	if (api === "openai-completions" && out.supportsReasoningEffort === undefined) {
		out.supportsReasoningEffort = true;
	}
	return out;
}

function hasEfforts(model) {
	return model.reasoningEfforts !== undefined && model.reasoningEfforts !== null;
}

/**
 * 审计一张补丁文档。
 * @param {unknown[]} doc loader patch 数组
 * @param {import("./catalog.mjs").Catalog} catalog
 */
export function auditDoc(doc, catalog) {
	const providers = providersConfig(doc) ?? {};
	const routes = [];
	for (const [provider, rawConfig] of Object.entries(providers)) {
		const config = normalizeProviderConfig(rawConfig);
		const catalogProvider = catalog.provider(provider);
		const models = normalizeModels(config.models);
		const route = {
			provider,
			api: typeof config.api === "string" ? config.api : undefined,
			baseURL: typeof config.baseURL === "string" ? config.baseURL : undefined,
			defaultEffort: typeof config.reasoning === "string" ? config.reasoning : undefined,
			inheritsCatalog: Boolean(catalogProvider),
			status: "unknown",
			models: [],
			issues: [],
			levels: [],
		};

		if (models.length === 0 && catalogProvider) {
			route.status = "inherited";
			const levels = [];
			for (const model of catalogProvider.models) {
				for (const level of model.supported ?? []) if (!levels.includes(level)) levels.push(level);
			}
			route.levels = levels;
			route.models = catalogProvider.models.map((model) => ({
				id: model.id,
				status: model.reasoning === false ? "no-reasoning" : "catalog",
				levels: model.supported ?? [],
			}));
		} else if (models.length === 0) {
			route.status = "empty";
			route.issues.push({
				code: "NO_MODELS",
				message: `路由 ${provider} 既没有手写 models，也不在 pi-ai 目录里：会列出 0 个模型`,
			});
		} else {
			route.status = "declared";
			const api = route.api;
			for (const model of models) {
				const id = String(model.id);
				const sameProvider = catalogProvider?.models.find((item) => item.id === id);
				const fallback = sameProvider ? undefined : catalog.findModel(id, { provider, api });
				let match = sameProvider ? { model: sameProvider, exact: true } : fallback;
				// 目录查不到（或只查到别的中转站条目）时，用「厂商家族规则」给出建议
				let recipe = hasEfforts(model) ? undefined : recipeFor(model, api);
				if (match && !match.exact && recipe && !isVendorMatch(recipe, match)) {
					// 聚合商目录里同一个型号常常少列档位（例如只写 high/max），
					// 厂商自己的目录才算权威，其余情况下家族规则更靠谱。
					match = undefined;
				}
				if (match) recipe = undefined;
				// 已手写的以配置为准（配置写什么，菜单就只有什么），否则按目录/家族推断
				const levels = hasEfforts(model)
					? model.reasoningEfforts === false
						? []
						: Object.keys(model.reasoningEfforts)
					: match
						? supportedLevels(match.model)
						: recipe
							? recipe.levels
							: [];
				let status;
				if (hasEfforts(model)) status = "declared";
				else if (match) {
					if (match.model.reasoning === false) status = "no-reasoning";
					else if (match.exact) status = "catalog"; // 同名路由的目录继承
					else status = "missing";
				} else if (recipe) status = "family";
				else status = "unknown";
				if (model.reasoningEfforts === false) status = "no-reasoning";
				route.models.push({
					id,
					status,
					levels,
					matchedProvider: match?.provider?.id,
					family: recipe?.family.id,
					canFix: status === "missing" || status === "family",
				});
				if (status === "unknown") {
					route.issues.push({
						code: "UNKNOWN_MODEL",
						message: `模型 ${id} 不在 pi-ai 目录里，也没有匹配的厂商家族规则，且没写 reasoningEfforts：无法推断档位，需要手写`,
					});
				}
				if (status === "family") {
					route.issues.push({
						code: "FAMILY_FIXABLE",
						severity: "info",
						message: `模型 ${id} 不在 pi-ai 目录里，但匹配「${recipe.family.label}」家族规则：修复时会补上 ${recipe.levels.join("/")}`,
					});
				}
			}
			for (const item of route.models) {
				for (const level of item.levels) if (!route.levels.includes(level)) route.levels.push(level);
			}
			if (route.models.some((item) => item.status === "missing") && !api) {
				route.issues.push({
					code: "NO_API",
					message: `路由 ${provider} 是自定义路由且没写 api：修复时会按目录里同型号的协议补上（通常是 openai-completions）`,
				});
			}
		}

		if (route.status !== "empty") {
			const thinking = route.levels.filter((level) => level !== "off");
			if (thinking.length === 0 && route.models.some((item) => item.status !== "no-reasoning")) {
				route.issues.push({
					code: "NO_LEVELS",
					message: `路由 ${provider} 的模型在目录里没有任何推理档位（这些型号本身不支持调档）`,
				});
			}
			if (thinking.length > 0 && !route.defaultEffort) {
				const everyOff = route.models
					.filter((item) => item.status !== "no-reasoning")
					.every((item) => item.levels.includes("off"));
				route.issues.push({
					code: "NO_DEFAULT",
					severity: everyOff ? "info" : "warn",
					message: everyOff
						? `路由 ${provider} 没有默认档：菜单会多出「Default」= 不发送 effort，厂商按自己的默认值处理`
						: `路由 ${provider} 没有默认档：菜单会多出「Default」= 不发送 effort，而这些型号不支持「关闭思考」，可能被厂商 400 拒绝`,
					suggestedDefault: pickDefaultLevel(thinking),
				});
			} else if (route.defaultEffort && !route.levels.includes(route.defaultEffort)) {
				route.issues.push({
					code: "BAD_DEFAULT",
					severity: "warn",
					message: `路由 ${provider} 的默认档 ${route.defaultEffort} 不在支持列表里（${route.levels.join("/")} 或目录未收录）`,
				});
			}
		}
		routes.push(route);
	}
	return {
		routes,
		hasLlmEntry: providersConfig(doc) !== undefined,
		summary: {
			routes: routes.length,
			inherited: routes.filter((route) => route.status === "inherited").length,
			declared: routes.filter((route) => route.status === "declared").length,
			fixableModels: routes.reduce(
				(total, route) => total + route.models.filter((model) => model.canFix).length,
				0,
			),
			warns: routes.reduce(
				(total, route) =>
					total + route.issues.filter((issue) => (issue.severity ?? "warn") === "warn").length,
				0,
			),
		},
	};
}

/**
 * 漂移检查：配置文件是否落后于「目录 + 家族规则」应给出的档位声明。
 *
 * 给 CI / pre-commit 用，所以只回答「干不干净」，不改文档。
 * 默认只在「有东西该修」或「有风险警告」时判脏；`strict` 连提示级（info）也算脏。
 *
 * @returns {{ clean: boolean, strict: boolean, drift: object[], report: object }}
 */
export function checkDoc(doc, catalog, options = {}) {
	const { strict = false } = options;
	const report = auditDoc(doc, catalog);
	const drift = [];
	for (const route of report.routes) {
		for (const model of route.models) {
			if (model.canFix) {
				drift.push({
					provider: route.provider,
					model: model.id,
					status: model.status,
					code: "MISSING_LEVELS",
					message: `模型 ${model.id} 缺 reasoningEfforts（目录/家族规则能推出：${model.levels.join("/") || "无"}）`,
					severity: "warn",
				});
			}
		}
		for (const issue of route.issues) {
			const severity = issue.severity ?? "warn";
			if (issue.code === "FAMILY_FIXABLE") continue; // 与上面的 MISSING_LEVELS 重复
			if (severity === "info" && !strict) continue;
			drift.push({
				provider: route.provider,
				code: issue.code,
				severity,
				message: issue.message,
				...(issue.suggestedDefault ? { suggestedDefault: issue.suggestedDefault } : {}),
			});
		}
	}
	return { clean: drift.length === 0, strict, drift, report };
}

/** 一个模型配置项最终能调到的档位：优先显式声明，其次目录继承，最后家族规则。 */
function levelsOfModel(model, provider, catalog) {
	if (model.reasoningEfforts === false) return [];
	if (model.reasoningEfforts && typeof model.reasoningEfforts === "object") {
		return Object.keys(model.reasoningEfforts);
	}
	const id = String(model.id);
	const sameProvider = catalog.provider(provider)?.models.find((item) => item.id === id);
	const match = sameProvider ? { model: sameProvider } : catalog.findModel(id, { provider });
	const recipe = recipeFor(model);
	if (match) {
		// 聚合商条目少列档位时，家族规则更靠谱（与 audit/fix 的判定保持一致）
		if (!sameProvider && recipe && !isVendorMatch(recipe, match)) return recipe.levels;
		return supportedLevels(match.model);
	}
	return recipe?.levels ?? [];
}

/**
 * 生成修复：给自定义路由补 reasoningEfforts / api / compat / 默认档。
 * 不修改入参文档，返回新文档与变更清单。
 */
export function fixDoc(doc, catalog, options = {}) {
	const { applyDefault = true, defaultEffort } = options;
	const next = structuredClone(doc);
	const providers = providersConfig(next);
	const changes = [];
	const skipped = [];
	if (!providers) {
		return { doc: next, changes, skipped, note: "补丁里没有 llm-pi-ai 条目，无可修复路由（可用 init 新增厂商）" };
	}

	for (const [provider, rawConfig] of Object.entries(providers)) {
		const config = normalizeProviderConfig(rawConfig);
		const catalogProvider = catalog.provider(provider);
		const models = normalizeModels(config.models);
		if (models.length === 0) continue;

		const fixed = [];
		for (const model of models) {
			const id = String(model.id);
			if (hasEfforts(model)) continue;
			const sameProvider = catalogProvider?.models.find((item) => item.id === id);
			let match = sameProvider ? { provider: catalogProvider, model: sameProvider, exact: true } : catalog.findModel(id, { provider, api: config.api });
			let recipe = recipeFor(model, config.api);
			if (match && !match.exact && recipe && !isVendorMatch(recipe, match)) {
				// 聚合商目录条目不权威：让位给家族规则
				match = undefined;
			}
			if (match) recipe = undefined;
			if (!match) {
				// 目录没收录（中转站型号 / 新发布型号）：退一步用厂商家族规则
				if (!recipe) {
					skipped.push({ provider, model: id, reason: "目录里没有这个型号，也没有匹配的家族规则" });
					continue;
				}
				model.reasoningEfforts = recipe.efforts;
				fixed.push({ model, recipe, levels: recipe.levels });
				changes.push({
					provider,
					kind: "model",
					target: id,
					detail: `reasoningEfforts = ${recipe.levels.join("/")}（按「${recipe.family.label}」家族规则）`,
				});
				continue;
			}
			const levels = supportedLevels(match.model);
			if (match.exact) continue; // 同名路由按 id 继承，不需要写
			const efforts = effortsFor(match.model);
			if (efforts === false || levels.length === 0) {
				skipped.push({ provider, model: id, reason: "该型号本身不支持调档" });
				continue;
			}
			model.reasoningEfforts = efforts;
			fixed.push({ model, match, levels });
			changes.push({
				provider,
				kind: "model",
				target: id,
				detail: `reasoningEfforts = ${Object.keys(efforts).join("/")}（来自 ${match.provider.id} 目录）`,
			});
		}

		if (fixed.length === 0) {
			// 没有缺 reasoningEfforts 的型号（目录继承或已手写）：仍可补默认档，
			// 否则菜单里的「Default」= 不发送 effort，对禁止关闭思考的型号是 400 隐患。
			if (!applyDefault || typeof config.reasoning === "string") continue;
			const levels = commonLevels(
				models.map((model) => levelsOfModel(model, provider, catalog)).filter((list) => list.length > 0),
			);
			const chosen =
				defaultEffort && levels.includes(defaultEffort) ? defaultEffort : pickDefaultLevel(levels);
			if (chosen) {
				config.reasoning = chosen;
				changes.push({ provider, kind: "route", detail: `reasoning = ${chosen}（默认档）` });
			}
			providers[provider] = config;
			continue;
		}

		// api：自定义路由必须显式声明协议
		if (typeof config.api !== "string") {
			const apis = [...new Set(fixed.map((item) => item.match?.model.api ?? item.recipe.api).filter(Boolean))];
			if (apis.length === 1) {
				config.api = apis[0];
				changes.push({ provider, kind: "route", detail: `api = ${apis[0]}（按目录/家族规则推断）` });
			} else {
				skipped.push({ provider, model: "*", reason: `型号协议不一致（${apis.join("/")}），请手动指定 api` });
			}
		}

		// compat：先看各型号是否一致，一致就写路由级，不一致写型号级
		const perModel = fixed.map((item) =>
			item.match
				? {
						id: String(item.model.id),
						api: item.match.model.api,
						compat: derivedCompat(item.match.model, item.match.model.api),
					}
				: { id: String(item.model.id), api: item.recipe.api, compat: item.recipe.compat },
		);
		const fields = [...new Set(perModel.flatMap((item) => Object.keys(item.compat)))];
		const routeCompat = {};
		const modelCompat = new Map();
		const existingRouteCompat = normalizeProviderConfig(config.compat);
		for (const field of fields) {
			const values = perModel.map((item) => item.compat[field]);
			const allSame = values.every((value) => value === values[0]);
			if (allSame) {
				if (existingRouteCompat[field] === values[0]) continue;
				if (existingRouteCompat[field] !== undefined) continue; // 用户已显式设置，保留
				routeCompat[field] = values[0];
			} else {
				for (const item of perModel) {
					if (item.compat[field] === undefined) continue;
					const bucket = modelCompat.get(item.id) ?? {};
					bucket[field] = item.compat[field];
					modelCompat.set(item.id, bucket);
				}
			}
		}
		if (Object.keys(routeCompat).length > 0) {
			config.compat = { ...existingRouteCompat, ...routeCompat };
			changes.push({ provider, kind: "route", detail: `compat += ${Object.keys(routeCompat).join(", ")}` });
		}
		for (const [id, compat] of modelCompat) {
			const model = models.find((item) => String(item.id) === id);
			if (!model) continue;
			const existing = normalizeProviderConfig(model.compat);
			model.compat = { ...existing, ...compat };
			changes.push({ provider, kind: "model", target: id, detail: `compat += ${Object.keys(compat).join(", ")}` });
		}

		// 默认档：避免「Default」把不支持的关闭请求打到厂商
		if (applyDefault && typeof config.reasoning !== "string") {
			const levels = commonLevels(fixed.map((item) => item.levels));
			const preferred = fixed.find((item) => item.recipe?.defaultEffort)?.recipe.defaultEffort;
			const chosen =
				defaultEffort && levels.includes(defaultEffort)
					? defaultEffort
					: preferred && levels.includes(preferred)
						? preferred
						: pickDefaultLevel(levels);
			if (chosen) {
				config.reasoning = chosen;
				changes.push({ provider, kind: "route", detail: `reasoning = ${chosen}（默认档）` });
			}
		}

		// normalizeModels 返回的是副本，必须写回去，否则上面所有改动都会丢
		config.models = models;
		providers[provider] = config;
	}
	return { doc: next, changes, skipped };
}

/**
 * 为一组目录里的供应商新增路由。
 *
 * 只写 `displayName / apiKeyEnv / baseURL / reasoning` 四项，不写 models ——
 * 路由 id 与 pi-ai 目录同名时，模型和档位全部由目录供给，这是最不容易出错的写法。
 */
export function initDoc(doc, catalog, providerIds, options = {}) {
	const { defaultEffort, baseURLs = {} } = options;
	const next = structuredClone(doc);
	const existing = providersConfig(next) ?? {};
	const changes = [];
	const skipped = [];
	const created = {};
	for (const providerId of providerIds) {
		const provider = catalog.provider(providerId);
		if (!provider) {
			skipped.push({ provider: providerId, reason: "pi-ai 目录里没有这个供应商" });
			continue;
		}
		if (existing[providerId] !== undefined || created[providerId] !== undefined) {
			skipped.push({ provider: providerId, reason: "补丁里已经声明过，未覆盖" });
			continue;
		}
		const levels = [];
		for (const model of provider.models) {
			for (const level of model.supported ?? []) if (!levels.includes(level)) levels.push(level);
		}
		const meta = PROVIDER_META[providerId] ?? {};
		const preset = { displayName: meta.label ?? provider.name ?? providerId };
		if (meta.apiKeyEnv) preset.apiKeyEnv = meta.apiKeyEnv;
		const baseURL = baseURLs[providerId] ?? provider.baseUrl;
		if (baseURL) preset.baseURL = baseURL;
		const chosen =
			defaultEffort && levels.includes(defaultEffort) ? defaultEffort : pickDefaultLevel(levels);
		if (chosen) preset.reasoning = chosen;
		created[providerId] = preset;
		changes.push({
			provider: providerId,
			kind: "route",
			detail: `新增路由（继承目录 ${provider.models.length} 个模型，档位 ${levels.join("/") || "无"}）`,
		});
	}
	if (Object.keys(created).length > 0) Object.assign(ensureProvidersConfig(next), created);
	return { doc: next, changes, skipped };
}

export { THINKING_LEVELS };
