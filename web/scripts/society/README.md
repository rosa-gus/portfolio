# Archive society

A small simulation in the Cases document grid. It starts after eight seconds and
stays in the visible corridors. Document icons act as shelters, and labels
stay clear.

Up to four asterisks can occupy the corridors. Sheltered residents can still
peek from the edge and slip back inside while all four slots are taken. After
fully emerging, each spends at least 10 seconds outside. Residents explore or
seek company until their interest runs out. Unstarted interests expire after
roughly 20–25 seconds, while an encounter in progress can finish. A confirmed
encounter has a 34% chance of a short, silent murmur. A bubble can appear above,
below, or beside its speaker. The 34–54 second cooldown starts once the line is
displayed.

Occasional silent events respond to the grid: a passer-by prompts a peek, a
shared walk splits at a clear branch, or one resident replaces another at the
same shelter. Events share a cooldown and respect the corridor limit.

```text
[ SHELTER ]
     |
     v
first walk
     |
     +-- company nearby? --> approach --> meet --> may walk together
     |
     +-- alone? -----------> explore another corridor
                                      |
                           interest ends or stalls
                                      |
                            10 seconds outside?
                              |             |
                              no           yes
                              |             |
                          keep looking   return to shelter
```

A click, touch, key or wheel input ends the visit for the tab session without
interrupting the action. The session flag is `portfolio:v1:asterisks`. Direct
links to an item skip the scene. Reduced motion disables it, and hidden tabs
pause it.

`engine.ts` manages residents and paths, `events.ts` schedules contextual
events, and `index.ts` measures and draws the grid.
Run `node --test tools/tests/society*.test.mjs` to check them.
