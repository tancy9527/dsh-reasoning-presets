# dsh-reasoning-presets

给 [DSH（DeepSeek Harness）](https://github.com/deepseek-ai) 补齐「推理等级」滑块：
**GLM / Claude / GPT / Gemini / Kimi / Qwen / Grok / DeepSeek 等主流模型，接进来就能在模型菜单里拖档位。**

DSH 4.x 的模型菜单里，DeepSeek 官方模型下面有一条「推理等级」（`Low / High / Max` 之类）。一旦你换成自己接的模型——尤其是智谱 GLM 这种"官方目录里没有同名供应商"的——这条滑块就直接消失了，只剩下模型名。

本仓库解决的问题只有一个：**让这条滑块回来，并且对主流模型都能用。**

```console
$ node bin/cli.mjs audit
DSH 推理等级审计
路由 2 条（目录继承 0 / 手写 2）· 可修模型 3 · 警告 3

✓ glm                    手写模型
                        openai-completions · 4 个模型 · 默认档 high
                        https://open.bigmodel.cn/api/paas/v4
   glm-5.2                    关闭/低/高/最大                手写声明
   glm-5.3                    低/高/最大                     手写声明
   ...

✗ claude                 手写模型
                        anthropic-messages · 5 个模型 · 默认档未设置
   claude-fable-5             极简/低/中/高/极高/最大        缺档位 · 可修（取自 anthropic 目录）
   ...
```

---

## 30 秒根因

模型菜单里的档位不是 UI 画的，也不是插件能"加"出来的——它来自**模型描述里的 `reasoning.efforts`**。
在 `@deepseek-ai/dsh-llm-pi-ai` 这一层，这个字段由配置里的 **`reasoningEfforts`** 决定：

| 写法 | 结果 |
| --- | --- |
| 模型条目里没有 `reasoningEfforts` | DSH 判定该模型 **`reasoning: false`** → 菜单里**没有**推理等级 |
| `reasoningEfforts: { low: "low", high: "high", max: "max" }` | 菜单出现 **低 / 高 / 最大** 三档 |
| 键是档位名，值是发给厂商的**线上取值**（可与键不同，例如 `max: "high"`） | 灵活适配各家奇怪的命名 |
| `reasoningEfforts: false` | 明确声明"这是非推理模型" |

为什么 GLM 会踩坑：`llm-pi-ai` 解析配置时，**只有路由 id 与 pi-ai 内置供应商同名时**才会回填目录里的推理信息。
智谱 GLM 在 pi-ai 里的 id 是 `zai` / `zai-coding-cn`；你写成 `glm`，就成了自定义路由 → 没有目录可继承 → 模型全部退化成非推理模型 → 滑块消失。

所以修复方式有两条，本仓库都支持：

1. **路由改叫 `zai`**（或 `deepseek` / `openai` …），模型和档位全部继承 pi-ai 目录 —— 零维护；
2. 保留自定义路由 `glm`，但给每个模型**显式写 `reasoningEfforts`** —— 本仓库 CLI 会自动从目录里查出正确档位并填好。

---

## 快速开始

### 方式一：命令行体检（推荐先跑这个）

```console
# 克隆到任意位置
git clone https://github.com/<you>/dsh-reasoning-presets.git
cd dsh-reasoning-presets

# 1. 看看现在哪些模型有滑块、哪些缺
node bin/cli.mjs audit

# 2. 预演修复（不写盘）
node bin/cli.mjs fix

# 3. 真的写进去（会先生成带时间戳的 .bak 备份）
node bin/cli.mjs fix --write

# 4. 想新增一家供应商：只写 4 行，模型和档位全部继承目录
node bin/cli.mjs init deepseek openai anthropic google xai --write
```

改完 **不用重启 DSH**：profile 里的 `cordis.patch.yml` 在 DSH 的 HMR 监听列表里，保存即生效，模型菜单随即出现档位。

默认操作 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml`；多 profile 用 `--profile`，或 `--patch <文件>` 直接指定。

### 方式二：装成 DSH 插件

仓库带 `dsh.bundle.patch`，可由 DSH 作为 bundle 安装（插件面板安装本地路径，或让 agent 调 `plugin_manager install_bundle`）。装好后多一个只读为主的工具 `reasoning_presets`：

```text
reasoning_presets action=audit
reasoning_presets action=fix write=true
reasoning_presets action=init providers=["deepseek","openai","anthropic"] write=true
reasoning_presets action=list
```

它本身**不改 UI、不接管菜单**——滑块的来源始终是配置里的 `reasoningEfforts`。

### 方式三：手改 YAML

`~/.dsh/profiles/desktop/cordis.patch.yml`，找到 `llm-pi-ai` 条目，在 `config.providers` 下：

```yaml
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      # ① 自定义路由：必须自己写档位
      glm:
        displayName: GLM
        apiKeyEnv: GLM_API_KEY
        api: openai-completions          # 注意不是 openai-responses，见 docs/PLUMBING.md
        baseURL: https://open.bigmodel.cn/api/paas/v4
        reasoning: high                  # 默认档；不写的话菜单会多一项「Default」
        compat:
          thinkingFormat: zai
          supportsReasoningEffort: true
          maxTokensField: max_tokens
          supportsStore: false
        models:
          - id: glm-5.2
            name: GLM-5.2
            reasoningEfforts: { off: none, low: low, high: high, max: max }
          - id: glm-5.3
            name: GLM-5.3
            reasoningEfforts: { low: low, high: high, max: max }   # 5.3 不能关闭思考

      # ② 路由名与 pi-ai 目录同名：模型和档位全部继承，一行模型都不用写
      deepseek:
        apiKeyEnv: DEEPSEEK_API_KEY
        reasoning: high
```

---

## 支持的主流模型（节选）

档位为「在该供应商下能选到的等级」。全量 41 家见 [docs/MATRIX.md](docs/MATRIX.md)。

| 供应商 id | 名称 | 档位 |
| --- | --- | --- |
| `zai` | Z.AI（GLM 国际站） | 关闭 / 极简 / 低 / 中 / 高 / 最大 |
| `zai-coding-cn` | Z.AI Coding（国内套餐） | 关闭 / 极简 / 低 / 中 / 高 / 最大 |
| `deepseek` | DeepSeek 官方 API | 关闭 / 低 / 高 / 最大 |
| `anthropic` | Anthropic Claude | 关闭 / 极简 / 低 / 中 / 高 / 极高 / 最大 |
| `openai` | OpenAI | 关闭 / 极简 / 低 / 中 / 高 / 极高 / 最大 |
| `google` | Google Gemini | 关闭 / 极简 / 低 / 中 / 高 |
| `xai` | xAI Grok | 关闭 / 低 / 中 / 高 / 极高 |
| `moonshotai` | Moonshot / Kimi | 关闭 / 极简 / 低 / 中 / 高 / 最大 |
| `qwen-token-plan-cn` | 阿里云 Qwen | 关闭 / 极简 / 低 / 中 / 高 / 极高 / 最大 |
| `openrouter` | OpenRouter 聚合 | 关闭 / 极简 / 低 / 中 / 高 / 极高 / 最大 |

> 表里的档位来自你本机安装的 pi-ai 目录（`node_modules/@earendil-works/pi-ai`），
> 版本不同可能略有出入——以 `node bin/cli.mjs list` 的输出为准。

---

## 命令参考

| 命令 | 作用 |
| --- | --- |
| `root` | 打印探测到的 DSH 安装目录 / pi-ai 目录 / 补丁文件 |
| `list [--all] [--markdown]` | 列目录里各供应商的档位 |
| `audit [--json] [--markdown]` | 体检 profile：谁有滑块、谁缺、为什么缺 |
| `fix [--write] [--effort high] [--no-default]` | 补 `reasoningEfforts` / `api` / `compat` / 默认档 |
| `init <id...> [--write] [--base-url id=url,...]` | 按供应商 id 新增路由（继承目录） |

公共参数：`--profile <dir>`、`--patch <file>`、`--dsh-root <dir>`、`--markdown`、`--json`。
`--dsh-root` 省略时会依次探测 `DSH_APP_ROOT`、`%LOCALAPPDATA%\Programs\DSH Desktop\resources\app`、
`%ProgramFiles%\DSH Desktop\resources\app`、macOS 的 `/Applications/DSH Desktop.app/Contents/Resources/app` 等。

---

## 常见问题

**菜单里为什么会多出一项「Default」？**
当模型没有默认档（配置里没有 `reasoning`）时，DSH 会额外给一项「Default」，选中它等于**不发送任何 effort**。
对 GLM-5.3 这种"禁止关闭思考"的模型，这可能被厂商直接 400 拒绝。本仓库的 `fix` 会自动补一个默认档（默认 `high`），
补了之后「Default」就不再出现。

**GLM-5.3 系列为什么没有「关闭」？**
智谱官方文档明确：GLM-5.3 / 5.3-Flash / 5.3-FlashX **不再支持关闭思考**，`thinking.type` 传 `disabled` 会报错；
`reasoning_effort` 也**只接受 `low` / `high` / `max`**。所以本仓库对这三款只声明这三档。GLM-5.2 仍支持 `none`（= 关闭）。

**报 429 是不是档位配错了？**
多半不是。智谱在**余额不足 / 无可用资源包**时也返回 HTTP 429（`{"error":{"code":"1113",...}}`），
容易被当成限流。先看响应体里的 `code`：`1113` = 欠费，`1305` = 真·限流。

**为什么不干脆全部用 `zai` 路由？**
当然可以，而且更省事。`init` 就是这么干的。保留自定义 `glm` 路由的价值在于：多个 baseURL / 多把 key / 只挑部分模型时更清晰。

**会不会改坏我的配置？**
写盘前先复制 `<文件>.<ISO时间戳>.bak`；解析失败直接报错不写；所有修复都是"只加不改"（你已显式写过的字段不覆盖）。
另外 `fix` 的入参文档是深拷贝，dry-run 与 `--json` 都不碰文件。

**Windows 上写入被沙箱拦？**
DSH 默认 workspace-write 策略只允许写工作区。要么在本仓库目录外手动跑 `fix --write`，
要么让 agent 用 danger-full-access 重试那一次写入。

---

## 目录结构

```
lib/levels.mjs    档位语义：supportedLevels / effortsFor / pickDefaultLevel（对齐 pi-ai 判据）
lib/catalog.mjs   读本机 pi-ai 目录（41 家供应商、模型、thinkingLevelMap）
lib/presets.mjs   厂商中文名 / API Key 环境变量 / 推荐路由
lib/patch.mjs     cordis.patch.yml 的解析、序列化、备份写入
lib/audit.mjs     体检与修复的纯函数（不碰 IO）
lib/render.mjs    文本 / markdown 渲染
lib/index.mjs     DSH 插件入口（reasoning_presets 工具）
bin/cli.mjs       命令行
docs/PLUMBING.md  机制细节：继承规则、reasoningEfforts、compat 白名单、各家 wire 差异
docs/MATRIX.md    全量厂商档位矩阵（由 list 生成）
```

想深入了解 DSH 是怎么把 `reasoningEfforts` 变成菜单项的，看 [docs/PLUMBING.md](docs/PLUMBING.md)。

---

## License

MIT
