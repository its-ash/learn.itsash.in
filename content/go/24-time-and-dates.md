# 24 — Time & Dates

Go's `time` package handles instants (`Time`), durations (`Duration`), and ticking (`Ticker`/`Timer`). It's well-designed but has time-zone and monotonic-clock subtleties.

## `time.Time` — an Instant

::code-wrapper{language="go"}
```go
now := time.Now()                  // current time (local, with monotonic clock)
t := time.Date(2024, 3, 15, 14, 30, 0, 0, time.UTC)   // specific time
t, err := time.Parse("2006-01-02", "2024-03-15")      // parse a string
t, err := time.Parse(time.RFC3339, "2024-03-15T14:30:00Z")
t, err := time.ParseInLocation("2006-01-02", "2024-03-15", time.UTC)
```
::

### The reference time (the format "2006-01-02")

Go's date formatting is unusual: you format by writing an **example** of the reference time (Jan 2 15:04:05 2006 MST), not `YYYY-MM-DD`:

::code-wrapper{language="go"}
```go
t.Format("2006-01-02")              // "2024-03-15"
t.Format("2006-01-02 15:04:05")     // "2024-03-15 14:30:00"
t.Format(time.RFC3339)              // "2024-03-15T14:30:00Z"
t.Format("Mon Jan _2 15:04:05 2006")// "Fri Mar 15 14:30:00 2024"
```
::

The reference time is `Mon Jan 2 15:04:05 MST 2006` — `1 2 3 4 5 6 7` (month, day, hour, minute, second, year, timezone). Mnemonic: "1/2 3:04:05PM '06 -0700."

Predefined formats: `time.RFC3339`, `time.RFC1123`, `time.Kitchen` (`"3:04PM"`), `time.Stamp` (`"Jan _2 15:04:05"`).

## `time.Duration` — a Span

::code-wrapper{language="go"}
```go
d := 5 * time.Second
d := 1500 * time.Millisecond
d := 2 * time.Hour

d.Seconds()   // float64
d.Milliseconds()
d.String()    // "5s", "1.5s", "2h0m0s"

// Arithmetic
t2 := t.Add(2 * time.Hour)
t3 := t.AddDate(0, 1, 0)   // add 1 month
diff := t2.Sub(t)          // Duration
``
::

`Duration` is an `int64` nanoseconds. Constants: `time.Nanosecond`, `time.Microsecond`, `time.Millisecond`, `time.Second`, `time.Minute`, `time.Hour`.

### `Add` vs `AddDate`

- `Add(d Duration)` — adds a duration (handles leap seconds, DST).
- `AddDate(years, months, days)` — adds calendar units (a month is a calendar month, not 30 days). `time.Date(2024, 1, 31).AddDate(0, 1, 0)` = Feb 29 (or 28) — normalization.

## Comparing Times

::code-wrapper{language="go"}
```go
t1.Before(t2)
t1.After(t2)
t1.Equal(t2)   // ✅ use Equal, not == (see below)
``
::

### `==` vs `Equal`

`==` compares the wall clock *and* the monotonic clock and the location. `Equal` compares the instant (the moment in time), ignoring location and monotonic differences. **Use `Equal`** for "are these the same moment":

::code-wrapper{language="go"}
```go
t1, _ := time.Parse(time.RFC3339, "2024-03-15T14:30:00Z")
t2, _ := time.Parse(time.RFC3339, "2024-03-15T09:30:00-05:00")
// t1 and t2 are the same instant (14:30 UTC = 09:30 EST)
t1.Equal(t2)   // true
t1 == t2       // false (different locations)
```
::

## Time Zones

::code-wrapper{language="go"}
```go
loc, _ := time.LoadLocation("America/New_York")
t := time.Now().In(loc)   // the current moment, displayed in NYC time

t.UTC()                   // convert to UTC display
t.Local()                 // convert to local display

// LoadLocation needs the tz database. On Windows, it's bundled; on Unix,
// it uses /usr/share/zoneinfo. If missing, import "time/tzdata" to embed it.
``
::

`In(loc)`, `UTC()`, and `Local()` change the *display* of a `Time`, not the instant. Use `LoadLocation` with IANA names (`"America/New_York"`, `"Asia/Tokyo"`), not abbreviations (`"EST"` — which has no DST rules).

## Monotonic Clock

`time.Now()` includes a **monotonic clock** reading (since Go 1.9) for measuring elapsed time, immune to wall-clock changes (NTP adjustments, DST):

::code-wrapper{language="go"}
```go
start := time.Now()
// ... work ...
elapsed := time.Since(start)   // uses the monotonic clock
``
::

`time.Since(start)` and `time.Until(t)` use the monotonic component if both times have it — accurate even if the wall clock jumps. `time.Date` and `time.Parse` don't have monotonic readings (they're wall-clock only).

### `time.Now()` and serialization

`time.Now()` includes the monotonic reading, but `MarshalJSON`/`Format` drop it (it's not part of the wall-clock representation). Round-tripping a `Now()` through JSON loses the monotonic component — fine for storage, not for elapsed-time measurement across a serialize/deserialize boundary.

## `time.Ticker` and `time.Timer`

::code-wrapper{language="go"}
```go
// Ticker — fires repeatedly at an interval
ticker := time.NewTicker(1 * time.Second)
defer ticker.Stop()
for {
	select {
	case t := <-ticker.C:
		fmt.Println("tick at", t)
	case <-done:
		return
	}
}

// Timer — fires once after a duration
timer := time.NewTimer(5 * time.Second)
defer timer.Stop()
select {
case <-timer.C:
	fmt.Println("fired")
case <-done:
	return
}

// time.After — convenience Timer (but can leak; see chapter 18)
select {
case <-time.After(5 * time.Second):
case <-done:
}
``
::

- `Ticker` — fires repeatedly. `Stop()` releases it. `ticker.C` is the channel.
- `Timer` — fires once. `Stop()` cancels (returns true if it hadn't fired). `Reset(d)` reuses.
- `time.After(d)` — convenience, but leaks the timer if the select takes another case (chapter 18).

## `time.Sleep`

::code-wrapper{language="go"}
```go
time.Sleep(2 * time.Second)   // blocks the goroutine
``
::

`Sleep` blocks the goroutine (not the thread — the scheduler runs others). For test delays, use `time.Sleep`; for production waits, prefer `select` on `<-ctx.Done()`/`<-timer.C` so you can cancel.

## 💡 Tips & Tricks

- **Idiom**: use `time.Since(start)` for elapsed time — it uses the monotonic clock (immune to wall-clock changes), so it's accurate even if NTP adjusts the clock mid-measurement. `time.Now()` includes a monotonic reading (Go 1.9+); `time.Date`/`time.Parse` don't.
- **Idiom**: use `t.Equal(t2)`, not `t == t2`, for comparing instants — `Equal` compares the moment (ignoring location and monotonic differences); `==` compares the full struct (location, monotonic), so two representations of the same instant can be `!=`. This is the #1 time bug.
- **Idiom**: use IANA time zone names (`"America/New_York"`), not abbreviations (`"EST"`) — IANA names have full DST rules; `EST` is a fixed offset (no DST). `time.LoadLocation("America/New_York")` is the right way.
- **Idiom**: format dates with the reference time (`t.Format("2006-01-02")`), not `YYYY-MM-DD` — Go's formatting is by example, where `2006-01-02 15:04:05` is the reference (1/2 3:04:05PM '06). It's unusual but unambiguous and self-documenting.
- **Idiom**: use `time.NewTicker` with `defer ticker.Stop()` for periodic work, and include `<-ctx.Done()` in the `select` so the tick loop can be canceled — a ticker without an exit path leaks the goroutine. `time.After` leaks the timer if another case wins; use `NewTimer` + `Stop` in hot loops.

## ⚠️ Edge Cases & Gotchas

- **`==` vs `Equal`**: `t1 == t2` is false for the same instant in different locations. Use `t1.Equal(t2)`.
- **Monotonic clock only in `time.Now()`**: `time.Date`/`time.Parse` have no monotonic reading — `time.Since(parsedTime)` uses the wall clock (subject to jumps). Use `time.Now()` for start times of elapsed measurements.
- **`time.After` leaks**: the timer goroutine lingers until the duration, even if the select took another case. In hot loops, use `time.NewTimer` + `Stop`.
- **`AddDate` normalizes**: `time.Date(2024, 1, 31).AddDate(0, 1, 0)` = Feb 29 (2024 is a leap year) or Feb 28 — "Jan 31 + 1 month" normalizes to the last day of Feb.
- **`time.Parse` uses UTC if no zone**: `time.Parse(time.RFC3339, "2024-03-15T14:30:00")` (no `Z` or offset) parses as UTC. Use `ParseInLocation` for a specific zone.
- **`time.Now()` is local**: `time.Now()` returns local time. Use `.UTC()` for UTC display, `.In(loc)` for a specific zone.
- **`time.Sleep` isn't cancellable**: `time.Sleep(10*time.Second)` blocks for 10s regardless. Use `select { case <-time.After(10s): case <-ctx.Done(): }` for cancellable waits.
- **DST and `Add`**: `t.Add(24 * time.Hour)` adds 24 hours of *elapsed time*, not "the same time tomorrow" — across a DST spring-forward, 24h from 1 AM is 2 AM (not 1 AM) the next day. Use `AddDate(0, 0, 1)` for "same wall time tomorrow."
- **`time.LoadLocation` on Windows**: Windows doesn't have `/usr/share/zoneinfo`; import `_ "time/tzdata"` to embed the tz database in your binary.
- **`time.Time` zero value**: `time.Time{}` is year 1, January 1, 00:00:00 UTC — a valid but "zero" time. Use `t.IsZero()` to check. JSON marshals it as `"0001-01-01T00:00:00Z"`.

## 🧠 Spot the Bug

A developer measures elapsed time but gets wrong results after the server's clock is adjusted by NTP:

::code-wrapper{language="go"}
```go
start := time.Date(2024, 3, 15, 14, 0, 0, 0, time.UTC)
// ... work ...
elapsed := time.Since(start)
``
::

What's wrong?

<details>
<summary>Answer</summary>

`time.Date(...)` creates a `Time` with a wall-clock reading but **no monotonic clock component** (only `time.Now()` includes a monotonic reading). `time.Since(start)` computes `time.Now().Sub(start)` — since `start` has no monotonic reading, the subtraction uses the wall clock, which is subject to NTP adjustments. If the clock jumped backward during the work, `elapsed` could be negative or wrong.

The fix — use `time.Now()` for the start time (it has a monotonic reading), so `time.Since` uses the monotonic clock (immune to wall-clock changes):

```go
start := time.Now()   // ✅ includes monotonic reading
// ... work ...
elapsed := time.Since(start)   // uses monotonic clock — accurate even if wall clock jumps
```

If you need a specific start time (e.g., from a parsed timestamp), you can't get monotonic accuracy — monotonic clocks can't be reconstructed from wall times. Measure elapsed time from `time.Now()` at the actual start.

**The lesson**: `time.Since` uses the monotonic clock only if both times have a monotonic reading. `time.Now()` has one; `time.Date`/`time.Parse` don't. For elapsed-time measurement, always start with `time.Now()`.

</details>

## Summary

You can now use `time.Time` (instants), `time.Duration` (spans), format with the reference time, compare with `Equal` (not `==`), handle time zones with IANA names, measure elapsed time with the monotonic clock (`time.Now()` + `time.Since`), and use `Ticker`/`Timer`/`Sleep` with cancellation. Next: testing and benchmarking.