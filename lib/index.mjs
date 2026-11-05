/**
 * Host 侧入口：把「推理等级」体检/修复能力做成一个工具 `reasoning_presets`。
 *
 * 只读为主：audit / list 不写盘；fix / init 只有显式 `write: true` 才落盘，
 * 且落盘前会在同目录留一份带时间戳的 .bak。
 *
 * 铁律：apply() 不允许抛错——抛了会让整个插件被记成加载失败，
 * 连带影响同一 bundle 里的其它东西。
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { loadCatalog } from "./catalog.mjs";
import { auditDoc, checkDoc, fixDoc, initDoc } from "./audit.mjs";
import { autoRepair, describeRepair } from "./autofix.mjs";
import { readPatchFile, stringifyPatch, writePatchFile } from "./patch.mjs";
import {
	renderAuditText,
	renderCatalogText,
	renderChanges,
	renderCheckText,
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
			enum: ["list", "audit", "check", "fix", "init"],
			description:
				"list=列目录里各厂商的推理档位；audit=体检当前 profile（只读）；check=漂移检查（只读，返回 clean 与否，适合 CI/pre-commit）；fix=给缺档位的路由补配置（需 write:true 才落盘）；init=按供应商 id 新增路由（需 write:true）。",
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
		strict: {
			type: "boolean",
			description: "check 时把提示级（info）问题也算作漂移（默认只算警告级）。",
		},
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
			clean: { type: "boolean", description: "check 的结论：true=没有漂移。" },
			drift: {
				type: "array",
				description: "check 发现的漂移项（code / provider / model / message）。",
				items: { type: "object" },
			},
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
	const patch = await readPatchFile(file, catalog.origin);

	if (action === "audit") {
		const report = auditDoc(patch.doc, catalog);
		return { action, file, text: renderAuditText(report, { profile: file, root: catalog.origin }) };
	}

	if (action === "check") {
		const strict = args?.strict === true;
		const result = checkDoc(patch.doc, catalog, { strict });
		return {
			action,
			file,
			clean: result.clean,
			drift: result.drift,
			text: renderCheckText(result, { file, strict }),
		};
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
		const backup = await writePatchFile(file, await stringifyPatch(result.doc, patch.header, catalog.origin));
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
	const backup = await writePatchFile(file, await stringifyPatch(result.doc, patch.header, catalog.origin));
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
				"推理等级（reasoning effort）体检与修复：列出各家模型可选的思考档位，检查当前 profile 里哪些路由缺滑块（audit/check），并补齐 reasoningEfforts / compat / 默认档（fix）。默认只读，写盘需 write:true。",
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

	void autoFixOnLoad(ctx, config);
	auditClientBundle(ctx);
}

/**
 * 客户端半边自检：`dsh.client`、`exports["./client"]`、产物里的关键字符串缺任何一个，
 * 滑条就永远不会出现，而且**不会有任何报错**（DSH 只会当成没有这个客户端插件）。
 * 这里只写日志，不改文件、不抛错。
 */
export function auditClientBundle(ctx) {
	try {
		const manifestUrl = new URL("../package.json", import.meta.url);
		const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
		const problems = [];
		const client = manifest.dsh?.client;
		if (client === undefined) problems.push("package.json 缺 dsh.client");
		else if (typeof client.platform !== "string") problems.push("dsh.client.platform 必须是字符串");
		const declared = manifest.exports?.["./client"];
		const entry = typeof declared === "string" ? declared : declared?.default;
		if (typeof entry !== "string") {
			problems.push('package.json 的 exports["./client"] 缺失或不是字符串');
		} else {
			const source = readFileSync(new URL(`../${entry.replace(/^\.\//, "")}`, import.meta.url), "utf8");
			const needles = [
				["__ModuleLoader__.load", "__ModuleLoader__.load"],
				[`id: "${manifest.name}"`, "bundle id"],
				["conversation.input.right", "插槽名 conversation.input.right"],
				["exports.apply", "exports.apply"],
				["return module.exports", "return module.exports"],
			];
			for (const [needle, label] of needles) {
				if (!source.includes(needle)) problems.push(`客户端产物缺 ${label}`);
			}
		}
		if (problems.length === 0) ctx.logger?.debug?.("reasoning-presets: 客户端滑条自检通过");
		else ctx.logger?.warn?.(`reasoning-presets: 客户端滑条可能不出现 —— ${problems.join("；")}`);
	} catch (error) {
		ctx.logger?.debug?.(`reasoning-presets: 客户端滑条自检跳过（${String(error?.message ?? error)}）`);
	}
}

/**
 * 启动时自动补配置：让「装 → 重启 → 滑条出现」成立。
 * 只补不覆盖、写盘留 .bak、有日志、可关（配置 `autoFix: false`）。
 */
async function autoFixOnLoad(ctx, config) {
	try {
		const config0 = typeof config === "function" ? config() : config;
		if (config0?.autoFix === false) return;
		const catalog = await loadCatalog({ root: config0?.dshRoot });
		const file = patchFileOf({}, config0 ?? {});
		const result = await autoRepair({
			file,
			catalog,
			applyDefault: config0?.applyDefault !== false,
			defaultEffort: config0?.defaultEffort,
		});
		const line = `reasoning-presets: ${describeRepair(result)}`;
		if (result.status === "written") {
			ctx.logger?.info?.(line) ?? ctx.logger?.warn?.(line);
		} else {
			ctx.logger?.debug?.(line);
		}
	} catch (error) {
		ctx.logger?.warn?.(`reasoning-presets: 自动补齐失败，已跳过：${String(error?.message ?? error)}`);
	}
}

export default { name, apply };
