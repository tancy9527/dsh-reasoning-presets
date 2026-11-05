/**
 * 渲染：把审计结果 / 目录矩阵输出成人能读的文本或 markdown。
 * 这里只做展示，不做判断——所有判断都在 audit.mjs / catalog.mjs 里。
 */

import { THINKING_LEVELS, labelLevels } from "./levels.mjs";
import { PROVIDER_META, RECOMMENDED } from "./presets.mjs";

const STATUS_LABEL = {
	declared: "手写声明",
	catalog: "目录继承",
	missing: "缺档位 · 可修",
	unknown: "目录未收录",
	"no-reasoning": "非推理模型",
};

const ROUTE_LABEL = {
	inherited: "全部继承目录",
	declared: "手写模型",
	empty: "空路由",
};

const ICON = { ok: "✓", warn: "!", bad: "✗" };

function pad(text, width) {
	const value = String(text ?? "");
	// 中文按两格算，保证等宽对齐
	let visual = 0;
	for (const char of value) visual += /[\u2e80-\u9fff\uff00-\uffef]/.test(char) ? 2 : 1;
	return value + " ".repeat(Math.max(0, width - visual));
}

function routeIcon(route) {
	if (route.issues.some((issue) => (issue.severity ?? "warn") === "warn")) return ICON.bad;
	if (route.models.some((model) => model.canFix)) return ICON.warn;
	return ICON.ok;
}

function routeHeadline(route) {
	const parts = [];
	parts.push(route.api ?? "协议未指定");
	parts.push(`${route.models.length} 个模型`);
	if (route.defaultEffort) parts.push(`默认档 ${route.defaultEffort}`);
	else parts.push("默认档未设置");
	return parts.join(" · ");
}

export function renderAuditText(report, options = {}) {
	const { profile, root } = options;
	const lines = [];
	lines.push("DSH 推理等级审计");
	if (profile) lines.push(`profile：${profile}`);
	if (root) lines.push(`DSH：${root}`);
	const { summary } = report;
	lines.push(
		`路由 ${summary.routes} 条（目录继承 ${summary.inherited} / 手写 ${summary.declared}）· 可修模型 ${summary.fixableModels} · 警告 ${summary.warns}`,
	);
	lines.push("");

	if (!report.hasLlmEntry) {
		lines.push("补丁里没有 llm-pi-ai 条目 —— 没有可审计的路由。用 init 先加一条。");
		return `${lines.join("\n")}\n`;
	}

	for (const route of report.routes) {
		const badge = ROUTE_LABEL[route.status] ?? route.status;
		lines.push(`${routeIcon(route)} ${pad(route.provider, 22)} ${badge}`);
		lines.push(`${" ".repeat(24)}${routeHeadline(route)}`);
		if (route.baseURL) lines.push(`${" ".repeat(24)}${route.baseURL}`);
		for (const model of route.models) {
			const levels = model.levels.length > 0 ? labelLevels(model.levels) : "—";
			const status = STATUS_LABEL[model.status] ?? model.status;
			const from =
				model.status === "missing" && model.matchedProvider
					? `（取自 ${model.matchedProvider} 目录）`
					: "";
			lines.push(`   ${pad(model.id, 26)} ${pad(levels, 30)} ${status}${from}`);
		}
		for (const issue of route.issues) {
			const mark = (issue.severity ?? "warn") === "info" ? "·" : "!";
			lines.push(`   ${mark} ${issue.message}`);
		}
		lines.push("");
	}
	lines.push("档位顺序：" + THINKING_LEVELS.join(" / "));
	return `${lines.join("\n")}\n`;
}

export function renderAuditMarkdown(report, options = {}) {
	const { profile } = options;
	const lines = [];
	lines.push("# DSH 推理等级审计");
	lines.push("");
	if (profile) lines.push(`- profile：\`${profile}\``);
	lines.push(
		`- 路由 ${report.summary.routes} 条（目录继承 ${report.summary.inherited} / 手写 ${report.summary.declared}），可修模型 ${report.summary.fixableModels}，警告 ${report.summary.warns}`,
	);
	lines.push("");
	lines.push("| 路由 | 协议 | 模型 | 档位 | 默认档 | 状态 | 备注 |");
	lines.push("| --- | --- | --- | --- | --- | --- | --- |");
	for (const route of report.routes) {
		const levels = route.levels.length > 0 ? labelLevels(route.levels) : "—";
		const notes = route.issues.map((issue) => issue.code).join(", ") || "—";
		lines.push(
			`| \`${route.provider}\` | ${route.api ?? "—"} | ${route.models.length} | ${levels} | ${route.defaultEffort ?? "—"} | ${ROUTE_LABEL[route.status] ?? route.status} | ${notes} |`,
		);
	}
	const problems = report.routes.filter((route) => route.issues.length > 0);
	if (problems.length > 0) {
		lines.push("");
		lines.push("## 待处理");
		for (const route of problems) {
			for (const issue of route.issues) {
				lines.push(`- \`${route.provider}\` · ${issue.message}`);
			}
		}
	}
	return `${lines.join("\n")}\n`;
}

export function renderCatalogText(catalog, options = {}) {
	const { only, all = false } = options;
	const ids = only ?? (all ? catalog.rows().map((provider) => provider.id) : RECOMMENDED.filter((id) => catalog.provider(id)));
	const lines = [];
	lines.push("pi-ai 目录里的推理档位（只列有档位的供应商）");
	lines.push("");
	for (const id of ids) {
		const provider = catalog.provider(id);
		if (!provider) continue;
		const withReasoning = provider.models.filter((model) => (model.supported ?? []).length > 0);
		if (withReasoning.length === 0 && !all) continue;
		const meta = PROVIDER_META[id] ?? {};
		lines.push(`${pad(id, 22)} ${meta.label ?? provider.name ?? ""}`);
		const levels = [];
		for (const model of withReasoning) {
			for (const level of model.supported) if (!levels.includes(level)) levels.push(level);
		}
		lines.push(`   ${" ".repeat(0)}档位：${levels.length > 0 ? labelLevels(levels) : "无（该供应商全部不可调档）"}`);
		for (const model of provider.models.slice(0, 8)) {
			const modelLevels = (model.supported ?? []).length > 0 ? labelLevels(model.supported) : "—";
			lines.push(`   ${pad(model.id, 30)} ${modelLevels}`);
		}
		if (provider.models.length > 8) lines.push(`   … 另有 ${provider.models.length - 8} 个模型`);
		lines.push("");
	}
	return `${lines.join("\n")}\n`;
}

export function renderCatalogMarkdown(catalog, options = {}) {
	const { all = false } = options;
	const ids = all ? catalog.rows().map((provider) => provider.id) : RECOMMENDED.filter((id) => catalog.provider(id));
	const lines = [];
	lines.push("# 主流模型推理档位矩阵");
	lines.push("");
	lines.push(
		"档位一列表示**在这个供应商下**可选到的推理等级。`off` 之外的档位越靠右越深；`—` 表示该供应商的模型不可调档。",
	);
	lines.push("");
	lines.push(`| 供应商 | 名称 | API Key | 档位 | 代表模型 |`);
	lines.push("| --- | --- | --- | --- | --- |");
	for (const id of ids) {
		const provider = catalog.provider(id);
		if (!provider) continue;
		const meta = PROVIDER_META[id] ?? {};
		const levels = [];
		const withReasoning = provider.models.filter((model) => (model.supported ?? []).length > 0);
		for (const model of withReasoning) {
			for (const level of model.supported) if (!levels.includes(level)) levels.push(level);
		}
		const sample = provider.models
			.slice(0, 3)
			.map((model) => `\`${model.id}\``)
			.join("、");
		lines.push(
			`| \`${id}\` | ${meta.label ?? provider.name ?? ""} | ${meta.apiKeyEnv ? `\`${meta.apiKeyEnv}\`` : "—"} | ${levels.length > 0 ? labelLevels(levels) : "—"} | ${sample} |`,
		);
	}
	return `${lines.join("\n")}\n`;
}

export function renderChanges(result, options = {}) {
	const { dryRun = false, file } = options;
	const lines = [];
	if (result.note) lines.push(result.note);
	const header = dryRun ? "将要做的改动（dry-run，未落盘）" : "已写入的改动";
	lines.push(`${header}${file ? `：${file}` : ""}`);
	if (result.changes.length === 0) lines.push("（没有需要改的地方）");
	for (const change of result.changes) {
		const where = change.target ? `${change.provider}.${change.target}` : change.provider;
		lines.push(`  + ${pad(where, 32)} ${change.detail}`);
	}
	if (result.skipped?.length > 0) {
		lines.push("跳过：");
		for (const item of result.skipped) {
			lines.push(`  - ${pad(item.model ? `${item.provider}.${item.model}` : item.provider, 32)} ${item.reason}`);
		}
	}
	return `${lines.join("\n")}\n`;
}
