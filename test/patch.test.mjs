import assert from "node:assert/strict";
import test from "node:test";

import { resolveDshRoot } from "../lib/catalog.mjs";
import { parsePatch, splitHeader, stringifyPatch } from "../lib/patch.mjs";

const root = resolveDshRoot();

const SAMPLE = `# 这个文件的注释必须保留
# 第二行注释
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      glm:
        api: openai-completions
        reasoning: high
        models:
          - id: glm-5.2
            reasoningEfforts: { off: none, low: low, high: high, max: max }
          - id: glm-5.3
            reasoningEfforts: { low: low, high: high, max: max }
      claude:
        api: anthropic-messages
        models:
          - id: claude-fable-5
`;

test("splitHeader 只吃开头的注释与空行", () => {
	const { header, body } = splitHeader(SAMPLE);
	assert.match(header, /# 这个文件的注释必须保留/);
	assert.match(header, /# 第二行注释/);
	assert.match(body, /^- id: llm-pi-ai/m);
});

test("解析 + 重写 + 再解析：结构不变，注释不丢", async (t) => {
	if (!root) {
		t.skip("本机没找到 DSH 安装目录（pi-ai / yaml 不可用）");
		return;
	}
	const { doc, header } = await parsePatch(SAMPLE, root);
	assert.equal(doc.length, 1);
	assert.equal(doc[0].id, "llm-pi-ai");
	const providers = doc[0].config.providers;
	assert.deepEqual(providers.glm.models[0].reasoningEfforts, { off: "none", low: "low", high: "high", max: "max" });
	assert.equal(providers.glm.reasoning, "high");

	const text = await stringifyPatch(doc, header, root);
	assert.match(text, /^# 这个文件的注释必须保留/);
	const again = await parsePatch(text, root);
	assert.deepEqual(again.doc, doc);
});

test("顶层不是数组直接报错", async (t) => {
	if (!root) {
		t.skip("本机没找到 DSH 安装目录");
		return;
	}
	await assert.rejects(() => parsePatch("foo: bar\n", root), /顶层必须是数组/);
});
