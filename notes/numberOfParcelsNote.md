
Here’s how to mirror that logic in Qlik Sense.

## 1. Parcel container type (same rules as `isParcelContainerType`)

- Value (after Trim + Upper) must start with `CC-`.
- Suffix after `CC-` must **not** start with `PALL`, `BPALL`, or `PF`.

In Qlik, use **WildMatch** (pattern `*` = any characters). Parcel condition:

```qlik
WildMatch(Upper(Trim(ContainerType)), 'CC-*')
and not WildMatch(Upper(Trim(ContainerType)), 'CC-PALL*', 'CC-BPALL*', 'CC-PF*')
```

Replace `ContainerType` with your actual field name if different.

---

## 2. Count parcels per delivery (same as `countParcelsForDelivery`)

You want: **per delivery**, count **distinct Outermost LPN** where:

- Container type is parcel (expression above), and  
- LPN is non-empty (after trim).

Use this as a **measure** in a chart that has **Delivery** (or your delivery ID field) as dimension.

**Measure – Count of parcels (distinct LPNs) per delivery:**

```qlik
Count(distinct 
  If(
    WildMatch(Upper(Trim(ContainerType)), 'CC-*')
    and not WildMatch(Upper(Trim(ContainerType)), 'CC-PALL*', 'CC-BPALL*', 'CC-PF*')
    and Len(Trim(OutermostLPN)) > 0,
    OutermostLPN
  )
)
```

Replace:

- `ContainerType` → your container type field  
- `OutermostLPN` → your outermost LPN field  
- Dimension of the chart = your delivery ID field (so the count is “per delivery”).

---

## 3. Optional: reusable “Is parcel” flag

In the data load script you can add a flag so you don’t repeat the WildMatch in every chart:

```qlik
// In your load script, after loading the table that has ContainerType:
YourTable:
Load
  *,
  If(
    WildMatch(Upper(Trim(ContainerType)), 'CC-*')
    and not WildMatch(Upper(Trim(ContainerType)), 'CC-PALL*', 'CC-BPALL*', 'CC-PF*'),
    1,
    0
  ) as IsParcelContainer
Resident YourTable;
```

Then the measure can be:

```qlik
Count(distinct If(IsParcelContainer = 1 and Len(Trim(OutermostLPN)) > 0, OutermostLPN))
```

---

## 4. Summary

| Your logic | Qlik implementation |
|-----------|----------------------|
| Container starts with `CC-` | `WildMatch(Upper(Trim(ContainerType)), 'CC-*')` |
| Exclude `CC-PALL*`, `CC-BPALL*`, `CC-PF*` | `not WildMatch(..., 'CC-PALL*', 'CC-BPALL*', 'CC-PF*')` |
| Same delivery | Use delivery ID as chart dimension |
| Distinct LPNs, non-empty | `Count(distinct If(..., OutermostLPN))` with `Len(Trim(OutermostLPN)) > 0` inside the `If` |

This replicates the same rules as `isParcelContainerType` and `countParcelsForDelivery` in Qlik Sense.