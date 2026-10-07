// Multi-robot frontier exploration, drawn onto the notebook grid.
//
// Each robot senses the cells within SENSOR_RADIUS (line of sight, walls block),
// then drives to the nearest frontier (a known free cell next to an unknown one)
// that no other robot has claimed, along a path planned with A*. When nothing is left to explore, the map
// fades and a new one is generated. Visitors can draw or erase walls, change
// the number of robots, pause, and show each robot's planned path.

const SENSOR_RADIUS = 5;
const SPEED = 4; // cells per second
const CLAIM_SPACING = 4; // cells kept between claimed frontiers
const WALL_PENALTY = 0.5; // extra cost for cells touching a wall
const MAX_SEARCHES = 40; // A* runs allowed per goal selection
const NEIGHBOURS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const HOLD_MS = 2500;
const FADE_MS = 1200;
export const MIN_ROBOTS = 1;
export const MAX_ROBOTS = 6;
const DOCK: [number, number][] = [
  [1, 1],
  [2, 1],
  [1, 2],
  [2, 2],
  [3, 1],
  [1, 3],
  [3, 2],
  [2, 3],
];

const enum Cell {
  Unknown = 0,
  Free = 1,
  Wall = 2,
}

type Robot = {
  x: number; // continuous position, in cells
  y: number;
  path: number[]; // remaining waypoints, as cell indices
  target: number; // claimed frontier cell, -1 when idle
  trail: number[]; // visited positions, flat [x0, y0, x1, y1, ...]
  heading: number;
  pen: number; // index into the pen colours
  stuckAt: number; // map version when no goal was found, -1 otherwise
};

type Palette = { ink: string; explored: string; wall: string; paper: string; pens: string[] };

export type ExplorerStats = {
  /** Share of the reachable floor the robots have mapped, 0 to 100. */
  explored: number;
  robots: number;
  paused: boolean;
};

export type Explorer = {
  togglePause(): void;
  setRobotCount(n: number): void;
  newMap(): void;
  setShowPlans(show: boolean): void;
};

export function startExplorer(
  canvas: HTMLCanvasElement,
  keepOut: HTMLElement | null,
  onStats: (stats: ExplorerStats) => void = () => {},
  initialRobots = 4,
): Explorer | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');

  let cell = 24;
  let cols = 0;
  let rows = 0;
  let offsetX = 0; // aligns the simulation with the page's background grid
  let offsetY = 0;

  let truth = new Uint8Array(0); // the real map
  let known = new Uint8Array(0); // what the robots have seen
  let reserved = new Uint8Array(0); // cells under the headline: walls that are never drawn
  let reachable = new Uint8Array(0); // free cells connected to the dock
  let reachableCount = 1;
  let robots: Robot[] = [];
  let robotCount = Math.min(MAX_ROBOTS, Math.max(MIN_ROBOTS, initialRobots));
  let mapVersion = 0; // bumped whenever the known map changes
  let showPlans = true;

  let phase: 'exploring' | 'holding' | 'fading' = 'exploring';
  let phaseStart = 0;
  let fade = 1;
  let palette = readPalette();

  let running = false;
  let paused = false;
  let visible = true;
  let lastTime = 0;
  let lastStats = 0;
  let frame = 0;
  let hover = -1;

  function readPalette(): Palette {
    const s = getComputedStyle(canvas);
    const v = (name: string) => s.getPropertyValue(name).trim();
    return {
      ink: v('--ink'),
      explored: v('--explored'),
      wall: v('--wall'),
      paper: v('--paper-raised'),
      pens: [1, 2, 3, 4, 5, 6].map((n) => v(`--pen-${n}`)),
    };
  }

  const idx = (c: number, r: number) => r * cols + c;
  const inBounds = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows;
  const isBorder = (c: number, r: number) => c === 0 || r === 0 || c === cols - 1 || r === rows - 1;

  // ---------- map generation ----------

  function rand(min: number, max: number) {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  function generateMap() {
    truth = new Uint8Array(cols * rows).fill(Cell.Free);
    known = new Uint8Array(cols * rows).fill(Cell.Unknown);
    mapVersion++;
    reserved = new Uint8Array(cols * rows);

    for (let c = 0; c < cols; c++) {
      truth[idx(c, 0)] = Cell.Wall;
      truth[idx(c, rows - 1)] = Cell.Wall;
    }
    for (let r = 0; r < rows; r++) {
      truth[idx(0, r)] = Cell.Wall;
      truth[idx(cols - 1, r)] = Cell.Wall;
    }

    // Interior walls with doorways, like a floor plan.
    const segments = Math.round((cols * rows) / 90);
    for (let i = 0; i < segments; i++) {
      const horizontal = Math.random() < 0.5;
      const length = rand(4, 11);
      const c0 = rand(2, cols - 3);
      const r0 = rand(2, rows - 3);
      const door = rand(1, length - 2);
      for (let k = 0; k < length; k++) {
        if (k === door || k === door + 1) continue;
        const c = horizontal ? c0 + k : c0;
        const r = horizontal ? r0 : r0 + k;
        if (inBounds(c, r) && c < cols - 1 && r < rows - 1) truth[idx(c, r)] = Cell.Wall;
      }
    }

    // A few crates and pillars.
    const blocks = Math.round((cols * rows) / 160);
    for (let i = 0; i < blocks; i++) {
      const w = rand(1, 3);
      const h = rand(1, 2);
      const c0 = rand(3, cols - 4 - w);
      const r0 = rand(3, rows - 4 - h);
      for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) truth[idx(c, r)] = Cell.Wall;
    }

    markKeepOut();

    // Clear the dock where the robots start.
    for (let r = 1; r <= 3; r++) for (let c = 1; c <= 3; c++) if (!reserved[idx(c, r)]) truth[idx(c, r)] = Cell.Free;

    computeReachable();
  }

  // The headline box is an obstacle: robots drive around it, and it is never drawn.
  function markKeepOut() {
    if (!keepOut) return;
    const box = keepOut.getBoundingClientRect();
    const area = canvas.getBoundingClientRect();
    if (box.bottom <= area.top || box.top >= area.bottom || box.right <= area.left || box.left >= area.right) return;

    const c0 = Math.floor((box.left - area.left - offsetX) / cell);
    const c1 = Math.ceil((box.right - area.left - offsetX) / cell);
    const r0 = Math.floor((box.top - area.top - offsetY) / cell);
    const r1 = Math.ceil((box.bottom - area.top - offsetY) / cell);
    for (let r = Math.max(0, r0); r < Math.min(rows, r1); r++) {
      for (let c = Math.max(0, c0); c < Math.min(cols, c1); c++) {
        truth[idx(c, r)] = Cell.Wall;
        reserved[idx(c, r)] = 1;
      }
    }
  }

  // Free cells connected to the dock: the denominator of the "explored" figure.
  function computeReachable() {
    reachable = new Uint8Array(cols * rows);
    const start = idx(1, 1);
    if (truth[start] !== Cell.Free) {
      reachableCount = 1;
      return;
    }
    const queue = [start];
    reachable[start] = 1;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      const c = i % cols;
      for (const n of [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols]) {
        if (n < 0 || n >= cols * rows || reachable[n] || truth[n] !== Cell.Free) continue;
        reachable[n] = 1;
        queue.push(n);
      }
    }
    reachableCount = Math.max(1, queue.length);
  }

  // ---------- robots ----------

  function makeRobot(pen: number): Robot | null {
    const occupied = new Set(robots.map((r) => idx(Math.floor(r.x), Math.floor(r.y))));
    const spot = DOCK.find(([c, r]) => inBounds(c, r) && truth[idx(c, r)] === Cell.Free && !occupied.has(idx(c, r)));
    if (!spot) return null;
    const x = spot[0] + 0.5;
    const y = spot[1] + 0.5;
    const robot: Robot = { x, y, path: [], target: -1, trail: [x, y], heading: Math.PI / 4, pen, stuckAt: -1 };
    sense(robot);
    return robot;
  }

  function spawnRobots() {
    robots = [];
    for (let i = 0; i < robotCount; i++) {
      const robot = makeRobot(i);
      if (robot) robots.push(robot);
    }
  }

  // ---------- sensing ----------

  function sense(robot: Robot) {
    const rc = Math.floor(robot.x);
    const rr = Math.floor(robot.y);
    for (let dr = -SENSOR_RADIUS; dr <= SENSOR_RADIUS; dr++) {
      for (let dc = -SENSOR_RADIUS; dc <= SENSOR_RADIUS; dc++) {
        if (dc * dc + dr * dr > SENSOR_RADIUS * SENSOR_RADIUS) continue;
        castRay(rc, rr, rc + dc, rr + dr);
      }
    }
  }

  // Bresenham line from the robot; everything up to and including the first wall is seen.
  function castRay(c0: number, r0: number, c1: number, r1: number) {
    const dc = Math.abs(c1 - c0);
    const dr = -Math.abs(r1 - r0);
    const sc = c0 < c1 ? 1 : -1;
    const sr = r0 < r1 ? 1 : -1;
    let err = dc + dr;
    let c = c0;
    let r = r0;
    while (inBounds(c, r)) {
      const i = idx(c, r);
      if (known[i] !== truth[i]) {
        known[i] = truth[i];
        mapVersion++;
      }
      if (truth[i] === Cell.Wall || (c === c1 && r === r1)) return;
      const e2 = 2 * err;
      if (e2 >= dr) {
        err += dr;
        c += sc;
      }
      if (e2 <= dc) {
        err += dc;
        r += sr;
      }
    }
  }

  // ---------- planning ----------

  function isFrontier(i: number) {
    if (known[i] !== Cell.Free) return false;
    const c = i % cols;
    const r = (i - c) / cols;
    return (
      (c > 0 && known[i - 1] === Cell.Unknown) ||
      (c < cols - 1 && known[i + 1] === Cell.Unknown) ||
      (r > 0 && known[i - cols] === Cell.Unknown) ||
      (r < rows - 1 && known[i + cols] === Cell.Unknown)
    );
  }

  function claimedNear(i: number, self: Robot) {
    const c = i % cols;
    const r = (i - c) / cols;
    return robots.some((other) => {
      if (other === self || other.target < 0) return false;
      const oc = other.target % cols;
      const or = (other.target - oc) / cols;
      return Math.abs(oc - c) + Math.abs(or - r) < CLAIM_SPACING;
    });
  }

  // Goal selection: the unclaimed frontier with the cheapest A* path. Candidates
  // are tried nearest-first by octile distance; since that distance never exceeds
  // the true path cost, the search stops as soon as no candidate can do better.
  function assign(robot: Robot): boolean {
    const start = idx(Math.floor(robot.x), Math.floor(robot.y));
    const unclaimed: number[] = [];
    const claimed: number[] = [];
    for (let i = 0; i < known.length; i++) {
      if (i === start || !isFrontier(i)) continue;
      (claimedNear(i, robot) ? claimed : unclaimed).push(i);
    }

    // Every reachable frontier is claimed: share one rather than sit idle.
    const plan = cheapestPlan(start, unclaimed) ?? cheapestPlan(start, claimed);
    if (!plan) {
      robot.target = -1;
      robot.path = [];
      robot.stuckAt = mapVersion; // nothing to do until the map changes
      return false;
    }
    robot.stuckAt = -1;
    robot.target = plan.goal;
    robot.path = plan.path;
    return true;
  }

  function cheapestPlan(start: number, goals: number[]) {
    const h = (i: number) => octile(start, i);
    goals.sort((a, b) => h(a) - h(b));
    let best: { goal: number; path: number[]; cost: number } | null = null;
    let searches = 0;
    for (const goal of goals) {
      if (best && h(goal) >= best.cost) break;
      if (++searches > MAX_SEARCHES) break;
      const result = aStar(start, goal);
      if (result && (!best || result.cost < best.cost)) best = { goal, ...result };
    }
    return best;
  }

  // Octile distance: the exact cost of the shortest 8-connected path on an empty grid.
  function octile(a: number, b: number) {
    const dc = Math.abs((a % cols) - (b % cols));
    const dr = Math.abs(Math.floor(a / cols) - Math.floor(b / cols));
    return Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr);
  }

  function nearWall(i: number) {
    const c = i % cols;
    const r = (i - c) / cols;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if ((dc || dr) && inBounds(c + dc, r + dr) && known[idx(c + dc, r + dr)] === Cell.Wall) return true;
      }
    }
    return false;
  }

  // A* over known free cells, 8-connected. Diagonal steps may not cut a wall's
  // corner, and cells touching a wall cost a little more so robots keep clear.
  function aStar(start: number, goal: number): { path: number[]; cost: number } | null {
    const size = cols * rows;
    const g = new Float64Array(size).fill(Infinity);
    const parent = new Int32Array(size).fill(-1);
    const closed = new Uint8Array(size);
    const open = new MinHeap();
    g[start] = 0;
    parent[start] = start;
    open.push(start, octile(start, goal));

    while (open.size > 0) {
      const i = open.pop();
      if (closed[i]) continue;
      if (i === goal) {
        const path: number[] = [];
        for (let k = goal; k !== start; k = parent[k]) path.push(k);
        return { path: path.reverse(), cost: g[goal] };
      }
      closed[i] = 1;
      const c = i % cols;
      const r = (i - c) / cols;
      for (const [dc, dr] of NEIGHBOURS) {
        const nc = c + dc;
        const nr = r + dr;
        if (!inBounds(nc, nr)) continue;
        const n = idx(nc, nr);
        if (closed[n] || known[n] !== Cell.Free) continue;
        if (dc && dr && (known[idx(c + dc, r)] !== Cell.Free || known[idx(c, r + dr)] !== Cell.Free)) continue;
        const cost = g[i] + (dc && dr ? Math.SQRT2 : 1) + (nearWall(n) ? WALL_PENALTY : 0);
        if (cost < g[n]) {
          g[n] = cost;
          parent[n] = i;
          open.push(n, cost + octile(n, goal));
        }
      }
    }
    return null;
  }

  // ---------- simulation step ----------

  function step(dt: number) {
    let active = 0;
    for (const robot of robots) {
      if (robot.target >= 0 && !isFrontier(robot.target)) robot.target = -1;
      if (robot.target < 0 && (robot.stuckAt === mapVersion || !assign(robot))) continue;
      active++;

      let budget = SPEED * dt;
      while (budget > 0 && robot.path.length > 0) {
        const next = robot.path[0];
        if (known[next] === Cell.Wall) {
          robot.target = -1; // path ran into a newly seen wall; replan next step
          break;
        }
        const tx = (next % cols) + 0.5;
        const ty = Math.floor(next / cols) + 0.5;
        const dx = tx - robot.x;
        const dy = ty - robot.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1e-6) {
          const desired = Math.atan2(dy, dx);
          let turn = desired - robot.heading;
          turn = Math.atan2(Math.sin(turn), Math.cos(turn));
          robot.heading += turn * Math.min(1, dt * 10);
        }
        if (dist <= budget) {
          robot.x = tx;
          robot.y = ty;
          budget -= dist;
          robot.path.shift();
          robot.trail.push(tx, ty);
          sense(robot);
          if (!isFrontier(robot.target)) {
            robot.target = -1;
            break;
          }
        } else {
          robot.x += (dx / dist) * budget;
          robot.y += (dy / dist) * budget;
          budget = 0;
        }
      }
      if (robot.path.length === 0) robot.target = -1;
    }
    return active > 0;
  }

  function explored() {
    let mapped = 0;
    for (let i = 0; i < known.length; i++) if (reachable[i] && known[i] === Cell.Free) mapped++;
    return Math.min(100, Math.round((mapped / reachableCount) * 100));
  }

  function report() {
    onStats({ explored: explored(), robots: robots.length, paused });
  }

  // ---------- drawing ----------

  function pen(robot: Robot) {
    return palette.pens[robot.pen % palette.pens.length] || palette.ink;
  }

  function draw() {
    const w = canvas.width / devicePixelRatio;
    const h = canvas.height / devicePixelRatio;
    ctx!.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx!.clearRect(0, 0, w, h);
    ctx!.globalAlpha = fade;
    ctx!.translate(offsetX, offsetY);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = idx(c, r);
        if (reserved[i] || known[i] === Cell.Unknown) continue;
        if (known[i] === Cell.Free) {
          ctx!.fillStyle = palette.explored;
          ctx!.fillRect(c * cell, r * cell, cell, cell);
        } else {
          ctx!.fillStyle = palette.wall;
          ctx!.fillRect(c * cell + 5, r * cell + 5, cell - 10, cell - 10);
        }
      }
    }

    if (hover >= 0) {
      const c = hover % cols;
      const r = (hover - c) / cols;
      ctx!.strokeStyle = palette.ink;
      ctx!.lineWidth = 1.5;
      ctx!.setLineDash([]);
      ctx!.strokeRect(c * cell + 1.5, r * cell + 1.5, cell - 3, cell - 3);
    }

    ctx!.lineJoin = 'round';
    ctx!.lineCap = 'round';

    // Trails: where each robot has been.
    ctx!.lineWidth = 1.25;
    ctx!.setLineDash([2, 4]);
    ctx!.globalAlpha = fade * 0.55;
    for (const robot of robots) {
      ctx!.strokeStyle = pen(robot);
      ctx!.beginPath();
      for (let k = 0; k < robot.trail.length; k += 2) {
        const x = robot.trail[k] * cell;
        const y = robot.trail[k + 1] * cell;
        if (k === 0) ctx!.moveTo(x, y);
        else ctx!.lineTo(x, y);
      }
      ctx!.lineTo(robot.x * cell, robot.y * cell);
      ctx!.stroke();
    }
    ctx!.globalAlpha = fade;

    // Plans: where each robot is going, and the frontier it has claimed.
    if (showPlans) {
      ctx!.lineWidth = 2;
      ctx!.setLineDash([6, 5]);
      for (const robot of robots) {
        if (robot.target < 0 || robot.path.length === 0) continue;
        ctx!.strokeStyle = pen(robot);
        ctx!.beginPath();
        ctx!.moveTo(robot.x * cell, robot.y * cell);
        for (const i of robot.path) ctx!.lineTo(((i % cols) + 0.5) * cell, (Math.floor(i / cols) + 0.5) * cell);
        ctx!.stroke();
      }
      ctx!.setLineDash([]);
      const s = cell * 0.22;
      for (const robot of robots) {
        if (robot.target < 0) continue;
        const tx = ((robot.target % cols) + 0.5) * cell;
        const ty = (Math.floor(robot.target / cols) + 0.5) * cell;
        ctx!.strokeStyle = pen(robot);
        ctx!.beginPath();
        ctx!.moveTo(tx - s, ty - s);
        ctx!.lineTo(tx + s, ty + s);
        ctx!.moveTo(tx + s, ty - s);
        ctx!.lineTo(tx - s, ty + s);
        ctx!.stroke();
      }
    }

    // Robots: a body and a heading tick, outlined in the robot's pen colour.
    ctx!.setLineDash([]);
    const radius = cell * 0.36;
    for (const robot of robots) {
      const x = robot.x * cell;
      const y = robot.y * cell;
      ctx!.beginPath();
      ctx!.arc(x, y, radius, 0, Math.PI * 2);
      ctx!.fillStyle = palette.paper;
      ctx!.fill();
      ctx!.lineWidth = 2.25;
      ctx!.strokeStyle = pen(robot);
      ctx!.stroke();
      ctx!.beginPath();
      ctx!.moveTo(x, y);
      ctx!.lineTo(x + Math.cos(robot.heading) * radius, y + Math.sin(robot.heading) * radius);
      ctx!.stroke();
    }
    ctx!.globalAlpha = 1;
  }

  // ---------- editing: click or drag to draw and erase walls ----------

  function cellAt(event: PointerEvent): number {
    const rect = canvas.getBoundingClientRect();
    const c = Math.floor((event.clientX - rect.left - offsetX) / cell);
    const r = Math.floor((event.clientY - rect.top - offsetY) / cell);
    if (!inBounds(c, r) || isBorder(c, r) || reserved[idx(c, r)]) return -1;
    return idx(c, r);
  }

  function occupied(i: number) {
    return robots.some((robot) => idx(Math.floor(robot.x), Math.floor(robot.y)) === i || robot.path[0] === i);
  }

  function setCell(i: number, value: Cell.Free | Cell.Wall) {
    if (i < 0 || truth[i] === value || (value === Cell.Wall && occupied(i))) return;
    truth[i] = value;
    // Changes inside the mapped area are seen at once; elsewhere robots discover them.
    if (known[i] !== Cell.Unknown) known[i] = value;
    mapVersion++;
    computeReachable();
    wake();
    report();
  }

  let painting: Cell.Free | Cell.Wall | null = null;

  canvas.addEventListener('pointerdown', (event) => {
    const i = cellAt(event);
    if (i < 0 || event.button !== 0) return;
    painting = truth[i] === Cell.Wall ? Cell.Free : Cell.Wall;
    setCell(i, painting);
    // Mouse and pen can drag to paint; touch keeps scrolling the page.
    if (event.pointerType === 'touch') painting = null;
    else canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    const i = event.pointerType === 'touch' ? -1 : cellAt(event);
    if (painting !== null && i >= 0) setCell(i, painting);
    if (i !== hover) {
      hover = i;
      if (!running) draw();
    }
  });

  const stopPainting = () => (painting = null);
  canvas.addEventListener('pointerup', stopPainting);
  canvas.addEventListener('pointercancel', stopPainting);
  canvas.addEventListener('pointerleave', () => {
    hover = -1;
    if (!running) draw();
  });

  // ---------- lifecycle ----------

  function reset() {
    generateMap();
    spawnRobots();
    phase = 'exploring';
    fade = 1;
  }

  // After an edit, get back to exploring (or, without motion, show the new result).
  function wake() {
    if (phase !== 'exploring' && fade > 0) {
      phase = 'exploring';
      fade = 1;
    }
    if (reducedMotion.matches) renderFinished();
    else if (!running) draw();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    cell = parseFloat(getComputedStyle(canvas).getPropertyValue('--cell')) || 24;
    // The page grid starts at the document origin; snap to it.
    const pageLeft = rect.left + window.scrollX;
    const pageTop = rect.top + window.scrollY;
    offsetX = (cell - (pageLeft % cell)) % cell;
    offsetY = (cell - (pageTop % cell)) % cell;
    cols = Math.floor((rect.width - offsetX) / cell);
    rows = Math.floor((rect.height - offsetY) / cell);
    canvas.width = Math.round(rect.width * devicePixelRatio);
    canvas.height = Math.round(rect.height * devicePixelRatio);
    reset();
    if (reducedMotion.matches) renderFinished();
    else draw();
    report();
  }

  // Reduced motion: compute a whole run up front and show only the result.
  function renderFinished() {
    for (let i = 0; i < 20000 && step(1 / 30); i++);
    fade = 1;
    draw();
    report();
  }

  function tick(time: number) {
    if (!running) return;
    const dt = Math.min(0.05, (time - lastTime) / 1000 || 0);
    lastTime = time;

    if (phase === 'exploring') {
      if (!step(dt)) {
        phase = 'holding';
        phaseStart = time;
      }
    } else if (phase === 'holding' && time - phaseStart > HOLD_MS) {
      phase = 'fading';
      phaseStart = time;
    } else if (phase === 'fading') {
      fade = Math.max(0, 1 - (time - phaseStart) / FADE_MS);
      if (fade === 0) reset();
    }

    draw();
    if (time - lastStats > 250) {
      lastStats = time;
      report();
    }
    frame = requestAnimationFrame(tick);
  }

  function updateRunning() {
    const shouldRun = visible && !paused && !document.hidden && !reducedMotion.matches;
    if (shouldRun && !running) {
      running = true;
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    } else if (!shouldRun && running) {
      running = false;
      cancelAnimationFrame(frame);
      draw();
    }
  }

  let resizeTimer = 0;
  let lastWidth = 0;
  new ResizeObserver(() => {
    // Mobile browsers resize the viewport when the address bar hides; ignore height-only changes.
    const width = canvas.getBoundingClientRect().width;
    if (width === lastWidth) return;
    lastWidth = width;
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 150);
  }).observe(canvas);

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    updateRunning();
  }).observe(canvas);

  document.addEventListener('visibilitychange', updateRunning);
  reducedMotion.addEventListener('change', () => {
    updateRunning();
    if (reducedMotion.matches) renderFinished();
  });
  const repaint = () => {
    palette = readPalette();
    if (!running) draw();
  };
  darkScheme.addEventListener('change', repaint);
  // The header's theme button switches colours by setting data-theme on <html>.
  new MutationObserver(repaint).observe(document.documentElement, { attributeFilter: ['data-theme'] });

  lastWidth = canvas.getBoundingClientRect().width;
  resize();
  updateRunning();

  // The headline box is measured as an obstacle, and it changes size once its
  // web fonts load. Start over with the final size.
  if (document.fonts.status !== 'loaded') document.fonts.ready.then(resize);

  return {
    togglePause() {
      paused = !paused;
      updateRunning();
      report();
    },
    setRobotCount(n: number) {
      robotCount = Math.min(MAX_ROBOTS, Math.max(MIN_ROBOTS, n));
      while (robots.length > robotCount) robots.pop();
      while (robots.length < robotCount) {
        const used = new Set(robots.map((r) => r.pen));
        const free = [...Array(MAX_ROBOTS).keys()].find((p) => !used.has(p)) ?? robots.length;
        const robot = makeRobot(free);
        if (!robot) break; // the dock is full; try again once robots have left it
        robots.push(robot);
      }
      wake();
      report();
    },
    newMap() {
      reset();
      if (reducedMotion.matches) renderFinished();
      else draw();
      report();
    },
    setShowPlans(show: boolean) {
      showPlans = show;
      if (!running) draw();
    },
  };
}

// Binary min-heap of cell indices keyed by priority, for the A* open set.
class MinHeap {
  private items: number[] = [];
  private keys: number[] = [];

  get size() {
    return this.items.length;
  }

  push(item: number, key: number) {
    let i = this.items.length;
    this.items.push(item);
    this.keys.push(key);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (this.keys[up] <= key) break;
      this.items[i] = this.items[up];
      this.keys[i] = this.keys[up];
      i = up;
    }
    this.items[i] = item;
    this.keys[i] = key;
  }

  pop(): number {
    const top = this.items[0];
    const item = this.items.pop()!;
    const key = this.keys.pop()!;
    const n = this.items.length;
    if (n > 0) {
      let i = 0;
      while (true) {
        let child = 2 * i + 1;
        if (child >= n) break;
        if (child + 1 < n && this.keys[child + 1] < this.keys[child]) child++;
        if (this.keys[child] >= key) break;
        this.items[i] = this.items[child];
        this.keys[i] = this.keys[child];
        i = child;
      }
      this.items[i] = item;
      this.keys[i] = key;
    }
    return top;
  }
}
