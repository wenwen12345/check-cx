-- 将历史遗留的 openai + chat/completions 配置迁移到 openai_chat，避免升级后不兼容
--
-- 注意：PostgreSQL 在同一事务中新增 enum 值后不可立刻使用该值。
-- 因此此迁移必须在新增 enum 值的迁移之后执行。

UPDATE public.check_configs
SET type = 'openai_chat'
WHERE type = 'openai'
  AND (
    endpoint LIKE '%/chat/completions'
    OR endpoint LIKE '%/chat/completions?%'
    OR endpoint LIKE '%/chat/completions/%'
  );
