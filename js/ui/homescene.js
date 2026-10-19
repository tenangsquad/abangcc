/* ==========================================================================
   4e. HOME SCENE — the café comes alive behind the main menu
   --------------------------------------------------------------------------
   While the menu page is up, the 3D view shows a small throw-away demo shop instead of the player's real one:
   customers walk in, queue, get seated, play (the monitors light up) and leave, Abang strolls over to set them up.
   It runs the real game rules (so the animation is the real animation) but is never saved, has no money, trouble
   or sound, and the player's actual session is left untouched. The demo mirrors the real shop's PC count and perks,
   so the room looks like the player's own café.
   ========================================================================== */
(function (ns) {
  'use strict';

  const { State, S } = ns;
  const UI = ns.UI;

  let demo = null;
  let key = '';
  let spawnIn = 1;
  let seatIn = 0.8;

  function build(real) {
    const d = State.create(20070815);
    d.day = 4; // all the everyday customer types
    d.pcs = real.pcs.map((p, i) => {
      const pc = S.makePc(i);
      pc.tier = p.tier || 1;
      return pc;
    });
    d.perks = (real.perks || []).slice();
    d.phase = 'prep';
    State.startShift(d);
    Object.assign(d, { customers: [], beatPlan: [], specialAt: [], worldEvents: [], activeIssues: [], officer: null }); // none of the tutorial's scripted crowds
    return d;
  }

  /** Advance the demo shop by `dt` seconds and return it, ready to be drawn in place of `real`. */
  UI.homeScene = {
    step(real, dt) {
      const k = `${real.pcs.length}|${(real.perks || []).join(',')}`;
      if (!demo || k !== key) {
        demo = build(real);
        key = k;
        spawnIn = 1;
      }
      dt = Math.min(dt, 0.07);
      // no trouble, no inspections, a clock stuck at mid-afternoon
      Object.assign(demo, { eventCooldown: 1e9, spawnCooldown: 1e9, inspectionScheduled: 1e9, elapsed: 20, activeIssues: [], worldEvents: [] });

      spawnIn -= dt;
      const queue = State.inQueue(demo);
      if (spawnIn <= 0) {
        if (queue.length < 2 && State.idlePCs(demo).length > queue.length) State.spawn(demo);
        spawnIn = 2.5 + Math.random() * 3;
      }
      seatIn -= dt;
      if (seatIn <= 0) {
        seatIn = 0.7;
        const next = queue.find((c) => c.status === 'waiting');
        if (next) State.quickSeat(demo, next.id);
      }

      State.update(demo, dt);
      for (const pc of demo.pcs) {
        if (pc.fault || pc.issue) {
          pc.fault = null;
          pc.issue = null;
          pc.status = pc.customerId ? 'busy' : 'free';
        }
      }
      demo.customers = demo.customers.filter((c) => c.status !== 'event' && c.status !== 'officer'); // door crowds and officers are story beats, not scenery
      demo.logs.length = 0;
      State.drainFx(); // the demo is silent: its coins and doorbells are not for the player's ears
      return demo;
    },
  };
})(window.ABCC);
