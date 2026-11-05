/**
 * 厂商元数据：环境变量名、中文名、官方文档、国内/海外路由建议。
 *
 * `apiKeyEnv` 与 `@earendil-works/pi-ai` 的 `dist/env-api-keys.js` 保持一致
 * （那份表是 pi-ai 自己在找不到显式 key 时的兜底来源）。模型清单不在这里写死，
 * 一律以安装目录里的实时目录为准 —— 这样 pi-ai 一升级，本仓库不用跟着改。
 */

/** @typedef {{label: string, apiKeyEnv?: string, kind?: "key"|"oauth"|"cloud", docs?: string, note?: string, alt?: string}} ProviderMeta */

/** @type {Record<string, ProviderMeta>} */
export const PROVIDER_META = {
	zai: {
		label: "Z.AI（GLM / 智谱国际站）",
		apiKeyEnv: "ZAI_API_KEY",
		docs: "https://docs.z.ai/",
		note: "pi-ai 目录里的 zai 走 openai-completions + thinkingFormat=zai，档位 low/high/max。",
		alt: "国内站请用 zai-coding-cn（open.bigmodel.cn/api/coding/paas/v4）；直接调开放平台的 chat/completions 见 README「自定义路由」一节。",
	},
	"zai-coding-cn": {
		label: "Z.AI Coding CN（智谱编码套餐·国内）",
		apiKeyEnv: "ZAI_CODING_CN_API_KEY",
		docs: "https://docs.bigmodel.cn/",
		note: "baseURL 为 open.bigmodel.cn/api/coding/paas/v4，仅覆盖官方编码工具链路。",
	},
	deepseek: {
		label: "DeepSeek（官方 API）",
		apiKeyEnv: "DEEPSEEK_API_KEY",
		docs: "https://api-docs.deepseek.com/",
		note: "pi-ai 目录带 deepseek 思考格式；deepseek-reasoner 类模型始终思考，档位很少。",
	},
	moonshotai: {
		label: "Moonshot / Kimi（国际站）",
		apiKeyEnv: "MOONSHOT_API_KEY",
		docs: "https://platform.moonshot.ai/",
	},
	"moonshotai-cn": {
		label: "Moonshot / Kimi（国内站）",
		apiKeyEnv: "MOONSHOT_API_KEY",
		docs: "https://platform.moonshot.cn/",
		note: "国内 key 与国际站同变量名，但 baseURL 是 api.moonshot.cn；两站 key 不通用。",
	},
	"kimi-coding": {
		label: "Kimi For Coding（订阅）",
		apiKeyEnv: "KIMI_API_KEY",
		docs: "https://platform.moonshot.cn/",
		note: "走 anthropic-messages 协议，档位由 pi-ai 目录给出。",
	},
	minimax: {
		label: "MiniMax（国际站）",
		apiKeyEnv: "MINIMAX_API_KEY",
		docs: "https://platform.minimaxi.com/",
	},
	"minimax-cn": {
		label: "MiniMax（国内站）",
		apiKeyEnv: "MINIMAX_CN_API_KEY",
		docs: "https://platform.minimaxi.com/",
	},
	"qwen-token-plan": {
		label: "Qwen Token Plan（阿里云国际）",
		apiKeyEnv: "QWEN_TOKEN_PLAN_API_KEY",
		docs: "https://help.aliyun.com/zh/model-studio/",
		note: "thinkingFormat=qwen，档位含 xhigh；国内用 qwen-token-plan-cn。",
	},
	"qwen-token-plan-cn": {
		label: "Qwen Token Plan（阿里云国内）",
		apiKeyEnv: "QWEN_TOKEN_PLAN_CN_API_KEY",
		docs: "https://help.aliyun.com/zh/model-studio/",
	},
	"qwen-token-plan-individual": {
		label: "Qwen Token Plan（个人版）",
		apiKeyEnv: "QWEN_TOKEN_PLAN_API_KEY",
		docs: "https://help.aliyun.com/zh/model-studio/",
	},
	xiaomi: {
		label: "Xiaomi MiMo",
		apiKeyEnv: "XIAOMI_API_KEY",
		docs: "https://platform.xiaomimimo.com/",
	},
	openai: {
		label: "OpenAI",
		apiKeyEnv: "OPENAI_API_KEY",
		docs: "https://platform.openai.com/docs/",
		note: "pi-ai 目录走 openai-responses，档位含 minimal/medium/xhigh/max。",
	},
	"openai-codex": {
		label: "OpenAI Codex（订阅）",
		kind: "oauth",
		docs: "https://developers.openai.com/",
	},
	anthropic: {
		label: "Anthropic Claude",
		apiKeyEnv: "ANTHROPIC_API_KEY",
		docs: "https://docs.anthropic.com/",
		note: "走 anthropic-messages，思考为 budget_tokens；也支持 Claude Pro/Max 订阅登录（OAuth）。",
	},
	google: {
		label: "Google Gemini",
		apiKeyEnv: "GEMINI_API_KEY",
		docs: "https://ai.google.dev/gemini-api/docs",
		note: "google-generative-ai 协议，thinkingConfig 走 budget；档位 minimal/low/medium/high。",
	},
	"google-vertex": {
		label: "Google Vertex AI",
		apiKeyEnv: "GOOGLE_CLOUD_API_KEY",
		kind: "cloud",
		docs: "https://cloud.google.com/vertex-ai/generative-ai/docs",
	},
	xai: {
		label: "xAI Grok",
		apiKeyEnv: "XAI_API_KEY",
		docs: "https://docs.x.ai/",
		note: "openai-responses 协议，档位 off/low/medium/high/xhigh。",
	},
	openrouter: {
		label: "OpenRouter（聚合，含 300+ 模型）",
		apiKeyEnv: "OPENROUTER_API_KEY",
		docs: "https://openrouter.ai/docs",
		note: "thinkingFormat=openrouter，推理模型最多，适合「一个 key 试遍所有厂商」。",
	},
	groq: {
		label: "Groq",
		apiKeyEnv: "GROQ_API_KEY",
		docs: "https://console.groq.com/docs",
	},
	cerebras: {
		label: "Cerebras",
		apiKeyEnv: "CEREBRAS_API_KEY",
		docs: "https://inference-docs.cerebras.ai/",
	},
	mistral: {
		label: "Mistral",
		apiKeyEnv: "MISTRAL_API_KEY",
		docs: "https://docs.mistral.ai/",
	},
	together: {
		label: "Together AI",
		apiKeyEnv: "TOGETHER_API_KEY",
		docs: "https://docs.together.ai/",
	},
	fireworks: {
		label: "Fireworks AI",
		apiKeyEnv: "FIREWORKS_API_KEY",
		docs: "https://docs.fireworks.ai/",
	},
	baseten: {
		label: "Baseten",
		apiKeyEnv: "BASETEN_API_KEY",
		docs: "https://docs.baseten.co/",
	},
	nvidia: {
		label: "NVIDIA NIM",
		apiKeyEnv: "NVIDIA_API_KEY",
		docs: "https://docs.nvidia.com/nim/",
	},
	huggingface: {
		label: "Hugging Face Router",
		apiKeyEnv: "HF_TOKEN",
		docs: "https://huggingface.co/docs/inference-providers",
	},
	opencode: {
		label: "OpenCode Zen",
		apiKeyEnv: "OPENCODE_API_KEY",
		docs: "https://opencode.ai/docs/zen/",
		note: "聚合网关，73 个模型全部带推理档位。",
	},
	"opencode-go": {
		label: "OpenCode Go",
		apiKeyEnv: "OPENCODE_API_KEY",
		docs: "https://opencode.ai/docs/",
	},
	"github-copilot": {
		label: "GitHub Copilot（订阅）",
		kind: "oauth",
		docs: "https://docs.github.com/copilot",
	},
	"ant-ling": {
		label: "Ant Ling",
		apiKeyEnv: "ANT_LING_API_KEY",
		docs: "https://www.ant-ling.com/",
	},
	"azure-openai-responses": {
		label: "Azure OpenAI",
		apiKeyEnv: "AZURE_OPENAI_API_KEY",
		kind: "cloud",
		docs: "https://learn.microsoft.com/azure/ai-services/openai/",
	},
	"amazon-bedrock": {
		label: "Amazon Bedrock",
		kind: "cloud",
		docs: "https://docs.aws.amazon.com/bedrock/",
		note: "凭证走 AWS_PROFILE / AWS_ACCESS_KEY_ID 或实例角色，不用 apiKeyEnv。",
	},
	"cloudflare-workers-ai": {
		label: "Cloudflare Workers AI",
		apiKeyEnv: "CLOUDFLARE_API_KEY",
		kind: "cloud",
		docs: "https://developers.cloudflare.com/workers-ai/",
	},
	"cloudflare-ai-gateway": {
		label: "Cloudflare AI Gateway",
		apiKeyEnv: "CLOUDFLARE_API_KEY",
		kind: "cloud",
		docs: "https://developers.cloudflare.com/ai-gateway/",
	},
	"vercel-ai-gateway": {
		label: "Vercel AI Gateway",
		apiKeyEnv: "AI_GATEWAY_API_KEY",
		docs: "https://vercel.com/docs/ai-gateway",
	},
	meta: {
		label: "Meta AI",
		apiKeyEnv: "META_API_KEY",
		docs: "https://ai.meta.com/",
	},
	radius: {
		label: "Radius",
		apiKeyEnv: "RADIUS_API_KEY",
		docs: "https://www.radius.dev/",
	},
};

/** 一批「开箱即用」的推荐路由（README 矩阵用的顺序）。 */
export const RECOMMENDED = [
	"zai",
	"zai-coding-cn",
	"deepseek",
	"moonshotai-cn",
	"kimi-coding",
	"minimax-cn",
	"qwen-token-plan-cn",
	"xiaomi",
	"openai",
	"anthropic",
	"google",
	"xai",
	"openrouter",
	"opencode",
	"groq",
	"mistral",
	"together",
	"fireworks",
];

export function metaOf(providerId) {
	return PROVIDER_META[providerId] ?? {};
}

/** 生成一条可粘贴的 provider 配置（路由自身不写 models，交给目录继承）。 */
export function providerPreset(catalog, providerId, { baseURL, defaultEffort } = {}) {
	const provider = catalog.provider(providerId);
	if (!provider) return undefined;
	const meta = metaOf(providerId);
	const preset = { displayName: meta.label ?? provider.name ?? providerId };
	if (meta.apiKeyEnv) preset.apiKeyEnv = meta.apiKeyEnv;
	if (baseURL) preset.baseURL = baseURL;
	else if (provider.baseUrl) preset.baseURL = provider.baseUrl;
	const levels = [];
	for (const model of provider.models) for (const level of model.supported ?? []) if (!levels.includes(level)) levels.push(level);
	if (defaultEffort) preset.reasoning = defaultEffort;
	return { providerId, preset, levels, meta, provider };
}
