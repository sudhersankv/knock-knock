/* @bruin
name: game.quality_gate
type: duckdb.sql
description: |
  Enforces "never fake content, every lock has exactly one valid answer". If any check fails the run fails
  and the game keeps serving the previous valid round_pack.json.
depends:
  - game.threads_vocab
  - game.codex
  - game.pulse
  - game.debates
materialization:
  type: view
columns:
  - name: thread_id
    type: VARCHAR
    checks:
      - name: not_null
      - name: unique
custom_checks:
  - name: enough_threads
    query: select count(*) >= 20 from game.threads
    value: 1
  - name: every_thread_has_real_moltbook_id
    query: select count(*) from game.threads t left join stage.posts_clean p on p.post_id = t.thread_id where p.post_id is null
    value: 0
  - name: exactly_five_debates
    query: select count(*) from game.debates
    value: 5
  - name: debate_keyword_in_thread_vocab
    query: |
      select count(*) from game.debates d
      where not exists (select 1 from game.vocab v where v.thread_id = d.thread_id and v.word = d.keyword)
    value: 0
  - name: all_debates_philosophical
    description: Every debate was classified as a moral / ethical / philosophical question by the LLM.
    query: select count(*) from game.debates where philosophical is not true or theme is null
    value: 0
  - name: debate_threads_are_readable
    query: select count(*) from game.debates d left join game.threads t on t.thread_id = d.thread_id where t.thread_id is null
    value: 0
  - name: every_debate_has_2_to_4_voices
    query: |
      select count(*) from game.debates d
      where (select count(*) from game.debate_voices v where v.thread_id = d.thread_id) not between 2 and 4
    value: 0
  - name: voices_are_short_plain_and_clean
    query: |
      select count(*) from game.debate_voices
      where length(text) > 221 or stance not in (1, -1) or regexp_matches(text, '[\w.+-]+@[\w-]+\.[a-z]{2,}|https?://|www\.')
    value: 0
  - name: society_numbers_positive
    query: select count(*) from raw.society where posts24h > 0 and comments24h > 0 and activeAgents24h > 0 and submolts > 0
    value: 1
  - name: at_least_four_codexes
    query: select count(*) >= 4 from game.codex
    value: 1
  - name: codex_word_occurs_exactly_once
    query: |
      select count(*) from game.codex
      where len(regexp_extract_all(lower(lines_json), '(^|[^a-z])' || pass_word || '([^a-z]|$)')) != 1
    value: 0
  - name: codex_word_is_unsayable
    query: select count(*) from game.codex c join game.vocab v on v.word = c.pass_word
    value: 0
  - name: at_least_three_pulses
    query: select count(distinct snapshot_id) >= 3 from game.pulse
    value: 1
  - name: pulse_ranks_distinct_and_separated
    query: |
      select count(*) from (
        select activity_24h, lag(activity_24h) over (partition by snapshot_id order by rank) as prev
        from game.pulse
      ) where prev is not null and prev < activity_24h * 1.15
    value: 0
  - name: no_pii_in_thread_text
    query: |
      select count(*) from game.threads
      where regexp_matches(title || ' ' || body, '[\w.+-]+@[\w-]+\.[a-z]{2,}|https?://|www\.')
    value: 0
@bruin */
select thread_id, submolt, title from game.threads
