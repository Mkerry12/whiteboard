<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ name: string }>();

const PATHS: Record<string, string> = {
  select: "M5 3.5 5 19.5 9.2 15.2 12.5 21 14.7 20 11.4 14.1 17 13.6Z",
  pan: "M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5",
  pen: "M13.5 6.5 17.5 10.5M4 20l4.2-.8L19 8.4a1.8 1.8 0 0 0-2.5-2.5L5.7 16.7Z",
  rect: "M6 6.5h12.5v11H6z",
  ellipse:
    "M12 7.2c3.8 0 7 2.1 7 4.8s-3.2 4.8-7 4.8-7-2.1-7-4.8 3.2-4.8 7-4.8Z",
  line: "M6 18 18 6",
  arrow: "M6 18 18 6M18 6h-6M18 6v6",
  text: "M7 6.5h10M12 6.5V18M9.2 18h5.6",
  sticky: "M6 5h8l4 4v10H6zM14 5v4h4M8 13h8M8 16h5",
  forward: "M12 19V6M12 6 8 10M12 6l4 4",
  backward: "M12 5v13M12 18l-4-4M12 18l4-4",
  trash: "M5 8h14M9 8V6h6v2M8 8l.8 11h6.4L16 8",
  share:
    "M10 13a4 4 0 0 0 6.2 1.2l2.2-2.2a4 4 0 0 0-5.7-5.6L11.4 7.6M14 11a4 4 0 0 0-6.2-1.2L5.6 12a4 4 0 0 0 5.7 5.6l1.2-1.2",
};

const d = computed(() => PATHS[props.name] ?? "");
const filled = computed(() => props.name === "select");
</script>

<template>
  <svg
    class="tool-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
    :fill="filled ? 'currentColor' : 'none'"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path :d="d" />
  </svg>
</template>
