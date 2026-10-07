// HTTP client for postflop-solver-api (/game/*, /solves). Mirrors the former
// worker handler so components keep their call sites.

const BASE = ""; // relative: dev server proxies it, prod serves from the API

export type CurrentPlayer = "oop" | "ip" | "chance" | "terminal";

export type EvModel =
  | { type: "chip_ev" }
  | { type: "icm_bubble_factor"; oop: number; ip: number }
  | {
      type: "terminal_icm";
      stacks: number[];
      payouts: number[];
      oop_seat: number;
      ip_seat: number;
    };

export type TreeParams = {
  board_len: number;
  starting_pot: number;
  effective_stack: number;
  donk_option: boolean;
  oop_flop_bet: string;
  oop_flop_raise: string;
  oop_turn_bet: string;
  oop_turn_raise: string;
  oop_turn_donk: string;
  oop_river_bet: string;
  oop_river_raise: string;
  oop_river_donk: string;
  ip_flop_bet: string;
  ip_flop_raise: string;
  ip_turn_bet: string;
  ip_turn_raise: string;
  ip_river_bet: string;
  ip_river_raise: string;
  add_allin_threshold: number;
  force_allin_threshold: number;
  merging_threshold: number;
  added_lines: string;
  removed_lines: string;
};

export type TreeEdit =
  | { op: "add_bet"; amount: number; is_raise: boolean }
  | { op: "remove_node" }
  | { op: "delete_added"; line: string }
  | { op: "delete_removed"; line: string };

export type TreeNode = {
  actions: string;
  is_terminal: boolean;
  is_chance: boolean;
  total_bet_amount: [number, number];
};

export type TreeResponse = {
  is_error: boolean;
  added_lines: string;
  removed_lines: string;
  invalid_terminals: string;
  line: string[];
  failed_at: number | null;
  nodes: TreeNode[];
};

export type RangeOp = { row: number; col: number; weight: number };

export type RangeResponse = {
  error: string | null;
  weights: number[];
  raw: number[];
  text: string;
};

export type SolveRecord = {
  id: number;
  memo: string;
  board: { flop: string; turn: string | null; river: string | null };
  final_exploitability: number;
  num_iterations: number;
  ev_unit: string;
  blob_bytes: number;
  created_at_ms: number;
  [key: string]: unknown;
};

/** A finalized game still in server memory (unsaved runs included). */
export type LiveGame = {
  game_id: string;
  request: unknown;
  ev_unit: string;
  target_exploitability: number;
  iterations: number;
  exploitability: number | null;
  expires_in_secs: number;
};

type NodeResponse = {
  current_player: CurrentPlayer;
  num_actions: number;
  actions: string;
  total_bet_amount: [number, number];
  possible_cards: number;
};

export type GameInfo = {
  threads: number;
  targetExploitability: number;
  evUnit: string;
};

const post = async <T>(path: string, body: unknown = {}): Promise<T> => {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parse<T>(res);
};

const parse = async <T>(res: Response): Promise<T> => {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON body (e.g. proxy error page)
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error;
    throw new Error(msg || text || `${res.status} ${res.statusText}`);
  }
  return data as T;
};

const toNumbers = (data: (number | null)[]) =>
  Float64Array.from(data, (v) => v ?? NaN);

let gameId: string | null = null;
// Finalized games stay on the server (until TTL/eviction) so they can be reopened.
let finalized = false;
let history: number[] = [];
let lastNode: { key: string; value: NodeResponse } | null = null;
let memory: [number, number] = [0, 0];

const gamePath = (action: string) => {
  if (!gameId) throw new Error("No game: build a tree first");
  return `/game/${gameId}/${action}`;
};

const closeGame = async () => {
  if (!gameId) return;
  const id = gameId;
  gameId = null;
  lastNode = null;
  if (finalized) return;
  try {
    await post(`/game/${id}/close`);
  } catch {
    // closing is best effort; the server also expires idle games
  }
};

// Free server memory when the tab goes away.
window.addEventListener("pagehide", () => {
  if (gameId && !finalized) {
    const blob = new Blob(["{}"], { type: "application/json" });
    navigator.sendBeacon(`${BASE}/game/${gameId}/close`, blob);
  }
});

const node = async (append: ArrayLike<number> = []) => {
  const body = { history, append: Array.from(append) };
  const key = JSON.stringify(body);
  if (lastNode?.key === key) return lastNode.value;
  const value = await post<NodeResponse>(gamePath("node"), body);
  lastNode = { key, value };
  return value;
};

const setGame = async (id: string) => {
  await closeGame();
  gameId = id;
  finalized = true;
  history = [];
};

export const handler = {
  /** Info of the last built/loaded game (threads, server target, EV unit). */
  info: { threads: 0, targetExploitability: 0, evUnit: "chips" } as GameInfo,

  /** Builds the game. Returns an error string (empty on success). */
  async init(
    oopRange: Float32Array,
    ipRange: Float32Array,
    flop: Uint8Array,
    startingPot: number,
    effectiveStack: number,
    rakePercentage: number,
    rakeCap: number,
    donkOption: boolean,
    oopFlopBet: string,
    oopFlopRaise: string,
    oopTurnBet: string,
    oopTurnRaise: string,
    oopTurnDonk: string,
    oopRiverBet: string,
    oopRiverRaise: string,
    oopRiverDonk: string,
    ipFlopBet: string,
    ipFlopRaise: string,
    ipTurnBet: string,
    ipTurnRaise: string,
    ipRiverBet: string,
    ipRiverRaise: string,
    addAllInThreshold: number,
    forceAllInThreshold: number,
    mergingThreshold: number,
    addedLines: string,
    removedLines: string,
    evModel?: EvModel,
    targetExploitabilityPct?: number,
    threads?: number
  ): Promise<string> {
    await closeGame();
    try {
      const res = await post<{
        game_id: string;
        memory: [number, number];
        target_exploitability: number;
        ev_unit: string;
        threads: number;
      }>("/game/init", {
        starting_pot: startingPot,
        effective_stack: effectiveStack,
        donk_option: donkOption,
        oop_flop_bet: oopFlopBet,
        oop_flop_raise: oopFlopRaise,
        oop_turn_bet: oopTurnBet,
        oop_turn_raise: oopTurnRaise,
        oop_turn_donk: oopTurnDonk,
        oop_river_bet: oopRiverBet,
        oop_river_raise: oopRiverRaise,
        oop_river_donk: oopRiverDonk,
        ip_flop_bet: ipFlopBet,
        ip_flop_raise: ipFlopRaise,
        ip_turn_bet: ipTurnBet,
        ip_turn_raise: ipTurnRaise,
        ip_river_bet: ipRiverBet,
        ip_river_raise: ipRiverRaise,
        add_allin_threshold: addAllInThreshold,
        force_allin_threshold: forceAllInThreshold,
        merging_threshold: mergingThreshold,
        added_lines: addedLines,
        removed_lines: removedLines,
        oop_range: Array.from(oopRange),
        ip_range: Array.from(ipRange),
        board: Array.from(flop),
        rake_rate: rakePercentage,
        rake_cap: rakeCap,
        ev_model: evModel,
        target_exploitability_pct: targetExploitabilityPct,
        threads,
      });
      gameId = res.game_id;
      finalized = false;
      history = [];
      memory = res.memory;
      handler.info = {
        threads: res.threads,
        targetExploitability: res.target_exploitability,
        evUnit: res.ev_unit,
      };
      return "";
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  },

  async privateCards(player: number): Promise<number[]> {
    const res = await post<{ cards: number[] }>(gamePath("private_cards"), {
      player,
    });
    return res.cards;
  },

  /** Bytes needed, from the last init (no request). */
  async memoryUsage(enableCompression: boolean) {
    return memory[enableCompression ? 1 : 0];
  },

  async allocateMemory(enableCompression: boolean) {
    await post(gamePath("allocate"), { compression: enableCompression });
  },

  /** Runs `count` iterations from `start`; may stop early after `stop()`. */
  async iterate(start: number, count = 10) {
    const res = await post<{
      iterations_done: number;
      exploitability: number | null;
      queue_ms: number;
      stopped: boolean;
    }>(gamePath("iterate"), { start, count });
    return {
      iterationsDone: res.iterations_done,
      exploitability: res.exploitability ?? NaN,
      queueMs: res.queue_ms,
      stopped: res.stopped,
    };
  },

  async exploitability() {
    const res = await post<{ exploitability: number | null }>(
      gamePath("exploitability")
    );
    return res.exploitability ?? NaN;
  },

  /** Interrupts the running iterate chunk (does not block). */
  async stop() {
    if (gameId) await post(gamePath("stop"));
  },

  async finalize() {
    await post(gamePath("finalize"));
    finalized = true;
  },

  async close() {
    await closeGame();
  },

  /** Only stores the history; every later call sends it along. */
  async applyHistory(h: ArrayLike<number>) {
    history = Array.from(h);
  },

  async currentPlayer() {
    return (await node()).current_player;
  },

  async numActions() {
    return (await node()).num_actions;
  },

  async actionsAfter(append: ArrayLike<number>) {
    return (await node(append)).actions;
  },

  async totalBetAmount(append: ArrayLike<number>) {
    return (await node(append)).total_bet_amount;
  },

  async possibleCards() {
    return BigInt((await node()).possible_cards);
  },

  async getResults() {
    const res = await post<{ data: (number | null)[] }>(gamePath("results"), {
      history,
    });
    return toNumbers(res.data);
  },

  async getChanceReports(append: ArrayLike<number>, numActions: number) {
    const res = await post<{ data: (number | null)[] }>(
      gamePath("chance_reports"),
      { history, append: Array.from(append), num_actions: numActions }
    );
    return toNumbers(res.data);
  },
};

export const rangeApi = {
  update(body: {
    raw?: number[];
    clear?: boolean;
    text?: string;
    ops?: RangeOp[];
  }) {
    return post<RangeResponse>("/game/range", body);
  },
};

export const treeApi = {
  query(params: TreeParams, line: string[], edit: TreeEdit | null = null) {
    return post<TreeResponse>("/game/tree", { params, line, edit });
  },
};

/** Server CPU info: default solver threads and the most a game may use. */
export const serverInfo = async () =>
  parse<{ threads: number; logical_cores: number }>(
    await fetch(`${BASE}/info`)
  );

export const solvesApi = {
  async list() {
    const res = await parse<{ solves: SolveRecord[]; total: number }>(
      await fetch(`${BASE}/solves`)
    );
    return res.solves;
  },

  /** Saves the current (finalized) game. */
  save(memo = "") {
    return post<SolveRecord & { deduplicated: boolean }>(gamePath("save"), {
      memo,
    });
  },

  /** Loads a saved solve as the current (finalized) game. */
  async load(solveId: number) {
    const res = await post<{
      game_id: string;
      request: unknown;
      ev_unit: string;
      target_exploitability: number;
      iterations: number;
      exploitability: number;
    }>("/game/load", { solve_id: solveId });
    await setGame(res.game_id);
    handler.info = {
      ...handler.info,
      targetExploitability: res.target_exploitability,
      evUnit: res.ev_unit,
    };
    return res;
  },

  /** Finalized games in server memory, most recently used first. */
  async live() {
    const res = await parse<{ games: LiveGame[] }>(await fetch(`${BASE}/game`));
    return res.games;
  },

  /** Reopens an in-memory game as the current one. */
  async open(id: string) {
    const res = await parse<LiveGame>(
      await fetch(`${BASE}/game/${encodeURIComponent(id)}`)
    );
    if (id !== gameId) await setGame(id);
    handler.info = {
      ...handler.info,
      targetExploitability: res.target_exploitability,
      evUnit: res.ev_unit,
    };
    return res;
  },

  currentGameId: () => gameId,

  async remove(solveId: number) {
    await parse(await fetch(`${BASE}/solves/${solveId}`, { method: "DELETE" }));
  },
};
