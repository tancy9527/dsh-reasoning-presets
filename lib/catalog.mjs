/**
 * 读取 DSH 安装目录里 `@earendil-works/pi-ai` 自带的模型目录。
 *
 * 这是整个仓库的事实来源：pi-ai 的 40 多个内置供应商目录里，每个模型都写好了
 * `reasoning` / `thinkingLevelMap` / `compat`。DSH 的 `llm-pi-ai` 适配器在
 * 解析路由时会对同名 provider 做 catalog 回填（`catalogModels(provider)`），
 * 所以：
 *   - 路由 id 与 pi-ai 目录 id 同名  → 模型元数据自动继承，滑块直接出现
 *   - 路由 id 是自定义的（例如 `glm`）→ 目录不回填，必须手写 reasoningEfforts
 * 本模块负责把这份目录读出来，供 audit / fix / init 使用。
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { supportedLevels } from "./levels.mjs";

const PI_AI = "@earendil-works/pi-ai";

/** 候选 DSH 安装根目录（含 node_modules/@earendil-works/pi-ai 的那一层）。 */
export function dshRootCandidates(explicit) {
	const out = [];
	const push = (value) => {
		if (typeof value === "string" && value.length > 0 && !out.includes(value)) out.push(value);
	};
	push(explicit);
	push(process.env.DSH_APP_ROOT);
	push(process.env.DSH_RUNTIME_ROOT);
	// Electron 主进程 / 桌面版
	if (typeof process.resourcesPath === "string") push(join(process.resourcesPath, "app"));
	const env = process.env;
	if (env.LOCALAPPDATA) push(join(env.LOCALAPPDATA, "Programs", "DSH Desktop", "resources", "app"));
	for (const key of ["ProgramFiles", "ProgramW6432", "PROGRAMFILES"]) {
		if (env[key]) push(join(env[key], "DSH Desktop", "resources", "app"));
	}
	// DSH 装到非系统盘（D:\ E:\ …）时，ProgramFiles 指不到，按盘符再兜一轮
	if (process.platform === "win32") {
		for (const drive of "CDEFGH") {
			push(`${drive}:\\Program Files\\DSH Desktop\\resources\\app`);
			push(`${drive}:\\Program Files (x86)\\DSH Desktop\\resources\\app`);
			push(`${drive}:\\DSH Desktop\\resources\\app`);
		}
	}
	push("/Applications/DSH Desktop.app/Contents/Resources/app");
	push("/usr/lib/dsh");
	push("/usr/local/lib/dsh");
	push("/opt/dsh");
	return out;
}

export function piAiDirOf(root) {
	return join(root, "node_modules", ...PI_AI.split("/"));
}

/** 该目录看起来像 DSH 安装根吗（有 pi-ai 包）。 */
export function isDshRoot(root) {
	return typeof root === "string" && existsSync(join(piAiDirOf(root), "package.json"));
}

/** 找到第一个像样的 DSH 根目录，找不到返回 undefined。 */
export function resolveDshRoot(explicit) {
	const candidates = dshRootCandidates(explicit);
	return candidates.find((candidate) => isDshRoot(candidate));
}

/** 目录对象：只读、可测试（`Catalog.fromProviders()` 可注入假数据）。 */
export class Catalog {
	constructor(providers, origin) {
		this.origin = origin;
		this.providers = providers;
		this.byId = new Map(providers.map((provider) => [provider.id, provider]));
		this.modelIndex = new Map();
		for (const provider of providers) {
			for (const model of provider.models) {
				const bucket = this.modelIndex.get(model.id);
				if (bucket) bucket.push({ provider, model });
				else this.modelIndex.set(model.id, [{ provider, model }]);
			}
		}
	}

	static fromProviders(providers, origin) {
		return new Catalog(providers, origin);
	}

	provider(id) {
		return this.byId.get(id);
	}

	get ids() {
		return this.providers.map((provider) => provider.id);
	}

	/** 同名 provider 优先，其次协议一致，再次任意同名模型。 */
	findModel(modelId, { provider, api } = {}) {
		if (provider) {
			const hit = this.byId.get(provider)?.models.find((model) => model.id === modelId);
			if (hit) return { provider: this.byId.get(provider), model: hit, exact: true };
		}
		const bucket = this.modelIndex.get(modelId);
		if (!bucket || bucket.length === 0) return undefined;
		if (api) {
			const sameApi = bucket.find((entry) => entry.model.api === api);
			if (sameApi) return { ...sameApi, exact: false };
		}
		return { ...bucket[0], exact: false };
	}

	/** 用于 `list` / README 矩阵的聚合行。 */
	rows() {
		return this.providers.map((provider) => {
			const reasoning = provider.models.filter((model) => model.reasoning !== false);
			const levels = [];
			for (const model of reasoning) {
				for (const level of model.supported ?? []) if (!levels.includes(level)) levels.push(level);
			}
			const formats = [
				...new Set(reasoning.map((model) => model.compat?.thinkingFormat).filter(Boolean)),
			];
			const apis = [...new Set(provider.models.map((model) => model.api).filter(Boolean))];
			return {
				id: provider.id,
				name: provider.name,
				baseUrl: provider.baseUrl,
				apis,
				modelCount: provider.models.length,
				reasoningCount: reasoning.length,
				levels,
				formats,
			};
		});
	}
}

/**
 * 载入 pi-ai 内置目录。
 * @param {{root?: string}} options root 缺省时按候选路径探测
 * @returns {Promise<Catalog>}
 */
export async function loadCatalog({ root } = {}) {
	const resolved = resolveDshRoot(root);
	if (!resolved) {
		throw new Error(
			[
				"找不到 DSH 安装目录（需要其中的 node_modules/@earendil-works/pi-ai）。",
				"用 --dsh-root <目录> 或环境变量 DSH_APP_ROOT 指定；",
				"桌面版典型路径：%LOCALAPPDATA%\\Programs\\DSH Desktop\\resources\\app。",
			].join("\n"),
		);
	}
	const entry = join(piAiDirOf(resolved), "dist", "providers", "all.js");
	const mod = await import(pathToFileURL(entry).href);
	const providerObjects = mod.builtinProviders();
	const providers = providerObjects.map((provider) => {
		const models = mod.getBuiltinModels(provider.id).map((model) => ({
			...model,
			supported: supportedLevels(model),
		}));
		return {
			id: provider.id,
			name: provider.name ?? provider.id,
			baseUrl: provider.baseUrl,
			models,
		};
	});
	return new Catalog(providers, resolved);
}
