import assert from "node:assert/strict";
import test from "node:test";

import { Catalog } from "../lib/catalog.mjs";
import { auditDoc, fixDoc, initDoc } from "../lib/audit.mjs";
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
			baseUrl: "https://api.z.ai/api/coding/paas/v4",
			models: [
				model({
					id: "glm-5.3",
					api: "openai-completions",
					reasoning: true,
					thinkingLevelMap: { off: null, minimal: null, low: "low", medium: null, high: "high", xhigh: null, max: "max" },
					compat: ZAI_COMPAT,
				}),
				model({
					id: "glm-5.2",
					api: "openai-completions",
					reasoning: true,
					thinkingLevelMap: { off: "none", minimal: null, low: "low", medium: null, high: "high", xhigh: null, max: "max" },
					compat: ZAI_COMPAT,
				}),
				model({ id: "glm-4.7", api: "openai-completions", reasoning: false }),
			],
		},
		{
			id: "openai",
			name: "OpenAI",
			models: [
				model({
					id: "gpt-5.3",
					api: "openai-responses",
					reasoning: true,
					thinkingLevelMap: { off: "none", minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
					compat: { supportsDeveloperRole: true, supportsStrictMode: true },
				}),
			],
		},
	],
	"/fake/app",
);

function docWith(providers) {
	return [{ id: "llm-pi-ai", name: "@deepseek-ai/dsh-llm-pi-ai", config: { providers } }];
}

test("自定义路由（glm）缺 reasoningEfforts 时会被判成可修", () => {
	const doc = docWith({
		glm: {
			api: "openai-completions",
			baseURL: "https://open.bigmodel.cn/api/paas/v4",
			models: [{ id: "glm-5.3", name: "GLM-5.3" }, { id: "glm-5.2", name: "GLM-5.2" }],
		},
	});
	const report = auditDoc(doc, catalog);
	const route = report.routes[0];
	assert.equal(route.status, "declared");
	assert.equal(route.inheritsCatalog, false);
	assert.deepEqual(
		route.models.map((item) => item.status),
		["missing", "missing"],
	);
	assert.equal(report.summary.fixableModels, 2);
	const codes = route.issues.map((issue) => issue.code);
	assert.ok(codes.includes("NO_DEFAULT"));
});

test("fix 会补 reasoningEfforts、api、compat 与默认档", () => {
	const doc = docWith({
		glm: {
			baseURL: "https://open.bigmodel.cn/api/paas/v4",
			models: [{ id: "glm-5.3", name: "GLM-5.3" }, { id: "glm-5.2", name: "GLM-5.2" }],
		},
	});
	const result = fixDoc(doc, catalog);
	const providers = result.doc[0].config.providers;
	const glm = providers.glm;
	assert.equal(glm.api, "openai-completions");
	assert.equal(glm.reasoning, "high");
	assert.deepEqual(glm.models[0].reasoningEfforts, { low: "low", high: "high", max: "max" });
	assert.deepEqual(glm.models[1].reasoningEfforts, { off: "none", low: "low", high: "high", max: "max" });
	assert.equal(glm.compat.thinkingFormat, "zai");
	assert.equal(glm.compat.supportsReasoningEffort, true);
	assert.equal(glm.compat.maxTokensField, "max_tokens");
	assert.ok(result.changes.length >= 4);
	// 入参没被改
	assert.equal(doc[0].config.providers.glm.api, undefined);
});

test("同名路由按目录继承，不需要手写档位", () => {
	const doc = docWith({ zai: { models: [{ id: "glm-5.3" }] } });
	const report = auditDoc(doc, catalog);
	assert.equal(report.routes[0].models[0].status, "catalog");
	assert.equal(report.summary.fixableModels, 0);
	const result = fixDoc(doc, catalog);
	// 只补默认档，不动模型
	assert.equal(result.doc[0].config.providers.zai.reasoning, "high");
	assert.equal(result.doc[0].config.providers.zai.models[0].reasoningEfforts, undefined);
});

test("不写 models 的路由整体继承目录", () => {
	const doc = docWith({ zai: { apiKeyEnv: "ZAI_API_KEY" } });
	const report = auditDoc(doc, catalog);
	assert.equal(report.routes[0].status, "inherited");
	assert.deepEqual(report.routes[0].models.map((item) => item.id), ["glm-5.3", "glm-5.2", "glm-4.7"]);
});

test("响应协议的自定义路由只补该协议认识的 compat", () => {
	const doc = docWith({ "my-gpt": { models: [{ id: "gpt-5.3" }] } });
	const result = fixDoc(doc, catalog);
	const route = result.doc[0].config.providers["my-gpt"];
	assert.equal(route.api, "openai-responses");
	assert.equal(route.compat.supportsDeveloperRole, true);
	// responses 协议不接受 thinkingFormat / maxTokensField
	assert.equal(route.compat.thinkingFormat, undefined);
	assert.equal(route.compat.maxTokensField, undefined);
});

test("未知型号既不猜也不写", () => {
	const doc = docWith({ ghost: { api: "openai-completions", models: [{ id: "ghost-9000" }] } });
	const report = auditDoc(doc, catalog);
	assert.equal(report.routes[0].models[0].status, "unknown");
	const result = fixDoc(doc, catalog);
	assert.equal(result.changes.length, 0);
	assert.ok(result.skipped.some((item) => item.model === "ghost-9000"));
});

test("init 只写四项，模型交给目录", () => {
	const result = initDoc(docWith({}), catalog, ["zai", "openai"]);
	const providers = result.doc[0].config.providers;
	assert.deepEqual(Object.keys(providers.zai).sort(), ["apiKeyEnv", "baseURL", "displayName", "reasoning"]);
	assert.equal(providers.zai.models, undefined);
	assert.equal(providers.openai.reasoning, "high");
});

test("init 不覆盖已有路由", () => {
	const doc = docWith({ zai: { displayName: "我自己写的" } });
	const result = initDoc(doc, catalog, ["zai"]);
	assert.equal(result.doc[0].config.providers.zai.displayName, "我自己写的");
	assert.ok(result.skipped.some((item) => item.provider === "zai"));
});
