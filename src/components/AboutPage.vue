<template>
  <p>
    <span class="font-bold">Postflop Solver UI</span> is a web front end for the
    local <span class="font-bold">postflop-solver-api</span> server. The solver
    runs on the server, so there is no browser memory limit and all CPU cores
    are used.
  </p>

  <ul class="mt-4 ml-8 list-disc">
    <li>Chip EV, bubble factor and tournament ICM models</li>
    <li>Saved solves can be stored and reloaded on the server</li>
  </ul>

  <p class="mt-4">
    This project is a fork of
    <a
      href="https://github.com/b-inary/wasm-postflop"
      class="link"
      target="_blank"
      >b-inary/wasm-postflop</a
    >
    (AGPL-3.0), whose WebAssembly solver has been replaced by an HTTP client.
    The original interface and design are by b-inary.
  </p>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({});
</script>

<style scoped>
.link {
  @apply text-blue-500 hover:underline;
}
</style>
