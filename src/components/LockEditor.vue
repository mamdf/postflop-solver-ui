<template>
  <div class="shrink-0 px-4 py-2 border-t border-l border-gray-500 text-sm">
    <div class="flex items-center gap-2">
      <span class="text-base font-semibold">Strategy lock</span>
      <span class="text-gray-600">{{ statusText }}</span>
    </div>

    <div class="flex flex-wrap items-center gap-x-4 mt-1">
      <label class="cursor-pointer">
        <input
          v-model="scope"
          class="mr-1 cursor-pointer disabled:cursor-default"
          type="radio"
          value="cell"
          :disabled="!hoverContent"
        />
        Selected cell{{ hoverContent ? ` (${hoverContent.name})` : "" }}
      </label>
      <label class="cursor-pointer">
        <input
          v-model="scope"
          class="mr-1 cursor-pointer"
          type="radio"
          value="range"
        />
        Whole range
      </label>
      <span v-if="!hoverContent" class="text-gray-600">
        (click a cell in the grid to select it)
      </span>
    </div>

    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
      <label
        v-for="(action, i) in spot.actions"
        :key="action.index"
        class="flex items-center"
      >
        <span
          class="inline-block w-3 h-3 mr-1 rounded-sm"
          :style="{ backgroundColor: action.color }"
        ></span>
        {{ action.name }}
        {{ action.amount === "0" ? "" : action.amount }}
        <input
          v-model="percents[i]"
          type="number"
          :class="
            'w-20 ml-1.5 mr-0.5 px-2 py-0.5 rounded-lg text-sm text-center ' +
            (percents[i] < 0 || percents[i] > 100 ? 'input-error' : '')
          "
          min="0"
          max="100"
          step="0.1"
        />
        %
      </label>
    </div>

    <div class="flex flex-wrap items-center gap-2 mt-2">
      <button
        class="button-base button-blue"
        :disabled="!canLock"
        @click="lockScope"
      >
        Lock {{ scopeText }}
      </button>
      <button
        class="button-base button-blue"
        :disabled="scopeHands.length === 0"
        @click="startFromSolved"
      >
        Start from solved mix
      </button>
      <button
        class="button-base button-red"
        :disabled="!lock"
        @click="clearNode"
      >
        Clear node
      </button>
      <button
        class="button-base button-red"
        :disabled="numLocks === 0"
        @click="clearAll"
      >
        Clear all ({{ numLocks }})
      </button>
      <span v-if="!isSumValid" class="text-red-600">
        Sum is {{ sum.toFixed(1) }}% (must be 100%)
      </span>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, ref, watch } from "vue";
import { useStore, lockKey } from "../store";
import { average } from "../utils";
import { Results, SpotPlayer, HoverContent } from "../result-types";

// Strategy lock of the acting player at one node, edited client-side; Run Solver's
// "Re-solve with locks" applies them all. Hands never locked stay free (-1).
export default defineComponent({
  props: {
    history: {
      type: Array as () => number[],
      required: true,
    },
    // the server's lock flag of the node (also set when locked via an isomorphic card)
    isNodeLocked: {
      type: Boolean,
      default: false,
    },
    spot: {
      type: Object as () => SpotPlayer,
      required: true,
    },
    results: {
      type: Object as () => Results,
      required: true,
    },
    // private hands of the acting player
    cards: {
      type: Array as () => number[],
      required: true,
    },
    hoverContent: {
      type: Object as () => HoverContent | null,
      default: null,
    },
  },

  setup(props) {
    const store = useStore();

    const scope = ref<"cell" | "range">("range");
    const percents = ref<number[]>([]);

    const key = computed(() => lockKey(props.history));
    const lock = computed(() => store.nodeLocks[key.value] ?? null);
    const numLocks = computed(() => Object.keys(store.nodeLocks).length);
    const numHands = computed(() => props.cards.length);
    const numActions = computed(() => props.spot.actions.length);
    const state = computed(() => store.lockState(key.value));
    // locked in this game through another (isomorphic) history: a second lock is rejected
    const isAlias = computed(
      () => props.isNodeLocked && !(key.value in store.appliedLocks)
    );

    watch(
      () => props.hoverContent,
      (content) => (scope.value = content ? "cell" : "range")
    );

    const scopeHands = computed(() =>
      scope.value === "cell" && props.hoverContent
        ? props.hoverContent.indices
        : Array.from({ length: numHands.value }, (_, i) => i)
    );

    const scopeText = computed(() =>
      scope.value === "cell" && props.hoverContent
        ? props.hoverContent.name
        : "whole range"
    );

    const isLockedHand = (hand: number) => {
      const strategy = lock.value?.strategy;
      if (!strategy) return false;
      for (let a = 0; a < numActions.value; ++a) {
        if (strategy[a * numHands.value + hand] > 0) return true;
      }
      return false;
    };

    const statusText = computed(() => {
      if (isAlias.value) return "Locked via an isomorphic card (edit it there)";
      if (state.value === "cleared") {
        return "Applied in this game · cleared for the next re-solve";
      }
      if (!lock.value) return "Not locked";
      const locked = scopeHands.value.filter(isLockedHand).length;
      const text =
        state.value === "applied"
          ? "applied"
          : "pending: re-solve with locks (Run Solver) to apply";
      return `${locked} of ${scopeHands.value.length} hands (${scopeText.value}) locked · ${text}`;
    });

    const sum = computed(() =>
      percents.value.reduce((acc, p) => acc + Number(p), 0)
    );
    const isSumValid = computed(() => Math.abs(sum.value - 100) < 0.05);

    const canLock = computed(
      () =>
        !isAlias.value &&
        scopeHands.value.length > 0 &&
        isSumValid.value &&
        percents.value.every((p) => p >= 0 && p <= 100)
    );

    const lockScope = () => {
      const nh = numHands.value;
      const strategy =
        lock.value?.strategy.slice() ??
        Array.from({ length: numActions.value * nh }, () => -1);
      for (const hand of scopeHands.value) {
        percents.value.forEach((p, a) => (strategy[a * nh + hand] = p / 100));
      }
      store.nodeLocks[key.value] = {
        history: props.history.slice(),
        player: props.spot.player,
        num_actions: numActions.value,
        strategy,
      };
    };

    // Shows `mix` (any scale) in 0.1% steps that sum to 100%.
    const setPercents = (mix: number[]) => {
      const total = mix.reduce((acc, v) => acc + v, 0);
      if (!(total > 0)) {
        percents.value = mix.map(() => 0);
        return;
      }
      const rounded = mix.map((v) => Math.round((v / total) * 1000) / 10);
      const top = rounded.indexOf(Math.max(...rounded));
      const rest = rounded.reduce((acc, v) => acc + v, 0) - rounded[top];
      rounded[top] = Math.round((100 - rest) * 10) / 10;
      percents.value = rounded;
    };

    // Reach-weighted mix of the solved strategy over the scope.
    const startFromSolved = () => {
      const nh = numHands.value;
      const hands = scopeHands.value;
      const playerIndex = props.spot.player === "oop" ? 0 : 1;
      let weights = hands.map((h) => props.results.normalizer[playerIndex][h]);
      if (!weights.some((w) => w > 0)) weights = hands.map(() => 1);
      const mix = Array.from({ length: numActions.value }, (_, a) =>
        average(
          hands.map((h) => props.results.strategy[a * nh + h]),
          weights
        )
      );
      setPercents(mix);
    };

    // On a new node or scope: the draft lock of the scope's first locked hand, else the
    // solved mix.
    watch(
      [key, scopeHands],
      () => {
        const hand = scopeHands.value.find(isLockedHand);
        const strategy = lock.value?.strategy;
        if (hand === undefined || !strategy) return startFromSolved();
        const nh = numHands.value;
        setPercents(
          Array.from({ length: numActions.value }, (_, a) =>
            Math.max(strategy[a * nh + hand], 0)
          )
        );
      },
      { immediate: true }
    );

    // Only the draft: the current game keeps its locks until the next re-solve.
    const clearNode = () => {
      delete store.nodeLocks[key.value];
    };

    const clearAll = () => {
      store.nodeLocks = {};
    };

    return {
      scope,
      percents,
      lock,
      numLocks,
      scopeHands,
      scopeText,
      statusText,
      sum,
      isSumValid,
      canLock,
      lockScope,
      startFromSolved,
      clearNode,
      clearAll,
    };
  },
});
</script>
