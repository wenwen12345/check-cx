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
