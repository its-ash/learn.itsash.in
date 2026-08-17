# 17 — Date & Time Handling

Date and time in SQL is a field littered with traps: time zones, daylight saving time, leap seconds, ambiguous local times, and the critical distinction between "a moment in time" and "a wall-clock reading." This chapter covers the types, the operations, and the gotchas.

## The Types

| Type | What it stores | Example |
|---|---|---|
| `DATE` | Calendar date (year, month, day), no time, no zone. | `'2024-03-15'` |
| `TIME` (a.k.a. `TIME WITHOUT TIME ZONE`) | Clock time, no date, no zone. | `'14:30:00'` |
| `TIMETZ` (`TIME WITH TIME ZONE`) | Clock time + zone. Rarely useful. | `'14:30:00-05'` |
| `TIMESTAMP` (`TIMESTAMP WITHOUT TIME ZONE`) | Date + time, no zone. **Ambiguous** — no way to know what zone it's in. | `'2024-03-15 14:30:00'` |
| `TIMESTAMPTZ` (`TIMESTAMP WITH TIME ZONE`) | A **moment** — date + time + zone, stored as UTC, displayed in the session zone. | `'2024-03-15 14:30:00-05'` |
| `INTERVAL` | A span of time (days, hours, etc.), not a point. | `'30 days'`, `'1 hour 30 minutes'` |

### The critical choice: `TIMESTAMP` vs `TIMESTAMPTZ`

- **`TIMESTAMPTZ`** stores a **specific moment** in time (internally as UTC). When you insert `'2024-03-15 14:30:00-05'`, it converts to UTC and stores that. When you read it, it displays in the session's `TimeZone` setting. Two clients in different time zones see the same moment displayed in their local time. **Use this for almost everything** — event timestamps, created_at, order times.

- **`TIMESTAMP`** (without zone) stores a **wall-clock reading** with no zone information. `'2024-03-15 14:30:00'` could be New York or Tokyo — there's no way to tell. Use this only when the zone is irrelevant (a daily schedule "2:30 PM" that applies in whatever local zone the reader is in) or implicitly fixed by convention.

**Default to `TIMESTAMPTZ` for event timestamps.** The "without time zone" type is a frequent source of bugs when data crosses time zones.

## Inserting and Displaying

::code-wrapper{language="sql"}
```sql
-- Insert with explicit zone
INSERT INTO events (ts) VALUES ('2024-03-15 14:30:00-05');

-- Insert with no zone (interpreted as the session zone for TIMESTAMPTZ)
INSERT INTO events (ts) VALUES ('2024-03-15 14:30:00');

-- Display in a specific zone
SET TimeZone = 'Asia/Tokyo';
SELECT ts FROM events;   -- shows the same moment in Tokyo time

SET TimeZone = 'UTC';
SELECT ts FROM events;   -- shows the same moment in UTC
``
::

The stored value is the same; only the display changes. This is the power of `TIMESTAMPTZ`.

## Time Zone Functions

::code-wrapper{language="sql"}
```sql
-- Convert a timestamp to a specific zone (returns TIMESTAMPTZ)
SELECT ts AT TIME ZONE 'America/New_York' FROM events;
-- Note: AT TIME ZONE on a TIMESTAMPTZ returns a TIMESTAMP (wall time in that zone).

-- AT TIME ZONE on a TIMESTAMP returns a TIMESTAMPTZ (interprets the wall time as being in that zone)
SELECT TIMESTAMP '2024-03-15 14:30:00' AT TIME ZONE 'America/New_York';

-- Get the current timestamp in a specific zone
SELECT now() AT TIME ZONE 'Asia/Kolkata';

-- List available time zones
SELECT * FROM pg_timezone_names ORDER BY name LIMIT 10;
``
::

The `AT TIME ZONE` operator's behavior flips based on the input type — a common confusion. Memorize: `TIMESTAMPTZ AT TIME ZONE 'X'` → `TIMESTAMP` (wall time in X); `TIMESTAMP AT TIME ZONE 'X'` → `TIMESTAMPTZ` (the moment that wall time represents in X).

## Current Date/Time Functions

| Function | Returns |
|---|---|
| `CURRENT_DATE` | Today's date (session date). |
| `CURRENT_TIME` | Current time with zone. |
| `CURRENT_TIMESTAMP` (or `now()`) | Current `TIMESTAMPTZ`. |
| `LOCALTIMESTAMP` | Current `TIMESTAMP` (no zone). |
| `clock_timestamp()` | Current `TIMESTAMPTZ`, re-evaluated per call (within a statement). |
| `transaction_timestamp()` | Start of the current transaction (same as `now()`). |
| `statement_timestamp()` | Start of the current statement. |

`now()` / `CURRENT_TIMESTAMP` / `transaction_timestamp()` all return the **transaction start time** — they're constant within a transaction. `clock_timestamp()` is the real wall clock, changing per call. This matters for measuring elapsed time within a transaction: use `clock_timestamp()`, not `now()`.

## Intervals

`INTERVAL` is a span of time, not a point:

::code-wrapper{language="sql"}
```sql
SELECT INTERVAL '30 days';
SELECT INTERVAL '1 hour 30 minutes';
SELECT INTERVAL '2 months 3 days';

-- Arithmetic with timestamps
SELECT now() + INTERVAL '7 days';        -- a week from now
SELECT now() - INTERVAL '1 hour';        -- an hour ago
SELECT '2024-03-15'::date - '2024-03-01'::date;   -- 14 (days between dates, as integer)

-- Age
SELECT age('2024-03-15'::date, '2000-01-01'::date);   -- an interval
SELECT age(now(), '2000-01-01'::timestamptz);
```
::

### Interval components

::code-wrapper{language="sql"}
```sql
-- Extract a component
SELECT EXTRACT(days FROM INTERVAL '2 months 3 days');   -- 3
SELECT EXTRACT(months FROM INTERVAL '2 months 3 days'); -- 2

-- Convert to seconds (loses months, which vary in length)
SELECT EXTRACT(epoch FROM INTERVAL '1 hour');   -- 3600
``
::

Months and years are **variable-length** intervals (a month is 28–31 days). `EXTRACT(epoch ...)` on an interval with months uses an average month (30 days) — be careful.

## Date/Time Arithmetic and Indexing

::code-wrapper{language="sql"}
```sql
-- Range queries on an indexed timestamp
SELECT * FROM orders WHERE ordered_on >= '2024-01-01' AND ordered_on < '2024-02-01';

-- Better: half-open range (handles timestamps within the last day correctly)
SELECT * FROM orders WHERE ordered_on >= '2024-01-01' AND ordered_on < '2024-02-01';
-- vs. the buggy: WHERE ordered_on BETWEEN '2024-01-01' AND '2024-01-31' (misses Jan 31 18:00)
```
::

**Use half-open ranges (`>= start AND < end`) instead of `BETWEEN`** for timestamp ranges. `BETWEEN '2024-01-01' AND '2024-01-31'` includes `2024-01-31 00:00:00` but excludes any time later on Jan 31 — a subtle off-by-one. Half-open ranges are correct and compose cleanly (Jan is `[2024-01-01, 2024-02-01)`).

### Index-friendly date filtering

::code-wrapper{language="sql"}
```sql
-- ❌ Applies a function to the column — defeats the index
SELECT * FROM orders WHERE DATE(ordered_on) = '2024-03-15';

-- ✅ Range on the raw column — uses the index
SELECT * FROM orders
WHERE ordered_on >= '2024-03-15'::timestamptz
  AND ordered_on <  '2024-03-16'::timestamptz;
``
::

Wrapping the column in `DATE()` (or `EXTRACT`, `to_char`) applies a function per row, defeating the index. Filter on the raw timestamp with a range instead.

## Extracting Components

::code-wrapper{language="sql"}
```sql
SELECT
  EXTRACT(YEAR   FROM ordered_on) AS yr,
  EXTRACT(MONTH  FROM ordered_on) AS mo,
  EXTRACT(DAY    FROM ordered_on) AS dy,
  EXTRACT(HOUR   FROM ordered_on) AS hr,
  EXTRACT(DOW    FROM ordered_on) AS dow,   -- day of week (0=Sunday)
  EXTRACT(DOY    FROM ordered_on) AS doy,   -- day of year (1-366)
  EXTRACT(QUARTER FROM ordered_on) AS q,
  EXTRACT(EPOCH  FROM ordered_on) AS unix_ts
FROM orders;

-- date_trunc — round down to a unit
SELECT date_trunc('month', ordered_on) AS month_start FROM orders;
SELECT date_trunc('hour', ordered_on) AS hour_start FROM orders;
``
::

`date_trunc('month', ts)` returns the first moment of the month containing `ts` — perfect for grouping by month: `GROUP BY date_trunc('month', ordered_on)`.

## Time Series Aggregation

::code-wrapper{language="sql"}
```sql
-- Orders per month
SELECT
  date_trunc('month', ordered_on) AS month,
  COUNT(*) AS orders,
  SUM(amount) AS revenue
FROM orders
GROUP BY date_trunc('month', ordered_on)
ORDER BY month;

-- Orders per day in a range
SELECT
  date_trunc('day', ordered_on) AS day,
  COUNT(*) AS n
FROM orders
WHERE ordered_on >= '2024-01-01' AND ordered_on < '2024-02-01'
GROUP BY day
ORDER BY day;
``
::

## Generating Series (filling gaps)

`generate_series` produces a complete range of timestamps — essential for time-series reports with no gaps (days with no orders should show 0, not be missing):

::code-wrapper{language="sql"}
```sql
-- Orders per day, including days with zero orders
SELECT
  day::date,
  COUNT(o.id) AS orders
FROM generate_series(
  '2024-01-01'::timestamptz,
  '2024-01-31'::timestamptz,
  INTERVAL '1 day'
) day
LEFT JOIN orders o
  ON date_trunc('day', o.ordered_on) = day
GROUP BY day
ORDER BY day;
``
::

`generate_series` + `LEFT JOIN` is the standard "fill the gaps" pattern for time-series reports.

## Daylight Saving Time Traps

DST is the source of most time-zone bugs:

1. **Spring-forward gap**: in March (US), 2:00 AM → 3:00 AM, so 2:30 AM doesn't exist. Inserting `'2024-03-10 02:30:00'` in `America/New_York` — PostgreSQL interprets it as 3:30 AM (or errors, depending on settings).
2. **Fall-back ambiguity**: in November, 2:00 AM happens twice. `'2024-11-03 01:30:00'` in `America/New_York` is ambiguous — is it EDT or EST?

::code-wrapper{language="sql"}
```sql
-- The spring-forward gap: 2:30 AM doesn't exist on 2024-03-10 in US zones
SET TimeZone = 'America/New_York';
SELECT '2024-03-10 02:30:00'::timestamptz;
-- PostgreSQL advances it to 03:30 EDT (or errors with 'discontinuity')

-- The fall-back ambiguity: 01:30 happens twice
SELECT '2024-11-03 01:30:00 America/New_York'::timestamptz;
-- Interpreted as the first occurrence (EDT) — to get the second, specify the offset
SELECT '2024-11-03 01:30:00-05'::timestamptz;   -- EST (the second occurrence)
```
::

**Store in UTC, display in the user's zone** — this avoids most DST ambiguity (UTC has no DST). When you must accept local-time input, validate it against the zone's DST transitions.

## 💡 Tips & Tricks

- **Idiom**: default to `TIMESTAMPTZ` for all event timestamps — it stores a specific moment (UTC internally) and displays correctly in any session zone. Reserve `TIMESTAMP` (without zone) for wall-clock readings with no meaningful zone (a daily alarm time, a store's business hours).
- **Idiom**: use **half-open ranges** (`>= start AND < end`) for timestamp ranges instead of `BETWEEN` — `BETWEEN '2024-01-01' AND '2024-01-31'` silently excludes times after midnight on the 31st, while `[2024-01-01, 2024-02-01)` captures the whole month correctly and composes cleanly with adjacent months.
- **Idiom**: use `date_trunc('month', ts)` (or `'day'`, `'hour'`) for time-bucket aggregation — it rounds down to the start of the bucket, giving clean `GROUP BY` keys for charts and reports. Pair with `generate_series` + `LEFT JOIN` to fill days with zero activity.
- **Performance**: filter on the **raw timestamp column** with a range, not on `DATE(col)` or `EXTRACT(YEAR FROM col)` — wrapping the column in a function defeats the index. `WHERE ts >= '2024-03-15'::timestamptz AND ts < '2024-03-16'::timestamptz` uses the index; `WHERE DATE(ts) = '2024-03-15'` does a seq scan.
- **Portability**: `INTERVAL '1 hour'` is PostgreSQL; MySQL uses `DATE_ADD(ts, INTERVAL 1 HOUR)`; SQLite uses `ts + '+1 hour'`. Timestamp arithmetic is one of the least portable areas — write it per-engine.

## ⚠️ Edge Cases & Gotchas

- **`TIMESTAMP` (without zone) is ambiguous**: `'2024-03-15 14:30:00'` has no zone — you can't know what moment it represents. When data crosses time zones, this causes bugs. Use `TIMESTAMPTZ`.
- **`now()` is constant within a transaction**: `now()` / `CURRENT_TIMESTAMP` / `transaction_timestamp()` all return the transaction start time. Use `clock_timestamp()` for the real wall clock (e.g., measuring elapsed time).
- **DST spring-forward gap**: 2:30 AM doesn't exist on spring-forward day. PostgreSQL advances it to 3:30 (or errors, per `TimeZone`/`Extra_Float_Digits` settings). Validate local-time input against DST transitions.
- **DST fall-back ambiguity**: 1:30 AM happens twice on fall-back day. `'2024-11-03 01:30:00'` is ambiguous — specify the offset (`-04` EDT vs `-05` EST) to disambiguate.
- **`BETWEEN` on timestamps is inclusive on both ends**: `BETWEEN '2024-01-01' AND '2024-01-31 23:59:59'` still misses `23:59:59.5`. Use half-open ranges.
- **`EXTRACT(epoch FROM ts)` returns seconds since 1970-01-01 UTC**: useful for Unix timestamps, but note leap seconds aren't represented (every day has exactly 86400 epoch seconds — POSIX time ignores leap seconds).
- **`INTERVAL '1 month'` is variable-length**: adding `INTERVAL '1 month'` to `'2024-01-31'` gives `'2024-02-29'` (Feb 29 in a leap year) or `'2024-02-28'` — not 30 days. Months vary 28–31 days; don't assume a fixed length.
- **`age(ts)` returns years/months/days**: `age('2024-03-15', '2000-01-01')` = `24 years 2 mons 14 days`, not a number of days. Use `EXTRACT(days FROM ...)` or date subtraction for day counts.
- **Time zone names vs abbreviations**: `America/New_York` is a zone name (with full DST rules); `EST`/`EDT` are abbreviations (fixed offsets, no DST rules). Prefer zone names — `EST` doesn't switch to `EDT` in summer.
- **`TIMETZ` is rarely useful**: `TIME WITH TIME ZONE` is almost never what you want — a clock time with a zone doesn't represent a moment (no date). Use `TIMESTAMPTZ` or `TIME`.
- **Session `TimeZone` affects display, not storage**: `SET TimeZone = 'Asia/Tokyo'` changes how `TIMESTAMPTZ` values are *displayed*, not what's stored. The stored value is always UTC. Two sessions with different zones see the same moment differently.

## 🧠 Spot the Bug

A report groups orders by day, but orders placed late in the evening (after 7 PM New York time) appear on the *next* day's row. Why?

::code-wrapper{language="sql"}
```sql
SET TimeZone = 'America/New_York';
SELECT
  date_trunc('day', ordered_on)::date AS day,
  COUNT(*) AS n
FROM orders
GROUP BY day
ORDER BY day;
```
::

The `ordered_on` column is `TIMESTAMPTZ`.

<details>
<summary>Answer</summary>

`date_trunc('day', ordered_on)` truncates to the start of the day **in the session's time zone** (`America/New_York`). But the truncation happens in the session zone, and the result is a `TIMESTAMPTZ` representing midnight New York time — which is correct *if* the session zone matches the business's zone.

The actual bug is more subtle: if the session `TimeZone` is set to UTC (or the server runs in UTC) but the business thinks in New York time, `date_trunc('day', ordered_on)` truncates to **UTC midnight**, not New York midnight. An order at 7 PM New York (`2024-03-15 19:00-05` = `2024-03-16 00:00 UTC`) gets truncated to `2024-03-16` in UTC — appearing on the next day, even though in New York it was still March 15.

The fix — explicitly truncate in the business zone, regardless of session zone:

```sql
SELECT
  date_trunc('day', ordered_on AT TIME ZONE 'America/New_York')::date AS day,
  COUNT(*) AS n
FROM orders
GROUP BY day
ORDER BY day;
```
::
`ordered_on AT TIME ZONE 'America/New_York'` converts the `TIMESTAMPTZ` to a `TIMESTAMP` (wall time in New York), then `date_trunc('day', ...)` truncates that wall time to New York midnight. The result is stable regardless of the session's `TimeZone` setting.

**The lesson**: `date_trunc('day', ts)` truncates in the **session zone**, which may not be the business zone. For reports that must group by "business day in New York," convert to the business zone (`AT TIME ZONE 'America/New_York'`) before truncating, so the result doesn't depend on the session's `TimeZone`.

</details>

## Summary

You can now choose between `TIMESTAMPTZ` and `TIMESTAMP`, manipulate dates/times with `EXTRACT`/`date_trunc`/intervals, build time-series reports with `generate_series`, use half-open ranges and index-friendly filtering, and navigate DST gaps and ambiguities. Next: JSON and array columns — semi-structured data in a relational database.