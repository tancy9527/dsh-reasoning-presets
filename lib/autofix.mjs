/**
 * 插件启动时的自动补配置（autoFix）。
 *
 * 目的：让「装插件 → 重启 DSH → 菜单里就有滑条」成立，而不是装完还要再跑一条命令。
 *
 * 边界（刻意保守）：
 * - 只修 `llm-pi-ai` 那一条路由里的模型，不碰其它插件条目；
 * - 只补不覆盖：手写过的 `reasoningEfforts` / `reasoning` 原样保留；
 * - 写盘前在同目录留 `<文件名>.<ISO时间戳>.bak`，并把改动追加到 `reasoning-presets.log`；
 * - 无改动就完全不写盘（重复启动是幂等的）；
 * - 任何异常都被调用方吞掉，绝不让插件加载失败。
 */

import { appendFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { auditDoc, fixDoc } from "./audit.mjs";
import { readPatchFile, stringifyPatch, writePatchFile } from "./patch.mjs";

function logFileFor(file) {
	return join(dirname(file), `${basename(file, ".yml")}.reasoning-presets.log`);
}

async function appendLog(file, lines) {
	try {
		const stamp = new Date().toISOString();
		await appendFile(
			logFileFor(file),
			`\n[${stamp}] autoFix\n${lines.map((line) => `  ${line}`).join("\n")}\n`,
			"utf8",
		);
	} catch {
		// 日志写不进去不影响主流程
	}
}

/**
 * 体检并自动补齐当前 profile 里缺档位的模型。
 * @param {{file: string, catalog: unknown, applyDefault?: boolean, defaultEffort?: string, dryRun?: boolean}} options
 * @returns {Promise<{status: string, file: string, changes: string[], backup?: string}>}
 *   status: `written`（已写盘）/ `clean`（无需修改）/ `missing`（没有补丁文件）/ `empty`（没有 llm-pi-ai 条目）
 */
export async function autoRepair({ file, catalog, applyDefault = true, defaultEffort, dryRun = false }) {
	if (!existsSync(file)) return { status: "missing", file, changes: [] };

	const patch = await readPatchFile(file, catalog.origin);
	const report = auditDoc(patch.doc, catalog);
	if (!report.hasLlmEntry) return { status: "empty", file, changes: [] };

	// 已经干净就不写盘（幂等；也避免每次启动都改一次文件触发无谓的 HMR）
	if (report.summary.fixableModels === 0 && report.summary.warns === 0) {
		return { status: "clean", file, changes: [] };
	}

	const result = fixDoc(patch.doc, catalog, { applyDefault, defaultEffort });
	if (result.changes.length === 0) return { status: "clean", file, changes: [] };

	const lines = result.changes.map((change) => {
		// route 级改动没有 model id，写成「路由设置」而不是 provider.undefined
		const where = change.kind === "route" ? "路由设置" : String(change.target);
		return `${change.provider}.${where}: ${change.detail}`;
	});
	if (dryRun) return { status: "clean", file, changes: lines };

	const text = await stringifyPatch(result.doc, patch.header, catalog.origin);
	const backup = await writePatchFile(file, text);
	await appendLog(file, [...lines, backup ? `备份：${backup}` : ""].filter(Boolean));
	return { status: "written", file, changes: lines, backup: backup ?? undefined };
}

/** 把 autoRepair 的结果压成一行提示（给 logger 用）。 */
export function describeRepair(result) {
	switch (result.status) {
		case "written":
			return `已自动补齐 ${result.changes.length} 处推理等级配置（重启后菜单即出现档位）：${result.changes.slice(0, 3).join("；")}${result.changes.length > 3 ? " 等" : ""}`;
		case "clean":
			return "推理等级配置已完整，无需改动";
		case "missing":
			return `没有找到 ${result.file}，跳过自动补齐`;
		case "empty":
			return "当前 profile 里没有 llm-pi-ai 配置，跳过自动补齐";
		default:
			return "自动补齐未执行";
	}
}

export async function readLog(file) {
	try {
		return await readFile(logFileFor(file), "utf8");
	} catch {
		return "";
	}
}
