# 主流模型推理档位矩阵

档位一列表示**在这个供应商下**可选到的推理等级。`off` 之外的档位越靠右越深；`—` 表示该供应商的模型不可调档。

| 供应商 | 名称 | API Key | 档位 | 代表模型 |
| --- | --- | --- | --- | --- |
| `amazon-bedrock` | Amazon Bedrock | — | 关闭/极简/低/中/高/极高/最大 | `amazon.nova-2-lite-v1:0`、`amazon.nova-lite-v1:0`、`amazon.nova-micro-v1:0` |
| `ant-ling` | Ant Ling | `ANT_LING_API_KEY` | 高/极高 | `Ling-2.6-1T`、`Ling-2.6-flash`、`Ring-2.6-1T` |
| `anthropic` | Anthropic Claude | `ANTHROPIC_API_KEY` | 关闭/极简/低/中/高/极高/最大 | `claude-fable-5`、`claude-fable-5-1`、`claude-haiku-4-5` |
| `azure-openai-responses` | Azure OpenAI | `AZURE_OPENAI_API_KEY` | 关闭/极简/低/中/高/极高/最大 | `gpt-4`、`gpt-4-turbo`、`gpt-4.1` |
| `baseten` | Baseten | `BASETEN_API_KEY` | 关闭/极简/低/中/高/极高/最大 | `deepseek-ai/DeepSeek-V4-Flash-0731`、`deepseek-ai/DeepSeek-V4-Pro`、`deepseek-ai/DeepSeek-V4-Pro-0813` |
| `cerebras` | Cerebras | `CEREBRAS_API_KEY` | 关闭/低/中/高 | `gpt-oss-120b`、`qwen-3.8-27b` |
| `cloudflare-ai-gateway` | Cloudflare AI Gateway | `CLOUDFLARE_API_KEY` | 关闭/极简/低/中/高/极高/最大 | `claude-fable-5`、`claude-fable-5.1`、`claude-haiku-4.5` |
| `cloudflare-workers-ai` | Cloudflare Workers AI | `CLOUDFLARE_API_KEY` | 关闭/极简/低/中/高/极高/最大 | `@cf/deepseek-ai/deepseek-v4-flash-0731`、`@cf/deepseek-ai/deepseek-v4-pro-0813`、`@cf/google/gemma-4-26b-a4b-it` |
| `deepseek` | DeepSeek（官方 API） | `DEEPSEEK_API_KEY` | 关闭/低/高/最大 | `deepseek-flash`、`deepseek-v4-pro` |
| `fireworks` | Fireworks AI | `FIREWORKS_API_KEY` | 关闭/极简/低/中/高/极高/最大 | `accounts/fireworks/models/deepseek-v4-flash-0731`、`accounts/fireworks/models/deepseek-v4-flash-vision-exp`、`accounts/fireworks/models/deepseek-v4-pro` |
| `github-copilot` | GitHub Copilot（订阅） | — | 关闭/极简/低/中/高/极高/最大 | `claude-fable-5`、`claude-fable-5.1`、`claude-haiku-4.5` |
| `google` | Google Gemini | `GEMINI_API_KEY` | 关闭/极简/低/中/高 | `deep-research-max-preview-04-2026`、`deep-research-preview-04-2026`、`gemini-2.5-computer-use-preview-10-2025` |
| `google-vertex` | Google Vertex AI | `GOOGLE_CLOUD_API_KEY` | 关闭/极简/低/中/高 | `gemini-2.5-flash`、`gemini-2.5-flash-lite`、`gemini-2.5-pro` |
| `groq` | Groq | `GROQ_API_KEY` | 关闭/低/中/高 | `llama-3.1-8b-instant`、`llama-3.3-70b-versatile`、`openai/gpt-oss-120b` |
| `huggingface` | Hugging Face Router | `HF_TOKEN` | 关闭/极简/低/中/高/极高/最大 | `MiniMaxAI/MiniMax-M2`、`MiniMaxAI/MiniMax-M2.1`、`MiniMaxAI/MiniMax-M2.5` |
| `kimi-coding` | Kimi For Coding（订阅） | `KIMI_API_KEY` | 关闭/极简/低/中/高/最大 | `k3`、`k3-256k`、`kimi-for-coding` |
| `meta` | Meta AI | `META_API_KEY` | 极简/低/中/高/极高/最大 | `muse-spark-1.1`、`muse-spark-1.2`、`muse-spark-1.2-contributor` |
| `minimax` | MiniMax（国际站） | `MINIMAX_API_KEY` | 关闭/极简/低/中/高 | `MiniMax-M2.7`、`MiniMax-M2.7-highspeed`、`MiniMax-M3` |
| `minimax-cn` | MiniMax（国内站） | `MINIMAX_CN_API_KEY` | 关闭/极简/低/中/高 | `MiniMax-M2.7`、`MiniMax-M2.7-highspeed`、`MiniMax-M3` |
| `mistral` | Mistral | `MISTRAL_API_KEY` | 关闭/极简/低/中/高 | `codestral-latest`、`devstral-2512`、`devstral-latest` |
| `moonshotai` | Moonshot / Kimi（国际站） | `MOONSHOT_API_KEY` | 关闭/极简/低/中/高/最大 | `kimi-k2.6`、`kimi-k2.7-code`、`kimi-k2.7-code-highspeed` |
| `moonshotai-cn` | Moonshot / Kimi（国内站） | `MOONSHOT_API_KEY` | 关闭/极简/低/中/高/最大 | `kimi-k2.6`、`kimi-k2.7-code`、`kimi-k2.7-code-highspeed` |
| `nvidia` | NVIDIA NIM | `NVIDIA_API_KEY` | 关闭/极简/低/中/高 | `google/gemma-3-12b-it`、`google/gemma-3-4b-it`、`meta/llama-3.2-11b-vision-instruct` |
| `openai` | OpenAI | `OPENAI_API_KEY` | 关闭/极简/低/中/高/极高/最大 | `gpt-4`、`gpt-4-turbo`、`gpt-4.1` |
| `openai-codex` | OpenAI Codex（订阅） | — | 关闭/极简/低/中/高/极高/最大 | `gpt-5.3-codex-spark`、`gpt-5.5`、`gpt-5.6-luna` |
| `opencode` | OpenCode Zen | `OPENCODE_API_KEY` | 关闭/极简/低/中/高/极高/最大 | `claude-fable-5`、`claude-fable-5-1`、`claude-haiku-4-5` |
| `opencode-go` | OpenCode Go | `OPENCODE_API_KEY` | 关闭/极简/低/中/高/极高/最大 | `minimax-m3`、`qwen3.8-flash`、`deepseek-v4-flash` |
| `openrouter` | OpenRouter（聚合，含 300+ 模型） | `OPENROUTER_API_KEY` | 关闭/极简/低/中/高/极高/最大 | `anthropic/claude-3-haiku`、`anthropic/claude-fable-5`、`anthropic/claude-fable-5.1` |
| `qwen-token-plan` | Qwen Token Plan（阿里云国际） | `QWEN_TOKEN_PLAN_API_KEY` | 关闭/极简/低/中/高/极高/最大 | `MiniMax-M2.5`、`deepseek-v3.2`、`deepseek-v4-flash` |
| `qwen-token-plan-cn` | Qwen Token Plan（阿里云国内） | `QWEN_TOKEN_PLAN_CN_API_KEY` | 关闭/极简/低/中/高/极高/最大 | `MiniMax-M2.5`、`deepseek-v3.2`、`deepseek-v4-flash` |
| `qwen-token-plan-individual` | Qwen Token Plan（个人版） | `QWEN_TOKEN_PLAN_API_KEY` | 关闭/极简/低/中/高/极高/最大 | `deepseek-v4-flash-0731`、`deepseek-v4-pro`、`deepseek-v4-pro-0813` |
| `radius` | Radius | `RADIUS_API_KEY` | 关闭/极简/低/中/高/极高/最大 | `balanced`、`cheap`、`claude-fable-5` |
| `together` | Together AI | `TOGETHER_API_KEY` | 关闭/低/中/高 | `MiniMaxAI/MiniMax-M2.7`、`MiniMaxAI/MiniMax-M3`、`Qwen/Qwen2.5-7B-Instruct-Turbo` |
| `vercel-ai-gateway` | Vercel AI Gateway | `AI_GATEWAY_API_KEY` | 关闭/极简/低/中/高/极高/最大 | `alibaba/qwen-3-14b`、`alibaba/qwen-3-235b`、`alibaba/qwen-3-30b` |
| `xai` | xAI Grok | `XAI_API_KEY` | 关闭/低/中/高/极高 | `grok-4.3`、`grok-4.5`、`grok-4.6` |
| `xiaomi` | Xiaomi MiMo | `XIAOMI_API_KEY` | 关闭/极简/低/中/高 | `mimo-v2.5`、`mimo-v2.5-pro`、`mimo-v2.5-pro-ultraspeed` |
| `xiaomi-token-plan-ams` | Xiaomi Token Plan AMS | — | 关闭/极简/低/中/高 | `mimo-v2.5`、`mimo-v2.5-pro`、`mimo-v2.6-flash` |
| `xiaomi-token-plan-cn` | Xiaomi Token Plan CN | — | 关闭/极简/低/中/高 | `mimo-v2.5`、`mimo-v2.5-pro`、`mimo-v2.6-flash` |
| `xiaomi-token-plan-sgp` | Xiaomi Token Plan SGP | — | 关闭/极简/低/中/高 | `mimo-v2.5`、`mimo-v2.5-pro`、`mimo-v2.6-flash` |
| `zai` | Z.AI（GLM / 智谱国际站） | `ZAI_API_KEY` | 关闭/极简/低/中/高/最大 | `glm-4.7`、`glm-5-turbo`、`glm-5.2` |
| `zai-coding-cn` | Z.AI Coding CN（智谱编码套餐·国内） | `ZAI_CODING_CN_API_KEY` | 关闭/极简/低/中/高/最大 | `glm-4.6v`、`glm-5.3`、`glm-5.3-flash` |
