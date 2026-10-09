<template>
  <div class="text-sm text-gray-600">
    Settings of the solver server, shared by this UI and the agents using its
    API. <b>Apply</b> changes them until the server restarts;
    <b>Save as default</b> also keeps them for the next start. Values set by an
    environment variable are fixed and can only be changed where the server is
    launched.
  </div>

  <div v-if="message" class="my-3">{{ message }}</div>

  <table v-if="entries" class="mt-4 text-sm">
    <thead>
      <tr class="text-left">
        <th class="pr-4">Setting</th>
        <th class="pr-4">Value</th>
        <th class="pr-4">Source</th>
        <th class="pr-4">Default</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="f in fields" :key="f.key">
        <td class="pr-4 py-1">
          {{ f.label }}
          <span v-if="!entries[f.key].live" class="text-gray-600">
            (on restart)
          </span>
        </td>
        <td class="pr-4 py-1 whitespace-nowrap">
          <input
            v-if="f.bool"
            v-model="draft[f.key]"
            type="checkbox"
            :disabled="isEnv(f.key)"
          />
          <template v-else>
            <input
              v-model="draft[f.key]"
              type="text"
              :class="
                'w-24 px-2 py-1 rounded-lg text-sm text-right ' +
                (toValue(f, draft[f.key]) === undefined ? 'input-error' : '')
              "
              :placeholder="f.nullLabel"
              :disabled="isEnv(f.key)"
            />
            <span class="ml-1">{{ f.unit }}</span>
          </template>
        </td>
        <td class="pr-4 py-1">
          <span v-if="isEnv(f.key)" :title="entries[f.key].env">
            environment
          </span>
          <span v-else>{{ sourceText[entries[f.key].source] }}</span>
        </td>
        <td class="pr-4 py-1 text-gray-600">
          {{ display(f, entries[f.key].default) }}
        </td>
      </tr>
    </tbody>
  </table>

  <div class="flex mt-4 gap-3">
    <button
      class="button-base button-blue"
      :disabled="busy || !valid || Object.keys(changes(false)).length === 0"
      @click="apply(false)"
    >
      Apply
    </button>
    <button
      class="button-base button-blue"
      :disabled="busy || !valid || Object.keys(changes(true)).length === 0"
      @click="apply(true)"
    >
      Save as default
    </button>
    <button class="button-base button-blue" :disabled="busy" @click="refresh">
      Reset
    </button>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, ref, watch } from "vue";
import { SettingEntry, SettingValue, settingsApi } from "../api";
import { useStore } from "../store";

type Field = {
  key: string;
  label: string;
  unit?: string;
  /** Server value = shown value * scale. */
  scale?: number;
  /** Shown when the value is null (built-in behaviour); empty input means null. */
  nullLabel?: string;
  bool?: boolean;
};

const GB = 2 ** 30;

const fields: Field[] = [
  {
    key: "memory_ttl_secs",
    label: "Keep idle solves in memory",
    unit: "min",
    scale: 60,
  },
  { key: "max_in_memory", label: "Max solves in memory (UI + API)" },
  { key: "max_concurrent_solves", label: "Solves running at once" },
  { key: "threads", label: "Solver threads", nullLabel: "all cores" },
  {
    key: "max_game_memory_bytes",
    label: "Max memory of a UI solve",
    unit: "GB",
    scale: GB,
    nullLabel: "free RAM",
  },
  {
    key: "store_max_load_bytes",
    label: "Max memory to load a saved solve",
    unit: "GB",
    scale: GB,
    nullLabel: "no cap",
  },
  { key: "store_zstd_level", label: "Save compression level (zstd)" },
  { key: "river_cache_max", label: "River subgames cached per API solve" },
  { key: "turn_cache_max", label: "Turn subgames cached per API solve" },
  { key: "async_submit", label: "Async API solves", bool: true },
  { key: "submit_grace_ms", label: "Async grace before 202", unit: "ms" },
];

const sourceText: Record<SettingEntry["source"], string> = {
  env: "environment",
  saved: "saved default",
  runtime: "until restart",
  default: "built-in",
};

type Draft = string | boolean;

const round = (x: number) => Math.round(x * 100) / 100;

/** Draft -> server value; `undefined` when the input is invalid. */
const toValue = (f: Field, d: Draft): SettingValue | undefined => {
  if (f.bool) return d as boolean;
  const text = String(d).trim();
  if (text === "") return f.nullLabel ? null : undefined;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * (f.scale ?? 1));
};

const toDraft = (f: Field, v: SettingValue): Draft => {
  if (f.bool) return !!v;
  return v === null ? "" : String(round((v as number) / (f.scale ?? 1)));
};

export default defineComponent({
  setup() {
    const store = useStore();
    const entries = ref<Record<string, SettingEntry> | null>(null);
    const draft = ref<Record<string, Draft>>({});
    const message = ref("");
    const busy = ref(false);

    const isEnv = (key: string) => entries.value?.[key].source === "env";

    const display = (f: Field, v: SettingValue) => {
      if (f.bool) return v ? "on" : "off";
      if (v === null) return f.nullLabel;
      return `${round((v as number) / (f.scale ?? 1))} ${f.unit ?? ""}`;
    };

    const load = (res: Record<string, SettingEntry>) => {
      entries.value = res;
      draft.value = Object.fromEntries(
        fields.map((f) => [f.key, toDraft(f, res[f.key].value)])
      );
    };

    const refresh = async () => {
      try {
        load(await settingsApi.get());
        message.value = "";
      } catch (e) {
        message.value = `Error: ${e instanceof Error ? e.message : e}`;
      }
    };

    const valid = computed(() =>
      fields.every(
        (f) => isEnv(f.key) || toValue(f, draft.value[f.key]) !== undefined
      )
    );

    // Edited keys; saving also includes ones applied only until restart.
    const changes = (persist: boolean) => {
      const out: Record<string, SettingValue> = {};
      if (!entries.value) return out;
      for (const f of fields) {
        const entry = entries.value[f.key];
        if (entry.source === "env") continue;
        const value = toValue(f, draft.value[f.key]);
        if (value === undefined) continue;
        if (value !== entry.value || (persist && entry.source === "runtime")) {
          out[f.key] = value;
        }
      }
      return out;
    };

    const apply = async (persist: boolean) => {
      busy.value = true;
      try {
        load(await settingsApi.update(changes(persist), persist));
        message.value = persist
          ? "Saved as the server's defaults."
          : "Applied until the server restarts.";
      } catch (e) {
        message.value = `Error: ${e instanceof Error ? e.message : e}`;
      }
      busy.value = false;
    };

    // the view stays mounted (v-show): reload whenever it is shown
    watch(
      () => store.sideView,
      (view) => view === "server" && refresh(),
      { immediate: true }
    );

    return {
      fields,
      sourceText,
      entries,
      draft,
      message,
      busy,
      valid,
      isEnv,
      display,
      toValue,
      changes,
      apply,
      refresh,
    };
  },
});
</script>
