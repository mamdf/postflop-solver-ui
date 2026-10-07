<template>
  <div class="max-w-xl">
    <div class="my-1">
      <span class="inline-block w-[7.5rem]">Mode:</span>
      <label
        v-for="m in modes"
        :key="m.value"
        :class="
          'inline-block mr-2 px-3 py-1 rounded-full border-2 cursor-pointer select-none ' +
          (ev.mode === m.value
            ? 'border-blue-600 bg-blue-100 font-semibold'
            : 'border-gray-400 hover:bg-blue-50')
        "
      >
        <input v-model="ev.mode" type="radio" class="hidden" :value="m.value" />
        {{ m.label }}
      </label>
    </div>

    <div v-if="ev.mode === 'icm_bubble_factor'" class="mt-4">
      <div class="my-1">
        <span class="inline-block w-[7.5rem]">OOP factor:</span>
        <input
          v-model.number="ev.bubbleOop"
          type="number"
          :class="
            'w-24 px-2 py-1 rounded-lg text-sm text-center ' +
            (ev.bubbleOop > 0 ? '' : 'input-error')
          "
          min="0"
          step="0.05"
        />
      </div>
      <div class="my-1">
        <span class="inline-block w-[7.5rem]">IP factor:</span>
        <input
          v-model.number="ev.bubbleIp"
          type="number"
          :class="
            'w-24 px-2 py-1 rounded-lg text-sm text-center ' +
            (ev.bubbleIp > 0 ? '' : 'input-error')
          "
          min="0"
          step="0.05"
        />
      </div>
      <p class="mt-2 text-sm text-gray-600">
        Bubble factor per player (1 = chip EV).
      </p>
    </div>

    <div v-if="ev.mode === 'terminal_icm'" class="mt-4">
      <div class="my-1">
        <span class="inline-block w-[7.5rem]">Stacks:</span>
        <input
          v-model="ev.stacks"
          type="text"
          placeholder="1000, 1000, 500"
          class="w-64 px-2 py-1 rounded-lg text-sm"
        />
      </div>
      <div class="my-1">
        <span class="inline-block w-[7.5rem]">Payouts:</span>
        <input
          v-model="ev.payouts"
          type="text"
          placeholder="70, 30"
          class="w-64 px-2 py-1 rounded-lg text-sm"
        />
      </div>
      <div class="my-1">
        <span class="inline-block w-[7.5rem]">OOP seat:</span>
        <input
          v-model.number="ev.oopSeat"
          type="number"
          class="w-24 px-2 py-1 rounded-lg text-sm text-center"
          min="0"
        />
      </div>
      <div class="my-1">
        <span class="inline-block w-[7.5rem]">IP seat:</span>
        <input
          v-model.number="ev.ipSeat"
          type="number"
          class="w-24 px-2 py-1 rounded-lg text-sm text-center"
          min="0"
        />
      </div>
      <p class="mt-2 text-sm text-gray-600">
        Comma-separated lists. Seats are 0-based indexes into the stacks list.
        Results are shown as payout deltas. Tournament ICM cannot be combined
        with rake.
      </p>
    </div>

    <ul v-if="errors.length > 0" class="mt-4 pl-6 list-disc text-red-600">
      <li v-for="e in errors" :key="e">{{ e }}</li>
    </ul>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent } from "vue";
import { useConfigStore } from "../store";
import { evSettingsErrors } from "../ev-model";

export default defineComponent({
  setup() {
    const config = useConfigStore();

    const modes = [
      { value: "chip_ev", label: "Chip EV" },
      { value: "icm_bubble_factor", label: "Bubble factor" },
      { value: "terminal_icm", label: "Tournament ICM" },
    ];

    const errors = computed(() =>
      evSettingsErrors(config.evModel, config.rakePercent)
    );

    const ev = computed(() => config.evModel);

    return { ev, modes, errors };
  },
});
</script>
