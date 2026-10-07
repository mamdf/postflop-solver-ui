<template>
  <!-- Error -->

  <div v-if="isTreeError">
    Error: Failed to build tree (loaded broken tree?)
  </div>

  <!-- Navigation -->

  <div
    v-if="!isTreeError"
    ref="navDiv"
    class="flex h-[10.5rem] gap-1 p-1 overflow-x-auto whitespace-nowrap snug"
  >
    <div
      v-for="spot in spots"
      :key="spot.index"
      :class="
        'flex flex-col h-full px-1 py-0.5 justify-start ' +
        'rounded-lg shadow-md border-[3px] transition group ' +
        (spot.type === 'chance'
          ? 'hover:border-red-600 '
          : 'hover:border-blue-600 ') +
        (spot.index === selectedSpotIndex
          ? 'border-blue-600 cursor-default'
          : 'border-gray-400 cursor-pointer')
      "
      @click="selectSpot(spot.index, false, false, true)"
    >
      <!-- Root or Chance -->
      <template v-if="spot.type === 'root' || spot.type === 'chance'">
        <div
          class="px-1.5 pt-1 pb-0.5 font-semibold group-hover:opacity-100 opacity-70"
        >
          {{ spot.player.toUpperCase() }}
        </div>
        <div
          class="flex flex-col flex-grow px-3 items-center justify-evenly font-semibold"
        >
          <div class="group-hover:opacity-100 opacity-70">
            <div>Pot {{ spot.pot }}</div>
            <div>Stack {{ spot.stack }}</div>
          </div>
        </div>
      </template>

      <!-- Player -->
      <template v-if="spot.type === 'player'">
        <div
          :class="
            'px-1.5 py-1 font-semibold group-hover:opacity-100 ' +
            (spot.index === selectedSpotIndex ? '' : 'opacity-70')
          "
        >
          {{ spot.player.toUpperCase() }}
        </div>
        <div class="flex-grow overflow-y-auto">
          <button
            v-for="action of spot.actions"
            :key="action.index"
            :class="
              'flex w-full px-1.5 rounded-md transition-colors hover:bg-blue-100 ' +
              (action.isSelected ? 'bg-blue-100 ' : '')
            "
            @click.stop="play(spot.index, action.index)"
          >
            <span class="inline-block relative w-4 mr-0.5">
              <span v-if="action.isSelected">
                <CheckIcon class="absolute top-[0.1875rem] -left-0.5 w-4 h-4" />
              </span>
            </span>
            <span
              :class="
                'pr-0.5 font-semibold group-hover:opacity-100 ' +
                (action.isSelected || spot.index === selectedSpotIndex
                  ? ''
                  : 'opacity-70')
              "
            >
              {{ action.name }}
              {{ action.amount === "0" ? "" : action.amount }}
            </span>
          </button>
          <div
            v-if="spot.actions.length === 0"
            :class="
              'flex w-full px-1.5 font-semibold group-hover:opacity-100 ' +
              (spot.index === selectedSpotIndex ? '' : 'opacity-70')
            "
          >
            (No actions)
          </div>
        </div>
      </template>

      <!-- Terminal -->
      <template v-else-if="spot.type === 'terminal'">
        <div
          :class="
            'px-1.5 pt-1 pb-0.5 font-semibold group-hover:opacity-100 ' +
            (spot.index === selectedSpotIndex ? '' : 'opacity-70')
          "
        >
          {{ spot.player.toUpperCase() }}
        </div>
        <div
          :class="
            'flex flex-col flex-grow items-center justify-evenly font-semibold group-hover:opacity-100 ' +
            (spot.index === selectedSpotIndex ? '' : 'opacity-70')
          "
        >
          <div v-if="spot.equityOop === 0 || spot.equityOop === 1" class="px-3">
            {{ ["IP", "OOP"][spot.equityOop] }} Wins
          </div>
          <div class="px-3">Pot {{ spot.pot }}</div>
        </div>
      </template>
    </div>
  </div>

  <!-- Invalid lines error -->

  <div
    v-if="!isTreeError && invalidLinesArray.length > 0"
    class="flex mt-4 font-semibold text-red-500"
  >
    <div class="underline">
      Invalid Terminal{{ invalidLinesArray.length > 1 ? "s" : "" }}:
    </div>
    <div class="ml-2">
      <div v-for="invalidLine in invalidLinesArray" :key="invalidLine">
        {{ invalidLine }}
      </div>
    </div>
  </div>

  <div v-if="!isTreeError" class="flex mx-6 my-6 justify-center">
    <hr class="border-gray-400 w-full" />
  </div>

  <!-- Edit -->

  <div v-if="!isTreeError" class="flex gap-3">
    <button
      class="button-base button-blue"
      :disabled="
        loading ||
        isSelectedTerminal ||
        isAfterAllin ||
        betAmount < minAmount ||
        betAmount > maxAmount ||
        betAmount % 1 !== 0 ||
        existingAmounts.includes(betAmount)
      "
      @click="addBetAction"
    >
      Add Bet Action
    </button>

    <button
      class="button-base button-red"
      :disabled="loading || selectedSpotIndex === 1"
      @click="removeSelectedNode"
    >
      Remove Selected Node
    </button>

    <div class="pl-3">
      Bet amount:
      <input
        v-model="betAmount"
        type="number"
        :class="
          'w-24 ml-2 px-2 py-1 rounded-lg text-sm text-center ' +
          (betAmount < minAmount || betAmount > maxAmount || betAmount % 1 !== 0
            ? 'input-error'
            : '')
        "
        :min="minAmount"
        :max="maxAmount"
        @keydown.enter="addBetAction"
      />
      <span v-if="!isSelectedTerminal && !isAfterAllin" class="ml-2">
        ({{ (amountRate * 100).toFixed(1) }}% of the pot)
      </span>
    </div>
  </div>

  <div class="flex mx-6 my-6 justify-center">
    <hr class="border-gray-400 w-full" />
  </div>

  <!-- Save/Cancel -->

  <div class="flex my-6 gap-3">
    <button
      class="button-base button-blue"
      :disabled="isTreeError || invalidLinesArray.length > 0"
      @click="saveEdit"
    >
      Save Edit
    </button>

    <button class="button-base button-red" @click="cancelEdit">
      Cancel Edit
    </button>
  </div>

  <!-- Lines -->

  <div
    v-if="
      !isTreeError &&
      (addedLinesArray.length > 0 || removedLinesArray.length > 0)
    "
  >
    <div v-if="addedLinesArray.length > 0" class="flex">
      <div class="font-semibold underline w-[7.75rem]">
        Added line{{ addedLinesArray.length > 1 ? "s" : "" }}:
      </div>
      <div class="flex flex-col">
        <div
          v-for="(addedLine, index) in addedLinesArray"
          :key="addedLine"
          class="flex items-center"
        >
          <button class="mr-2" @click="deleteAddedLine(index)">
            <TrashIcon class="w-5 h-5 text-gray-600" />
          </button>
          <span>{{ addedLine }}</span>
        </div>
      </div>
    </div>

    <div v-if="removedLinesArray.length > 0" class="flex mt-2">
      <div class="font-semibold underline w-[7.75rem]">
        Removed line{{ removedLinesArray.length > 1 ? "s" : "" }}:
      </div>
      <div class="flex flex-col">
        <div
          v-for="(removedLine, index) in removedLinesArray"
          :key="removedLine"
          class="flex items-center"
        >
          <button class="mr-2" @click="deleteRemovedLine(index)">
            <TrashIcon class="w-5 h-5 text-gray-600" />
          </button>
          <span>{{ removedLine }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, nextTick, onMounted, ref } from "vue";
import { useConfigStore } from "../store";
import { convertBetString, readableLineString } from "../utils";
import { Spot, SpotRoot, SpotPlayer } from "../result-types";
import { treeApi, TreeEdit, TreeNode, TreeParams, TreeResponse } from "../api";

import { CheckIcon } from "@heroicons/vue/20/solid";
import { TrashIcon } from "@heroicons/vue/24/outline";

type Bets = [number, number];

export default defineComponent({
  components: {
    CheckIcon,
    TrashIcon,
  },

  emits: {
    save: (_addedLines: string, _removedLines: string) => true,
    cancel: () => true,
  },

  setup(_, context) {
    const navDiv = ref(null as HTMLDivElement | null);

    const config = useConfigStore();

    const boardLength = config.expectedBoardLength;
    // added/removed lines are kept here and refreshed from every response
    const params: TreeParams = {
      board_len: boardLength,
      starting_pot: config.startingPot,
      effective_stack: config.effectiveStack,
      donk_option: config.donkOption,
      oop_flop_bet: convertBetString(config.oopFlopBet),
      oop_flop_raise: convertBetString(config.oopFlopRaise),
      oop_turn_bet: convertBetString(config.oopTurnBet),
      oop_turn_raise: convertBetString(config.oopTurnRaise),
      oop_turn_donk: config.donkOption
        ? convertBetString(config.oopTurnDonk)
        : "",
      oop_river_bet: convertBetString(config.oopRiverBet),
      oop_river_raise: convertBetString(config.oopRiverRaise),
      oop_river_donk: config.donkOption
        ? convertBetString(config.oopRiverDonk)
        : "",
      ip_flop_bet: convertBetString(config.ipFlopBet),
      ip_flop_raise: convertBetString(config.ipFlopRaise),
      ip_turn_bet: convertBetString(config.ipTurnBet),
      ip_turn_raise: convertBetString(config.ipTurnRaise),
      ip_river_bet: convertBetString(config.ipRiverBet),
      ip_river_raise: convertBetString(config.ipRiverRaise),
      add_allin_threshold: config.addAllInThreshold / 100,
      force_allin_threshold: config.forceAllInThreshold / 100,
      merging_threshold: config.mergingThreshold / 100,
      added_lines: config.addedLines,
      removed_lines: config.removedLines,
    };

    const isTreeError = ref(false);
    const loading = ref(false);
    // the last request wins; older responses are dropped
    let querySeq = 0;

    const rootSpot: SpotRoot = {
      type: "root",
      index: 0,
      player: boardLength === 3 ? "flop" : boardLength === 4 ? "turn" : "river",
      selectedIndex: -1,
      board: config.board,
      pot: config.startingPot,
      stack: config.effectiveStack,
    };
    const spots = ref<Spot[]>([rootSpot]);
    // total bet amounts at the node that produced each spot (parallel to spots)
    let spotBets: Bets[] = [[0, 0]];
    const selectedSpotIndex = ref(-1);

    const isSelectedTerminal = computed(() => {
      if (selectedSpotIndex.value === -1) return false;
      const selectedSpot = spots.value[selectedSpotIndex.value];
      return selectedSpot.type === "terminal";
    });

    const betAmount = ref(0);
    const totalBetAmount = ref([0, 0]);
    const prevBetAmount = ref(0);

    const isAfterAllin = computed(() => {
      const maxTotalBetAmount = Math.max(...totalBetAmount.value);
      return maxTotalBetAmount === config.effectiveStack;
    });

    const maxAmount = computed(() => {
      if (isSelectedTerminal.value) return 0;
      const maxTotalBetAmount = Math.max(...totalBetAmount.value);
      return config.effectiveStack - (maxTotalBetAmount - prevBetAmount.value);
    });

    const minAmount = computed(() => {
      const betMinus = config.effectiveStack - maxAmount.value;
      const min = Math.min(...totalBetAmount.value) - betMinus;
      const max = Math.max(...totalBetAmount.value) - betMinus;
      return Math.min(Math.max(2 * max - min, 1), maxAmount.value);
    });

    const amountRate = computed(() => {
      const pot = config.startingPot + 2 * Math.max(...totalBetAmount.value);
      const amount = betAmount.value - prevBetAmount.value;
      return amount / pot;
    });

    const existingAmounts = computed(() => {
      if (selectedSpotIndex.value === -1) return [];
      const ret: number[] = [];
      const spot = spots.value[selectedSpotIndex.value] as SpotPlayer;
      for (const action of spot.actions) {
        if (action.amount !== "0") {
          ret.push(Number(action.amount));
        }
      }
      return ret;
    });

    const addedLines = ref("");
    const removedLines = ref("");
    const invalidLines = ref("");

    const addedLinesArray = computed(() =>
      addedLines.value === ""
        ? []
        : addedLines.value.split(",").map(readableLineString)
    );

    const removedLinesArray = computed(() =>
      removedLines.value === ""
        ? []
        : removedLines.value.split(",").map(readableLineString)
    );

    const invalidLinesArray = computed(() =>
      invalidLines.value === ""
        ? []
        : invalidLines.value.split(",").map(readableLineString)
    );

    // line of displayed actions (e.g. "Bet:100") leading to a spot
    const encodeLine = (spotIndex: number) => {
      const ret: string[] = [];
      for (let i = 1; i < spotIndex; ++i) {
        const spot = spots.value[i];
        if (spot.type === "player") {
          const action = spot.actions[spot.selectedIndex];
          ret.push(`${action.name}:${action.amount}`);
        }
      }
      return ret;
    };

    const absorb = (res: TreeResponse) => {
      isTreeError.value = res.is_error;
      params.added_lines = res.added_lines;
      params.removed_lines = res.removed_lines;
      addedLines.value = res.added_lines;
      removedLines.value = res.removed_lines;
      invalidLines.value = res.invalid_terminals;
    };

    const parseActions = (actions: string) => {
      const list = actions.split("/");
      if (list[0] === "") list.pop();
      return list.map((action, i) => {
        const [name, amount] = action.split(":");
        return { index: i, name, amount, isSelected: false, color: "#000" };
      });
    };

    // Appends the spot(s) for `node`; the spot index is the list length.
    const pushNode = (list: Spot[], bets: Bets[], node: TreeNode) => {
      const total = node.total_bet_amount;
      const prevSpot = list[list.length - 1];
      const index = list.length;

      if (node.is_terminal) {
        const prev = prevSpot as SpotPlayer;
        const prevAction = prev.actions[prev.selectedIndex];

        let equityOop = -1;
        if (prevAction.name === "Fold") {
          equityOop = prev.player === "oop" ? 0 : 1;
        }

        list.push({
          type: "terminal",
          index,
          player: "end",
          selectedIndex: -1,
          prevPlayer: prev.player,
          equityOop,
          pot: config.startingPot + total[0] + total[1],
        });
        bets.push(total);
      } else if (node.is_chance) {
        const prev = prevSpot as SpotPlayer;
        const hasTurn = list.some((spot) => spot.player === "turn");

        list.push(
          {
            type: "chance",
            index,
            player: hasTurn ? "river" : "turn",
            selectedIndex: -1,
            prevPlayer: prev.player,
            cards: Array.from({ length: 52 }, (_, i) => ({
              card: i,
              isSelected: false,
              isDead: true,
            })),
            pot: config.startingPot + 2 * total[0],
            stack: config.effectiveStack - total[0],
          },
          {
            type: "player",
            index: index + 1,
            player: "oop",
            selectedIndex: -1,
            actions: parseActions(node.actions),
          }
        );
        bets.push(total, total);
      } else {
        list.push({
          type: "player",
          index,
          player: prevSpot.player === "oop" ? "ip" : "oop",
          selectedIndex: -1,
          actions: parseActions(node.actions),
        });
        bets.push(total);
      }
    };

    // Rebuilds all spots from a response to `line`; stops where the line no
    // longer applies (failed_at replaces play() === -1).
    const buildSpots = (res: TreeResponse) => {
      const list: Spot[] = [rootSpot];
      const bets: Bets[] = [[0, 0]];
      pushNode(list, bets, res.nodes[0]);

      let failed = res.failed_at !== null;
      const count = res.failed_at ?? res.line.length;
      for (let i = 0; i < count; ++i) {
        const node = res.nodes[i + 1];
        const spot = list[list.length - 1] as SpotPlayer;
        const index = spot.actions.findIndex(
          (a) => `${a.name}:${a.amount}` === res.line[i]
        );
        if (!node || index === -1) {
          failed = true;
          break;
        }
        spot.selectedIndex = index;
        spot.actions[index].isSelected = true;
        pushNode(list, bets, node);
      }

      return { list, bets, failed };
    };

    const selectSpot = async (
      spotIndex: number,
      needSplice: boolean,
      needRebuild: boolean,
      needAmountUpdate: boolean
    ): Promise<void> => {
      if (
        !needSplice &&
        !needRebuild &&
        spotIndex === selectedSpotIndex.value
      ) {
        return;
      }

      if (spotIndex === 0) {
        return selectSpot(1, true, false, selectedSpotIndex.value !== 1);
      }

      if (!needSplice && spots.value[spotIndex]?.type === "chance") {
        return selectSpot(spotIndex + 1, false, false, true);
      }

      const seq = ++querySeq;
      loading.value = true;
      try {
        let list = spots.value;
        let bets = spotBets;
        let selected = spotIndex;

        if (needRebuild) {
          const res = await treeApi.query(
            params,
            encodeLine(spots.value.length - 1)
          );
          if (seq !== querySeq) return;
          absorb(res);
          if (res.is_error) return;

          const built = buildSpots(res);
          list = built.list;
          bets = built.bets;
          if (built.failed) needAmountUpdate = true;
          selected = Math.min(selectedSpotIndex.value, list.length - 1);
        } else if (needSplice) {
          const res = await treeApi.query(params, encodeLine(selected));
          if (seq !== querySeq) return;
          absorb(res);
          if (res.is_error || res.failed_at !== null) return;

          list = list.slice(0, selected);
          bets = bets.slice(0, selected);
          pushNode(list, bets, res.nodes[res.nodes.length - 1]);
          if (list[selected].type === "chance") ++selected;
        }

        spots.value = list;
        spotBets = bets;
        selectedSpotIndex.value = selected;
        totalBetAmount.value = [...bets[selected]];

        const prev = list[selected - 1];
        if (prev.type === "player") {
          prevBetAmount.value = Number(prev.actions[prev.selectedIndex].amount);
        } else {
          prevBetAmount.value = 0;
        }

        if (needAmountUpdate) {
          betAmount.value = minAmount.value;
        }

        autoScrollNav();
      } catch {
        if (seq === querySeq) isTreeError.value = true;
      } finally {
        if (seq === querySeq) loading.value = false;
      }
    };

    const autoScrollNav = async () => {
      await nextTick();
      if (navDiv.value) {
        const selectedChild = navDiv.value.children[selectedSpotIndex.value];
        if (selectedChild) {
          selectedChild.scrollIntoView({
            behavior: "smooth",
            inline: "center",
          });
        }
      }
    };

    const play = (spotIndex: number, actionIndex: number) => {
      const spot = spots.value[spotIndex] as SpotPlayer;

      if (spot.selectedIndex !== -1) {
        spot.actions[spot.selectedIndex].isSelected = false;
      }
      spot.actions[actionIndex].isSelected = true;
      spot.selectedIndex = actionIndex;

      selectSpot(spotIndex + 1, true, false, true);
    };

    // Applies an edit at the selected node, then rebuilds the spots.
    const editTree = async (edit: TreeEdit, nextIndex?: number) => {
      if (loading.value) return;
      const seq = ++querySeq;
      loading.value = true;
      try {
        const res = await treeApi.query(
          params,
          encodeLine(selectedSpotIndex.value),
          edit
        );
        if (seq !== querySeq) return;
        absorb(res);
      } catch {
        if (seq === querySeq) {
          isTreeError.value = true;
          loading.value = false;
        }
        return;
      }
      await selectSpot(
        nextIndex ?? selectedSpotIndex.value,
        false,
        true,
        nextIndex !== undefined
      );
    };

    const addBetAction = () => {
      const isRaise = totalBetAmount.value[0] !== totalBetAmount.value[1];
      editTree({ op: "add_bet", amount: betAmount.value, is_raise: isRaise });
    };

    const removeSelectedNode = () => {
      let prevIndex = selectedSpotIndex.value - 1;
      if (spots.value[prevIndex].type === "chance") --prevIndex;
      editTree({ op: "remove_node" }, prevIndex);
    };

    const saveEdit = () => {
      context.emit("save", addedLines.value, removedLines.value);
    };

    const cancelEdit = () => {
      context.emit("cancel");
    };

    const deleteAddedLine = (index: number) => {
      const line = addedLines.value.split(",")[index];
      editTree({ op: "delete_added", line });
    };

    const deleteRemovedLine = (index: number) => {
      const line = removedLines.value.split(",")[index];
      editTree({ op: "delete_removed", line });
    };

    onMounted(() => selectSpot(0, true, false, true));

    return {
      navDiv,
      isTreeError,
      loading,
      spots,
      selectedSpotIndex,
      isSelectedTerminal,
      betAmount,
      isAfterAllin,
      maxAmount,
      minAmount,
      amountRate,
      existingAmounts,
      addedLinesArray,
      removedLinesArray,
      invalidLinesArray,
      selectSpot,
      play,
      addBetAction,
      removeSelectedNode,
      saveEdit,
      cancelEdit,
      deleteAddedLine,
      deleteRemovedLine,
    };
  },
});
</script>
