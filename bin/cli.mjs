#!/usr/bin/env node
/**
 * dsh-reasoning-presets CLI —— 不改 DSH 源码，只调 profile 里的 llm-pi-ai 配置。
 *
 *   dsh-reasoning root            打印探测到的 DSH / pi-ai 目录
 *   dsh-reasoning list            列目录里各厂商可选的推理档位
 *   dsh-reasoning audit           体检 profile：谁有滑块、谁缺
 *   dsh-reasoning check           漂移检查：脏就 exit 1（给 CI / pre-commit 用）
 *   dsh-reasoning fix --write     给缺档位的路由补 reasoningEfforts / compat / 默认档
 *   dsh-reasoning init zai openai 新增路由（继承目录，天然有滑块）
 *
 * 公共参数：--profile <dir>  --patch <file>  --dsh-root <dir>  --json  --markdown
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { loadCatalog } from "../lib/catalog.mjs";
import { auditDoc, checkDoc, fixDoc, initDoc } from "../lib/audit.mjs";
import { readPatchFile, stringifyPatch, writePatchFile } from "../lib/patch.mjs";
import {
	renderAuditMarkdown,
	renderAuditText,
	renderCatalogMarkdown,
	renderCatalogText,
	renderChanges,
	renderCheckText,
} from "../lib/render.mjs";

const HELP = `用法：dsh-reasoning <命令> [参数]

命令
  root                     打印探测到的 DSH 安装目录与 pi-ai 目录
  list                     列出 pi-ai 目录里各厂商的推理档位（--all 显示全部 41 家）
  audit                    体检当前 profile 的 llm-pi-ai 配置
  check                    漂移检查：配置落后于目录/家族规则就非零退出（给 CI 用）
  fix                      给缺档位的路由补 reasoningEfforts / compat / 默认档
  init <provider...>       新增路由（路由 id 与 pi-ai 目录同名即可继承全部档位）
  help                     显示本帮助

参数
  --profile <dir>          profile 目录，默认 %USERPROFILE%\\.dsh\\profiles\\desktop
  --patch <file>           直接指定 cordis.patch.yml
  --dsh-root <dir>         DSH 安装目录（含 node_modules/@earendil-works/pi-ai）
  --write                  真的写盘（不写就只打印，等价 dry-run）
  --strict                 check 时把提示级（info）也算漂移
  --effort <level>         指定默认档，默认自动选 high→medium→max→low
  --no-default             不要自动补默认档
  --markdown               以 markdown 输出（方便贴 issue / README）
  --all                    list 时显示目录里全部供应商
  --json                   以 JSON 输出审计结果
`;

function parseArgs(argv) {
	const options = { flags: new Set(), values: new Map(), rest: [] };
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === "--") {
			options.rest.push(...argv.slice(index + 1));
			break;
		}
		if (!token.startsWith("--")) {
			options.rest.push(token);
			continue;
		}
		const equal = token.indexOf("=");
		if (equal > 0) {
			options.values.set(token.slice(2, equal), token.slice(equal + 1));
			continue;
		}
		const key = token.slice(2);
		const next = argv[index + 1];
		if (next !== undefined && !next.startsWith("--")) {
			options.values.set(key, next);
			index += 1;
			continue;
		}
		options.flags.add(key);
	}
	return options;
}

function defaultProfileDir() {
	const home = homedir();
	return join(home, ".dsh", "profiles", "desktop");
}

function patchFileOf(options) {
	const explicit = options.values.get("patch");
	if (explicit) return resolve(explicit);
	const profile = resolve(options.values.get("profile") ?? defaultProfileDir());
	return join(profile, "cordis.patch.yml");
}

function fail(message) {
	process.stderr.write(`${message}\n`);
	process.exitCode = 1;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const command = options.rest[0] ?? "help";
	const dshRoot = options.values.get("dsh-root") ?? process.env.DSH_APP_ROOT;

	if (command === "help" || options.flags.has("help")) {
		process.stdout.write(HELP);
		return;
	}

	const catalog = await loadCatalog({ root: dshRoot });

	if (command === "root") {
		process.stdout.write(`DSH 安装目录：${catalog.origin ?? "(未知)"}\n`);
		process.stdout.write(`pi-ai 目录：${join(catalog.origin ?? "", "node_modules", "@earendil-works", "pi-ai")}\n`);
		process.stdout.write(`profile 补丁：${patchFileOf(options)}\n`);
		return;
	}

	if (command === "list") {
		const text = options.flags.has("markdown")
			? renderCatalogMarkdown(catalog, { all: options.flags.has("all") })
			: renderCatalogText(catalog, { all: options.flags.has("all") });
		process.stdout.write(text);
		return;
	}

	const file = patchFileOf(options);
	if (!existsSync(file)) {
		fail(`找不到 ${file}\n用 --profile 或 --patch 指定，或先在 DSH 里配置一个模型。`);
		return;
	}
	const patch = await readPatchFile(file, catalog.origin);

	if (command === "audit") {
		const report = auditDoc(patch.doc, catalog);
		if (options.flags.has("json")) {
			process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
			return;
		}
		process.stdout.write(
			options.flags.has("markdown")
				? renderAuditMarkdown(report, { profile: file })
				: renderAuditText(report, { profile: file, root: catalog.origin }),
		);
		return;
	}

	if (command === "check") {
		const strict = options.flags.has("strict");
		const result = checkDoc(patch.doc, catalog, { strict });
		if (options.flags.has("json")) {
			process.stdout.write(
				`${JSON.stringify({ clean: result.clean, strict, drift: result.drift, summary: result.report.summary }, null, 2)}\n`,
			);
		} else {
			process.stdout.write(renderCheckText(result, { file, strict }));
		}
		if (!result.clean) process.exitCode = 1;
		return;
	}

	if (command === "fix" || command === "init") {
		const dryRun = !options.flags.has("write");
		const common = {
			applyDefault: !options.flags.has("no-default"),
			defaultEffort: options.values.get("effort"),
		};
		if (command === "init" && options.rest.length <= 1) {
			fail("init 需要至少一个供应商 id，例如：dsh-reasoning init zai openai anthropic");
			return;
		}
		const result =
			command === "fix"
				? fixDoc(patch.doc, catalog, common)
				: initDoc(patch.doc, catalog, options.rest.slice(1), {
						defaultEffort: common.defaultEffort,
						baseURLs: collectBaseURLs(options),
					});
		if (result.changes.length === 0) {
			process.stdout.write(renderChanges(result, { dryRun, file }));
			return;
		}
		if (dryRun) {
			process.stdout.write(renderChanges(result, { dryRun: true, file }));
			process.stdout.write("\n加上 --write 才会真正写入（会先生成 .bak 备份）。\n");
			return;
		}
		const nextText = await stringifyPatch(result.doc, patch.header, catalog.origin);
		const backup = await writePatchFile(file, nextText);
		process.stdout.write(renderChanges(result, { dryRun: false, file }));
		if (backup) process.stdout.write(`\n原文件已备份：${backup}\n`);
		return;
	}

	fail(`未知命令：${command}\n\n${HELP}`);
}

function collectBaseURLs(options) {
	const out = {};
	const raw = options.values.get("base-url");
	if (!raw) return out;
	for (const item of String(raw).split(",")) {
		const [id, ...rest] = item.split("=");
		if (id && rest.length > 0) out[id.trim()] = rest.join("=").trim();
	}
	return out;
}

const invokedDirectly =
	process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
	main().catch((error) => {
		fail(error?.stack ?? String(error));
	});
}

// 便于在测试里直接引用
export { parseArgs };
