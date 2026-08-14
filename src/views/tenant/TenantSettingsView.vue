<script setup>
import { ref, onMounted, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useBrandingStore } from '@/stores/branding'
import { useAuthStore } from '@/stores/auth'
import {
  listDomains, listAddresses,
  listTenantMembers, saveTenantMember, deleteTenantMember,
  listKnowledgeBase, saveKnowledgeBase, deleteKnowledgeBase,
  listTenantSubscriptions, getAuraAiConfig, listTenantAiUsage
} from '@/services/inbox'

const brandingStore = useBrandingStore()
const authStore = useAuthStore()

const activeTab = ref('domains') // domains | members | aura_credits | knowledge
const loading = ref(true)
const error = ref('')
const notice = ref('')

const domains = ref([])
const addresses = ref([])
const members = ref([])
const knowledgeDocs = ref([])
const subscription = ref(null)
const auraConfig = ref(null)
const aiUsage = ref([])

// Form states
const newMember = ref({
  email: '',
  display_name: '',
  role: 'operator',
  inbox_access: []
})

const newKbDoc = ref({
  title: '',
  category: 'General Support',
  content: '',
  is_active: true
})

function flash(msg) {
  notice.value = msg
  setTimeout(() => { notice.value = '' }, 4000)
}

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    const [dList, mList, kbList, subList, auraCfg, usageLogs] = await Promise.all([
      listDomains(),
      listTenantMembers(),
      listKnowledgeBase(),
      listTenantSubscriptions(),
      getAuraAiConfig(),
      listTenantAiUsage()
    ])
    domains.value = dList || []
    members.value = mList || []
    knowledgeDocs.value = kbList || []
    subscription.value = (subList && subList[0]) || { ai_credits_balance: 10000, membership_plans: { name: 'Pro Business' } }
    auraConfig.value = auraCfg
    aiUsage.value = usageLogs || []

    // Fetch addresses across domains
    if (domains.value.length > 0) {
      const addrPromises = domains.value.map(d => listAddresses(d.id))
      const results = await Promise.all(addrPromises)
      addresses.value = results.flat()
    }
  } catch (e) {
    error.value = e.message || 'Failed to load organization settings.'
  } finally {
    loading.value = false
  }
}

async function handleAddMember() {
  if (!newMember.value.email.trim()) {
    error.value = 'Please provide member email.'
    return
  }
  try {
    await saveTenantMember({
      email: newMember.value.email.trim().toLowerCase(),
      display_name: newMember.value.display_name.trim() || newMember.value.email.split('@')[0],
      role: newMember.value.role,
      inbox_access: newMember.value.role === 'operator' ? newMember.value.inbox_access : ['*']
    })
    newMember.value = { email: '', display_name: '', role: 'operator', inbox_access: [] }
    members.value = await listTenantMembers()
    flash('Team member added successfully!')
  } catch (e) {
    error.value = e.message || 'Failed to add team member.'
  }
}

async function handleRemoveMember(mId) {
  if (!confirm('Remove this team member?')) return
  try {
    await deleteTenantMember(mId)
    members.value = await listTenantMembers()
    flash('Team member removed.')
  } catch (e) {
    error.value = e.message || 'Failed to remove member.'
  }
}

async function handleAddKbDoc() {
  if (!newKbDoc.value.title.trim() || !newKbDoc.value.content.trim()) {
    error.value = 'Please enter a title and content for the knowledge doc.'
    return
  }
  try {
    await saveKnowledgeBase({
      title: newKbDoc.value.title.trim(),
      category: newKbDoc.value.category.trim(),
      content: newKbDoc.value.content.trim(),
      is_active: newKbDoc.value.is_active
    })
    newKbDoc.value = { title: '', category: 'General Support', content: '', is_active: true }
    knowledgeDocs.value = await listKnowledgeBase()
    flash('Knowledge Base document saved!')
  } catch (e) {
    error.value = e.message || 'Failed to save knowledge document.'
  }
}

async function handleRemoveKbDoc(docId) {
  if (!confirm('Delete this knowledge document?')) return
  try {
    await deleteKnowledgeBase(docId)
    knowledgeDocs.value = await listKnowledgeBase()
    flash('Knowledge document deleted.')
  } catch (e) {
    error.value = e.message || 'Failed to delete knowledge document.'
  }
}

onMounted(loadData)
</script>

<template>
  <div class="settings-page" :style="brandingStore.cssVariables">
    <!-- Header -->
    <header class="settings-header">
      <div class="header-left">
        <RouterLink to="/inbox" class="back-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Back to Inbox
        </RouterLink>
        <h1>Organization Settings</h1>
        <span class="badge tier-badge">{{ subscription?.membership_plans?.name || 'Pro Tier' }}</span>
      </div>
      <div class="header-right">
        <div class="credit-pill">
          <span class="sparkle">✨</span>
          <span class="credit-count">{{ (subscription?.ai_credits_balance || 0).toLocaleString() }} AURA Credits</span>
        </div>
      </div>
    </header>

    <!-- Notices / Errors -->
    <div v-if="notice" class="alert alert-success">{{ notice }}</div>
    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <!-- Navigation Tabs -->
    <nav class="settings-tabs">
      <button :class="{ active: activeTab === 'domains' }" @click="activeTab = 'domains'">
        🌐 Domains & Inboxes
      </button>
      <button :class="{ active: activeTab === 'members' }" @click="activeTab = 'members'">
        👥 Team & Permissions
      </button>
      <button :class="{ active: activeTab === 'aura_credits' }" @click="activeTab = 'aura_credits'">
        ✨ AURA AI & Credits
      </button>
      <button :class="{ active: activeTab === 'knowledge' }" @click="activeTab = 'knowledge'">
        📚 Knowledge Base (RAG)
      </button>
    </nav>

    <!-- Loading State -->
    <div v-if="loading" class="loading-container">
      <div class="spinner"></div>
      <p>Loading organization settings...</p>
    </div>

    <main v-else class="tab-content">
      <!-- 🌐 DOMAINS & INBOXES TAB -->
      <section v-if="activeTab === 'domains'" class="tab-pane">
        <div class="pane-header">
          <div>
            <h2>Your Domains & Team Inboxes</h2>
            <p>Manage sending/receiving domains and address mailboxes for your organization.</p>
          </div>
          <RouterLink to="/admin" class="btn btn-outline" v-if="authStore.isSuperAdmin">Manage Domains in Admin Console</RouterLink>
        </div>

        <div class="card-grid">
          <div v-for="d in domains" :key="d.id" class="card">
            <div class="card-title-row">
              <h3>{{ d.domain }}</h3>
              <span class="badge" :class="d.inbound_enabled ? 'badge-success' : 'badge-warning'">
                {{ d.inbound_enabled ? 'MX Active' : 'Pending Setup' }}
              </span>
            </div>
            <p class="meta">Catch-all behavior: <code>{{ d.unknown_recipient }}</code></p>

            <div class="addresses-sublist">
              <h4>Inboxes on this domain:</h4>
              <ul>
                <li v-for="addr in addresses.filter(a => a.domain_id === d.id)" :key="addr.id">
                  <span>📬 {{ addr.address }}</span>
                  <span class="meta-tag">{{ addr.kind }}</span>
                </li>
                <li v-if="!addresses.filter(a => a.domain_id === d.id).length" class="empty-text">
                  No inboxes created yet on this domain.
                </li>
              </ul>
            </div>
          </div>

          <div v-if="!domains.length" class="empty-state">
            <p>No active domains assigned yet. Contact your Super Admin or set up domains in the Admin portal.</p>
          </div>
        </div>
      </section>

      <!-- 👥 TEAM & PERMISSIONS TAB -->
      <section v-if="activeTab === 'members'" class="tab-pane">
        <div class="pane-header">
          <div>
            <h2>Team Members & Granular Access (RBAC)</h2>
            <p>Invite sub-members and configure domain or inbox-specific operator access.</p>
          </div>
        </div>

        <!-- Add Member Form -->
        <div class="form-card card">
          <h3>Add New Team Member</h3>
          <form @submit.prevent="handleAddMember" class="form-grid">
            <div class="form-group">
              <label>Email Address</label>
              <input v-model="newMember.email" type="email" placeholder="colleague@company.com" required />
            </div>
            <div class="form-group">
              <label>Display Name</label>
              <input v-model="newMember.display_name" type="text" placeholder="Sarah Connor" />
            </div>
            <div class="form-group">
              <label>Role</label>
              <select v-model="newMember.role">
                <option value="owner">Owner (Full Control)</option>
                <option value="admin">Tenant Admin (Domains & Billing)</option>
                <option value="domain_admin">Domain Admin (Domain Scope)</option>
                <option value="operator">Inbox Operator (Assigned Inboxes Only)</option>
              </select>
            </div>
            <div v-if="newMember.role === 'operator'" class="form-group full-width">
              <label>Assign Inbox Access</label>
              <div class="checkbox-group">
                <label v-for="addr in addresses" :key="addr.id" class="checkbox-item">
                  <input type="checkbox" :value="addr.id" v-model="newMember.inbox_access" />
                  {{ addr.address }} ({{ addr.display_name || 'Inbox' }})
                </label>
              </div>
            </div>
            <div class="form-group full-width">
              <button type="submit" class="btn btn-primary">Invite Member</button>
            </div>
          </form>
        </div>

        <!-- Members Table -->
        <div class="table-card card">
          <h3>Active Members ({{ members.length }})</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Inbox Scope</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in members" :key="m.id">
                <td>
                  <div class="user-info">
                    <strong>{{ m.display_name || m.email }}</strong>
                    <span class="user-email">{{ m.email }}</span>
                  </div>
                </td>
                <td>
                  <span class="badge role-badge" :class="'role-' + m.role">{{ m.role }}</span>
                </td>
                <td>
                  <span v-if="m.inbox_access?.includes('*') || m.role === 'owner' || m.role === 'admin'" class="meta-tag">
                    All Inboxes
                  </span>
                  <span v-else class="meta-tag">
                    {{ m.inbox_access?.length || 0 }} Specific Inboxes
                  </span>
                </td>
                <td>
                  <button @click="handleRemoveMember(m.id)" class="btn-icon danger" title="Remove Member">
                    ✕
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ✨ AURA AI & CREDITS TAB -->
      <section v-if="activeTab === 'aura_credits'" class="tab-pane">
        <div class="pane-header">
          <div>
            <h2>Platform AURA AI Engine & Credit Usage</h2>
            <p>Your organization uses platform-wide AURA LLM engine. No API key needed.</p>
          </div>
        </div>

        <div class="aura-stats-grid">
          <div class="stat-card card">
            <span class="stat-icon">✨</span>
            <div class="stat-val">{{ (subscription?.ai_credits_balance || 0).toLocaleString() }}</div>
            <div class="stat-lbl">Remaining AI Credits</div>
          </div>
          <div class="stat-card card">
            <span class="stat-icon">⚡</span>
            <div class="stat-val">{{ auraConfig?.provider?.toUpperCase() || 'OPENAI' }}</div>
            <div class="stat-lbl">Active LLM Provider</div>
          </div>
          <div class="stat-card card">
            <span class="stat-icon">🎯</span>
            <div class="stat-val">{{ auraConfig?.model || 'gpt-4o-mini' }}</div>
            <div class="stat-lbl">Default AI Model</div>
          </div>
        </div>

        <div class="card credit-rates-card">
          <h3>AURA Consumption Rates</h3>
          <ul class="rates-list">
            <li><span>Smart Email Triage & Categorization:</span> <strong>{{ auraConfig?.credit_rate_triage || 1 }} Credit / Email</strong></li>
            <li><span>AI Draft Response & Auto-Reply:</span> <strong>{{ auraConfig?.credit_rate_reply || 2 }} Credits / Draft</strong></li>
          </ul>
        </div>

        <!-- Usage Logs -->
        <div class="card">
          <h3>Recent AI Consumption Activity</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Credits Used</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in aiUsage" :key="log.id">
                <td>{{ new Date(log.created_at).toLocaleString() }}</td>
                <td><span class="badge badge-info">{{ log.action_type }}</span></td>
                <td><strong>-{{ log.credits_deducted }}</strong></td>
                <td>{{ log.details || 'AURA Triage & Reply Generation' }}</td>
              </tr>
              <tr v-if="!aiUsage.length">
                <td colspan="4" class="empty-text">No AI consumption logs recorded yet.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 📚 KNOWLEDGE BASE TAB -->
      <section v-if="activeTab === 'knowledge'" class="tab-pane">
        <div class="pane-header">
          <div>
            <h2>Inbox Knowledge Base (RAG)</h2>
            <p>Upload documentation, FAQs, and response rules to ground AURA AI auto-replies in real facts.</p>
          </div>
        </div>

        <!-- Create Knowledge Doc Form -->
        <div class="form-card card">
          <h3>Add Knowledge Document</h3>
          <form @submit.prevent="handleAddKbDoc" class="form-grid">
            <div class="form-group">
              <label>Document Title</label>
              <input v-model="newKbDoc.title" type="text" placeholder="e.g. Return Policy 2026" required />
            </div>
            <div class="form-group">
              <label>Category</label>
              <input v-model="newKbDoc.category" type="text" placeholder="Policy / Support / FAQ" />
            </div>
            <div class="form-group full-width">
              <label>Knowledge Content / Instructions</label>
              <textarea v-model="newKbDoc.content" rows="4" placeholder="Enter facts, instructions, or rules the AI should follow when replying..." required></textarea>
            </div>
            <div class="form-group full-width">
              <button type="submit" class="btn btn-primary">Save Knowledge Document</button>
            </div>
          </form>
        </div>

        <!-- Knowledge Base Cards -->
        <div class="card-grid">
          <div v-for="doc in knowledgeDocs" :key="doc.id" class="card kb-card">
            <div class="card-title-row">
              <h3>{{ doc.title }}</h3>
              <span class="badge badge-info">{{ doc.category }}</span>
            </div>
            <p class="kb-content">{{ doc.content }}</p>
            <div class="card-footer">
              <button @click="handleRemoveKbDoc(doc.id)" class="btn-text danger">Delete Document</button>
            </div>
          </div>

          <div v-if="!knowledgeDocs.length" class="empty-state">
            <p>No knowledge documents added yet. Add documents to improve AI auto-replies!</p>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.settings-page {
  min-height: 100vh;
  background-color: var(--rr-bg);
  color: var(--rr-text);
  padding: 1.5rem 2rem;
  font-family: var(--rr-font);
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--rr-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--xe-text-muted);
  text-decoration: none;
  font-size: 0.9rem;
  transition: color var(--xe-transition);
}

.back-btn:hover {
  color: var(--rr-text);
}

.header-left h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.01em;
}

.badge {
  padding: 0.25rem 0.6rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.tier-badge {
  background: var(--rr-accent-transparent);
  color: var(--rr-accent);
  border: 1px solid var(--rr-border);
}

.credit-pill {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--xe-bg-hover);
  border: 1px solid var(--rr-border);
  padding: 0.4rem 1rem;
  border-radius: 9999px;
  font-weight: 600;
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
}

.settings-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.settings-tabs button {
  background: var(--xe-bg-hover);
  border: 1px solid transparent;
  color: var(--xe-text-muted);
  padding: 0.6rem 1.2rem;
  border-radius: var(--xe-radius);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--xe-transition);
}

.settings-tabs button:hover {
  background: var(--xe-bg-hover);
  color: var(--rr-text);
}

.settings-tabs button.active {
  background: var(--rr-accent);
  color: #ffffff;
  border-color: transparent;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.25rem;
  margin-top: 1rem;
}

.card {
  background: var(--rr-bg-surface);
  border: 1px solid var(--rr-border);
  border-radius: var(--xe-radius-lg);
  padding: 1.25rem;
}

.pane-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.pane-header h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 0.25rem 0;
}

.pane-header p {
  color: var(--xe-text-muted);
  font-size: 0.9rem;
  margin: 0;
}

.aura-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.25rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  text-align: center;
  padding: 1.5rem;
}

.stat-icon {
  font-size: 1.8rem;
}

.stat-val {
  font-size: 1.6rem;
  font-weight: 600;
  margin: 0.25rem 0;
  font-variant-numeric: tabular-nums;
}

.stat-lbl {
  color: var(--xe-text-muted);
  font-size: 0.85rem;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-top: 1rem;
}

.form-group.full-width {
  grid-column: span 2;
}

.form-group label {
  display: block;
  font-size: 0.85rem;
  color: var(--xe-text-muted);
  margin-bottom: 0.4rem;
}

.form-group input, .form-group select, .form-group textarea {
  width: 100%;
  background: var(--rr-bg);
  border: 1px solid var(--rr-border);
  color: var(--rr-text);
  padding: 0.6rem 0.8rem;
  border-radius: var(--xe-radius);
  font-size: 0.9rem;
}

.btn {
  padding: 0.6rem 1.2rem;
  border-radius: var(--xe-radius);
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: opacity var(--xe-transition);
}

.btn-primary {
  background: var(--rr-accent);
  color: #ffffff;
}

.btn-outline {
  background: transparent;
  border: 1px solid var(--rr-border);
  color: var(--rr-text);
  text-decoration: none;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
}

.data-table th, .data-table td {
  padding: 0.8rem;
  text-align: left;
  border-bottom: 1px solid var(--rr-border);
  font-size: 0.9rem;
}

.alert {
  padding: 0.8rem 1.2rem;
  border-radius: var(--xe-radius);
  margin-bottom: 1rem;
}

.alert-success { background: rgba(16, 185, 129, 0.15); color: var(--xe-success); border: 1px solid var(--rr-border); }
.alert-danger { background: rgba(239, 68, 68, 0.15); color: var(--xe-danger); border: 1px solid var(--rr-border); }
</style>
