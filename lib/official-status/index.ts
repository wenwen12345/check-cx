/**
 * 官方状态检查器统一入口
 * 根据 Provider 类型调用对应的状态检查函数
 */

import type {OfficialStatusResult, ProviderType} from "../types";
import {checkOpenAIStatus} from "./openai";
import {checkAnthropicStatus} from "./anthropic";

/**
 * 检查指定 Provider 的官方服务状态
 * @param type - Provider 类型
 * @returns 官方状态检查结果
 */
export async function checkOfficialStatus(
  type: ProviderType
): Promise<OfficialStatusResult> {
  const checkedAt = new Date().toISOString();

  switch (type === "openai_chat" ? "openai" : type) {
    case "openai":
      return checkOpenAIStatus();

    case "gemini":
      // TODO: 实现 Gemini 官方状态检查
      return {
        status: "unknown",
        message: "未配置官方状态检查",
        checkedAt,
      };

    case "anthropic":
      return checkAnthropicStatus();

    default:
      return {
        status: "unknown",
        message: "不支持的 Provider 类型",
        checkedAt,
      };
  }
}

/**
 * 批量检查所有 Provider 的官方状态
 * @param types - Provider 类型列表
 * @returns Provider 类型到状态结果的映射
 */
export async function checkAllOfficialStatuses(
  types: ProviderType[]
): Promise<Map<ProviderType, OfficialStatusResult>> {
  const canonicalTypes = Array.from(
    new Set(types.map((type) => (type === "openai_chat" ? "openai" : type)))
  );

  const canonicalResults = await Promise.all(
    canonicalTypes.map(async (type) => {
      const result = await checkOfficialStatus(type);
      return [type, result] as const;
    })
  );

  const canonicalMap = new Map(canonicalResults);
  return new Map(
    types.map((type) => {
      const canonicalType = type === "openai_chat" ? "openai" : type;
      const canonical = canonicalMap.get(canonicalType);
      return [
        type,
        canonical ?? {
          status: "unknown",
          message: "未配置官方状态检查",
          checkedAt: new Date().toISOString(),
        },
      ] as const;
    })
  );
}
