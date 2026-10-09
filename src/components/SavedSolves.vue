<template>
  <div class="flex items-center my-1 gap-3">
    <input
      v-model="memo"
      type="text"
      placeholder="Memo (optional)"
      class="w-64 px-2 py-1 rounded-lg text-sm"
    />
    <button
      class="button-base button-blue"
      :disabled="!store.isSolverFinished || busy"
      @click="save"
    >
      Save Current Solve
    </button>
    <button class="button-base button-blue" :disabled="busy" @click="refresh">
      Refresh
    </button>
  </div>
  <div v-if="!store.isSolverFinished" class="text-sm text-gray-600">
    Run the solver to completion to enable saving.
  </div>

  <div v-if="message" class="my-3">{{ message }}</div>

  <div class="mt-6 font-semibold">In memory</div>
  <div class="text-sm text-gray-600">
    Finished runs still on the server, saved or not, including solves made
    through the API (ids <code>solve-N</code>). They are dropped when idle too
    long or when a new solve needs the room.
  </div>
  <table v-if="live.length > 0" class="mt-2 text-sm">
    <thead>
      <tr class="text-left">
        <th class="pr-4">Board</th>
        <th class="pr-4">Iterations</th>
        <th class="pr-4">Exploitability</th>
        <th class="pr-4">EV unit</th>
        <th class="pr-4">Expires in</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="g in live" :key="g.game_id">
        <td class="pr-4 font-semibold">{{ boardText(liveBoard(g)) }}</td>
        <td class="pr-4">{{ g.iterations }}</td>
        <td class="pr-4">{{ g.exploitability?.toFixed(3) ?? "-" }}</td>
        <td class="pr-4">{{ g.ev_unit }}</td>
        <td class="pr-4">{{ Math.ceil(g.expires_in_secs / 60) }} min</td>
        <td class="whitespace-nowrap">
          <span v-if="g.game_id === currentGameId" class="text-gray-600">
            Current
          </span>
          <button
            v-else
            class="button-base button-blue"
            :disabled="busy || store.isSolverRunning || store.isFinalizing"
            @click="openLive(g.game_id)"
          >
            Load
          </button>
        </td>
      </tr>
    </tbody>
  </table>
  <div v-else class="mt-2 text-gray-600">No finished runs in memory.</div>

  <div class="mt-6 font-semibold">Saved</div>
  <table v-if="solves.length > 0" class="mt-2 text-sm">
    <thead>
      <tr class="text-left">
        <th class="pr-4">Board</th>
        <th class="pr-4">Iterations</th>
        <th class="pr-4">Exploitability</th>
        <th class="pr-4">EV unit</th>
        <th class="pr-4">Saved</th>
        <th class="pr-4">Memo</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="s in solves" :key="s.id">
        <td class="pr-4 font-semibold">{{ boardText(s.board) }}</td>
        <td class="pr-4">{{ s.num_iterations }}</td>
        <td class="pr-4">{{ s.final_exploitability.toFixed(3) }}</td>
        <td class="pr-4">{{ s.ev_unit }}</td>
        <td class="pr-4">{{ new Date(s.created_at_ms).toLocaleString() }}</td>
        <td class="pr-4">{{ s.memo }}</td>
        <td class="whitespace-nowrap">
          <button
            class="button-base button-blue mr-2"
            :disabled="busy || store.isSolverRunning || store.isFinalizing"
            @click="load(s.id)"
          >
            Load
          </button>
          <button
            class="button-base button-red"
            :disabled="busy"
            @click="remove(s.id)"
          >
            Delete
          </button>
        </td>
      </tr>
    </tbody>
  </table>
  <div v-else class="mt-2 text-gray-600">No saved solves.</div>
</template>

<script lang="ts">
import { defineComponent, nextTick, ref, watch } from "vue";
import { LiveGame, rangeApi, solvesApi, SolveRecord } from "../api";
import { evSettingsFromRequest } from "../ev-model";
import { useStore, useConfigStore, saveConfig, saveConfigTmp } from "../store";
import { parseCardString, unconvertBetString } from "../utils";

// Subset of the API's SolveRequest that is mapped back onto the config.
type StreetRequest = {
  oop: { bet: string; raise: string };
  ip: { bet: string; raise: string };
  oop_donk?: string | null;
};

type LoadedRequest = {
  ranges: { oop: string; ip: string };
  board: { flop: string; turn?: string | null; river?: string | null };
  tree: {
    starting_pot: number;
    effective_stack: number;
    rake_rate: number;
    rake_cap: number;
    flop: StreetRequest;
    turn: StreetRequest;
    river: StreetRequest;
    add_allin_threshold: number;
    force_allin_threshold: number;
    merging_threshold: number;
  };
  ev_model?: Parameters<typeof evSettingsFromRequest>[0];
};

const cards = (s: string | null | undefined) =>
  (s ?? "").match(/../g)?.map((c) => parseCardString(c) ?? -1) ?? [];

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// The server answers 404 when the game was closed or expired.
const isNotFound = (e: unknown) => /not found|unknown|404/i.test(errorText(e));

export default defineComponent({
  setup() {
    const store = useStore();
    const config = useConfigStore();

    const solves = ref<SolveRecord[]>([]);
    const live = ref<LiveGame[]>([]);
    const currentGameId = ref<string | null>(null);
    const memo = ref("");
    const message = ref("");
    const busy = ref(false);

    const boardText = (b: SolveRecord["board"]) =>
      [b.flop, b.turn, b.river].filter(Boolean).join(" ");

    const liveBoard = (g: LiveGame) => (g.request as LoadedRequest).board;

    const refresh = async () => {
      try {
        [solves.value, live.value] = await Promise.all([
          solvesApi.list(),
          solvesApi.live(),
        ]);
        currentGameId.value = solvesApi.currentGameId();
      } catch (e) {
        message.value = `Error: ${errorText(e)}`;
      }
    };

    const save = async () => {
      busy.value = true;
      try {
        const res = await solvesApi.save(memo.value);
        message.value = res.deduplicated
          ? "This solve was already saved."
          : "Solve saved.";
        memo.value = "";
        await refresh();
      } catch (e) {
        message.value = isNotFound(e)
          ? "The game has expired on the server. Please re-solve."
          : `Error: ${errorText(e)}`;
      }
      busy.value = false;
    };

    const remove = async (id: number) => {
      busy.value = true;
      try {
        await solvesApi.remove(id);
        await refresh();
      } catch (e) {
        message.value = `Error: ${errorText(e)}`;
      }
      busy.value = false;
    };

    // Fills the config (and then the tmp/saved copies) from a loaded request.
    const applyRequest = async (req: LoadedRequest) => {
      const [oop, ip] = await Promise.all([
        rangeApi.update({ text: req.ranges.oop }),
        rangeApi.update({ text: req.ranges.ip }),
      ]);
      [oop, ip].forEach((r, i) => {
        // in place: the mounted RangeEditors hold references to these arrays
        r.weights.forEach((w, j) => (config.range[i][j] = w * 100));
        config.rangeRaw[i].set(r.raw);
        config.rangeLoadText[i] = r.text;
      });
      config.rangeEpoch++;

      const { tree } = req;
      config.board = [
        ...cards(req.board.flop),
        ...cards(req.board.turn),
        ...cards(req.board.river),
      ];
      config.startingPot = tree.starting_pot;
      config.effectiveStack = tree.effective_stack;
      config.rakePercent = Math.round(tree.rake_rate * 1e6) / 1e4;
      config.rakeCap = tree.rake_cap;
      config.donkOption = !!(tree.turn.oop_donk || tree.river.oop_donk);
      config.oopFlopBet = unconvertBetString(tree.flop.oop.bet);
      config.oopFlopRaise = unconvertBetString(tree.flop.oop.raise);
      config.oopTurnBet = unconvertBetString(tree.turn.oop.bet);
      config.oopTurnRaise = unconvertBetString(tree.turn.oop.raise);
      config.oopTurnDonk = unconvertBetString(tree.turn.oop_donk ?? "");
      config.oopRiverBet = unconvertBetString(tree.river.oop.bet);
      config.oopRiverRaise = unconvertBetString(tree.river.oop.raise);
      config.oopRiverDonk = unconvertBetString(tree.river.oop_donk ?? "");
      config.ipFlopBet = unconvertBetString(tree.flop.ip.bet);
      config.ipFlopRaise = unconvertBetString(tree.flop.ip.raise);
      config.ipTurnBet = unconvertBetString(tree.turn.ip.bet);
      config.ipTurnRaise = unconvertBetString(tree.turn.ip.raise);
      config.ipRiverBet = unconvertBetString(tree.river.ip.bet);
      config.ipRiverRaise = unconvertBetString(tree.river.ip.raise);
      config.addAllInThreshold =
        Math.round(tree.add_allin_threshold * 1e6) / 1e4;
      config.forceAllInThreshold =
        Math.round(tree.force_allin_threshold * 1e6) / 1e4;
      config.mergingThreshold = Math.round(tree.merging_threshold * 1e6) / 1e4;
      // tree edits are not part of a saved solve
      config.expectedBoardLength = 0;
      config.addedLines = "";
      config.removedLines = "";
      config.evModel = evSettingsFromRequest(req.ev_model);

      saveConfigTmp();
      saveConfig();
    };

    // Makes a finalized game (saved or in memory) the current one.
    const openGame = async (
      fetchGame: () => Promise<{ request: unknown; ev_unit: string }>,
      notFound: string
    ) => {
      busy.value = true;
      message.value = "Loading...";
      try {
        const res = await fetchGame();
        // force the result viewer to re-initialize on the new game
        store.isSolverFinished = false;
        await nextTick();
        store.isSolverPaused = false;
        store.evUnit = res.ev_unit;
        try {
          await applyRequest(res.request as LoadedRequest);
        } catch (e) {
          message.value = `Loaded, but the configuration could not be restored: ${errorText(
            e
          )}`;
        }
        store.isSolverFinished = true;
        if (message.value === "Loading...") {
          message.value = "Loaded. Open the Results tab to browse the solve.";
        }
      } catch (e) {
        message.value = isNotFound(e) ? notFound : `Error: ${errorText(e)}`;
      }
      busy.value = false;
      await refresh();
    };

    const load = (id: number) =>
      openGame(
        () => solvesApi.load(id),
        "Solve not found on the server. Please re-solve."
      );

    const openLive = (id: string) =>
      openGame(
        () => solvesApi.open(id),
        "This run is no longer in memory on the server."
      );

    // the view stays mounted (v-show): refresh whenever it is shown
    watch(
      () => store.sideView,
      (view) => view === "saved-solves" && refresh(),
      { immediate: true }
    );

    return {
      store,
      solves,
      live,
      currentGameId,
      memo,
      message,
      busy,
      boardText,
      liveBoard,
      refresh,
      save,
      load,
      openLive,
      remove,
    };
  },
});
</script>
