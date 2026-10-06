# Spikes

A **spike** builds just enough to **measure something specific** and answer a question before
you commit to a route. Its main output is knowledge — but its code is **not necessarily
throwaway**: if the spike proves useful, it may become the basis of the real implementation.

```yaml
---
type: spike        # or: raconiter
status: draft
---
```

## Measures — settled during design

A spike isn't designed until it says what it will measure:

```markdown
## Measures

- **Question:** can ascending and descending slots be paired without missing the 20-minute cycle?
- **Hypothesis:** pairing cuts water use by ~40% with no extra waiting.
- **Measure:** simulate a week of real bookings at Castlefield, paired vs unpaired.
- **Answer criteria:** yes if water use drops ≥ 30% and median wait rises < 2 minutes.
- **Time-box:** 3 days.
```

Creating a spike gives you this skeleton.

## Running it

> Run the spike sb#24.

The **spike** brief (`implement` on a spike gives the same) asks the agent to:

- build the **smallest implementation that makes the numbers meaningful**, noting every shortcut;
- work on a **dedicated spike branch** — committed and kept, but not merged;
- keep the code tidy enough to build on, with the measuring harness separate from the code under test;
- stay inside the time-box, and measure exactly what `## Measures` asks.

## Findings

```markdown
## Findings

- **Method:** …
- **Results:** water use −37%; median wait +1m10s.
- **Conclusion:** yes, with moderate confidence (one lock, one week).
- **Code:** adapt — branch `spike/slot-booking-24`; the simulator is reusable.
```

Then the agent resolves the open questions the findings answer in initiatives that link to the
spike, and proposes follow-ups — typically an implementation initiative that lists the spike
under `## Dependencies` and starts from its branch. `complete` reminds you of those questions,
and a spike's `docs_impact` defaults to none: the knowledge lives in the initiative.
