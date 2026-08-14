<script setup>
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useBrandingStore } from '@/stores/branding'

const brandingStore = useBrandingStore()

// Billing toggle: monthly vs yearly (20% discount)
const isYearly = ref(true)

// Interactive AI Triage Simulator State
const sampleEmails = [
  {
    id: 1,
    sender: 'alex.morgan@acme.com',
    subject: 'Enterprise Upgrade & Security Compliance Question',
    body: 'Hi RelayRow Team,\nWe are interested in upgrading our organization to the Enterprise plan for 50 domains. Do you support custom Svix webhook HMAC signatures and SOC2 compliant vault key storage?',
    presetCategory: 'Sales & Security',
    confidence: 98,
    spamScore: 2,
    suggestedReply: 'Hello Alex,\nThank you for reaching out! Yes, RelayRow natively supports Svix HMAC signature verification on all inbound webhooks, and all API credentials are saved directly into Supabase Vault. I would be glad to set up an Enterprise onboarding call for your 50 domains!'
  },
  {
    id: 2,
    sender: 'billing@startup.io',
    subject: 'Request for Invoice Copy - Invoice #RR-8842',
    body: 'Hello Support,\nCould you please re-send the PDF invoice for our Pro plan renewal last week? We need it for our quarterly accounting audit.\nBest,\nJessica',
    presetCategory: 'Billing & Accounting',
    confidence: 96,
    spamScore: 1,
    suggestedReply: 'Hi Jessica,\nCertainly! I have attached a fresh PDF copy of invoice #RR-8842 for your Pro plan renewal. You can also view and download all historical invoices anytime in your RelayRow Organization Settings page under Billing.'
  },
  {
    id: 3,
    sender: 'promotions@cheap-leads-2026.net',
    subject: 'URGENT: Buy 1,000,000 Verified B2B Emails for $50!!',
    body: 'DEAL OF THE CENTURY!! Click here to download 1 million marketing emails right now before offer expires in 1 hour!!!',
    presetCategory: 'Spam / Phishing',
    confidence: 99,
    spamScore: 97,
    suggestedReply: '[AURA Scanner Verdict: Blocked & Quarantined. No response draft generated.]'
  }
]

const activeSampleId = ref(1)
const customSubject = ref('')
const customBody = ref('')
const isSimulating = ref(false)

const currentSample = computed(() => sampleEmails.find(e => e.id === activeSampleId.value) || sampleEmails[0])

function selectSample(id) {
  activeSampleId.value = id
  customSubject.value = ''
  customBody.value = ''
}

function runTriageSimulation() {
  isSimulating.value = true
  setTimeout(() => {
    isSimulating.value = false
  }, 600)
}

// Pricing calculation helper
const discount = computed(() => isYearly.value ? 0.8 : 1.0)
const plans = [
  {
    name: 'Starter Plan',
    slug: 'starter',
    monthlyPrice: 29,
    domains: 3,
    inboxes: 20,
    seats: 5,
    credits: '2,000',
    features: ['3 Inbound Domains', '20 Team Inboxes', '2,000 AURA AI Credits', '5 Team Seats', 'Svix Signature Verification', 'Email Forwarders'],
    isPopular: false
  },
  {
    name: 'Pro Business',
    slug: 'pro',
    monthlyPrice: 79,
    domains: 10,
    inboxes: 100,
    seats: 25,
    credits: '10,000',
    features: ['10 Inbound Domains', '100 Team Inboxes', '10,000 AURA AI Credits', '25 Team Seats', 'Priority AURA Cascade', 'Knowledge Base (RAG)', 'Custom Signature Templates'],
    isPopular: true
  },
  {
    name: 'Enterprise',
    slug: 'enterprise',
    monthlyPrice: 249,
    domains: 50,
    inboxes: 500,
    seats: 100,
    credits: '50,000',
    features: ['50 Inbound Domains', '500 Team Inboxes', '50,000 AURA AI Credits', '100 Team Seats', 'Dedicated AURA Pipeline', 'Custom SLA & Support', 'Vault Key Migration'],
    isPopular: false
  }
]

// FAQ State
const activeFaq = ref(0)
const faqs = [
  {
    q: 'How does RelayRow handle email receiving without a mail server?',
    a: 'RelayRow uses domain MX catch-all routing via Resend webhook ingestion. All inbound emails to any address@yourdomain.com hit the RelayRow Supabase Edge Function directly via Svix webhooks. No mail server, IMAP, or DNS waiting required.'
  },
  {
    q: 'What is the Platform AURA AI Module and do I need my own LLM API key?',
    a: 'No! Super Admins configure central platform LLM keys (OpenAI, Anthropic, OpenRouter, Groq) securely in Supabase Vault. Member accounts consume platform AURA credits for AI triage, intent classification, and automated reply drafting.'
  },
  {
    q: 'How does the 3-Tier user permission model work?',
    a: 'RelayRow supports Super Admin (platform owner), Tenant Owner / Admin (manages domains, billing, and team seats), and Inbox Operators (restricted access to specific assigned inboxes only).'
  },
  {
    q: 'Are inbound webhook payloads cryptographically verified?',
    a: 'Yes. RelayRow verifies Svix HMAC signatures on all inbound webhook calls. If an attacker attempts to spoof a delivery payload, RelayRow rejects it with a 401 Unauthorized status.'
  }
]

function toggleFaq(idx) {
  activeFaq.value = activeFaq.value === idx ? -1 : idx
}
</script>

<template>
  <div class="landing-page" :style="brandingStore.cssVariables">
    <!-- Navbar -->
    <header class="navbar">
      <div class="nav-container">
        <RouterLink to="/" class="brand-logo">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 236 64" width="140" height="38" role="img" aria-label="RelayRow">
            <defs>
              <linearGradient id="rrLndA" x1="6" y1="38" x2="58" y2="26" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="#818CF8"/>
                <stop offset="1" stop-color="#22D3EE"/>
              </linearGradient>
              <linearGradient id="rrLndB" x1="150" y1="46" x2="220" y2="20" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="#818CF8"/>
                <stop offset="1" stop-color="#22D3EE"/>
              </linearGradient>
            </defs>
            <rect class="rr-bar bar-1" x="6" y="13" width="30" height="8" rx="4" fill="#818CF8" opacity=".45"/>
            <rect class="rr-bar bar-2" x="6" y="28" width="38" height="8" rx="4" fill="url(#rrLndA)"/>
            <rect class="rr-bar bar-3" x="6" y="43" width="22" height="8" rx="4" fill="#818CF8" opacity=".45"/>
            <circle class="rr-packet" cx="54" cy="32" r="4" fill="#22D3EE"/>
            <text x="78" y="43" font-family="Inter, system-ui, sans-serif" font-size="30" font-weight="600" letter-spacing="-.6" fill="var(--rr-text)">Relay<tspan fill="url(#rrLndB)">Row</tspan></text>
          </svg>
        </RouterLink>

        <nav class="nav-links">
          <a href="#features">Capabilities</a>
          <a href="#aura">AURA AI Engine</a>
          <a href="#playground">Interactive Demo</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>

        <div class="nav-actions">
          <RouterLink to="/login" class="btn btn-ghost">Sign In</RouterLink>
          <RouterLink to="/inbox" class="btn btn-gradient">Launch App →</RouterLink>
          <RouterLink to="/admin" class="btn btn-outline-sm">Admin</RouterLink>
        </div>
      </div>
    </header>

    <!-- Hero Section -->
    <section class="hero-section">
      <div class="hero-bg-glow"></div>
      <div class="hero-content">
        <div class="hero-badge">
          <span class="sparkle">⚡</span> Next-Gen Multi-Tenant Email Engine & AURA AI Gateway
        </div>
        <h1 class="hero-title">
          Receive, Thread & Reply to Mail on Your Domain with <span class="gradient-text">Zero Mail Server</span>
        </h1>
        <p class="hero-subtitle">
          RelayRow turns email addresses into database rows. Powered by Supabase Edge Functions, Svix HMAC security, per-seat RBAC, and platform-wide AURA AI triage.
        </p>

        <div class="hero-cta-group">
          <RouterLink to="/login" class="btn btn-primary-lg glow-effect">
            Start Free Trial
          </RouterLink>
          <a href="#playground" class="btn btn-secondary-lg">
            Try Interactive AI Demo
          </a>
        </div>

        <!-- Metrics Banner -->
        <div class="metrics-bar">
          <div class="metric-item">
            <span class="metric-num">99.9%</span>
            <span class="metric-lbl">Webhook Delivery</span>
          </div>
          <div class="metric-divider"></div>
          <div class="metric-item">
            <span class="metric-num">0</span>
            <span class="metric-lbl">Mail Server Overhead</span>
          </div>
          <div class="metric-divider"></div>
          <div class="metric-item">
            <span class="metric-num">&lt;50ms</span>
            <span class="metric-lbl">Svix Ingest Latency</span>
          </div>
          <div class="metric-divider"></div>
          <div class="metric-item">
            <span class="metric-num">100%</span>
            <span class="metric-lbl">Vault Key Encryption</span>
          </div>
        </div>

        <!-- Live Hero Mockup Preview -->
        <div class="hero-preview-card card-glass">
          <div class="preview-header">
            <div class="window-dots">
              <span class="dot red"></span>
              <span class="dot yellow"></span>
              <span class="dot green"></span>
            </div>
            <div class="window-title">RelayRow — Live Multi-Tenant Inbox & AURA Stream</div>
            <div class="status-indicator">
              <span class="pulse-dot"></span> Live Catch-All MX Active
            </div>
          </div>

          <div class="preview-body">
            <div class="preview-sidebar">
              <div class="inbox-item active">
                <div class="inbox-title">📬 support@relayrow.com</div>
                <div class="inbox-count font-bold">14 Unread</div>
              </div>
              <div class="inbox-item">
                <div class="inbox-title">💼 sales@company.com</div>
                <div class="inbox-count">5 Unread</div>
              </div>
              <div class="inbox-item">
                <div class="inbox-title">🛠️ info@company.com</div>
                <div class="inbox-count">Catch-All</div>
              </div>
            </div>

            <div class="preview-main">
              <div class="stream-header">
                <span class="stream-sender">alex.morgan@acme.com</span>
                <span class="badge badge-aura">✨ AURA Triage: Sales Inquiry</span>
                <span class="badge badge-success">Spam Score: 2%</span>
              </div>
              <h4 class="stream-subject">Enterprise Upgrade & Security Compliance Question</h4>
              <p class="stream-snippet">
                "We are interested in upgrading our organization to the Enterprise plan for 50 domains. Do you support custom Svix webhook HMAC signatures...?"
              </p>

              <div class="ai-draft-box">
                <div class="draft-title">
                  <span>✨ AURA Auto-Generated Draft Response</span>
                  <span class="credits-tag">Cost: 2 AURA Credits</span>
                </div>
                <p class="draft-text">
                  "Hello Alex! Yes, RelayRow natively supports Svix HMAC signature verification on all inbound webhooks, and all API credentials are saved directly into Supabase Vault..."
                </p>
                <div class="draft-actions">
                  <button class="btn btn-sm btn-primary">Approve & Send</button>
                  <button class="btn btn-sm btn-ghost">Edit Reply</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Core Features Section -->
    <section id="features" class="features-section">
      <div class="section-container">
        <div class="section-header text-center">
          <span class="sub-tag">Platform Architecture</span>
          <h2>Built for Scale, Speed, and Zero Infrastructure Maintenance</h2>
          <p>Everything you need to run high-volume team email operations with enterprise grade security.</p>
        </div>

        <div class="features-grid">
          <div class="feature-card card-glass">
            <div class="feature-icon">🌐</div>
            <h3>Catch-All Domain Ingestion</h3>
            <p>One DNS MX record turns your domain into a catch-all receiver. Create `support@`, `billing@`, or `anything@` instantly without provider fees.</p>
          </div>

          <div class="feature-card card-glass" id="aura">
            <div class="feature-icon">✨</div>
            <h3>Platform AURA AI Engine</h3>
            <p>Super Admin configures platform-wide LLMs in Supabase Vault. Tenants consume pooled AI credits for automated triage and RAG knowledge base answers.</p>
          </div>

          <div class="feature-card card-glass">
            <div class="feature-icon">👥</div>
            <h3>3-Tier Granular RBAC</h3>
            <p>Super Admin platform controls, Member Org Admins, and Inbox Operators with domain and address-level permission scoping.</p>
          </div>

          <div class="feature-card card-glass">
            <div class="feature-icon">🔒</div>
            <h3>Svix HMAC Security</h3>
            <p>Every inbound webhook is cryptographically verified against Svix signatures. API keys stay isolated inside Supabase Vault.</p>
          </div>

          <div class="feature-card card-glass">
            <div class="feature-icon">📬</div>
            <h3>Sandbox CSP Rendering</h3>
            <p>View rich HTML emails safely inside iframe sandboxes preventing tracking pixels, script injection, or phishing exploits.</p>
          </div>

          <div class="feature-card card-glass">
            <div class="feature-icon">🔄</div>
            <h3>Idempotent Mail Replay</h3>
            <p>If an edge function ever experiences downtime, missed mail is retrievable from Resend and replayed with 100% idempotency.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Interactive AI Playground Demo -->
    <section id="playground" class="playground-section">
      <div class="section-container">
        <div class="section-header text-center">
          <span class="sub-tag">Interactive Demo</span>
          <h2>Test the AURA AI Triage & Draft Engine</h2>
          <p>Select a sample incoming email or type your own to see AURA analyze intent and draft a response live.</p>
        </div>

        <div class="playground-card card-glass">
          <div class="sample-selector">
            <button
              v-for="s in sampleEmails"
              :key="s.id"
              :class="{ active: activeSampleId === s.id && !customBody }"
              @click="selectSample(s.id)"
            >
              {{ s.subject }}
            </button>
          </div>

          <div class="playground-grid">
            <!-- Email Input -->
            <div class="input-column">
              <h3>Incoming Email Payload</h3>
              <div class="form-group">
                <label>From:</label>
                <input :value="currentSample.sender" readonly />
              </div>
              <div class="form-group">
                <label>Subject:</label>
                <input :value="currentSample.subject" readonly />
              </div>
              <div class="form-group">
                <label>Body Content:</label>
                <textarea rows="6" :value="currentSample.body" readonly></textarea>
              </div>
              <button class="btn btn-primary full-width" :disabled="isSimulating" @click="runTriageSimulation">
                {{ isSimulating ? 'AURA Analyzing Payload...' : 'Run AURA AI Triage' }}
              </button>
            </div>

            <!-- AI Output -->
            <div class="output-column">
              <h3>AURA Real-Time Analysis</h3>
              <div class="verdict-card">
                <div class="verdict-row">
                  <span>Intent Category:</span>
                  <span class="badge badge-aura">{{ currentSample.presetCategory }}</span>
                </div>
                <div class="verdict-row">
                  <span>Confidence Score:</span>
                  <strong>{{ currentSample.confidence }}%</strong>
                </div>
                <div class="verdict-row">
                  <span>Spam Risk Score:</span>
                  <span class="badge" :class="currentSample.spamScore > 50 ? 'badge-danger' : 'badge-success'">
                    {{ currentSample.spamScore }}%
                  </span>
                </div>
              </div>

              <div class="draft-output-card">
                <h4>Suggested AI Response Draft</h4>
                <p class="draft-content">{{ currentSample.suggestedReply }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Pricing Section -->
    <section id="pricing" class="pricing-section">
      <div class="section-container">
        <div class="section-header text-center">
          <span class="sub-tag">Membership Plans</span>
          <h2>Simple, Transparent Pricing for Teams of All Sizes</h2>
          <p>Choose the right plan for your organization. Upgrade or adjust anytime.</p>

          <!-- Toggle -->
          <div class="pricing-toggle">
            <span :class="{ active: !isYearly }">Monthly</span>
            <label class="switch">
              <input type="checkbox" v-model="isYearly" />
              <span class="slider round"></span>
            </label>
            <span :class="{ active: isYearly }">
              Yearly <span class="discount-badge">Save 20%</span>
            </span>
          </div>
        </div>

        <div class="pricing-grid">
          <div
            v-for="p in plans"
            :key="p.slug"
            class="pricing-card card-glass"
            :class="{ popular: p.isPopular }"
          >
            <div v-if="p.isPopular" class="popular-tag">MOST POPULAR</div>
            <h3>{{ p.name }}</h3>
            <div class="price-box">
              <span class="currency">$</span>
              <span class="amount">{{ Math.round(p.monthlyPrice * discount) }}</span>
              <span class="period">/ month</span>
            </div>
            <p class="billing-note">{{ isYearly ? 'Billed annually' : 'Billed monthly' }}</p>

            <ul class="features-list">
              <li v-for="(f, idx) in p.features" :key="idx">
                <span class="check">✓</span> {{ f }}
              </li>
            </ul>

            <RouterLink :to="`/login?plan=${p.slug}`" class="btn full-width" :class="p.isPopular ? 'btn-primary' : 'btn-outline'">
              Get Started
            </RouterLink>
          </div>
        </div>
      </div>
    </section>

    <!-- FAQ Accordion -->
    <section id="faq" class="faq-section">
      <div class="section-container">
        <div class="section-header text-center">
          <span class="sub-tag">Got Questions?</span>
          <h2>Frequently Asked Questions</h2>
        </div>

        <div class="faq-accordion">
          <div
            v-for="(faq, idx) in faqs"
            :key="idx"
            class="faq-item card-glass"
            :class="{ open: activeFaq === idx }"
            @click="toggleFaq(idx)"
          >
            <div class="faq-question">
              <h3>{{ faq.q }}</h3>
              <span class="faq-icon">{{ activeFaq === idx ? '−' : '+' }}</span>
            </div>
            <div v-if="activeFaq === idx" class="faq-answer">
              <p>{{ faq.a }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Banner -->
    <section class="cta-banner-section">
      <div class="cta-banner card-glass">
        <h2>Ready to Upgrade Your Organization's Email Infrastructure?</h2>
        <p>Launch your first receiving domain in under 3 minutes with zero mail server setup.</p>
        <RouterLink to="/login" class="btn btn-primary-lg glow-effect">
          Get Started Now →
        </RouterLink>
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <div class="footer-container">
        <div class="footer-col">
          <div class="brand-logo">
            <span class="brand-name">RelayRow</span>
          </div>
          <p class="footer-desc">
            Standalone Multi-Tenant Email Engine, Svix HMAC Webhook Security & AURA AI Gateway.
          </p>
        </div>

        <div class="footer-col">
          <h4>Platform Nav</h4>
          <RouterLink to="/inbox">Inbox App</RouterLink>
          <RouterLink to="/login">Sign In / Register</RouterLink>
          <RouterLink to="/settings">Member Settings</RouterLink>
          <RouterLink to="/admin">Super Admin Console</RouterLink>
        </div>

        <div class="footer-col">
          <h4>Architecture</h4>
          <a href="#features">Webhooks & Ingest</a>
          <a href="#aura">AURA AI Engine</a>
          <a href="#pricing">Membership Plans</a>
          <a href="#faq">FAQ</a>
        </div>
      </div>

      <div class="footer-bottom text-center">
        <p>© 2026 RelayRow.com. All rights reserved.</p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.landing-page {
  min-height: 100vh;
  background-color: var(--rr-bg);
  color: var(--rr-text);
  font-family: var(--rr-font);
  line-height: 1.6;
  overflow-x: hidden;
}

/* Navbar */
.navbar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--rr-bg-surface);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--rr-border);
  padding: 1rem 0;
}

.nav-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.brand-logo {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  text-decoration: none;
}

/* ── Animated Logo Mark ─────────────────────────────────────────────────── */
.rr-bar {
  transition: width 0.3s ease;
}
.bar-1 { animation: rrBarGrow1 4s ease-in-out infinite alternate; }
.bar-2 { animation: rrBarGrow2 4s ease-in-out infinite alternate 0.6s; }
.bar-3 { animation: rrBarGrow3 4s ease-in-out infinite alternate 1.2s; }

@keyframes rrBarGrow1 {
  0% { width: 30px; }
  50% { width: 36px; }
  100% { width: 28px; }
}

@keyframes rrBarGrow2 {
  0% { width: 38px; }
  50% { width: 44px; }
  100% { width: 34px; }
}

@keyframes rrBarGrow3 {
  0% { width: 22px; }
  50% { width: 32px; }
  100% { width: 24px; }
}

.rr-packet {
  animation: rrPacketStraightLine 3s ease-in-out infinite alternate;
}

@keyframes rrPacketStraightLine {
  0% { transform: translateX(-16px); opacity: 0.75; }
  50% { transform: translateX(0px); opacity: 1; }
  100% { transform: translateX(6px); opacity: 0.85; }
}

.nav-links {
  display: flex;
  gap: 2rem;
}

.nav-links a {
  color: var(--xe-text-muted);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
  transition: color var(--xe-transition);
}

.nav-links a:hover { color: var(--rr-text); }

.nav-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* Hero */
.hero-section {
  position: relative;
  padding: 5rem 1.5rem 4rem;
  text-align: center;
  max-width: 1100px;
  margin: 0 auto;
}

.hero-bg-glow {
  position: absolute;
  top: 5%;
  left: 50%;
  transform: translateX(-50%);
  width: 700px;
  height: 400px;
  background: radial-gradient(circle, var(--rr-accent-transparent) 0%, rgba(34, 211, 238, 0.1) 40%, transparent 70%);
  filter: blur(70px);
  pointer-events: none;
  animation: auroraFloat 8s ease-in-out infinite alternate;
}

@keyframes auroraFloat {
  0% { transform: translateX(-50%) translateY(0px) scale(1); opacity: 0.7; }
  50% { transform: translateX(-48%) translateY(-20px) scale(1.1); opacity: 1; }
  100% { transform: translateX(-52%) translateY(15px) scale(0.95); opacity: 0.75; }
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--rr-accent-transparent);
  border: 1px solid var(--rr-border);
  color: var(--rr-accent);
  padding: 0.4rem 1rem;
  border-radius: 9999px;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
}

.hero-title {
  font-size: 3.2rem;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.03em;
  margin-bottom: 1.25rem;
}

.gradient-text {
  color: var(--rr-accent);
}

.hero-subtitle {
  font-size: 1.15rem;
  color: var(--xe-text-muted);
  max-width: 760px;
  margin: 0 auto 2rem;
}

.hero-cta-group {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 3rem;
}

.metrics-bar {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 2rem;
  background: var(--rr-bg-surface);
  border: 1px solid var(--rr-border);
  padding: 1.25rem 2rem;
  border-radius: var(--xe-radius-lg);
  margin-bottom: 3.5rem;
}

.metric-num {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--rr-text);
  display: block;
  font-variant-numeric: tabular-nums;
}

.metric-lbl {
  font-size: 0.8rem;
  color: var(--xe-text-muted);
}

.metric-divider {
  width: 1px;
  height: 30px;
  background: var(--rr-border);
}

/* Glass Card */
.card-glass {
  background: var(--rr-bg-surface);
  border: 1px solid var(--rr-border);
  border-radius: var(--xe-radius-lg);
  padding: 1.75rem;
}

/* Preview Card */
.hero-preview-card {
  text-align: left;
  box-shadow: var(--xe-shadow);
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--rr-border);
  padding-bottom: 1rem;
  margin-bottom: 1.25rem;
}

.window-dots {
  display: flex;
  gap: 6px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.dot.red { background: var(--xe-danger); }
.dot.yellow { background: var(--xe-warning); }
.dot.green { background: var(--xe-success); }

.window-title { font-size: 0.85rem; color: var(--xe-text-muted); font-weight: 500; }

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  color: var(--xe-success);
  font-weight: 600;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  background: var(--xe-success);
  border-radius: 50%;
}

.preview-body {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 1.5rem;
}

.preview-sidebar {
  border-right: 1px solid var(--rr-border);
  padding-right: 1rem;
}

.inbox-item {
  padding: 0.6rem 0.8rem;
  border-radius: var(--xe-radius);
  margin-bottom: 0.4rem;
  font-size: 0.85rem;
}

.inbox-item.active {
  background: var(--rr-accent-transparent);
  border: 1px solid var(--rr-border);
}

.inbox-count { font-size: 0.75rem; color: var(--xe-text-muted); margin-top: 0.2rem; font-variant-numeric: tabular-nums; }

.stream-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.5rem;
}

.stream-sender { font-weight: 600; font-size: 0.9rem; }
.stream-subject { font-size: 1.1rem; margin: 0.25rem 0 0.5rem 0; }
.stream-snippet { color: var(--xe-text-muted); font-size: 0.88rem; margin-bottom: 1rem; }

.ai-draft-box {
  background: var(--xe-bg-elevated);
  border: 1px solid var(--rr-border);
  border-radius: var(--xe-radius-lg);
  padding: 1rem;
}

.draft-title {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--rr-accent);
  margin-bottom: 0.6rem;
}

.credits-tag { color: var(--xe-text-muted); font-size: 0.75rem; }
.draft-text { font-size: 0.85rem; color: var(--rr-text); margin-bottom: 1rem; }
.draft-actions { display: flex; gap: 0.5rem; }

/* Features */
.features-section { padding: 6rem 1.5rem; }
.section-container { max-width: 1150px; margin: 0 auto; }

.section-header h2 { font-size: 2.1rem; font-weight: 600; margin: 0.5rem 0; letter-spacing: -0.01em; }
.sub-tag { color: var(--rr-accent); font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; }

.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  margin-top: 3rem;
}

.feature-card { text-align: left; transition: transform var(--xe-transition); }
.feature-card:hover { transform: translateY(-2px); }

.feature-icon { font-size: 2rem; margin-bottom: 1rem; }
.feature-card h3 { font-size: 1.2rem; font-weight: 600; margin-bottom: 0.5rem; }
.feature-card p { color: var(--xe-text-muted); font-size: 0.9rem; }

/* Playground */
.playground-section { padding: 4rem 1.5rem; }
.playground-card { margin-top: 2rem; }

.sample-selector {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  overflow-x: auto;
}

.sample-selector button {
  background: var(--xe-bg-hover);
  border: 1px solid var(--rr-border);
  color: var(--xe-text-muted);
  padding: 0.5rem 1rem;
  border-radius: var(--xe-radius);
  font-size: 0.85rem;
  cursor: pointer;
}

.sample-selector button.active {
  background: var(--rr-accent);
  color: #ffffff;
  border-color: transparent;
}

.playground-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  text-align: left;
}

.form-group { margin-bottom: 1rem; }
.form-group label { display: block; font-size: 0.8rem; color: var(--xe-text-muted); margin-bottom: 0.3rem; }
.form-group input, .form-group textarea {
  width: 100%;
  background: var(--rr-bg);
  border: 1px solid var(--rr-border);
  color: var(--rr-text);
  padding: 0.6rem;
  border-radius: var(--xe-radius);
  font-size: 0.88rem;
}

.verdict-card {
  background: var(--xe-bg-elevated);
  padding: 1rem;
  border-radius: var(--xe-radius);
  margin-bottom: 1rem;
}

.verdict-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  font-size: 0.88rem;
}

.draft-output-card {
  background: var(--rr-accent-transparent);
  border: 1px solid var(--rr-border);
  padding: 1rem;
  border-radius: var(--xe-radius);
}

/* Pricing */
.pricing-section { padding: 6rem 1.5rem; }

.pricing-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 1.5rem;
  font-weight: 600;
}

.switch { position: relative; display: inline-block; width: 50px; height: 26px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider {
  position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
  background-color: var(--rr-border); transition: var(--xe-transition); border-radius: 34px;
}
.slider:before {
  position: absolute; content: ""; height: 18px; width: 18px; left: 4px; bottom: 4px;
  background-color: #ffffff; transition: var(--xe-transition); border-radius: 50%;
}
input:checked + .slider { background-color: var(--rr-accent); }
input:checked + .slider:before { transform: translateX(24px); }

.discount-badge {
  background: rgba(16, 185, 129, 0.15);
  color: var(--xe-success);
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 9999px;
  margin-left: 0.4rem;
}

.pricing-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
  margin-top: 3rem;
}

.pricing-card {
  position: relative;
  text-align: left;
  display: flex;
  flex-direction: column;
}

.pricing-card.popular {
  border-color: var(--rr-accent);
}

.popular-tag {
  position: absolute;
  top: -12px;
  right: 20px;
  background: var(--rr-accent);
  color: #ffffff;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
}

.price-box { margin: 1rem 0 0.2rem 0; display: flex; align-items: baseline; }
.currency { font-size: 1.5rem; font-weight: 700; }
.amount { font-size: 3rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.period { color: var(--xe-text-muted); font-size: 0.9rem; margin-left: 0.3rem; }

.features-list { list-style: none; padding: 0; margin: 1.5rem 0 2rem 0; flex-grow: 1; }
.features-list li { margin-bottom: 0.6rem; font-size: 0.9rem; color: var(--rr-text); }
.check { color: var(--xe-success); font-weight: 700; margin-right: 0.4rem; }

/* FAQ */
.faq-section { padding: 4rem 1.5rem; }
.faq-accordion { max-width: 800px; margin: 2rem auto 0; text-align: left; }
.faq-item { margin-bottom: 1rem; cursor: pointer; }
.faq-question { display: flex; justify-content: space-between; align-items: center; }
.faq-question h3 { font-size: 1.05rem; font-weight: 600; margin: 0; }
.faq-answer { margin-top: 0.8rem; color: var(--xe-text-muted); font-size: 0.92rem; border-top: 1px solid var(--rr-border); padding-top: 0.8rem; }

/* CTA Banner */
.cta-banner-section { padding: 4rem 1.5rem; }
.cta-banner { max-width: 1000px; margin: 0 auto; text-align: center; padding: 3.5rem 2rem; }
.cta-banner h2 { font-size: 2rem; font-weight: 800; margin-bottom: 0.5rem; }
.cta-banner p { color: var(--xe-text-muted); margin-bottom: 2rem; }

/* Buttons */
.btn {
  padding: 0.65rem 1.3rem;
  border-radius: var(--xe-radius);
  font-weight: 600;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: none;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
  user-select: none;
}

.btn:focus-visible {
  outline: 2px solid var(--rr-accent);
  outline-offset: 2px;
}

.btn-primary-lg {
  background: var(--rr-accent);
  color: #ffffff;
  padding: 0.9rem 2.2rem;
  font-size: 1.05rem;
  border-radius: var(--xe-radius-lg);
  box-shadow: 0 4px 16px var(--rr-accent-transparent);
}

.btn-primary-lg:hover {
  background: var(--rr-accent-hover);
  transform: translateY(-2px);
  box-shadow: 0 8px 28px var(--rr-accent-transparent);
}

.btn-primary-lg:active {
  transform: translateY(0px) scale(0.97);
  box-shadow: 0 2px 8px var(--rr-accent-transparent);
}

.glow-effect {
  box-shadow: 0 0 30px var(--rr-accent-transparent);
}

.btn-secondary-lg {
  background: var(--xe-bg-hover);
  border: 1px solid var(--rr-border);
  color: var(--rr-text);
  padding: 0.9rem 2.2rem;
  font-size: 1.05rem;
  border-radius: var(--xe-radius-lg);
}

.btn-secondary-lg:hover {
  background: var(--rr-accent-transparent);
  border-color: var(--rr-accent);
  color: var(--rr-text);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px var(--rr-accent-transparent);
}

.btn-secondary-lg:active {
  transform: translateY(0px) scale(0.97);
}

.btn-gradient {
  background: var(--rr-accent);
  color: #ffffff;
  box-shadow: 0 4px 14px var(--rr-accent-transparent);
}

.btn-gradient:hover {
  background: var(--rr-accent-hover);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px var(--rr-accent-transparent);
}

.btn-gradient:active {
  transform: translateY(0px) scale(0.97);
}

.btn-ghost { color: var(--xe-text-muted); }
.btn-ghost:hover {
  color: var(--rr-text);
  background: var(--xe-bg-hover);
  transform: translateY(-1px);
}
.btn-ghost:active { transform: translateY(0px) scale(0.97); }

.btn-outline-sm {
  border: 1px solid var(--rr-border);
  color: var(--rr-text);
  font-size: 0.85rem;
  background: transparent;
}

.btn-outline-sm:hover {
  border-color: var(--rr-accent);
  background: var(--rr-accent-transparent);
  transform: translateY(-1px);
}

.btn-outline-sm:active { transform: translateY(0px) scale(0.97); }

.full-width { width: 100%; }

.badge {
  padding: 0.2rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
}
.badge-aura { background: var(--rr-accent-transparent); color: var(--rr-accent); }
.badge-success { background: rgba(16, 185, 129, 0.15); color: var(--xe-success); }
.badge-danger { background: rgba(239, 68, 68, 0.15); color: var(--xe-danger); }

/* Footer */
.footer {
  border-top: 1px solid var(--rr-border);
  padding: 4rem 1.5rem 2rem;
  background: var(--rr-bg-surface);
}

.footer-container {
  max-width: 1150px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 3rem;
  text-align: left;
}

.footer-desc { color: var(--xe-text-muted); font-size: 0.88rem; margin-top: 0.8rem; }
.footer-col h4 { font-size: 0.9rem; font-weight: 600; margin-bottom: 1rem; color: var(--rr-text); }
.footer-col a { display: block; color: var(--xe-text-muted); text-decoration: none; font-size: 0.88rem; margin-bottom: 0.5rem; }
.footer-col a:hover { color: var(--rr-text); }

.footer-bottom {
  max-width: 1150px;
  margin: 3rem auto 0;
  padding-top: 1.5rem;
  border-top: 1px solid var(--rr-border);
  color: var(--xe-text-dim);
  font-size: 0.85rem;
}
</style>
