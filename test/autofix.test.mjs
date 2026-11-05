import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Catalog, resolveDshRoot } from "../lib/catalog.mjs";
import { autoRepair, describeRepair, readLog } from "../lib/autofix.mjs";
import { supportedLevels } from "../lib/levels.mjs";

const root = resolveDshRoot();

const catalog = Catalog.fromProviders(
	[
		{
			id: "anthropic",
			name: "Anthropic",
			models: [
				{
					id: "claude-opus-5",
					api: "anthropic-messages",
					reasoning: true,
					compat: {},
					thinkingLevelMap: { off: "none", minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
				},
			].map((model) => ({ ...model, supported: supportedLevels(model) })),
		},
	],
	root ?? "/fake/app",
);

const PATCH = `# 用户的注释要保留
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      claude:
        api: anthropic-messages
        baseURL: https://example.invalid
        models:
          - id: claude-opus-5
          - id: claude-sonnet-5-5
`;

async function tempPatch(text = PATCH) {
	const dir = await mkdtemp(join(tmpdir(), "dsh-rp-autofix-"));
	const file = join(dir, "cordis.patch.yml");
	await writeFile(file, text, "utf8");
	return file;
}

test("首次启动：自动补齐档位、写 .bak 与日志，注释不丢", async (t) => {
	if (!root) {
		t.skip("本机没找到 DSH 安装目录（yaml 不可用）");
		return;
	}
	const file = await tempPatch();
	const result = await autoRepair({ file, catalog });
	assert.equal(result.status, "written");
	assert.ok(result.changes.length >= 2);
	assert.ok(result.backup && existsSync(result.backup));

	const text = await readFile(file, "utf8");
	assert.match(text, /^# 用户的注释要保留/);
	assert.match(text, /reasoningEfforts/);
	assert.match(text, /reasoning: high/);
	// 目录里的型号用目录档位，目录外的型号走家族规则
	assert.match(text, /claude-sonnet-5-5[\s\S]*minimal/);

	assert.match(await readLog(file), /autoFix/);
	assert.match(describeRepair(result), /自动补齐/);
});

test("第二次启动：已经干净，不再写盘（幂等）", async (t) => {
	if (!root) {
		t.skip("本机没找到 DSH 安装目录（yaml 不可用）");
		return;
	}
	const file = await tempPatch();
	await autoRepair({ file, catalog });
	const after = await readFile(file, "utf8");

	const again = await autoRepair({ file, catalog });
	assert.equal(again.status, "clean");
	assert.equal(again.changes.length, 0);
	assert.equal(await readFile(file, "utf8"), after);
});

test("没有补丁文件 / 没有 llm-pi-ai 条目时安静跳过", async (t) => {
	if (!root) {
		t.skip("本机没找到 DSH 安装目录（yaml 不可用）");
		return;
	}
	const missing = await autoRepair({ file: join(tmpdir(), "dsh-rp-nope.yml"), catalog });
	assert.equal(missing.status, "missing");

	const emptyFile = await tempPatch("- id: something-else\n  name: whatever\n");
	const empty = await autoRepair({ file: emptyFile, catalog });
	assert.equal(empty.status, "empty");
});
