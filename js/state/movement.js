/* ==========================================================================
   2c. MOVEMENT — the character locomotion controller
   --------------------------------------------------------------------------
   Smooth steering along open aisles (accelerate, decelerate before the goal,
   turn naturally), plus soft separation so people don't walk through each other.
   Pure data: it moves {x, y, vx, vy, facing, walkCycle, moveIntensity} records.
   ========================================================================== */
(function (ns) {
  'use strict';

  const { ROOM } = ns;
  const S = ns.S;

  /** True when `pos` is (almost) on top of a PC chair. */
  function isSeated(pos) {
    for (let i = 0; i < ROOM.maxPcs; i++) {
      const seat = ROOM.seatFor(ROOM.pcSlot(i));
      if (Math.hypot(pos.x - seat.x, pos.y - seat.y) < 0.4) return true;
    }
    return false;
  }

  /**
   * Build a list of waypoints from the entity to `goal` that stays on walkable
   * lanes: left lane → aisle → desk, and the reverse. Seats are entered from the
   * left of the chair so nobody walks through a backrest. The counter is solid:
   * Abang leaves/enters his spot behind it through the hatch gap, and customers
   * enter or leave the queue lane through its open end by the door.
   */
  function planRoute(entity, goal) {
    const { laneX, aisleBack, aisleFront, sidestep, hatchY } = ROOM;
    const aisleFor = (y) => (y < (aisleBack + aisleFront) / 2 ? aisleBack : aisleFront);
    const inLeftZone = (p) => p.x < laneX + 0.4;
    const goalIsSeat = entity.status === 'walkToPc';
    const route = [];
    let pos = { x: entity.x, y: entity.y };
    const go = (x, y) => {
      route.push({ x, y });
      pos = { x, y };
    };

    if (ROOM.behindCounter(pos) && !ROOM.behindCounter(goal)) go(pos.x, hatchY);
    else if (ROOM.inQueueLane(pos) && inLeftZone(goal) && !ROOM.inQueueLane(goal)) go(ROOM.queue.x, ROOM.queue.entryY);

    if (!inLeftZone(pos)) {
      if (isSeated(pos)) go(pos.x - sidestep, pos.y);
      const nearest = Math.abs(pos.y - aisleBack) < Math.abs(pos.y - aisleFront) ? aisleBack : aisleFront;
      const onAisle = Math.abs(pos.y - nearest) < 0.8;
      const currentAisle = onAisle ? nearest : aisleFor(pos.y);
      if (Math.abs(pos.y - currentAisle) > 0.05) go(pos.x, currentAisle);
      if (inLeftZone(goal) || aisleFor(goal.y) !== currentAisle) go(laneX, currentAisle);
    }

    if (inLeftZone(goal)) {
      if (ROOM.behindCounter(goal) && !ROOM.behindCounter(pos)) {
        go(laneX, hatchY);
        go(goal.x, hatchY);
      } else if (ROOM.inQueueLane(goal) && !ROOM.inQueueLane(pos)) go(ROOM.queue.x, ROOM.queue.entryY);
      else if (pos.x >= laneX - 0.05) go(laneX, goal.y);
    } else {
      const goalAisle = aisleFor(goal.y);
      if (inLeftZone(pos)) {
        if (Math.abs(pos.x - laneX) > 0.05) go(laneX, pos.y);
        go(laneX, goalAisle);
      }
      if (goalIsSeat) {
        go(goal.x - sidestep, goalAisle);
        go(goal.x - sidestep, goal.y);
      } else {
        go(goal.x, goalAisle);
      }
    }
    go(goal.x, goal.y);
    return route.filter((v, i, all) => Math.hypot(v.x - (i ? all[i - 1].x : entity.x), v.y - (i ? all[i - 1].y : entity.y)) > 0.05);
  }

  /**
   * Accelerating, decelerating steering with smooth turning.
   * Returns true on the frame the destination is reached.
   */
  function updateMove(entity, dt, speed = 2.45) {
    const dt0 = Math.min(0.09, Math.max(0, dt));
    if (!entity.destination) {
      entity.vx = (entity.vx || 0) * Math.exp(-15 * dt0);
      entity.vy = (entity.vy || 0) * Math.exp(-15 * dt0);
      entity.moveIntensity = Math.max(0, (entity.moveIntensity || 0) - dt0 * 5);
      return false;
    }

    const goal = entity.destination;
    const signature = `${goal.x.toFixed(2)}:${goal.y.toFixed(2)}:${entity.status || 'staff'}`;
    if (entity._routeGoal !== signature) {
      entity._routeGoal = signature;
      entity._route = planRoute(entity, goal);
      entity.vx = entity.vx || 0;
      entity.vy = entity.vy || 0;
    }

    let next = entity._route?.[0] || goal;
    let dx = next.x - entity.x;
    let dy = next.y - entity.y;
    let dist = Math.hypot(dx, dy);

    const isLast = !entity._route || entity._route.length <= 1;
    if (dist < (isLast ? 0.075 : 0.22)) {
      entity.x = next.x;
      entity.y = next.y;
      entity._route?.shift();
      next = entity._route?.[0];
      if (!next) {
        entity.destination = null;
        entity._routeGoal = null;
        entity._route = [];
        entity.vx = 0;
        entity.vy = 0;
        entity.moveIntensity = 0;
        return true;
      }
      dx = next.x - entity.x;
      dy = next.y - entity.y;
      dist = Math.hypot(dx, dy);
    }

    // Slow down when approaching a waypoint, ease velocity towards the desired one.
    const cap = Math.min(speed, Math.sqrt(Math.max(0, dist) * 11.5));
    const desiredVX = dist > 0 ? (dx / dist) * cap : 0;
    const desiredVY = dist > 0 ? (dy / dist) * cap : 0;
    const responsiveness = 1 - Math.exp(-10.5 * dt0);
    entity.vx = (entity.vx || 0) + (desiredVX - (entity.vx || 0)) * responsiveness;
    entity.vy = (entity.vy || 0) + (desiredVY - (entity.vy || 0)) * responsiveness;

    const velMag = Math.hypot(entity.vx, entity.vy);
    const travel = Math.min(dist, velMag * dt0);
    if (velMag > 1e-5) {
      entity.x += (entity.vx / velMag) * travel;
      entity.y += (entity.vy / velMag) * travel;
    }
    entity.moveIntensity = Math.min(1, velMag / Math.max(0.01, speed));
    entity.walkCycle = (entity.walkCycle || 0) + travel * (entity.stride || 5.4);

    if (velMag > 0.04) {
      const target = Math.atan2(entity.vx, entity.vy);
      const current = entity.facing ?? target;
      const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
      entity.facing = current + diff * (1 - Math.exp(-9 * dt0));
    }
    return false;
  }

  const SEPARATION = 0.58; // personal space radius (world units)
  /** Who has right of way when two walkers meet: the officer and Abang first, then lower ids. */
  const rank = (e, s) => (e === s.player ? 3 : e.status === 'officer' ? 4 : 0);
  const goalFade = (e) => {
    // fade the push out near the final goal, so nobody can be blocked from arriving
    if (!e.destination) return 1;
    return Math.max(0, Math.min(1, (Math.hypot(e.destination.x - e.x, e.destination.y - e.y) - 0.25) / 1.0));
  };

  /**
   * Gentle separation: a person who is walking steps aside for anyone closer than
   * SEPARATION. Only the walker with lower right of way yields (so two people meeting
   * head-on never deadlock), standing people are never pushed, and seated people, the
   * standing queue and the door crowd are left alone — nothing shoves the queue out of its lane.
   */
  function separate(s, dt) {
    const bodies = [];
    for (const c of s.customers) {
      if (c.status === 'gone' || c.status === 'playing' || (c.status === 'walkToPc' && !c.destination)) continue;
      if ((c.sitBlend || 0) > 0.4) continue;
      bodies.push(c);
    }
    bodies.push(s.player);
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        const am = !!a.destination, bm = !!b.destination;
        if (!am && !bm) continue;
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d >= SEPARATION || d < 1e-4) continue;
        // who yields? a standing person never does; of two walkers the lower rank (then higher id) does
        let yielder = null;
        if (am && !bm) yielder = a;
        else if (bm && !am) yielder = b;
        else {
          const ra = rank(a, s), rb = rank(b, s);
          yielder = ra !== rb ? (ra < rb ? a : b) : (a.id || 0) > (b.id || 0) ? a : b;
        }
        const sign = yielder === a ? 1 : -1;
        const nx = (dx / d) * sign, ny = (dy / d) * sign;
        const push = ((SEPARATION - d) / SEPARATION) * 2.4 * dt * goalFade(yielder);
        // a sideways bias so the yielder slides around instead of backing straight away
        yielder.x += (nx - ny * 0.6) * push;
        yielder.y += (ny + nx * 0.6) * push;
      }
    }
  }

  Object.assign(S, { isSeated, planRoute, updateMove, separate });
})(window.ABCC);
