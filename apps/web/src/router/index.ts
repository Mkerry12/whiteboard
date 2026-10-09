import { createRouter, createWebHistory } from "vue-router";
import { guardNavigation } from "./guard";
import { useAuthStore } from "../stores/auth";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/boards" },
    {
      path: "/login",
      name: "login",
      component: () => import("../pages/LoginPage.vue"),
      meta: { guestOnly: true },
    },
    {
      path: "/boards",
      name: "boards",
      component: () => import("../pages/BoardListPage.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/boards/:boardId",
      name: "editor",
      component: () => import("../pages/EditorPage.vue"),
      meta: { requiresAuth: true },
    },
    { path: "/:pathMatch(.*)*", redirect: "/boards" },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  return (
    guardNavigation({
      isAuthenticated: auth.isAuthenticated,
      requiresAuth: to.meta.requiresAuth === true,
      guestOnly: to.meta.guestOnly === true,
      fullPath: to.fullPath,
    }) ?? true
  );
});
