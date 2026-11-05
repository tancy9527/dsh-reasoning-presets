/**
 * Host 侧入口：把「推理等级」体检/修复能力做成一个工具 `reasoning_presets`。
 *
 * 只读为主：audit / list 不写盘；fix / init 只有显式 `write: true` 才落盘，
 * 且落盘前会在同目录留一份带时间戳的 .bak。
 *
 * 铁律：apply() 不允许抛错——抛了会让整个插件被记成加载失败，
 * 连带影响同一 bundle 里的其它东西。
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { loadCatalog } from "./catalog.mjs";
import { auditDoc, fixDoc, initDoc } from "./audit.mjs";
import { readPatchFile, stringifyPatch, writePatchFile } from "./patch.mjs";
import {
	renderAuditText,
	renderCatalogText,
	renderChanges,
} from "./render.mjs";

export const name = "reasoning-presets";

function defaultProfileDir() {
	return join(homedir(), ".dsh", "profiles", "desktop");
}

function patchFileOf(args, config) {
	if (args?.patch) return resolve(String(args.patch));
	const profile = resolve(String(args?.profile ?? config?.profile ?? defaultProfileDir()));
	return join(profile, "cordis.patch.yml");
}

const PARAMETERS = {
	type: "object",
	additionalProperties: false,
	properties: {
		action: {
			type: "string",
			enum: ["list", "audit", "fix", "init"],
			description:
				"list=列目录里各厂商的推理档位；audit=体检当前 profile（只读）；fix=给缺档位的路由补配置（需 write:true 才落盘）；init=按供应商 id 新增路由（需 write:true）。",
		},
		providers: {
			type: "array",
			items: { type: "string" },
			description: "init 用：pi-ai 目录里的供应商 id，如 zai、deepseek、openai、anthropic、google。",
		},
		effort: {
			type: "string",
			enum: ["minimal", "low", "medium", "high", "xhigh", "max"],
			description: "可选：希望设为默认档的等级；省略时自动在 high→medium→max→low 里挑一个共同支持的。",
		},
		write: {
			type: "boolean",
			description: "fix/init 是否真的写盘（默认 false，只打印将要做的改动）。",
		},
		applyDefault: {
			type: "boolean",
			description: "fix 时是否顺带补默认档（默认 true）。补了就不会再出现「Default = 不发送 effort」这个坑。",
		},
		profile: {
			type: "string",
			description: "profile 目录，默认 %USERPROFILE%\\.dsh\\profiles\\desktop。",
		},
		patch: { type: "string", description: "直接指定 cordis.patch.yml 的路径。" },
		dshRoot: {
			type: "string",
			description: "DSH 安装目录（含 node_modules/@earendil-works/pi-ai）；省略时自动探测。",
		},
		all: { type: "boolean", description: "list 时列出目录里全部供应商，而不只是推荐的 18 家。" },
	},
	required: ["action"],
};

const OUTPUT = {
	schema: {
		type: "object",
		additionalProperties: false,
		properties: {
			action: { type: "string" },
			text: { type: "string", description: "给人看的报告。" },
			wrote: { type: "boolean", description: "本次是否真的写盘。" },
			file: { type: "string", description: "涉及的补丁文件。" },
			backup: { type: "string", description: "写盘前的备份路径。" },
		},
		required: ["action", "text"],
	},
};

async function execute(args, config) {
	const action = String(args?.action ?? "audit");
	const catalog = await loadCatalog({ root: args?.dshRoot ?? config?.dshRoot });
	if (action === "list") {
		return { action, text: renderCatalogText(catalog, { all: args?.all === true }) };
	}

	const file = patchFileOf(args, config);
	if (!existsSync(file)) {
		return {
			action,
			text: `找不到 ${file}。用 profile / patch 参数指定路径，或先在 DSH 里配置一个模型。`,
		};
	}
	const patch = await readPatchFile(file, args?.dshRoot ?? config?.dshRoot);

	if (action === "audit") {
		const report = auditDoc(patch.doc, catalog);
		return { action, file, text: renderAuditText(report, { profile: file, root: catalog.origin }) };
	}

	const write = args?.write === true;
	if (action === "fix") {
		const result = fixDoc(patch.doc, catalog, {
			applyDefault: args?.applyDefault !== false,
			defaultEffort: args?.effort,
		});
		if (!write || result.changes.length === 0) {
			return { action, file, wrote: false, text: renderChanges(result, { dryRun: !write, file }) };
		}
		const backup = await writePatchFile(file, await stringifyPatch(result.doc, patch.header, args?.dshRoot ?? config?.dshRoot));
		return {
			action,
			file,
			wrote: true,
			backup: backup ?? undefined,
			text: renderChanges(result, { dryRun: false, file }) + (backup ? `\n原文件已备份：${backup}` : ""),
		};
	}

	const providers = Array.isArray(args?.providers) ? args.providers.map(String) : [];
	if (providers.length === 0) {
		return { action, file, text: "init 需要 providers 数组，例如 [\"zai\", \"deepseek\", \"openai\"]。" };
	}
	const result = initDoc(patch.doc, catalog, providers, { defaultEffort: args?.effort });
	if (!write || result.changes.length === 0) {
		return { action, file, wrote: false, text: renderChanges(result, { dryRun: !write, file }) };
	}
	const backup = await writePatchFile(file, await stringifyPatch(result.doc, patch.header, args?.dshRoot ?? config?.dshRoot));
	return {
		action,
		file,
		wrote: true,
		backup: backup ?? undefined,
		text: renderChanges(result, { dryRun: false, file }) + (backup ? `\n原文件已备份：${backup}` : ""),
	};
}

export function apply(ctx, config = {}) {
	try {
		ctx.tools.register({
			name: "reasoning_presets",
			description:
				"推理等级（reasoning effort）体检与修复：列出各家模型可选的思考档位，检查当前 profile 里哪些路由缺滑块，并补齐 reasoningEfforts / compat / 默认档。默认只读，写盘需 write:true。",
			parameters: PARAMETERS,
			output: OUTPUT,
			async execute(args) {
				const config0 = typeof config === "function" ? config() : config;
				return execute(args ?? {}, config0 ?? {});
			},
		});
	} catch (error) {
		ctx.logger?.warn?.(`reasoning-presets: 注册工具有误，已跳过：${String(error?.message ?? error)}`);
	}
}

export default { name, apply };
