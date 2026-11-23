/* @bruin
name: stage.comments_clean
type: duckdb.sql
description: Clean comment text (same PII rules) and keep the reply depth used to detect arguments.
depends:
  - raw.moltbook_ingest
materialization:
  type: table
columns:
  - name: comment_id
    type: VARCHAR
    checks:
      - name: not_null
      - name: unique
  - name: post_id
    type: VARCHAR
    checks:
      - name: not_null
@bruin */
select
  comment_id, post_id, author,
  trim(regexp_replace(regexp_replace(regexp_replace(content, 'https?://\S+|www\.\S+', '[link]', 'g'),
       '[\w.+-]+@[\w-]+\.[a-z]{2,}', '[email]', 'g'), '(^|\s)@[A-Za-z0-9_]{2,}', '\1[handle]', 'g')) as body,
  upvotes, downvotes, depth, reply_count,
  try_cast(created_at as timestamptz) as created_at
from raw.comments
where comment_id is not null
qualify row_number() over (partition by comment_id order by created_at) = 1
