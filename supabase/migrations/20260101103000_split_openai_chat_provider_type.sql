-- 将 OpenAI Chat Completions 拆分为独立 Provider 类型
-- - openai：仅用于 /v1/responses
-- - openai_chat：仅用于 /v1/chat/completions

DO $$
BEGIN
  ALTER TYPE public.provider_type ADD VALUE IF NOT EXISTS 'openai_chat';
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

-- 将历史遗留的 openai + chat/completions 配置迁移到 openai_chat，避免升级后不兼容
UPDATE public.check_configs
SET type = 'openai_chat'
WHERE type = 'openai'
  AND (
    endpoint LIKE '%/chat/completions'
    OR endpoint LIKE '%/chat/completions?%'
    OR endpoint LIKE '%/chat/completions/%'
  );
