import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      name: 'landing',
      component: () => import('@/views/LandingView.vue'),
      meta: { public: true },
    },
    {
      path: '/inbox',
      name: 'inbox',
      component: () => import('@/views/inbox/InboxView.vue'),
    },
    {
      path: '/admin',
      redirect: '/admin/domains',
    },
    {
      path: '/admin/domains',
      name: 'admin-domains',
      component: () => import('@/views/admin/DomainsView.vue'),
    },
    {
      path: '/admin/tenants',
      name: 'admin-tenants',
      component: () => import('@/views/admin/TenantsView.vue'),
    },
    {
      path: '/admin/aura',
      name: 'admin-aura',
      component: () => import('@/views/admin/AuraView.vue'),
    },
    {
      path: '/admin/design',
      name: 'admin-design',
      component: () => import('@/views/admin/DesignSystemView.vue'),
    },
    {
      path: '/admin/logs',
      name: 'admin-logs',
      component: () => import('@/views/admin/LogsView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/tenant/TenantSettingsView.vue'),
    },
  ],
})

// Navigation guard: redirect to login if not authenticated
router.beforeEach(async (to) => {
  if (to.meta.public) return true

  const auth = useAuthStore()
  if (auth.loading) {
    await auth.init()
  }
  if (!auth.session && !auth.user) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  return true
})

export default router

