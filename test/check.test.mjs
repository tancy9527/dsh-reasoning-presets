import assert from "node:assert/strict";
import test from "node:test";

import { Catalog } from "../lib/catalog.mjs";
import { checkDoc } from "../lib/audit.mjs";
import { supportedLevels } from "../lib/levels.mjs";

function model(spec) {
	return { ...spec, supported: supportedLevels(spec) };
}

const ZAI_COMPAT = {
	thinkingFormat: "zai",
	supportsReasoningEffort: true,
	maxTokensField: "max_tokens",
	supportsStore: false,
};

const catalog = Catalog.fromProviders(
	[
		{
			id: "zai",
			name: "Z.AI",
			models: [
				model({
					id: "glm-5.3",
					api: "openai-completions",
					reasoning: true,
					thinkingLevelMap: {
						off: null,
						minimal: null,
						low: "low",
						medium: null,
						high: "high",
						xhigh: null,
						max: "max",
					},
					compat: ZAI_COMPAT,
				}),
				model({
					id: "glm-5.2",
					api: "openai-completions",
					reasoning: true,
					thinkingLevelMap: {
						off: "none",
						minimal: null,
						low: "low",
						medium: null,
						high: "high",
						xhigh: null,
						max: "max",
					},
					compat: ZAI_COMPAT,
				}),
			],
		},
	],
	"/fake/app",
);

function docWith(providers) {
	return [{ id: "llm-pi-ai", name: "@deepseek-ai/dsh-llm-pi-ai", config: { providers } }];
}

const CLEAN_PROVIDERS = {
	glm: {
		api: "openai-completions",
		baseURL: "https://open.bigmodel.cn/api/paas/v4",
		reasoning: "high",
		compat: ZAI_COMPAT,
		models: [{ id: "glm-5.3", name: "GLM-5.3", reasoningEfforts: { low: "low", high: "high", max: "max" } }],
	},
};

test("check：配置完整时判干净", () => {
	const result = checkDoc(docWith(structuredClone(CLEAN_PROVIDERS)), catalog);
	assert.equal(result.clean, true);
	assert.deepEqual(result.drift, []);
});

test("check：缺 reasoningEfforts 时判脏并给出 MISSING_LEVELS", () => {
	const providers = structuredClone(CLEAN_PROVIDERS);
	delete providers.glm.models[0].reasoningEfforts;
	const result = checkDoc(docWith(providers), catalog);
	assert.equal(result.clean, false);
	const item = result.drift.find((entry) => entry.code === "MISSING_LEVELS");
	assert.ok(item, "应有 MISSING_LEVELS");
	assert.equal(item.provider, "glm");
	assert.equal(item.model, "glm-5.3");
	assert.equal(item.severity, "warn");
});

test("check：缺默认档（info 级）默认算干净，strict 才算脏", () => {
	const providers = structuredClone(CLEAN_PROVIDERS);
	// glm-5.2 支持「关闭思考」⇒ 缺默认档只是 info（菜单多一个 Default 伪项，不会 400）
	providers.glm.models = [
		{
			id: "glm-5.2",
			name: "GLM-5.2",
			reasoningEfforts: { off: "none", low: "low", high: "high", max: "max" },
		},
	];
	delete providers.glm.reasoning;
	const loose = checkDoc(docWith(structuredClone(providers)), catalog);
	assert.equal(loose.clean, true, "info 级问题默认不拦 CI");
	assert.ok(loose.report.routes[0].issues.some((issue) => issue.code === "NO_DEFAULT"));

	const strict = checkDoc(docWith(structuredClone(providers)), catalog, { strict: true });
	assert.equal(strict.clean, false);
	assert.ok(strict.drift.some((item) => item.code === "NO_DEFAULT"));
});

test("check：不支持关闭思考的型号缺默认档算警告（会 400 的风险）", () => {
	const providers = structuredClone(CLEAN_PROVIDERS);
	delete providers.glm.reasoning;
	const result = checkDoc(docWith(providers), catalog);
	assert.equal(result.clean, false);
	const item = result.drift.find((entry) => entry.code === "NO_DEFAULT");
	assert.equal(item.severity, "warn");
	assert.equal(item.suggestedDefault, "high");
});

test("check：家族规则命中的型号只报一次（不重复 FAMILY_FIXABLE）", () => {
	const doc = docWith({
		relay: {
			api: "openai-completions",
			baseURL: "https://relay.example.com/v1",
			models: [{ id: "glm-5.3-flash", name: "GLM-5.3-Flash" }],
		},
	});
	const result = checkDoc(doc, catalog);
	const forModel = result.drift.filter((item) => item.model === "glm-5.3-flash");
	assert.equal(forModel.length, 1);
	assert.equal(forModel[0].code, "MISSING_LEVELS");
});
