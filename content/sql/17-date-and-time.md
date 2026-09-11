# 17 — Date & Time Handling

Date and time in SQL is a field littered with traps: time zones, daylight saving time, ambiguous local times, variable-length intervals, and the critical distinction between "a moment in time" and "a wall-clock reading." This chapter covers the types, the operations, and the production patterns that avoid the traps.

---

## The Type System

| Type | Stores | Example | Use Case |
|---|---|---|---|
| `DATE` | Calendar date (y, m, d), no time, no zone | `'2024-03-15'` | Birthdays, holidays |
| `TIME` | Clock time, no date, no zone | `'14:30:00'` | Daily schedule (zone-agnostic) |
| `TIMETZ` | Clock time + zone | `'14:30:00-05'` | Almost never useful |
| `TIMESTAMP` | Date + time, **no zone** | `'2024-03-15 14:30:00'` | Wall-clock readings, implicit zone |
| `TIMESTAMPTZ` | A **moment** — date + time, stored as UTC | `'2024-03-15 14:30:00-05'` | **Default for event timestamps** |
| `INTERVAL` | A span of time, not a point | `'30 days'`, `'1 hour'` | Duration math |

### The Critical Choice: TIMESTAMP vs TIMESTAMPTZ

::code-wrapper{language="sql"}
```sql
-- TIMESTAMPTZ: stores a specific MOMENT (UTC internally), displays in session zone
-- Two clients in different zones see the same moment in their local time
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()   -- ✅ correct: a specific moment
);

-- Insert with explicit zone → converted to UTC for storage
INSERT INTO events (created_at) VALUES ('2024-03-15 14:30:00-05');
-- Stored as 2024-03-15 19:30:00 UTC (regardless of session TimeZone)

-- TIMESTAMP (without zone): stores a WALL-CLOCK reading, no zone info
CREATE TABLE schedules (
  id BIGSERIAL PRIMARY KEY,
  start_time TIMESTAMP NOT NULL   -- ⚠️ '14:30:00' — New York? Tokyo? No way to tell
);
```
::

**Default to `TIMESTAMPTZ`** for event timestamps (`created_at`, `updated_at`, `order_time`). Reserve `TIMESTAMP` (without zone) for wall-clock readings with no meaningful zone (a daily alarm "2:30 PM" that applies in whatever local zone the reader is in).

`TIMESTAMPTZ` doesn't actually store a time zone — it stores UTC. The "with time zone" name means it *performs* zone conversion on input and output. The stored value is always UTC; display depends on the session's `TimeZone` setting.

---

## Inserting and Displaying

::code-wrapper{language="sql"}
```sql
-- Insert with explicit zone offset → converted to UTC for storage
INSERT INTO events (created_at) VALUES ('2024-03-15 14:30:00-05');
-- Stored: 2024-03-15 19:30:00 UTC

-- Insert with no zone → interpreted as the session's TimeZone for TIMESTAMPTZ
SET TimeZone = 'America/New_York';
INSERT INTO events (created_at) VALUES ('2024-03-15 14:30:00');
-- Session is New_York → interpreted as 2024-03-15 14:30:00-05 → stored as 19:30 UTC

-- Display in a specific zone (same stored value, different display)
SET TimeZone = 'Asia/Tokyo';
SELECT created_at FROM events;
-- 2024-03-16 04:30:00+09   (same moment, Tokyo time)

SET TimeZone = 'UTC';
SELECT created_at FROM events;
-- 2024-03-15 19:30:00+00   (same moment, UTC)
```
::

The stored value is the same; only the display changes. This is the power of `TIMESTAMPTZ` — one stored moment, correct display in any zone.

---

## AT TIME ZONE: The Direction-Flipping Operator

`AT TIME ZONE`'s behavior flips based on the input type — the most common source of timezone bugs:

| Input Type | `AT TIME ZONE 'X'` returns | Meaning |
|---|---|---|
| `TIMESTAMPTZ` | `TIMESTAMP` (no zone) | Wall-clock time in zone X |
| `TIMESTAMP` (no zone) | `TIMESTAMPTZ` | The moment that wall time represents in zone X |

::code-wrapper{language="sql"}
```sql
-- TIMESTAMPTZ → TIMESTAMP: "what does this moment look like in New York?"
SELECT created_at AT TIME ZONE 'America/New_York' FROM events;
-- Input: 2024-03-15 19:30:00 UTC → Output: 2024-03-15 14:30:00 (NY wall time, no zone)

-- TIMESTAMP → TIMESTAMPTZ: "what moment does this wall time represent in New York?"
SELECT TIMESTAMP '2024-03-15 14:30:00' AT TIME ZONE 'America/New_York';
-- Input: 2024-03-15 14:30:00 (no zone) → Output: 2024-03-15 19:30:00+00 (the UTC moment)

-- Get the current moment in a specific zone (now() returns TIMESTAMPTZ → AT TIME ZONE → TIMESTAMP)
SELECT now() AT TIME ZONE 'Asia/Kolkata';   -- current Kolkata wall time as TIMESTAMP

-- List available time zones (use full zone names, not abbreviations)
SELECT name, utc_offset, is_dst FROM pg_timezone_names
WHERE name LIKE 'America/%' ORDER BY name LIMIT 10;
```
::

**Memorize**: `TIMESTAMPTZ AT TIME ZONE 'X'` → `TIMESTAMP` (wall time in X); `TIMESTAMP AT TIME ZONE 'X'` → `TIMESTAMPTZ` (the moment that wall time represents in X).

---

## Current Date/Time Functions

| Function | Returns | Constant in transaction? |
|---|---|---|
| `CURRENT_DATE` | Today's date (session date) | N/A (date) |
| `CURRENT_TIME` | Current time with zone | ✅ Yes |
| `CURRENT_TIMESTAMP` / `now()` / `transaction_timestamp()` | Current `TIMESTAMPTZ` | ✅ Yes (transaction start) |
| `LOCALTIMESTAMP` | Current `TIMESTAMP` (no zone) | ✅ Yes |
| `statement_timestamp()` | Start of current statement | ❌ No |
| `clock_timestamp()` | Real wall clock, per call | ❌ No |

::code-wrapper{language="sql"}
```sql
-- now() is constant within a transaction — same value for all statements
BEGIN;
SELECT now();   -- 2024-03-15 10:00:00+00
-- ... other statements ...
SELECT now();   -- still 2024-03-15 10:00:00+00 (transaction start)
COMMIT;

-- clock_timestamp() is the real wall clock — changes per call
SELECT clock_timestamp();   -- 2024-03-15 10:00:00.123456+00
SELECT clock_timestamp();   -- 2024-03-15 10:00:00.124001+00 (microseconds later)

-- Use clock_timestamp() for elapsed-time measurement within a transaction
SELECT clock_timestamp() - transaction_timestamp() AS tx_elapsed;
```
::

`now()` / `CURRENT_TIMESTAMP` / `transaction_timestamp()` all return the **transaction start time** — they're constant within a transaction. Use `clock_timestamp()` for the real wall clock (e.g., measuring elapsed time).

---

## INTERVAL Arithmetic

`INTERVAL` is a span of time, not a point. It has two categories with fundamentally different semantics:

- **Fixed-length**: days, hours, minutes, seconds — always the same duration.
- **Variable-length**: months, years — a month is 28–31 days depending on the calendar.

::code-wrapper{language="sql"}
```sql
-- Basic intervals
SELECT INTERVAL '30 days';                -- 30 days
SELECT INTERVAL '1 hour 30 minutes';      -- 1:30:00
SELECT INTERVAL '2 months 3 days';        -- 2 mons 3 days

-- Timestamp arithmetic
SELECT now() + INTERVAL '7 days';         -- a week from now (TIMESTAMPTZ)
SELECT now() - INTERVAL '1 hour';         -- an hour ago

-- Date subtraction returns integer days (not an interval)
SELECT '2024-03-15'::date - '2024-03-01'::date;   -- 14 (integer, not interval)

-- Age: returns an interval (years/months/days)
SELECT age('2024-03-15'::date, '2000-01-01'::date);   -- 24 years 2 mons 14 days
SELECT age(now(), '2000-01-01'::timestamptz);          -- same, with time component
```
::

### Interval Components and Extraction

::code-wrapper{language="sql"}
```sql
-- Extract a single component
SELECT EXTRACT(days   FROM INTERVAL '2 months 3 days');   -- 3
SELECT EXTRACT(months FROM INTERVAL '2 months 3 days');   -- 2
SELECT EXTRACT(hours  FROM INTERVAL '1 hour 30 minutes'); -- 1

-- Convert to total seconds (epoch)
SELECT EXTRACT(epoch FROM INTERVAL '1 hour');             -- 3600
SELECT EXTRACT(epoch FROM INTERVAL '2 months 3 days');    -- 5616000 (uses avg 30 days/month)

-- ⚠️ EXTRACT(epoch ...) on intervals with months uses an average month (30 days)
--    Don't use epoch for variable-length intervals — the result is approximate
```
::

**Months and years are variable-length** — a month is 28–31 days. `EXTRACT(epoch ...)` on an interval with months uses an average month (30 days), which is wrong for calendar math.

---

## Date Truncation and Extraction

::code-wrapper{language="sql"}
```sql
-- EXTRACT: pull a single component from a timestamp
SELECT
  EXTRACT(YEAR    FROM ordered_on) AS yr,      -- 2024
  EXTRACT(MONTH   FROM ordered_on) AS mo,      -- 3
  EXTRACT(DAY     FROM ordered_on) AS dy,      -- 15
  EXTRACT(HOUR    FROM ordered_on) AS hr,      -- 14
  EXTRACT(DOW     FROM ordered_on) AS dow,     -- 0=Sunday, 1=Monday, ... 6=Saturday
  EXTRACT(DOY     FROM ordered_on) AS doy,     -- day of year (1-366)
  EXTRACT(QUARTER FROM ordered_on) AS q,       -- 1-4
  EXTRACT(EPOCH   FROM ordered_on) AS unix_ts  -- seconds since 1970-01-01 UTC
FROM orders;

-- date_trunc: round DOWN to the start of a unit (returns TIMESTAMPTZ)
SELECT date_trunc('month', ordered_on) AS month_start;   -- 2024-03-01 00:00:00+00
SELECT date_trunc('hour',   ordered_on) AS hour_start;   -- 2024-03-15 14:00:00+00
SELECT date_trunc('week',   ordered_on) AS week_start;   -- 2024-03-11 (Monday start)
```
::

`date_trunc('month', ts)` returns the first moment of the month containing `ts` — perfect for grouping by month: `GROUP BY date_trunc('month', ordered_on)`.

---

## Index-Friendly Date Filtering

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: wraps the column in a function → defeats the index (seq scan)
SELECT * FROM orders WHERE DATE(ordered_on) = '2024-03-15';
SELECT * FROM orders WHERE EXTRACT(YEAR FROM ordered_on) = 2024;

-- ✅ RIGHT: range on the raw column → uses the index
SELECT * FROM orders
WHERE ordered_on >= '2024-03-15'::timestamptz
  AND ordered_on <  '2024-03-16'::timestamptz;

-- ❌ WRONG: BETWEEN is inclusive on both ends — misses times after 23:59:59
SELECT * FROM orders WHERE ordered_on BETWEEN '2024-01-01' AND '2024-01-31';
-- Misses orders at 2024-01-31 18:00:00 (only captures 2024-01-31 00:00:00)

-- ✅ RIGHT: half-open range — correct, composable, no off-by-one
SELECT * FROM orders
WHERE ordered_on >= '2024-01-01'::timestamptz
  AND ordered_on <  '2024-02-01'::timestamptz;   -- [Jan 1, Feb 1) = all of January
```
::

**Use half-open ranges** (`>= start AND < end`) instead of `BETWEEN` for timestamp ranges. `[2024-01-01, 2024-02-01)` captures the entire month correctly and composes cleanly with adjacent months.

---

## Generating Series (Filling Gaps)

`generate_series` produces a complete range of timestamps — essential for time-series reports with no gaps (days with zero orders should show 0, not be missing):

::code-wrapper{language="sql"}
```sql
-- Orders per day, including days with zero orders (LEFT JOIN fills gaps)
SELECT
  day::date                      AS day,
  COUNT(o.id)                    AS orders,
  COALESCE(SUM(o.amount), 0)     AS revenue
FROM generate_series(
  '2024-01-01'::timestamptz,     -- start (inclusive)
  '2024-01-31'::timestamptz,     -- end (inclusive)
  INTERVAL '1 day'               -- step
) AS day
LEFT JOIN orders o
  ON date_trunc('day', o.ordered_on) = day   -- join on the day bucket
GROUP BY day
ORDER BY day;

-- generate_series with months (variable-length — handles Feb correctly)
SELECT * FROM generate_series(
  '2024-01-01'::timestamptz,
  '2024-12-01'::timestamptz,
  INTERVAL '1 month'             -- each step is exactly 1 calendar month
);
```
::

`generate_series` + `LEFT JOIN` is the standard "fill the gaps" pattern for time-series reports.

---

## Complex Implementation: Multi-Timezone Scheduling System

A scheduling system that stores events in UTC, displays in the user's local zone, and handles DST transitions safely:

::code-wrapper{language="sql"}
```sql
-- ============================================================================
-- Schema: multi-timezone meeting scheduler
-- ============================================================================
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC'   -- full IANA zone name (e.g., 'America/New_York')
);

CREATE TABLE meetings (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  -- Always store in TIMESTAMPTZ: a specific moment, unambiguous, DST-safe
  start_at TIMESTAMPTZ NOT NULL,
  duration INTERVAL NOT NULL DEFAULT INTERVAL '1 hour',  -- fixed-length duration
  created_by BIGINT NOT NULL REFERENCES users(id)
);

CREATE INDEX meetings_start_at_idx ON meetings(start_at);

-- ============================================================================
-- Insert: store as TIMESTAMPTZ (the input zone is converted to UTC automatically)
-- ============================================================================
-- A user in New York schedules a meeting for "2:30 PM local time on March 15"
INSERT INTO meetings (title, start_at, duration, created_by)
VALUES (
  'Quarterly Review',
  '2024-03-15 14:30:00 America/New_York'::timestamptz,  -- stored as UTC
  INTERVAL '1 hour',
  1
);
-- Stored: 2024-03-15 19:30:00 UTC (= 2024-03-15 14:30:00-05 EDT)

-- ============================================================================
-- Display: convert to each viewer's local time for rendering
-- ============================================================================
-- Viewer in Tokyo
SELECT
  m.title,
  m.start_at AT TIME ZONE u.timezone AS local_start,   -- TIMESTAMPTZ → TIMESTAMP (wall time)
  (m.start_at + m.duration) AT TIME ZONE u.timezone AS local_end
FROM meetings m
JOIN users u ON u.id = 2   -- Tokyo user
WHERE m.start_at >= now() AND m.start_at < now() + INTERVAL '7 days'
ORDER BY m.start_at;
-- local_start: 2024-03-16 04:30:00 (Tokyo wall time)

-- Viewer in New York
SELECT
  m.title,
  m.start_at AT TIME ZONE 'America/New_York' AS local_start
FROM meetings m
WHERE m.id = 1;
-- local_start: 2024-03-15 14:30:00 (NY wall time)

-- ============================================================================
-- DST-safe interval arithmetic: adding fixed-length intervals to TIMESTAMPTZ
-- ============================================================================
-- Adding INTERVAL '1 hour' to a TIMESTAMPTZ is always exactly 1 hour,
-- even across a DST transition (the UTC moment shifts by exactly 3600 seconds)
SELECT
  start_at,
  start_at + duration AS end_at,                         -- UTC-correct end moment
  (start_at + duration) AT TIME ZONE 'America/New_York' AS end_ny  -- NY wall time end
FROM meetings WHERE id = 1;

-- ⚠️ WARNING: adding INTERVAL '1 month' is NOT fixed-length
-- Adding 1 month to 2024-01-31 gives 2024-02-29 (or 2024-02-28 in non-leap years)
SELECT '2024-01-31'::timestamptz + INTERVAL '1 month';   -- 2024-02-29 00:00:00+00

-- ============================================================================
-- Recurring meetings: generate next N occurrences with generate_series
-- ============================================================================
-- Weekly meeting for 8 weeks, starting from the first occurrence
SELECT
  gs AS occurrence_start,
  gs AT TIME ZONE 'America/New_York' AS ny_wall_time,   -- display in creator's zone
  gs + INTERVAL '1 hour' AS occurrence_end
FROM generate_series(
  '2024-03-15 14:30:00 America/New_York'::timestamptz,
  '2024-03-15 14:30:00 America/New_York'::timestamptz + INTERVAL '7 weeks',
  INTERVAL '1 week'                                        -- fixed: always 7 days
) AS gs;
-- Note: each occurrence is 7*24*3600 seconds later in UTC,
-- but the NY wall time stays 14:30 — until DST shifts it (March 10 → March 17 is fine,
-- but a series crossing Nov 3 would show 14:30 EDT then 13:30 EST — the UTC moment is fixed)

-- ============================================================================
-- Find all meetings in a user's "today" (their local today, not UTC today)
-- ============================================================================
SELECT m.*
FROM meetings m
JOIN users u ON u.id = 2
-- Convert start_at to the user's wall time, then check if it's today in their zone
WHERE (m.start_at AT TIME ZONE u.timezone)::date = CURRENT_DATE;
```
::

**Key design decisions**:
1. **Store as `TIMESTAMPTZ`** — unambiguous moments, UTC internally, DST-safe arithmetic.
2. **`AT TIME ZONE` for display** — convert to the viewer's wall time only at query time.
3. **Fixed-length intervals** (`INTERVAL '1 hour'`, `INTERVAL '1 week'`) — always exact, even across DST.
4. **Variable-length intervals** (`INTERVAL '1 month'`) — calendar-correct but not fixed-duration; use carefully.

---

## Anti-Pattern: Storing Timestamps Without Timezone

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: TIMESTAMP without zone — no way to know what moment it represents
CREATE TABLE bad_events (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMP NOT NULL   -- '2024-03-15 14:30:00' — New York? UTC? Tokyo?
);

-- A server in UTC writes '2024-03-15 14:30:00' (meaning UTC)
-- A server in New York writes '2024-03-15 14:30:00' (meaning NY = 19:30 UTC)
-- Both rows have the same value but represent different moments → data corruption

-- ✅ RIGHT: TIMESTAMPTZ — every write specifies (or defaults to) a zone, stored as UTC
CREATE TABLE good_events (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL   -- '2024-03-15 14:30:00-05' → stored as 19:30 UTC
);
```
::

---

## Anti-Pattern: Double-Converting Timezones

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: applying AT TIME ZONE twice — undoes the conversion
SELECT
  start_at AT TIME ZONE 'America/New_York' AT TIME ZONE 'America/New_York'
FROM meetings;
-- start_at (TIMESTAMPTZ) → AT TIME ZONE 'NY' → TIMESTAMP (NY wall time)
-- TIMESTAMP → AT TIME ZONE 'NY' → TIMESTAMPTZ (reinterprets NY wall time as NY moment)
-- Result: the original moment shifted by the session zone offset — wrong

-- ✅ RIGHT: convert once, to the target zone for display
SELECT start_at AT TIME ZONE 'America/New_York' FROM meetings;
-- TIMESTAMPTZ → TIMESTAMP (NY wall time) — correct
```
::

---

## Daylight Saving Time Traps

::code-wrapper{language="sql"}
```sql
-- ============================================================================
-- Spring-forward gap: 2:30 AM doesn't exist on 2024-03-10 in US zones
-- ============================================================================
SET TimeZone = 'America/New_York';
SELECT '2024-03-10 02:30:00'::timestamptz;
-- PostgreSQL advances it to 2024-03-10 03:30:00-04 (interprets as after the gap)
-- (Or errors with 'discontinuity' depending on settings)

-- ============================================================================
-- Fall-back ambiguity: 1:30 AM happens twice on 2024-11-03
-- ============================================================================
SELECT '2024-11-03 01:30:00 America/New_York'::timestamptz;
-- Interpreted as the FIRST occurrence (EDT, -04) — before the clocks fall back

SELECT '2024-11-03 01:30:00-05'::timestamptz;
-- Explicit offset → the SECOND occurrence (EST, -05) — after the clocks fall back

-- ============================================================================
-- DST-safe: store in UTC, convert for display — UTC has no DST
-- ============================================================================
-- A meeting stored as UTC is never ambiguous:
INSERT INTO meetings (title, start_at, duration, created_by)
VALUES ('DST Test', '2024-11-03 05:30:00+00'::timestamptz, INTERVAL '1 hour', 1);
-- 05:30 UTC = 01:30 EDT (first occurrence) — unambiguous

-- ============================================================================
-- "Missing hour" in a schedule: spring-forward causes a gap
-- ============================================================================
-- A daily schedule from 2:00 to 3:00 on March 10 in NY:
-- 2:00 AM doesn't exist (clocks jump to 3:00 AM)
-- A naive schedule generator would create a phantom slot
SELECT gs AT TIME ZONE 'America/New_York' AS slot
FROM generate_series(
  '2024-03-10 02:00:00 America/New_York'::timestamptz,
  '2024-03-10 03:00:00 America/New_York'::timestamptz,
  INTERVAL '30 minutes'
) AS gs;
-- The 02:00 slot is shifted to 03:00 (or 03:30) — the gap is silently skipped
```
::

**Store in UTC, display in the user's zone** — this avoids most DST ambiguity. When you must accept local-time input, validate it against the zone's DST transitions.

---

## 💡 Tips & Tricks

- **Idiom** — default to `TIMESTAMPTZ` for all event timestamps: it stores a specific moment (UTC internally) and displays correctly in any session zone. Reserve `TIMESTAMP` for wall-clock readings with no meaningful zone.
- **Idiom** — use `AT TIME ZONE` for display conversion: `ts AT TIME ZONE 'America/New_York'` converts a `TIMESTAMPTZ` to the NY wall time. Apply once, at the presentation layer.
- **Idiom** — use `date_trunc('month', ts)` (or `'day'`, `'hour'`) for time-bucket aggregation: it rounds down to the start of the bucket, giving clean `GROUP BY` keys. Pair with `generate_series` + `LEFT JOIN` to fill zero-activity periods.
- **Idiom** — use `EXTRACT` for components (`YEAR`, `MONTH`, `DOW`, `EPOCH`) and `INTERVAL` for duration math. For day counts, use date subtraction (`date - date` → integer), not `age()` (which returns an interval).
- **Performance** — filter on the **raw timestamp column** with a range, not on `DATE(col)` or `EXTRACT(YEAR FROM col)` — wrapping the column in a function defeats the index.
- **Session** — `SET TimeZone = 'UTC'` for server-side processing (unambiguous), convert to user zones at the edge. `SET TimeZone` affects display, not storage.
- **Portability** — `INTERVAL '1 hour'` is PostgreSQL; MySQL uses `DATE_ADD(ts, INTERVAL 1 HOUR)`; SQLite uses `datetime(ts, '+1 hour')`. Timestamp arithmetic is one of the least portable areas.

---

## ⚠️ Edge Cases & Gotchas

- **`TIMESTAMP` (without zone) is ambiguous**: `'2024-03-15 14:30:00'` has no zone — you can't know what moment it represents. When data crosses time zones, this causes bugs. Use `TIMESTAMPTZ`.
- **`now()` is constant within a transaction**: `now()` / `CURRENT_TIMESTAMP` / `transaction_timestamp()` all return the transaction start time. Use `clock_timestamp()` for the real wall clock (e.g., measuring elapsed time).
- **DST spring-forward gap**: 2:30 AM doesn't exist on spring-forward day. PostgreSQL advances it to 3:30 (or errors). Validate local-time input against DST transitions.
- **DST fall-back ambiguity**: 1:30 AM happens twice on fall-back day. Specify the offset (`-04` EDT vs `-05` EST) to disambiguate.
- **`BETWEEN` on timestamps is inclusive on both ends**: `BETWEEN '2024-01-01' AND '2024-01-31 23:59:59'` still misses `23:59:59.5`. Use half-open ranges.
- **`EXTRACT(epoch FROM ts)` returns POSIX seconds**: useful for Unix timestamps, but leap seconds aren't represented — every day has exactly 86400 epoch seconds.
- **`INTERVAL '1 month'` is variable-length**: adding `INTERVAL '1 month'` to `'2024-01-31'` gives `'2024-02-29'` (leap year) or `'2024-02-28'` — not 30 days. Months vary 28–31 days.
- **`age(ts)` returns years/months/days**: `age('2024-03-15', '2000-01-01')` = `24 years 2 mons 14 days`, not a number of days. Use `EXTRACT(days FROM ...)` or date subtraction for day counts.
- **`'24:00:00'` vs `'00:00:00'`**: `'24:00:00'` is accepted by PostgreSQL and represents midnight of the *next* day (ISO 8601). `'00:00:00'` is midnight of the current day. They're different references.
- **Time zone names vs abbreviations**: `America/New_York` is a zone name (with full DST rules); `EST`/`EDT` are abbreviations (fixed offsets, no DST rules). Prefer zone names — `EST` doesn't switch to `EDT` in summer.
- **`TIMETZ` is rarely useful**: `TIME WITH TIME ZONE` is almost never what you want — a clock time with a zone doesn't represent a moment (no date). Use `TIMESTAMPTZ` or `TIME`.
- **Session `TimeZone` affects display, not storage**: `SET TimeZone = 'Asia/Tokyo'` changes how `TIMESTAMPTZ` values are *displayed*, not what's stored. The stored value is always UTC.
- **`date_trunc` truncates in the session zone**: `date_trunc('day', ts)` truncates to midnight in the session's `TimeZone`, not the business zone. For business-day grouping, convert first: `date_trunc('day', ts AT TIME ZONE 'America/New_York')`.

---

## 🧠 Spot the Bug

A report groups orders by day, but orders placed late in the evening (after 7 PM New York time) appear on the *next* day's row. The server runs in UTC. The `ordered_on` column is `TIMESTAMPTZ`.

::code-wrapper{language="sql"}
```sql
-- Server's session TimeZone is UTC
SET TimeZone = 'UTC';

SELECT
  date_trunc('day', ordered_on)::date AS day,
  COUNT(*) AS n
FROM orders
GROUP BY day
ORDER BY day;
```
::

<details>
<summary>Answer</summary>

`date_trunc('day', ordered_on)` truncates to the start of the day **in the session's time zone** — which is UTC, not New York. An order at 7 PM New York (`2024-03-15 19:00-05` = `2024-03-16 00:00 UTC`) gets truncated to `2024-03-16` in UTC — appearing on the next day, even though in New York it was still March 15.

::code-wrapper{language="sql"}
```sql
-- ✅ Fix: convert to the business zone BEFORE truncating
SELECT
  date_trunc('day', ordered_on AT TIME ZONE 'America/New_York')::date AS day,
  COUNT(*) AS n
FROM orders
GROUP BY day
ORDER BY day;
```
::

`ordered_on AT TIME ZONE 'America/New_York'` converts the `TIMESTAMPTZ` to a `TIMESTAMP` (NY wall time), then `date_trunc('day', ...)` truncates that wall time to NY midnight. The result is stable regardless of the session's `TimeZone` setting.

**The lesson**: `date_trunc('day', ts)` truncates in the **session zone**, which may not be the business zone. For reports that must group by "business day in New York," convert to the business zone before truncating.

</details>

---

## Summary

You can now choose between `TIMESTAMPTZ` and `TIMESTAMP`, manipulate dates/times with `EXTRACT`/`date_trunc`/intervals, build time-series reports with `generate_series`, use half-open ranges and index-friendly filtering, and navigate DST gaps and ambiguities. Next: JSON and array columns.