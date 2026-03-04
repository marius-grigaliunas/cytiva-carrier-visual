
Here’s how to mirror **“Dispatch to picking”** (longest time from **now** to **Dispatched Timestamp**, only for lines with Dispatched set and **no** valid Drop Off) in a Qlik Sense table.

---

## Logic to replicate

- **Include** a line only if:
  - It belongs to the delivery (handled by your dimension).
  - **Dispatched Timestamp (GMT)** is non-empty and parses as a valid date.
  - **Drop Off Timestamp (GMT)** is empty or does **not** parse as a valid date (e.g. "-", "N/A").
- **Value** = `now - Dispatched` in ms, then take the **max** over those lines (per delivery).

---

## 1. Table with Delivery as dimension

If the table has **Delivery** (or Delivery ID) as the dimension, each row is one delivery. Add a measure that, in that delivery’s context, takes the max of “now − Dispatched” in ms only for lines that pass the filters.

Assume:
- `DispatchedTimestampGMT` = “Dispatched Timestamp (GMT)”
- `DropOffTimestampGMT` = “Drop Off Timestamp (GMT)”
- Dates in Qlik are stored as numbers (e.g. serial days) or as text in a format you can parse.

**Measure – Dispatch to picking (max interval in ms):**

```qlik
Max(
  If(
    Len(Trim(DispatchedTimestampGMT)) > 0
    and Num(DispatchedTimestampGMT)  // use Date# if stored as text — see below
    and (Len(Trim(DropOffTimestampGMT)) = 0 or not Num(DropOffTimestampGMT)),
    (Now(1) - DispatchedTimestampGMT) * 24 * 60 * 60 * 1000,
    Null()
  )
)
```

- `Now(1)` = current time in Qlik’s date serial (days with fraction).  
- If your timestamp fields are **already numeric** (Qlik date/time), use `Num(DispatchedTimestampGMT)` / `Num(DropOffTimestampGMT)` as above.  
- If they are **text** (e.g. `"2026-01-01 16:00"`), parse them in the measure. Example:

**When timestamps are text (e.g. `YYYY-MM-DD HH:mm`):**

```qlik
Max(
  If(
    Len(Trim(DispatchedTimestampGMT)) > 0
    and Num(Date#(Trim(DispatchedTimestampGMT), 'YYYY-MM-DD HH:mm'))
    and (Len(Trim(DropOffTimestampGMT)) = 0 or not Num(Date#(Trim(DropOffTimestampGMT), 'YYYY-MM-DD HH:mm'))),
    (Now(1) - Date#(Trim(DispatchedTimestampGMT), 'YYYY-MM-DD HH:mm')) * 24 * 60 * 60 * 1000,
    Null()
  )
)
```

Adjust the format in `Date#(..., '...')` to match your data (e.g. `'DD/MM/YYYY HH:mm'`).

---

## 2. Showing “Dispatch to picking” as a duration (e.g. “2d 5h”)

The formula above returns **milliseconds**. To show it like your `formatDurationMs` (e.g. “2d 5h”):

- Either **format the measure** in the chart: set the measure’s **Number format** to a custom format that turns a large number (ms) into something readable (Qlik doesn’t have a built-in “duration” format, so this is limited), **or**
- **Prefer**: compute the same value in the **load script** and store it as a **duration string** (e.g. “2d 5h”) in a new field, then use that field as the table column. The script would:
  - For each delivery, compute the same max(now − Dispatched) in ms only for lines with Dispatched set and no valid Drop Off.
  - Convert that max ms into “Xd Yh” (or “Xh Ym”) and store it in a field like `DispatchToPickingDuration`.

---

## 3. Line-level table (one row per line) but column “per delivery”

If the table has **one row per line** and you still want a column “Dispatch to picking” that shows the **delivery-level** max:

Use an **aggregation over delivery** and then take the max per line’s delivery, e.g.:

```qlik
Max(
  Aggr(
    If(
      Len(Trim(DispatchedTimestampGMT)) > 0
      and Num(DispatchedTimestampGMT)
      and (Len(Trim(DropOffTimestampGMT)) = 0 or not Num(DropOffTimestampGMT)),
      (Now(1) - DispatchedTimestampGMT) * 24 * 60 * 60 * 1000,
      Null()
    ),
    DeliveryId
  )
)
```

Replace `DeliveryId` with your delivery dimension name. Again, use `Date#(..., 'format')` if the timestamps are text.

---

## 4. Summary

| Your logic | Qlik |
|------------|------|
| Only lines with Dispatched set | `Len(Trim(DispatchedTimestampGMT)) > 0` and `Num(...)` or `Date#(...)` |
| Exclude lines with valid Drop Off | `Len(Trim(DropOffTimestampGMT)) = 0 or not Num(...)` |
| Interval | `(Now(1) - DispatchedTimestampGMT) * 24 * 60 * 60 * 1000` (ms) |
| Per-delivery max | `Max(If(..., interval, Null()))` in a chart with Delivery as dimension |
| Date format | Use `Date#(Trim(Field), 'YYYY-MM-DD HH:mm')` (or your format) if values are text |

Use the **delivery-dimension table** measure in section 1 (with `Date#` if needed) to replicate `maxDispatchToPickingMsForDelivery` in a Qlik Sense table; use section 3 only if the table is line-level but the column must be delivery-level.