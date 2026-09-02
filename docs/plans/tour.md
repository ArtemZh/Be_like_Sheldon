# The guided tour and the way into the modes — plan

Status: **done**. Eight steps, as planned; what was not in the plan got
added along the way: after "Done" the tour returns to the welcome window
and the first mode, and the step pointing at a collapsed panel expands it
first.

## Why

Three modes on one map are three different applications, and right now
people stumble into them by accident. Two ways in are needed:

1. **From the welcome window** — three buttons, one per mode, and a fourth:
   "show the tour".
2. **The tour** — seven steps that switch modes themselves, highlight the
   element in question and explain what it is.

## How the highlight works

- A full-screen dimmer with a frame "cut out" around the target element.
  Done not with a mask but with a large shadow on a transparent block laid
  over the element: one node instead of four, and the frame animates itself
  between steps.
- The explanation card sits next to the frame (above, below, left or right,
  depending on where there is more room) and has a triangular arrow
  pointing at the highlighted element.
- Steps: "Next", "Back", "Skip", Esc. Clicking the dimmer does nothing, so
  a stray click cannot kill the tour.
- A step may declare a mode (`mode`) — we switch to it before showing and
  wait for the redraw.
- A step may declare an action (`action`) — for example computing a demo
  route so that there is something to look at.

## The steps

**Where can I get**

1. **Parameters** — highlight "minimum on site" and "coffee and a hotdog".
   Text: the metric is not travel time but useful time on the ground, and
   these two sliders set how much of it you need.
2. **The map** — highlight the map, having first computed a route from
   Frankfurt. Text: click anywhere and I will take the nearest station; the
   colour of a dot is how many hours are left on the ground.
3. **The board and the timeline** — highlight the timeline. Text: hover a
   station to see the arrival time and the last train back; the timeline
   scrolls through the day.

**Sheldon's route**

4. **Three route cards** — what he planned, how it turned out, the way
   home. Clicking a card switches the map.
5. **The story text** — paragraphs switch the map too: read about the
   points at Frankfurt and you see Frankfurt.

**Screen saver**

6. **The board** — every 30 seconds it shows either a live train with its
   route or a fact about German railways.
7. **Dots and counters** — three shades: just arrived, standing, leaving in
   half a minute. The same three numbers in the panel.
8. **Settings** — real time or an accelerated day, the whole map or only
   the visible part, and the two panel-collapsing buttons.

Eight steps instead of three: two or three screens per mode. Fewer does not
work — the day mode has three different things in it (parameters, map,
time).

## Files

- `web/src/tour.js` — the steps as data (selector, mode, title, text,
  action) and a pure function choosing where to put the card. Under tests.
- `web/src/map.js` — starting the tour, moving between steps, the
  highlight.
- `web/index.html` + `style.css` — the markup of the card and the dimmer,
  the buttons in the welcome window.
- `i18n` — texts in Ukrainian; translations in a separate pass.
