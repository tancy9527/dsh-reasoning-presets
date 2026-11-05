# 机制细节：`reasoningEfforts` 是怎样变成菜单里的档位的

这份文档记录 **DSH 2.0.x / `@deepseek-ai/dsh-llm-pi-ai` 0.2.x / `@earendil-works/pi-ai`** 的实际行为，
全部来自阅读打包产物与本地实测，不是推测。升级版本后如果行为变了，以 `node bin/cli.mjs audit` 的结果为准。

---

## 1. 一条调用链

```
profile/cordis.patch.yml
   └─ id: llm-pi-ai  →  config.providers.<路由名>.models[].reasoningEfforts
          │
          ├─ resolveRouteModels()      ← 决定 api / baseURL / 继承哪份目录
          │      ├─ catalogModels(路由名)        —— 路由名 == pi-ai 供应商 id 时才有值
          │      ├─ resolveModelReasoning()      —— 没有 reasoningEfforts 就 reasoning:false
          │      └─ resolveModelCompat()
          │
          ├─ reasoningInfo()           —— 只有 reasoning 为真才产出 efforts
          │      └─ getSupportedThinkingLevels(model)
          │
          └─ 客户端菜单（client-ui-model-selection）
                 └─ effortChoices({ efforts, defaultEffort })
                        └─ 有 efforts 才画「推理等级」这一行
```

关键判定（`dsh-llm-pi-ai/lib/index.js`）：

```js
// resolveModelReasoning —— 手写模型没有 reasoningEfforts 就直接 false
const efforts = entry.reasoningEfforts;
if (efforts === void 0) return { reasoning: base?.reasoning ?? false };

// reasoningInfo —— reasoning 为假时什么都不产出，菜单自然没有档位行
if (!model.reasoning) return {};
return { reasoning: { efforts: ..., defaultEffort: ... } };
```

> 结论：**插件无法凭空创造档位**。菜单那行是"配置驱动"的，插件最多能改写到
> `directory.select({ provider, model, reasoningEffort })` 这一步——而 `reasoningEffort`
> 必须是模型已经声明过的档位，否则抛 `UNSUPPORTED_REASONING_EFFORT`。

---

## 2. `reasoningEfforts` 的四种写法

| 配置 | DSH 解析结果 | 菜单表现 |
| --- | --- | --- |
| 不写 | `reasoning: false` | 无档位行 |
| `{ low: "low", high: "high", max: "max" }` | 三档 | 低 / 高 / 最大 |
| `{ off: null, high: "high" }` | `off` 表示"支持关闭且关闭时不发参数" | 关闭 / 高 |
| `false` | 非推理模型 | 无档位行 |

其它规则：

- **键**是档位名，只能是 `off / minimal / low / medium / high / xhigh / max` 之一；
- **值**是发给厂商的**线上取值**，可以任意字符串，甚至可以与键不同（例如 `max: "high"`）；
- 只写 `off` 会被拒绝：`model "<id>" reasoningEfforts offers no level beyond "off"`；
- 选中"关闭"时，zai / deepseek 这类实现会**整个不发** `thinking` / `reasoning_effort`，
  所以 `off` 写 `null` 或干脆省略值，效果一样。

本仓库的 `effortsFor()`（`lib/levels.mjs`）就是 `getSupportedThinkingLevels()` 的精确逆运算：
把目录里 `thinkingLevelMap` 的"支持矩阵"翻译回 `reasoningEfforts` 字典。

`getSupportedThinkingLevels()` 的判据（与 `lib/levels.mjs` 保持一致）：

- `thinkingLevelMap[level] === null` → 不支持；
- `xhigh` / `max` 必须**显式**给出（`undefined` 视为不支持）；
- 其余基础档 `undefined` → 支持，按档位名直接下发。

---

## 3. 继承规则：路由名决定一切

```js
// resolveRouteModels
const defaults = catalogModels(request.provider);   // 路由名 → pi-ai 内置供应商
const base = defaults?.get(entry.id);               // 型号名 → 目录里的模型描述
const api = request.api ?? base?.api ?? routeApi;
```

由此得到三条实用结论：

1. **路由名 == pi-ai 供应商 id**（`zai` / `deepseek` / `openai` / `anthropic` / `google` …）
   → 每个模型都能按 id 从目录继承 `reasoning` / `thinkingLevelMap` / `compat`，**一行模型都不用写**。
2. **路由名自定义**（`glm` / `my-gpt` / `公司网关`）
   → `base` 为 `undefined`，继承全部落空；`api`、`reasoningEfforts`、`compat` 都得自己写，
   否则模型就是"非推理模型"。
3. **写了 `models` 列表也不影响按 id 继承**：列表里同名的型号照样拿目录兜底，
   只有目录里没有的型号（新模型 / 私有模型）才必须手写。

`models` 列表另外还有一个语义：**它会替换掉未列出的模型**。想只暴露部分模型时用它；
想全都要就别写 `models`。

---

## 4. `compat` 白名单：写错一个字都会被拒

`compat` 是"这个厂商的 wire 协议有哪些怪癖"的开关集合，**每个协议只接受自己那批字段**：

| 协议 | 可写字段 |
| --- | --- |
| `openai-completions` | `supportsStore`、`supportsDeveloperRole`、`supportsReasoningEffort`、`supportsUsageInStreaming`、`supportsFinishReason`、`maxTokensField`、`requiresToolResultName`、`requiresAssistantAfterToolResult`、`requiresThinkingAsText`、`requiresReasoningContentOnAssistantMessages`、`thinkingFormat`、`supportsThinkingTokenBudget`、`thinkingTokenBudgetField`、`supportsStrictMode`、`cacheControlFormat`、`supportsLongCacheRetention` |
| `openai-responses` | `supportsDeveloperRole`、`supportsMaxOutputTokens`、`supportsStrictMode`、`supportsLongCacheRetention` |

差异化处理：

- **路由级** `compat` 里放了某协议不认识的字段 → **静默跳过**（无害）；
- **模型级** `compat` 里放了不认识的字段 → **直接报错**（`model "<id>" sets compat "<field>", but its api is "..."`）；
- 任何协议都不存在的字段 → `assertOfferedCompatFields` 拒绝（文案含 `which is not configurable here`）；
  例如 `zaiToolStream` 属于 pi-ai 内部保留字段，配置文件里写不了。

`lib/audit.mjs` 的 `API_COMPAT_FIELDS` 就是照抄这张表，所以它生成的 `compat` 一定能被 Config 接受。

---

## 5. 各家 wire 差异（为什么必须选对 `thinkingFormat`）

`thinkingFormat` 只在 `openai-completions` 协议下有效，取值：
`openai`、`deepseek`、`openrouter`、`together`、`baseten`、`zai`、`qwen`、`chat-template`、
`qwen-chat-template`、`string-thinking`、`ant-ling`。

以 `zai` 为例（`pi-ai/dist/api/openai-completions.js`）：

```js
if (compat.thinkingFormat === "zai" && model.reasoning) {
  zaiParams.thinking = options?.reasoningEffort
    ? { type: "enabled", clear_thinking: false }
    : { type: "disabled" };
  if (options?.reasoningEffort && compat.supportsReasoningEffort) {
    const mapped = model.thinkingLevelMap?.[options.reasoningEffort];
    const effort = mapped === undefined ? options.reasoningEffort : mapped;
    if (typeof effort === "string") zaiParams.reasoning_effort = effort;
  }
}
```

翻译成人话：**智谱要的是 `thinking.type` + `reasoning_effort` 两个字段**，
`thinkingFormat: zai` + `supportsReasoningEffort: true` 才能生成它们；`maxTokensField: max_tokens` 也常需要。

`openai-responses` 走的是另一条路（`pi-ai/dist/api/openai-responses.js`）：发 `reasoning: { effort, summary: "auto" }`，
且 URL 是 `baseURL + "/responses"`。

---

## 6. 为什么 GLM 要用 `openai-completions` 而不是 `openai-responses`

这一条最容易踩：

- 智谱的 **chat completions** 在 `https://open.bigmodel.cn/api/paas/v4/chat/completions`；
- 智谱的 **Response API** 在 `https://open.bigmodel.cn/api/v1/responses`（注意是 `/api/v1`，不是 `/api/paas/v4`）。

如果按 `api: openai-responses` + `baseURL: https://open.bigmodel.cn/api/paas/v4/` 去配，
拼出来的却是 `/api/paas/v4/responses` —— 一个不存在的端点。
并且 `openai-responses` 的 compat 白名单里**没有** `thinkingFormat` / `supportsReasoningEffort`，
你连"让它发智谱格式"的开关都写不了。

所以 GLM 的正确姿势是 `api: openai-completions` + `compat.thinkingFormat: zai`，
与本仓库一致，也与 pi-ai 自带的 `zai` 供应商一致。

---

## 7. 「Default」那一项是什么

`client-ui-model-selection` 的菜单项构造：

```js
const effortChoices = efforts.map(...);
if (reasoning.defaultEffort === void 0) {
  effortChoices.push({ key: "provider-default", effort: void 0, label: t("effort.providerDefault") });
}
```

即：**没有默认档时，菜单会多一项「Default」**，它的含义是"不发送 effort"，由厂商自己决定。

- 对 GLM-5.3 / 5.3-Flash / 5.3-FlashX：厂商文档写明"禁止关闭思考"，`disabled` 会报错 → Default 有 400 风险；
- 对 GLM-5.2 / DeepSeek：Default 一般无害（厂商有默认值）。

默认档来自路由级 `reasoning:`，取值为 `off / minimal / low / medium / high / xhigh / max`。
`describableReasoningLevel()` 只在该档属于模型的 `getSupportedThinkingLevels()` 时才认，
否则当作没设。所以 `fix` 补默认档时会先算**所有模型的档位交集**，再按 `high → medium → max → low` 挑。

---

## 8. 常见报错对照

| 报错 | 含义 | 处理 |
| --- | --- | --- |
| `UNSUPPORTED_REASONING_EFFORT` | 请求的档位不在模型声明的列表里 | `audit` 看真实档位；或补 `reasoningEfforts` |
| `model "<id>" reasoningEfforts offers no level beyond "off"` | 只声明了关闭 | 至少要有一个真正的档位 |
| `sets compat "<field>", but its api is "..."` | 模型级 compat 写了该协议不接受的字段 | 删掉，或换协议 |
| `... which is not configurable here` | 字段不属于任何协议（如 `zaiToolStream`） | 删掉 |
| `provider "<p>" names api "<api>", which this build cannot serve` | 协议名写错 | 用 `openai-completions` / `openai-responses` / `anthropic-messages` 等受支持的名字 |
| HTTP 429 `{"error":{"code":"1113"}}` | 智谱余额/资源包不足（**不是限流**） | 充值或换 key |
| HTTP 429 `{"error":{"code":"1305"}}` | 智谱真·限流 | 退避重试 |

---

## 9. 如何自己验证（不改任何东西）

```console
# 1. 目录侧：这个型号到底支持哪些档位
node bin/cli.mjs list --all | Select-String -Pattern 'glm-5.3'

# 2. 配置侧：DSH 会解析成什么
node bin/cli.mjs audit --json

# 3. 线上侧：抓一次真实请求体（无需真的发出去）
#    思路是用假 fetch 截获 pi-ai 的 streamSimple 请求，检查是否带上了
#    thinking: { type: "enabled" } 与 reasoning_effort
```

第 3 步的要点：`piCompletions.streamSimple(model, context, options)` 读的是 **`options.reasoning`**
（不是 `reasoningEffort`），内部会用 `clampThinkingLevel()` 把 `"off"` 转成 `undefined`；
真正写 wire 字段的是 `stream()` 里的 `buildParams()`。DSH 侧的 `profileOptions()` 同样把 `"off"` 转成 `undefined`。
两边一致，所以"关闭"= 不发参数字段。
