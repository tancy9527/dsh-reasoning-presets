/**
 * `cordis.patch.yml` 的读写与结构操作。
 *
 * DSH 的 profile 补丁是一个顶层 YAML 数组，每个元素要么按 id 覆盖某条插件配置，
 * 要么 `insert:` 新行。LLM 厂商全部挂在 `llm-pi-ai` 这一条的 `config.providers`
 * 下面，所以本仓库只碰这一块，其余内容原样保留。
 */

import { existsSync } from "node:fs";
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const LLM_PI_AI_ID = "llm-pi-ai";
export const LLM_PI_AI_PACKAGE = "@deepseek-ai/dsh-llm-pi-ai";

let yamlModule;

/** 优先用本包依赖的 yaml；没有就借 DSH 安装目录里自带的那份。 */
export async function loadYaml(root) {
	if (yamlModule) return yamlModule;
	try {
		yamlModule = await import("yaml");
		return yamlModule;
	} catch {
		/* 继续找 DSH 自带的 */
	}
	const candidates = [];
	if (root) candidates.push(root);
	if (typeof process.resourcesPath === "string") candidates.push(join(process.resourcesPath, "app"));
	for (const base of candidates) {
		const file = join(base, "node_modules", "yaml", "dist", "index.js");
		if (existsSync(file)) {
			yamlModule = await import(pathToFileURL(file).href);
			return yamlModule;
		}
	}
	throw new Error("找不到 yaml 模块：在仓库目录执行 npm install，或用 --dsh-root 指向 DSH 安装目录");
}

/** 拆出文件头的注释块（我们重写时原样保留它）。 */
export function splitHeader(text) {
	const lines = text.split(/\r?\n/);
	let index = 0;
	while (index < lines.length && (lines[index].trim() === "" || lines[index].trimStart().startsWith("#"))) {
		index += 1;
	}
	return { header: lines.slice(0, index).join("\n"), body: lines.slice(index).join("\n") };
}

export async function parsePatch(text, root) {
	const yaml = await loadYaml(root);
	const { header } = splitHeader(text);
	const doc = yaml.parse(text) ?? [];
	if (!Array.isArray(doc)) throw new Error("cordis.patch.yml 的顶层必须是数组（loader patch 列表）");
	return { doc, header };
}

export async function stringifyPatch(doc, header, root) {
	const yaml = await loadYaml(root);
	const body = yaml.stringify(doc, { lineWidth: 0, indent: 2 });
	return header && header.trim() !== "" ? `${header.replace(/\s+$/, "")}\n${body}` : body;
}

export async function readPatchFile(file, root) {
	const text = await readFile(file, "utf8");
	const { doc, header } = await parsePatch(text, root);
	return { file, text, doc, header };
}

/** 重写补丁文件，先留一份 `.bak`。 */
export async function writePatchFile(file, text) {
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const backup = `${file}.${stamp}.bak`;
	await copyFile(file, backup);
	await writeFile(file, text, "utf8");
	return backup;
}

export function isLlmPiAiEntry(entry) {
	if (!entry || typeof entry !== "object") return false;
	if (entry.id === LLM_PI_AI_ID) return true;
	return typeof entry.name === "string" && entry.name.includes("dsh-llm-pi-ai");
}

export function findLlmPiAiEntry(doc) {
	return doc.find((entry) => isLlmPiAiEntry(entry));
}

/** 取 `config.providers`（没有就 undefined）。 */
export function providersConfig(doc) {
	const entry = findLlmPiAiEntry(doc);
	return entry?.config?.providers;
}

/** 取 `config.providers`，没有就建出来（需要时补一条 llm-pi-ai）。 */
export function ensureProvidersConfig(doc) {
	let entry = findLlmPiAiEntry(doc);
	if (!entry) {
		entry = { id: LLM_PI_AI_ID, name: LLM_PI_AI_PACKAGE, config: { providers: {} } };
		doc.push(entry);
	}
	if (!entry.config || typeof entry.config !== "object") entry.config = {};
	if (!entry.config.providers || typeof entry.config.providers !== "object") entry.config.providers = {};
	return entry.config.providers;
}

/** 把 provider 配置统一成对象（允许 null）。 */
export function normalizeProviderConfig(value) {
	return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/** 模型列表统一成对象数组（`- id: x` 或裸字符串都接受）。 */
export function normalizeModels(value) {
	if (!Array.isArray(value)) return [];
	return value.map((model) => {
		if (typeof model === "string") return { id: model };
		return model && typeof model === "object" ? { ...model } : { id: String(model) };
	});
}
