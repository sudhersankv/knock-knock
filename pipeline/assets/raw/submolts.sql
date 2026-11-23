/* @bruin
name: raw.submolts_checked
type: duckdb.sql
description: Quality gate over the ingested submolt list.
depends:
  - raw.moltbook_ingest
materialization:
  type: view
columns:
  - name: name
    type: VARCHAR
    checks:
      - name: not_null
      - name: unique
@bruin */
select name, display_name, description, subscriber_count, post_count from raw.submolts
