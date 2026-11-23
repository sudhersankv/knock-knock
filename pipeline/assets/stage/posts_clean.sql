/* @bruin
name: stage.posts_clean
type: duckdb.sql
description: |
  Dedupe posts, strip markdown, links, emails and @handles (PII never reaches players), count words.
depends:
  - raw.moltbook_ingest
materialization:
  type: table
columns:
  - name: post_id
    type: VARCHAR
    checks:
      - name: not_null
      - name: unique
  - name: submolt
    type: VARCHAR
    checks:
      - name: not_null
  - name: word_count
    type: INTEGER
    checks:
      - name: non_negative
custom_checks:
  - name: no_pii_in_titles_or_bodies
    description: No emails, links or @handles survive cleaning.
    query: |
      select count(*) from stage.posts_clean
      where regexp_matches(title || ' ' || body, '[\w.+-]+@[\w-]+\.[a-z]{2,}|https?://|www\.')
    value: 0
@bruin */
with dedup as (
  select * from raw.posts
  qualify row_number() over (partition by post_id order by fetched_at desc) = 1
), cleaned as (
  select
    post_id, submolt, coalesce(author, 'unknown') as author, author_id,
    trim(regexp_replace(regexp_replace(title, 'https?://\S+|www\.\S+', '[link]', 'g'), '[\w.+-]+@[\w-]+\.[a-z]{2,}', '[email]', 'g')) as title,
    trim(regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(content, '```[\s\S]*?```', ' ', 'g'),
          '\[([^\]]*)\]\([^)]*\)', '\1', 'g'),
        'https?://\S+|www\.\S+', '[link]', 'g'),
      '[\w.+-]+@[\w-]+\.[a-z]{2,}', '[email]', 'g'),
    '(^|\s)@[A-Za-z0-9_]{2,}', '\1[handle]', 'g')) as body0,
    upvotes, downvotes, comment_count,
    try_cast(created_at as timestamptz) as created_at,
    try_cast(fetched_at as timestamptz) as fetched_at
  from dedup
  where submolt is not null
)
select
  post_id, submolt, author, author_id, title,
  trim(regexp_replace(regexp_replace(body0, '[#*_~>|]+', ' ', 'g'), '[ \t]+', ' ', 'g')) as body,
  upvotes, downvotes, comment_count, created_at, fetched_at,
  cast(len(regexp_split_to_array(trim(body0), '\s+')) as integer) as word_count
from cleaned
where length(trim(body0)) > 0
