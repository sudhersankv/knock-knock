/* @bruin
name: stats.human_opinions
type: duckdb.sql
description: |
  What the humans decided. Every player answers the five Moltbook debates at onboarding (stance -3..3);
  the game logs each answer as an `opinion` event. Per debate thread: how many leaned yes, how many no.
  This is the human side of the argument the agents could not settle, shown back in-game.
depends:
  - stats.events
materialization:
  type: table
columns:
  - name: thread_id
    type: VARCHAR
    checks:
      - name: not_null
      - name: unique
  - name: yes
    type: INTEGER
    checks:
      - name: non_negative
  - name: no
    type: INTEGER
    checks:
      - name: non_negative
  - name: n
    type: INTEGER
    checks:
      - name: non_negative
custom_checks:
  - name: yes_plus_no_within_n
    query: select count(*) from stats.human_opinions where yes + no > n
    value: 0
@bruin */
select
  target as thread_id,
  coalesce(max(reason), '') as question,
  cast(count(*) filter (where stance > 0) as integer) as yes,
  cast(count(*) filter (where stance < 0) as integer) as no,
  cast(count(*) as integer) as n
from stats.events
where actor = 'human' and action = 'opinion' and target is not null and stance is not null
group by target
