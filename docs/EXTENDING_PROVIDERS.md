# 扩展 Provider 与官方状态检查指南

本文档面向开发者，说明如何为 Check CX 新增/接入更多 AI Provider，以及如何对接它们各自的官方状态页。

## 1. 新增 Provider 类型

目标：让 Dashboard 能识别新的 Provider 类型（例如 `myvendor`），并在 Supabase 配置后自动开始轮询。

### 1.1 扩展类型定义

1. 修改 `lib/types/provider.ts`：

   ```ts
   export type ProviderType = "openai" | "openai_chat" | "gemini" | "anthropic" | "myvendor";

   export const DEFAULT_ENDPOINTS: Record<ProviderType, string> = {
     openai: "https://api.openai.com/v1/responses",
     openai_chat: "https://api.openai.com/v1/chat/completions",
     gemini: "https://generativelanguage.googleapis.com",
     anthropic: "https://api.anthropic.com/v1/messages",
     myvendor: "https://api.myvendor.com/v1/chat/completions",
   };
   ```

2. 若需要在 UI 中显示更友好的名称，更新 `lib/core/status.ts` 中的 `PROVIDER_LABEL`：

   ```ts
   export const PROVIDER_LABEL: Record<ProviderType, string> = {
     openai: "OpenAI (Responses)",
     openai_chat: "OpenAI (Chat)",
     gemini: "Gemini",
     anthropic: "Anthropic",
     myvendor: "MyVendor",
   };
   ```

### 1.2 编写健康检查实现

新建 `lib/providers/myvendor.ts`，实现最小健康检查逻辑。推荐遵循以下原则：

- 使用流式接口或轻量级请求
- 限制 `max_tokens` 或等效参数以降低成本
- 请求体尽可能简洁（例如固定 prompt `"hi"`）

可参考现有 Provider 实现：`lib/providers/ai-sdk-check.ts`

如果目标 Provider 也支持「流式响应」，推荐复用 `lib/providers/stream-check.ts`：

```ts
import type { ProviderConfig, CheckResult } from "@/lib/types";
import { runStreamCheck } from "./stream-check";

export async function checkMyVendor(config: ProviderConfig): Promise<CheckResult> {
  // 构造请求 URL 与 body
  const url = "...";

  return runStreamCheck(config, {
    url,
    displayEndpoint: config.endpoint,
    init: {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ /* 最小请求体 */ }),
    },
    parseStream: async (reader) => {
      // 按 Provider 协议解析流式响应，返回拼接后的文本即可
      // 具体参考 gemini 实现
      return "";
    },
  });
}
```

### 1.3 接入统一检查入口

修改 `lib/providers/index.ts`：

```ts
import { checkMyVendor } from "./myvendor";

async function checkProvider(config: ProviderConfig): Promise<CheckResult> {
  switch (config.type) {
    case "openai":
      return checkOpenAI(config);
    case "gemini":
      return checkGemini(config);
    case "anthropic":
      return checkAnthropic(config);
    case "myvendor":
      return checkMyVendor(config);
    default:
      throw new Error(`Unsupported provider: ${config.type satisfies never}`);
  }
}
```

至此，只要在 Supabase 的 `check_configs` 中插入 `type = 'myvendor'` 的配置，即可参与轮询与展示。

## 2. 对接官方状态页

目标：在 Dashboard 卡片中展示 Provider 官方状态（例如「服务正常 / 降级 / 故障」），补充自测结果。

### 2.1 基本类型

官方状态相关类型定义在 `lib/types/official-status.ts`：

- `OfficialHealthStatus`：`operational | degraded | down | unknown`
- `OfficialStatusResult`：包含 `status`、`message`、`checkedAt` 以及可选的 `affectedComponents`

### 2.2 增加状态检查实现

在 `lib/official-status` 下新增 `<provider>.ts` 文件，例如 `myvendor.ts`：

```ts
import type { OfficialStatusResult, OfficialHealthStatus } from "@/lib/types";
import { logError } from "@/lib/utils/error-handler";

const MYVENDOR_STATUS_URL = "https://status.myvendor.com/api/...";
const TIMEOUT_MS = 15_000;

export async function checkMyVendorStatus(): Promise<OfficialStatusResult> {
  const checkedAt = new Date().toISOString();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(MYVENDOR_STATUS_URL, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        status: "unknown",
        message: `HTTP ${response.status}`,
        checkedAt,
      };
    }

    const data = await response.json();
    // TODO: 将 data 映射为 OfficialHealthStatus 与 message
    const status: OfficialHealthStatus = "operational";

    return {
      status,
      message: "服务正常",
      checkedAt,
    };
  } catch (error) {
    logError("checkMyVendorStatus", error);

    if ((error as Error).name === "AbortError") {
      return {
        status: "unknown",
        message: "检查超时",
        checkedAt,
      };
    }

    return {
      status: "unknown",
      message: "检查失败",
      checkedAt,
    };
  }
}
```

### 2.3 注册到统一官方状态入口

修改 `lib/official-status/index.ts`：

```ts
import { checkMyVendorStatus } from "./myvendor";

export async function checkOfficialStatus(
  type: ProviderType
): Promise<OfficialStatusResult> {
  const checkedAt = new Date().toISOString();

  switch (type) {
    case "openai":
      return checkOpenAIStatus();
    case "gemini":
      // ...
    case "anthropic":
      return checkAnthropicStatus();
    case "myvendor":
      return checkMyVendorStatus();
    default:
      return {
        status: "unknown",
        message: "不支持的 Provider 类型",
        checkedAt,
      };
  }
}
```

官方状态轮询器 `lib/core/official-status-poller.ts` 会自动包含所有注册类型：

- 定期调用 `checkAllOfficialStatuses(["openai", "gemini", "anthropic", "myvendor"])`
- 将最新结果缓存在内存中，供 `loadDashboardData` 在组装 Dashboard 数据时挂载到 `latest.officialStatus` 上。

## 3. Supabase 配置与验证

新增 Provider 或官方状态后，需要在 Supabase 中插入或更新配置：

```sql
INSERT INTO check_configs (name, type, model, endpoint, api_key, enabled)
VALUES (
  'MyVendor 主力',
  'myvendor',
  'my-model-name',
  'https://api.myvendor.com/v1/chat/completions',
  'sk-xxx',
  true
);
```

验证步骤：

1. 启动服务（本地或预发环境）。
2. 观察日志中是否出现 MyVendor 的检测明细：
   - `[check-cx]   · MyVendor 主力(myvendor/...) -> operational ...`
3. 打开页面确认：
   - 新 Provider 卡片已出现，状态与延迟合理。
   - 若已实现官方状态检查，卡片中的「官方状态」字段能够展示正确信息。

## 4. 开发规范建议

- **错误处理**：统一使用 `logError(context, error)` 输出错误，避免直接 `console.error` 丢失上下文。
- **超时与降级**：
  - 默认超时可参考现有实现（请求超时 15 秒，降级阈值 6 秒）。
  - 根据 Provider 特性适度调整，但建议保持量级一致，保证横向可比性。
- **成本控制**：
  - 对高成本模型务必使用最小输入（prompt）和 `max_tokens` 限制。
  - 如需对推理模型设置额外参数（如 `reasoning_effort`），可参考 `lib/providers/openai.ts` 中的模型指令解析逻辑。

按以上步骤扩展 Provider 与官方状态检查，可以在保持现有架构简洁的前提下，安全地接入更多上游服务。
