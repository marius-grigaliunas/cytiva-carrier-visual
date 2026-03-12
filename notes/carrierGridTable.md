Good. Let me map each component to QlikSense specifics — chart types, expressions, and the logic behind each one.

1. Truck Strip → Straight Table with Conditional Coloring
This is the simplest one. You create a straight table with these columns:

Carrier name
Scheduled departure time
Countdown (calculated field)
Status (calculated field driving color)

The countdown expression would be something like:
Time(([DepartureTime] - Now()), 'h:mm') & ' remaining'
The conditional background color on the countdown cell:
If(([DepartureTime] - Now()) * 1440 < 90, Red(),
  If(([DepartureTime] - Now()) * 1440 < 120, RGB(245,158,11),
    Green()))
The * 1440 converts the fractional day QlikSense uses internally into minutes. For canceled trucks you add a flag field in your data model and use that to override the color to gray.
The tricky part here is that the truck schedule needs to live somewhere editable. The cleanest approach in QlikSense is an input table loaded from a small Excel or CSV file that someone updates at the start of shift. You reload the app and it picks up the day's schedule. Alternatively, QlikSense has an Input Field feature but it's limited — a maintained Excel file is more reliable in practice.

2. Carrier Cards → KPI Objects + Text & Image Objects
Each carrier card is not one QlikSense object — it's a group of 3-4 objects positioned together on the sheet. For each carrier you build:

A KPI object for packed pallets count
A KPI object for burn rate (pallets/hour)
A KPI object for projected pallets
A Text & Image object for the carrier name label with conditional background color

The packed pallets count:
Count({<CarrierName={'DHL'}, Status={'Packing Confirmed'}>} OrderID)
Burn rate — this is the key calculation. You need elapsed hours since first dispatch for that carrier today:
Count({<CarrierName={'DHL'}, Status={'Packing Confirmed'}>} OrderID)
/
(Now() - Min({<CarrierName={'DHL'}>} DispatchTimestamp)) * 24
The * 24 converts QlikSense's fractional day into hours.
Projected pallets by cutoff:
[DHL_BurnRate] * (([DHL_CutoffTime] - Now()) * 24)
+ [DHL_PackedCount]
You'd store the burn rate and packed count as variables or master measures to avoid repeating the formula everywhere.
For the card background color, the cleanest approach is a Text & Image object sized to cover the card area, with a background color expression:
If([DHL_MinutesToCutoff] < 90 And [DHL_BurnRateDrop] > 0.3, Red(),
  If([DHL_MinutesToCutoff] < 120, RGB(245,158,11),
    RGB(34,197,94)))

3. Pace Bar → Bullet Chart or Bar Chart (Single Bar)
QlikSense doesn't have a native gauge bar like in the mock, but you can fake it cleanly with a bar chart set to horizontal, with a single dimension (carrier name) and your pace health score as the measure.
Define pace health as a 0–100 score:
Min(100,
  (([DHL_BurnRate] / [DHL_HistoricalAvgRate]) * 100)
)
Where DHL_HistoricalAvgRate is your historical average pallets/hour for DHL at this time of day — this is where your two years of data becomes genuinely useful. You calculate that as an average from historical data loaded into the model.
Color the bar with a measure color expression using the same red/amber/green thresholds.
One bar per carrier, all on the same chart — that gives you a comparison at a glance across carriers.

4. Alerts Panel → Straight Table with Filter Expression
A straight table where each row is a carrier, but filtered to only show rows where an alert condition is true. The filter lives in the table's row condition or in a calculated dimension.
Create a calculated dimension:
If(
  ([MinutesToCutoff] < 90 And [PackedCount] < [HistoricalAvgAtThisHour] * 0.8)
  Or
  ([BurnRateDrop] > 0.35),
  CarrierName
)
Then suppress null values — the table only shows carriers that meet alert conditions. Add a text column that generates the alert message:
If([BurnRateDrop] > 0.35,
  'Burn rate dropped ' & Round([BurnRateDrop]*100) & '% in last 30 min. ',
  '') &
If([MinutesToCutoff] < 90,
  'Truck in ' & Round([MinutesToCutoff]) & ' min. Only ' & [PackedCount] & ' pallets confirmed.',
  '')

The data model you need to make this work
Everything above depends on having these fields cleanly available:

OrderID, CarrierName, Status, DispatchTimestamp, PackingConfirmedTimestamp
A separate table for today's truck schedule: CarrierName, TruckDepartureTime, IsCanceled
Historical aggregates table: CarrierName, HourOfDay, AvgPalletsConfirmed — pre-calculated from your two years of data and loaded as a static reference table

That last one is what makes the pace bar meaningful rather than arbitrary. Without historical context, you can only show raw numbers. With it, you can show whether 14 pallets at 09:00 for DHL is normal or already behind.

Practical build order
Start with the alerts table — it's the highest value, lowest complexity piece, and will immediately tell you if the underlying expressions are calculating correctly. Then build the KPI objects per carrier. The pace bar and truck strip come last because they depend on the schedule data model being clean.
Want me to help write the actual load script for the historical aggregates table, or the data model structure?My concern is ht e live schedule, from what I have played around in qliksense, I did not see ta place, or field where users could add their own data, which is crucial for this kind of graph, if i cannot add more trucks, there's very little use to show the default state7:26 AMThat's a valid concern and you're right to flag it. QlikSense's input capabilities are genuinely limited compared to what this needs.
The honest picture on QlikSense input
QlikSense does have "Input Fields" but they're clunky, require specific licensing (they're a Sense Enterprise feature), and are not designed for adding new rows — only editing existing cell values. So adding a new truck mid-shift is essentially not possible natively.
Your options are:

Option 1 — Editable source file (simplest, most practical)
The truck schedule lives in an Excel file on a shared drive that everyone with access can edit. QlikSense loads it on reload. A supervisor adds or cancels a truck in Excel, someone triggers a reload, and the dashboard updates.
The problem is the reload lag. If reloads are scheduled every 15-30 minutes, that's acceptable. If someone needs to cancel a truck and see it gone immediately, it's frustrating.

Option 2 — A small form outside QlikSense feeding the data
This is what I'd actually recommend. A dead simple separate page — could even be a Google Form, a Microsoft Form, or a tiny web app — where a supervisor inputs the day's truck schedule each morning, and any changes during the day. That data writes to a sheet or a table that QlikSense reads on reload.
This separates the "data entry" problem from the "visualisation" problem cleanly. QlikSense is good at the second one, not the first.

Option 3 — Reconsider the tool for this specific sheet
This is worth saying directly: the truck schedule strip with live editability, countdowns updating in real time, and cancel/add functionality — that's not what QlikSense is built for. It's an analytics tool, not an operational interface.
The carrier cards and alerts panel translate well to QlikSense because they're read-only visualisations of warehouse data you already have. But the live schedule component is fighting against the tool.
A practical split could be: build the carrier cards and alerts in QlikSense as a new sheet, and handle the truck schedule separately — even just a screen showing a manually maintained whiteboard-style list that someone updates. Low tech, but reliable.

The question that matters
Who would own updating the truck schedule each day, and how comfortable are they with tools? If it's a supervisor who's already in Excel daily, option 1 is fine. If you want zero friction and real-time updates, the dashboard probably needs to live outside QlikSense — or at least that one component does.
What's the setup like — do you have Microsoft 365 in the warehouse? That would open up some clean options with Power Apps or even just Forms + SharePoint as the input layer feeding QlikSense.No, I think this is out of scope for this week, right now we need to focus on carrier status, so my suggestion would be rather than having a card for every truck, we just have a card for carrier. And we set cutoff time for every carrier, that by 13:00 we have to be finished with everything for geodis.
By 18:00 everything is finished for DHL, just like that7:33 AMThat simplifies everything significantly and makes it much more buildable this week.
What this means practically
You hardcode the cutoff times per carrier directly in the QlikSense load script. No editable schedule needed, no external file dependency. The cutoffs are business rules, not operational data — they change rarely, and when they do, someone updates the script.
Something like this in the load script:
CarrierCutoffs:
Load * Inline [
    CarrierName, CutoffTime
    Geodis,      13:00
    DHL,         18:00
    KN Air,      11:00
    Expeditors,  14:00
    DHL Freight, 15:00
];
Done. That table joins to your order data on CarrierName and every expression downstream can reference CutoffTime directly.

What each carrier card then shows
With this simplification, each card becomes very clean:

Pallets packed confirmed so far today for that carrier
Burn rate (pallets/hour since first dispatch)
Time remaining until cutoff
Projected pallets by cutoff
Green/amber/red status based on pace vs time remaining

No truck countdown complexity. No schedule management. Just: are we going to finish this carrier's volume before their cutoff?

One thing to define before building
The amber/red threshold. Since you don't know the target volume, the alert has to trigger on pace drop or on time pressure alone. A simple rule to start with:

Red — burn rate dropped more than 30% in the last 30 minutes, AND less than 90 minutes to cutoff
Amber — either condition alone, or cutoff is under 2 hours with burn rate below historical average for that carrier at this hour

Does that logic feel right, or would you want to adjust those thresholds?