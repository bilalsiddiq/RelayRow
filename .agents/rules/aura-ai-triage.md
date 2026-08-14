# AURA AI Engine & Triage System

This document outlines the architecture of the AURA AI Engine module in RelayRow (`supabase/functions/inbox/ai.ts` and `scan.ts`).

---

## 1. Multi-Provider LLM Cascade

Super Admins configure LLM provider API keys globally in Supabase Vault (`vault.decrypted_secrets`). Member accounts consume platform AURA credits rather than supplying their own keys.

Supported Provider Standards:
- **OpenAI Compatible**: `https://api.openai.com/v1`
- **Anthropic Native / Compatible**: `https://api.anthropic.com/v1`
- **OpenRouter Gateway**: `https://openrouter.ai/api/v1`
- **Groq Llama Inference**: `https://api.groq.com/openai/v1`

---

## 2. Automated Triage & Capabilities

### A. Intent Classification & Urgency Scoring
- Evaluates inbound subject & body text.
- Classifies emails into categories: `Sales & Leads`, `Support`, `Billing & Accounting`, `Security & Compliance`, or `Spam`.
- Assigns confidence rating (0–100%) and urgency score.

### B. Spam & Phishing Heuristics Scanner (`scan.ts`)
- Evaluates SPF/DKIM header alignment.
- Scans for dangerous link mismatches, spoofed display names, urgency keywords, and financial wire requests.
- Flags suspicious messages with a visual advisory banner in the client inbox.

### C. Knowledge-Base (RAG) Auto-Draft Replies (`ai.ts`)
- Matches inbound questions against `aura_knowledge_bases` entries attached to the domain/inbox.
- Generates contextual draft responses ready for human review before sending.
