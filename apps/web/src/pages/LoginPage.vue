<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { safeInternalPath } from "../router/guard";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const mode = ref<"login" | "register">("login");
const email = ref("");
const displayName = ref("");
const password = ref("");
const confirm = ref("");
const error = ref("");
const pending = ref(false);

async function submit(): Promise<void> {
  error.value = "";
  if (mode.value === "register" && password.value !== confirm.value) {
    error.value = "Passwords do not match";
    return;
  }
  pending.value = true;
  try {
    if (mode.value === "register") {
      await auth.register(email.value, displayName.value, password.value);
    } else {
      await auth.login(email.value, password.value);
    }
    await router.push(safeInternalPath(route.query.redirect));
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Could not continue";
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <main class="login">
    <section class="login-hero" aria-hidden="true">
      <p class="kicker">Studio</p>
      <h1>A shared surface for thinking.</h1>
      <div class="hero-board">
        <span class="hero-rect" />
        <span class="hero-note">Sketch the flow</span>
        <span class="hero-ellipse" />
      </div>
    </section>
    <section class="login-card">
      <h2>{{ mode === "login" ? "Sign in" : "Create an account" }}</h2>
      <p class="lede">
        {{
          mode === "login"
            ? "Pick up a board you already started."
            : "Choose a name. It shows up next to your cursor."
        }}
      </p>
      <form @submit.prevent="submit">
        <label>
          Email
          <input
            v-model="email"
            type="email"
            data-testid="login-email"
            autocomplete="email"
            required
            maxlength="200"
          />
        </label>
        <label v-if="mode === 'register'">
          Name
          <input
            v-model="displayName"
            data-testid="login-name"
            autocomplete="name"
            required
            maxlength="80"
          />
        </label>
        <label>
          Password
          <input
            v-model="password"
            data-testid="login-password"
            type="password"
            :autocomplete="
              mode === 'login' ? 'current-password' : 'new-password'
            "
            required
            minlength="8"
            maxlength="128"
          />
        </label>
        <label v-if="mode === 'register'">
          Confirm password
          <input
            v-model="confirm"
            type="password"
            autocomplete="new-password"
            required
          />
        </label>
        <p v-if="error" class="form-error">{{ error }}</p>
        <button class="primary wide" type="submit" :disabled="pending">
          {{ mode === "login" ? "Sign in" : "Create account" }}
        </button>
      </form>
      <button
        class="text-button"
        type="button"
        @click="mode = mode === 'login' ? 'register' : 'login'"
      >
        {{
          mode === "login"
            ? "Need an account? Register"
            : "Already registered? Sign in"
        }}
      </button>
    </section>
  </main>
</template>
