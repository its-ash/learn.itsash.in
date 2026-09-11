---
title: "24 — Time & Dates"
description: "Monotonic vs wall clock, the reference time format, time zone handling, the == vs Equal trap, and tickers/timers for scheduling."
---

# 24 — Time & Dates

## `time.Time` — Wall Clock + Monotonic Clock

::code-wrapper{language="go"}
```go
// ┌──────────────────────────────────────────────────────────────────────┐
// │ time.Time contains TWO clocks:                                       │
// │   - Wall clock: the "real world" time (can be changed by NTP/DST)  │
// │   - Monotonic clock: never goes backward, unaffected by NTP/DST     │
// │                                                                      │
// │ time.Now() includes BOTH clocks.                                     │
// │ time.Parse/time.Date include ONLY the wall clock.                    │
// │                                                                      │
// │ Subtraction (t2.Sub(t1)) uses the MONOTONIC clock if both times     │
// │ have it — accurate for measuring elapsed time.                      │
// │                                                                      │
// │ == compares BOTH clocks → use t.Equal(t2) for instant comparison.   │
// │ Before/After use the monotonic clock if available.                  │
// └──────────────────────────────────────────────────────────────────────┘

func clocks() {
	t1 := time.Now()        // has wall + monotonic
	time.Sleep(100 * time.Millisecond)
	t2 := time.Now()        // has wall + monotonic

	elapsed := t2.Sub(t1)   // uses monotonic clock — accurate even if NTP jumps
	fmt.Println(elapsed)     // ~100ms (unaffected by wall clock changes)

	// Parsed times have NO monotonic clock:
	parsed, _ := time.Parse(time.RFC3339, "2024-03-15T14:30:00Z")
	// parsed.Sub(t1) uses the wall clock — less reliable for elapsed time
}
```

## The Reference Time — Format by Example

::code-wrapper{language="go"}
```go
// Go formats dates by writing an EXAMPLE of the reference time:
//   Mon Jan 2 15:04:05 MST 2006  (= 1/2 3:04:05PM '06 -0700)
//
// Mnemonic: 1 2 3 4 5 6 7
//   1 = month (January)
//   2 = day
//   3 = hour (15 = 24h, 3 = 12h with PM)
//   4 = minute
//   5 = second
//   6 = year (2006)
//   7 = timezone (-0700)

func formatting() {
	t := time.Date(2024, 3, 15, 14, 30, 45, 0, time.UTC)

	t.Format("2006-01-02")           // "2024-03-15"
	t.Format("2006-01-02 15:04:05")  // "2024-03-15 14:30:45"
	t.Format(time.RFC3339)           // "2024-03-15T14:30:45Z"
	t.Format("Mon Jan _2 15:04:05 2006")  // "Fri Mar 15 14:30:45 2024"
	t.Format("01/02/2006 3:04 PM")  // "03/15/2024 2:30 PM"
	t.Format("2006-01-02T15:04:05.999999-07:00")  // with microseconds

	// Predefined formats:
	// time.RFC3339     = "2006-01-02T15:04:05Z07:00"
	// time.RFC1123     = "Mon, 02 Jan 2006 15:04:05 MST"
	// time.Kitchen     = "3:04PM"
	// time.Stamp       = "Jan _2 15:04:05"
}

// ─── Parsing ───
func parsing() {
	t, err := time.Parse(time.RFC3339, "2024-03-15T14:30:45Z")
	t, err = time.Parse("2006-01-02", "2024-03-15")
	t, err = time.ParseInLocation("2006-01-02", "2024-03-15", time.UTC)

	// ⚠️ Layout errors are runtime (not compile-time) — a wrong layout
	// silently produces a wrong result or an error. Always check err.
}
```

## `==` vs `Equal` — The Comparison Trap

::code-wrapper{language="go"}
```go
// ❌ == compares wall clock AND monotonic clock AND location:
func badCompare() {
	t1, _ := time.Parse(time.RFC3339, "2024-03-15T14:30:00Z")        // UTC
	t2, _ := time.Parse(time.RFC3339, "2024-03-15T09:30:00-05:00")   // EST
	// t1 and t2 are the SAME INSTANT (14:30 UTC = 09:30 EST)
	fmt.Println(t1 == t2)      // false — different locations
}

// ✅ Equal compares only the INSTANT (the moment in time):
func goodCompare() {
	t1, _ := time.Parse(time.RFC3339, "2024-03-15T14:30:00Z")
	t2, _ := time.Parse(time.RFC3339, "2024-03-15T09:30:00-05:00")
	fmt.Println(t1.Equal(t2))  // true — same instant, different timezones
}

// Before/After also compare the instant:
func beforeAfter() {
	t1 := time.Now()
	t2 := t1.Add(time.Hour)
	fmt.Println(t1.Before(t2))  // true
	fmt.Println(t2.After(t1))   // true
}
```

## Time Zones

::code-wrapper{language="go"}
```go
func timeZones() {
	// Load an IANA timezone (requires the tz database):
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		// On systems without the tz database, embed it:
		// import _ "time/tzdata"  // adds ~450KB to binary
		panic(err)
	}

	now := time.Now().In(loc)  // display current time in NYC
	fmt.Println(now)           // 2024-03-15 10:30:00 -0400 EDT

	// UTC and Local conversions (change DISPLAY, not instant):
	utcTime := now.UTC()       // 2024-03-15 14:30:00 +0000 UTC
	localTime := now.Local()   // in the system's local timezone

	// ⚠️ Use IANA names ("America/New_York"), NOT abbreviations ("EST"):
	//   "EST" has no DST rules — it's always UTC-5, even in summer.
	//   "America/New_York" handles DST automatically.
	loc, _ = time.LoadLocation("EST")  // ❌ fixed offset, no DST
	loc, _ = time.LoadLocation("America/New_York")  // ✅ handles DST
}
```

## `Duration` — Arithmetic

::code-wrapper{language="go"}
```go
func durationArithmetic() {
	// Duration is int64 nanoseconds. Constants:
	// time.Nanosecond, Microsecond, Millisecond, Second, Minute, Hour

	d := 5 * time.Second
	d.Seconds()      // 5.0 (float64)
	d.Milliseconds() // 5000 (int64)
	d.String()       // "5s"

	// Add/subtract durations:
	t := time.Now()
	t2 := t.Add(2 * time.Hour)      // 2 hours later
	t3 := t.Add(-30 * time.Minute)  // 30 minutes earlier

	// Sub gives a Duration:
	diff := t2.Sub(t)  // 2h0m0s

	// ⚠️ Don't use Add for calendar months (different number of days):
	// t.Add(30 * 24 * time.Hour) is NOT "one month" — months vary.
	// Use AddDate for calendar units:
	t4 := t.AddDate(0, 1, 0)  // add 1 calendar month
	t5 := t.AddDate(1, 0, 0)  // add 1 calendar year
	// AddDate(0, 1, 0) on Jan 31 → Feb 28/29 (normalized)
}
```

## Tickers and Timers

::code-wrapper{language="go"}
```go
func tickersAndTimers() {
	// ─── Ticker — fires repeatedly at intervals ───
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()  // ⚠️ always Stop to release the goroutine

	go func() {
		for t := range ticker.C {  // channel sends a Time each tick
			fmt.Println("tick:", t)
		}
	}()

	// ─── Timer — fires once after a duration ───
	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()

	select {
	case <-timer.C:
		fmt.Println("timer fired")
	case <-ctx.Done():
		fmt.Println("cancelled before timer fired")
	}

	// ─── time.After — one-shot timer (leaks if not fired) ───
	// ⚠️ time.After leaks the timer goroutine if the select takes another case.
	// Use time.NewTimer + Stop in tight loops (see chapter 18).
	select {
	case v := <-ch:
		_ = v
	case <-time.After(5 * time.Second):
		fmt.Println("timeout")
	}

	// ─── time.Sleep — blocks the current goroutine ───
	time.Sleep(100 * time.Millisecond)  // no cancel, no select — rarely right
}
```

## Production Pattern — Scheduled Cleanup

::code-wrapper{language="go"}
```go
func startCleanup(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := cleanupExpiredSessions(ctx); err != nil {
				log.Printf("cleanup error: %v", err)
				// continue running — don't stop on error
			}
		case <-ctx.Done():
			log.Println("cleanup goroutine shutting down")
			return  // graceful exit on cancellation
		}
	}
}

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(),
		syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	go startCleanup(ctx, 5*time.Minute)

	// ... main server loop ...
	<-ctx.Done()
}
```

## 💡 Tips & Tricks

- **Idiom**: use `t.Equal(t2)` to compare times, not `==` — `Equal` compares the instant, ignoring location and monotonic differences. `==` compares all three and gives false for the same instant in different timezones.
- **Idiom**: use `AddDate` for calendar arithmetic (months, years) — `t.AddDate(0, 1, 0)` adds a calendar month (handles Feb 28/29). `t.Add(30 * 24 * time.Hour)` is NOT a month — months have different day counts.
- **Idiom**: use IANA timezone names ("America/New_York"), not abbreviations ("EST") — abbreviations have no DST rules. `time.LoadLocation("America/New_York")` handles DST automatically.
- **Idiom**: use `time.Now().Sub(t)` (monotonic clock) for measuring elapsed time — it's unaffected by NTP adjustments or DST changes. Parsed times have no monotonic clock.
- **Idiom**: always `defer ticker.Stop()` / `defer timer.Stop()` — without Stop, the timer goroutine lingers (resource leak). In tight loops, use `time.NewTimer` + `Stop` instead of `time.After` (which leaks).
- **Portability**: import `_ "time/tzdata"` to embed the timezone database — needed on systems without `/usr/share/zoneinfo` (some minimal Docker images, Windows). Adds ~450KB to the binary.

## ⚠️ Edge Cases & Gotchas

- **`==` vs `Equal`**: `==` compares wall + monotonic + location; `Equal` compares only the instant. Use `Equal` for "same moment."
- **Parsed times have no monotonic clock**: `time.Parse` returns a time with only the wall clock. `Sub` uses the wall clock (less reliable for elapsed time).
- **`AddDate` normalizes**: `time.Date(2024, 1, 31, 0, 0, 0, 0, UTC).AddDate(0, 1, 0)` → Feb 29 (2024 is a leap year). Adding a month to the 31st normalizes to the last day of the target month.
- **`time.Sleep` can't be cancelled**: `time.Sleep(d)` blocks the goroutine for d, ignoring context. Use `time.NewTimer` + `select` with `ctx.Done()` for cancellable waits.
- **`time.After` leaks**: the timer goroutine lives until the duration elapses, even if the `select` took another case. In hot loops, use `time.NewTimer` + `Stop`.
- **`time.LoadLocation` can fail**: on systems without the tz database, it returns an error. Import `_ "time/tzdata"` to embed the database.
- **DST changes**: adding `24 * time.Hour` across a DST boundary gives 23 or 25 hours of wall-clock time (but 24 hours of monotonic time). Use `AddDate(0, 0, 1)` for "next day at the same wall-clock time."
- **`time.Now()` is monotonic**: `time.Now()` includes the monotonic clock. Subtracting two `Now()` values gives accurate elapsed time regardless of NTP.
- **Timezone abbreviations are ambiguous**: "CST" can be Central Standard Time (US), China Standard Time, or Cuba Standard Time. Always use IANA names.

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
t1, _ := time.Parse(time.RFC3339, "2024-03-15T14:30:00Z")
t2, _ := time.Parse(time.RFC3339, "2024-03-15T14:30:00Z")

fmt.Println(t1 == t2)
fmt.Println(t1.Equal(t2))
```

What's printed?
::
<details>
<summary>Answer</summary>

```
true
true
```

Both `==` and `Equal` return `true` here — `t1` and `t2` are parsed from the same string, so they have the same wall clock, same location (UTC), and both lack a monotonic clock (parsed times don't have one).

The difference between `==` and `Equal` appears when the times are in **different locations**:
```go
t1, _ := time.Parse(time.RFC3339, "2024-03-15T14:30:00Z")
t2, _ := time.Parse(time.RFC3339, "2024-03-15T09:30:00-05:00")
fmt.Println(t1 == t2)      // false (different locations)
fmt.Println(t1.Equal(t2)) // true  (same instant)
```

Or when comparing `time.Now()` values (which have monotonic clocks):
```go
t1 := time.Now()
t2 := t1.In(time.UTC)  // same instant, different location
fmt.Println(t1 == t2)      // false (monotonic clock is stripped by In())
fmt.Println(t1.Equal(t2)) // true
```

</details>

## 📚 What's Next

→ [25 — Testing & Benchmarking](/go/25-testing-and-benchmarking) — table-driven tests, benchmarks, fuzzing, httptest, and coverage.