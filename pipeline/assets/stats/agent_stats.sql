/* @bruin
name: stats.agent_stats
type: duckdb.sql
description: |
  Per-agent behaviour across rounds: companions keyed by agenda (faithful, poet, jealous, ...), plus the
  gatekeeper and scout. distortion_rate = share of relays where what went out differs from what came in.
  This is the agents' long-term memory: it is written back into their prompts at the next drop-in.
depends:
  - stats.events
materialization:
  type: table
columns:
  - name: agent_key
    type: VARCHAR
    checks:
      - name: not_null
      - name: unique
  - name: distortion_rate
    type: DOUBLE
    checks:
      - name: non_negative
@bruin */
with e as (
  select *, case when (lower(actor) like 'comp-%' or lower(actor) like 'companion%') and agenda is not null then lower(agenda) else lower(actor) end as agent_key
  from stats.events
), unlocks as (
  select room_id, round, max(unlock_seconds) as unlock_seconds from stats.events where action = 'unlock' group by 1, 2
), agent_rounds as (
  select distinct e.agent_key, u.unlock_seconds from e join unlocks u on u.room_id = e.room_id and u.round = e.round
), agent_unlock as (
  select agent_key, avg(unlock_seconds) as avg_unlock_seconds from agent_rounds group by 1
)
select
  agent_key,
  count(distinct e.room_id || ':' || e.round) as rounds,
  coalesce(sum(case when action = 'relay' and coalesce(words_in, '') <> coalesce(words_out, '') then 1 end) * 1.0
           / nullif(sum(case when action = 'relay' then 1 end), 0), 0) as distortion_rate,
  coalesce(sum(case when caught or action = 'caught' then 1 end), 0) as caught_count,
  coalesce(sum(case when action = 'trade' then 1 end), 0) as trades,
  coalesce(sum(case when action in ('drop_word', 'deviate', 'leak') then 1 end), 0) as deviations,
  coalesce(sum(case when action in ('rekey', 'set_budget') then 1 end), 0) as world_events,
  any_value(au.avg_unlock_seconds) as avg_unlock_seconds
from e left join agent_unlock au using (agent_key)
where agent_key <> ''
group by agent_key
