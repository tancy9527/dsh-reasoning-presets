import assert from "node:assert/strict";
import test from "node:test";

import { Catalog } from "../lib/catalog.mjs";
import { auditDoc, fixDoc } from "../lib/audit.mjs";
import { familyOf, recipeFor } from "../lib/recipes.mjs";
import { supportedLevels } from "../lib/levels.mjs";

function model(spec) {
	return { ...spec, supported: supportedLevels(spec) };
}

// 目录里只有官方型号；claude-* / glm-5.3-flashx 这些中转站/新型号要靠家族规则兜底
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
					thinkingLevelMap: { off: null, minimal: null, low: "low", medium: null, high: "high", xhigh: null, max: "max" },
					compat: { thinkingFormat: "zai", supportsReasoningEffort: true },
				}),
			],
		},
	],
	"/fake/app",
);

function docWith(providers) {
	return [{ id: "llm-pi-ai", name: "@deepseek-ai/dsh-llm-pi-ai", config: { providers } }];
}

test("家族识别：GLM 与 Claude 的型号前缀", () => {
	assert.equal(familyOf("glm-5.3-flashx")?.id, "zhipu-glm");
	assert.equal(familyOf("claude-sonnet-5-5")?.id, "anthropic-claude");
	assert.equal(familyOf("gpt-5.3"), undefined);
	// api 不匹配时不认（避免把 claude 型号塞进 completions 路由）
	assert.equal(familyOf("claude-opus-5", "openai-completions"), undefined);
});

test("GLM 家族：5.3 不给 off，5.2 给 off=none", () => {
	const g53 = recipeFor({ id: "glm-5.3-flash" });
	assert.deepEqual(g53.levels, ["low", "high", "max"]);
	assert.equal(g53.api, "openai-completions");
	assert.equal(g53.compat.thinkingFormat, "zai");
	assert.equal(g53.defaultEffort, "high");

	const g52 = recipeFor({ id: "glm-5.2" });
	assert.deepEqual(g52.efforts, { off: "none", low: "low", high: "high", max: "max" });

	// 4.x 信息不可靠：不猜
	assert.equal(recipeFor({ id: "glm-4.7-flash" }), undefined);
});

test("Claude 家族：5.x 六档，haiku 保守三档", () => {
	const opus = recipeFor({ id: "claude-opus-5" });
	assert.equal(opus.api, "anthropic-messages");
	assert.deepEqual(opus.levels, ["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

	const haiku = recipeFor({ id: "claude-haiku-5-5" });
	assert.deepEqual(haiku.levels, ["off", "low", "medium", "high"]);
});

test("audit 把家族可修的型号标成 family 而不是 unknown", () => {
	const doc = docWith({
		claude: { api: "anthropic-messages", baseURL: "https://totokens.cc", models: [{ id: "claude-sonnet-5-5" }] },
	});
	const route = auditDoc(doc, catalog).routes[0];
	assert.equal(route.models[0].status, "family");
	assert.equal(route.models[0].canFix, true);
	assert.deepEqual(route.models[0].levels, ["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
	assert.ok(route.issues.some((issue) => issue.code === "FAMILY_FIXABLE"));
});

test("fix 用家族规则补齐中转站型号并写入默认档", () => {
	const doc = docWith({
		claude: {
			baseURL: "https://totokens.cc",
			models: [{ id: "claude-sonnet-5-5" }, { id: "claude-haiku-5-5" }],
		},
		glm: {
			models: [{ id: "glm-5.3-flashx" }],
		},
	});
	const result = fixDoc(doc, catalog);
	const providers = result.doc[0].config.providers;

	assert.equal(providers.claude.api, "anthropic-messages");
	assert.equal(providers.claude.reasoning, "high");
	assert.deepEqual(providers.claude.models[0].reasoningEfforts, {
		off: null,
		minimal: "minimal",
		low: "low",
		medium: "medium",
		high: "high",
		xhigh: "xhigh",
		max: "max",
	});
	assert.deepEqual(Object.keys(providers.claude.models[1].reasoningEfforts), ["off", "low", "medium", "high"]);

	assert.equal(providers.glm.api, "openai-completions");
	assert.equal(providers.glm.compat.thinkingFormat, "zai");
	assert.deepEqual(providers.glm.models[0].reasoningEfforts, { low: "low", high: "high", max: "max" });
	assert.equal(providers.glm.reasoning, "high");

	// 入参不被修改
	assert.equal(doc[0].config.providers.claude.api, undefined);
});

test("家族规则只补不覆盖：已手写的档位原样保留", () => {
	const doc = docWith({
		claude: { api: "anthropic-messages", models: [{ id: "claude-opus-5", reasoningEfforts: { low: "low", high: "high" } }] },
	});
	const result = fixDoc(doc, catalog);
	assert.deepEqual(result.doc[0].config.providers.claude.models[0].reasoningEfforts, { low: "low", high: "high" });
});
