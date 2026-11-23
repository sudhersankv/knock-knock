/* @bruin
name: stats.pair_stats
type: duckdb.sql
description: Solve times per room and difficulty. Feeds the leaderboard (fastest door opened per difficulty).
depends:
  - stats.events
materialization:
  type: table
columns:
  - name: unlock_seconds
    type: DOUBLE
    checks:
      - name: non_negative
@bruin */
select
  room_id,
  coalesce(max(difficulty), 'medium') as difficulty,
  max(unlock_seconds) as unlock_seconds,
  max(ts) as at_ts,
  coalesce(sum(case when action = 'lock_fail' then 1 end), 0) as locks_failed
from stats.events
where action = 'unlock' and unlock_seconds is not null
group by room_id
