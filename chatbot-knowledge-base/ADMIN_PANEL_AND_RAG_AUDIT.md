# Zyppi chatbot: admin panel and RAG audit

*Audited 2026-11-22, read-only, against the local checkouts listed below. Everything here was checked in code; items marked **[VERIFY_CONFIG]** depend on live Firestore data I could not see.*

## 1. Repositories and tech stack

| Name | Path (branch) | Role | Stack |
|---|---|---|---|
| **Zyppi App** | `~/Desktop/zyppi/zyppi-APP` (`main`) | Customer app, plus the shared backend | Flutter (Riverpod 3, go_router, easy_localization in en/bn/hi/pa, hive_ce, geolocator), PayU (`payu_checkoutpro_flutter`), Google sign-in. Backend: Firebase Cloud Functions (Node 22, firebase-functions 7, firebase-admin), Firestore in `asia-south1`, Storage, FCM, App Check. Project `zippy-app-2024`. |
| **Zyppi Marketplace** | `~/Desktop/zyppi/Zyppi-Marketplace` (`feat/scan-rider-qr`) | Seller app | Flutter 3.47.7 (FVM), Riverpod 3 + codegen, freezed, go_router, ML Kit face detection, mobile_scanner, signature. It writes only through callables. |
| **Zyppi Delivery** | `~/Desktop/zyppi/zyppi-delivery-app` (`main`) | Rider app | Flutter 3.47.7, Riverpod 3, geolocator, flutter_foreground_task, qr_flutter, fl_chart. It writes only through callables. |
| **Admin panel (active)** | `~/Documents/zyppi-delivery-admin` | Ops, support and the KB | Angular 22, NG-ZORRO 22, Tailwind 4, Firebase JS SDK 13, echarts, pdfmake, SheetJS `xlsx`, vitest. Deployed on Netlify (`main`), with Firebase Hosting target `admin` also configured. It reads Firestore directly and writes only through callables. |
| Old admin panel (legacy) | `~/Desktop/zyppi/zyppi-admin` | Not used | CoreUI on Angular 19. Its `CLAUDE.md` says not to reuse it. |
| Old backend (legacy) | `~/Desktop/zyppi/zippy-backend` | Not used | NestJS with TypeORM and MySQL. Last commit 2024-12-04 (user and OTP modules only). Nothing calls it. |

**Databases and search:** Firestore only. There is no Postgres, Mongo, Redis, Algolia, Meilisearch, Typesense or Elastic anywhere. **No LLM:** no OpenAI, Gemini, Vertex, Genkit, LangChain or Dialogflow.

## 2. The chatbot today: a hybrid RAG pipeline already exists

| Piece | Where | What it does |
|---|---|---|
| Embeddings | `zyppi-APP/functions/src/support/kb/embed.ts` | Runs `Xenova/multilingual-e5-small` (384 dimensions) **inside the function** through `@huggingface/transformers` (ONNX). No API key, no per-call cost. About 120 MB of weights download on a cold start. |
| Store | Firestore `supportKb/{id}` | One Q&A entry per document: `title`, `questions`, `answers` per language, plus `keywords`, `related`, `action` (`none`, `order_status`, `handoff`, `return_flow`), `hidden`, and the vectors as base64 Float32. Only the `support` role can read it, and only callables can write it. |
| Retrieval | `kb/retrieve.ts`, `kb/bm25.ts`, `kb/store.ts` | Keyword (BM25) and vector (cosine) scores merged with RRF. The whole index loads into memory and is cached for 10 minutes. Decisions: **answer** at cosine ≥ 0.88 with a 0.015 lead over the runner-up; **suggest** (3 chips) at cosine ≥ 0.84 or BM25 ≥ 2.5; otherwise **unknown**, which offers a person. If the model fails to load, it falls back to BM25 alone. |
| Bot | `support/bot.ts`, `reply.ts`, `copy.ts`, `lang.ts` | Firestore trigger on `supportChats/{chatId}/messages`. Detects the language, reads the live order status for `order_status` entries, allows 10 messages per minute, and has a kill switch at `config/features.supportBot`. |
| Chat API | `support/chat.ts` | `openSupportChat`, `requestSupportAgent`, `adminReplySupport`, `adminCloseSupport`. |
| **Re-index on save** | `kb/admin.ts` | `adminSaveKbEntry` validates the entry, re-embeds every question, writes it, writes an audit entry and calls `clearRetrieverCache()`. `adminDeleteKbEntry` handles deletes. This is already the "onSave reindex hook". |
| Admin UI | `zyppi-delivery-admin/src/app/features/support/` | Inbox at `/support` and the KB editor at `/support/kb` (a drawer with a tab per language). **This branch adds "Import JSON"** (see section 6). |
| Customer UI | `zyppi-APP/lib/features/support_chat/` and `core/common_widgets/help_sheet.dart` | Help sheet with Chat with us, WhatsApp and Call support. |

### Problems found

1. **3 of the 15 seed answers contradict the code** (`kb/seed.ts`):
   - `cancel_order` says orders can't be cancelled in the app. `cancelMyOrder` exists, and customers can cancel while the order is `placed`.
   - `otp_login` gives phone-OTP instructions. Login is Google, email or guest; `login_screen.dart` says "There is no phone-number sign-in".
   - `delivery_fee` says "Delivery is free". The fee comes from `config/delivery.feePaise` and `freeAbovePaise`.

   All three are fixed in `supportKb-import.json`. The seed file itself is unchanged.
2. **The seed's `talk_to_person` can't be saved from the admin editor.** Its answers are empty, and `validateKbEntry` rejects an empty answer unless the action is `order_status`. The import file gives it a one-line answer.
3. **`npm run seed:support` replaces the whole collection**, which wipes admin edits. Use the new admin import instead; it only upserts.
4. **Only the customer app has the chat.** On the checked-out branches, the seller and rider apps offer support by call and WhatsApp only. The rider app's `docs/PLAN.md` mentions "FAQs from admin", but that isn't built. If you want the bot there too, it needs an `audience` field on `supportKb` and role-aware retrieval (see 3.4).
5. With the bigger KB, one off-topic test query ("what's the weather today") gets suggestion chips instead of "unknown" (cosine 0.840, right on the suggest threshold). That's harmless, but re-run the smoke test after big KB changes and consider raising `THRESHOLDS.suggest` to 0.845.

## 3. RAG decision and architecture blueprint

### 3.1 Decision: keep the existing in-process hybrid RAG; add no new infrastructure

| Option | Verdict |
|---|---|
| **Current: BM25 + e5 vectors in Firestore, in-memory retrieval** | ✅ **Keep.** About 36 entries (roughly 450 example questions) fits in memory easily. Retrieval takes milliseconds, costs nothing per query, works in four languages and Hinglish, and already re-indexes when an admin saves. |
| Plain full-text or fuzzy search with synonyms | ❌ It would be a step backwards. It can't handle paraphrases ("where's my stuff") or Bengali, Hindi and Punjabi scripts without big synonym tables. |
| Put the whole KB in an LLM system prompt | ⏸ Not needed. There is no LLM in the stack, answers have to be exact policy text, and it would add cost, latency and a hallucination risk. |
| pgvector, Qdrant, Chroma, Atlas, Meilisearch | ❌ Overkill. They'd mean new infrastructure, and the current database is Firestore. |
| **Firestore native vector search (`findNearest`)** | ⏭ **Scale-up path** if the KB grows past about 1–2k entries, or if long documents get chunked. It stays inside Firestore; just store the vectors as `FieldValue.vector()` and add a vector index. |
| LLM answer synthesis (e.g. Claude over the top 3 entries) | ⏭ Optional later layer, for answers that combine policy text with order data. Keep the confidence gate, and only let it rephrase retrieved text. |

**Smoke test** (real model and real retriever, `scripts/support-smoke.ts` logic, 58 queries in en/bn/hi/pa plus Hinglish and typos):

| KB | Passed | Direct answers |
|---|---|---|
| Current seed | 33/34 | 16 |
| `supportKb-import.json` | **57/58** | **45** |

### 3.2 Chunking strategy
- **One `supportKb` document per intent**, not per paragraph. Each answer is self-contained, at most 1500 characters, and names "Zyppi" and the feature, so it reads correctly when retrieved alone.
- **Only the example questions are embedded**, not the answers: `questions` holds up to 20 per language, and every question gets its own vector. Retrieval quality comes from **many varied questions per entry** (paraphrases, Hinglish, typos), not from splitting text.
- `keywords` feed BM25 for brand names and misspellings.
- Keep entries **distinct**. Overlapping questions in two entries shrink the 0.015 margin and turn answers into suggestions. The smoke test caught three such collisions while this KB was being built.
- The Markdown files in this folder are the human-readable source, with one `##` section per entry and `<!-- kb_id -->` markers. `supportKb-import.json` is what gets loaded.

### 3.3 Admin save flow (already in place)
```
Admin (/support/kb drawer or Import JSON)
  → callable adminSaveKbEntry  [support role]
      → validateKbEntry (ids, 4-language titles and answers, limits)
      → embed(questions in all languages, "passage")  ~1–30 s on a cold start
      → supportKb/{id}.set({...entry, vectors, updatedAt, updatedBy})
      → writeAudit("kb.save")
      → clearRetrieverCache()   (other instances refresh within 10 min)
Delete → adminDeleteKbEntry → audit → cache clear
```

### 3.4 Optional extensions, in priority order
1. **Query-gap analytics (recommended next).**
   - In `bot.ts`, after `composeReply`, when the decision is `suggest` or `unknown`, write `supportGaps/{auto}` with `{text, lang, decision, topIds, topCosine, chatId, at}`. Expire it after about 90 days with a TTL policy on `expireAt`.
   - Admin: add a "Top unanswered" tab under `/support/kb` that groups similar texts and has a **"Create entry from this"** button, which pre-fills the drawer with the text as an English question.
   - Also log when a customer taps a suggestion chip (`quickReplyId` starting with `kb:`). These are cheap labels for tuning.
   - Needs a `firestore.rules` change in zyppi-APP: readable by `support`, written only by functions.
2. **Audience field.** Add `audience: 'customer' | 'seller' | 'rider'` to `supportKb`, and filter in `Retriever` by the chat owner's role. That lets the same pipeline serve the seller and rider apps.
3. **Vector field migration.** Store `FieldValue.vector()` alongside the base64 vectors, so moving to `findNearest` later is just a switch.

### 3.5 Red-team round (2026-11-22): small talk and the confidence gate
Testing on the live bot showed general chat failing. "good morning", "good night", "ok", "bye", "how are you" all got "Sorry, I can't answer that one yet" or unrelated chips. A 164-message adversarial set (greetings in 4 languages, typos, Hinglish, anger, off-topic, prompt injection, emoji, punctuation) traced it to four causes:

1. **Missing entries.** There was nothing for goodbye, how-are-you, who-are-you, ok, compliments, complaints or app crashes. **Added 8 entries**: `goodbye`, `how_are_you`, `about_bot`, `about_zyppi`, `acknowledge`, `compliment`, `complaint` (hands off to a person), `app_issue`.
2. **Hidden entries turned into random chips.** When the best match was the greeting (hidden), the bot offered three unrelated topics instead.
3. **An absolute cosine gate inside e5's noise floor.** Any short text scores 0.82–0.87 against everything. The gate now uses **lift**: the cosine above the median over all entries (real hits are at least about 0.06, off-topic about 0.03).
4. **Chips weren't filtered for relevance.**

**Code fixes** (zyppi-APP `functions/src/support`, branch `feat/support-bot-redteam`):
- `smalltalk.ts`: pattern-matches greeting, goodbye, thanks, ok and how-are-you in en/bn/hi/pa plus romanised forms and emoji. It answers from the KB entry with that id, so the text stays editable in the admin. It also strips a leading greeting ("hi, where is my order") and treats letter-less messages ("?", "...") as unknown without loading the model.
- `kb/retrieve.ts`: the lift gate, relevant-only chips, answering hidden entries directly, answering a lone relevant topic directly, and a standout rule.

| Message set | Before | After |
|---|---|---|
| Red-team set (164) | 81 pass, 26 chips, **57 fail** | **155** pass, 8 chips, 1 fail |
| Held-out set (62, never used for tuning) | — | **57** pass, 5 chips, **0 fail** |

The one remaining "failure" ("do you sell iphones") answers with "What is Zyppi? … groceries", which is acceptable.

## 4. Plugin and package recommendations

The admin repo's `CLAUDE.md` says to ask before adding packages that aren't in `docs/PLAN.md`. None of these are installed yet.

| Need | Recommendation | Install (admin repo) | Notes |
|---|---|---|---|
| **Bulk JSON import** | Built on this branch, no package needed | — | `features/support/kb-import.ts` + **Import JSON** on `/support/kb`. |
| `.csv` / `.xlsx` import | **SheetJS `xlsx`** (already installed) | — | Map rows to `KbEntry`, as `products/import-page.ts` does. Use `await import('xlsx')`. |
| `.md` import (this folder's files) | `gray-matter` (frontmatter) + `marked` (Markdown parsing) | `npm i gray-matter marked` | Split on `##` and use `<!-- kb_id -->` as the id. |
| `.pdf` import (policy docs) | `pdfjs-dist` | `npm i pdfjs-dist` | Extract text in the browser, then a person splits it into entries. Don't auto-chunk PDFs into the bot. |
| Markdown preview or editing of answers | `ngx-markdown` (pick the major that matches Angular 22) + `marked` | `npm i ngx-markdown marked` | Optional. The app shows answers as **plain text**, so keep answers plain unless the Flutter chat starts rendering Markdown. `shared/legal/legal-markdown.ts` already renders a safe Markdown subset if you only need a preview. |
| Rich-text editor | Not recommended | — | The bot sends plain text to the app. |
| Query-gap charts | `echarts` / `ngx-echarts` (already installed) | — | For the "Top unanswered" view. |
| Embeddings (backend) | `@huggingface/transformers` (already installed) | — | Keep `Xenova/multilingual-e5-small`. Upgrading to `multilingual-e5-base` (768 dimensions) improves recall but doubles memory and cold-start time. Only do that if the smoke test shows misses. |
| Vector database | **None** | — | See 3.1. If you ever need one, use Firestore `findNearest`. A vector field holds one vector per document, so store one document per example question, e.g. `supportKbVectors/{entryId}_{n}`. Index: `gcloud firestore indexes composite create --collection-group=supportKbVectors --query-scope=COLLECTION --field-config=field-path=embedding,vector-config='{"dimension":"384","flat":"{}"}'`. |

## 5. [VERIFY_CONFIG] items: confirm before publishing

The bot answers in `supportKb-import.json` avoid these numbers on purpose and point to what the app shows. The Markdown files do mention them, so confirm them before you publish those files anywhere.

| # | Value | Where it lives | Default or seed value | Used in |
|---|---|---|---|---|
| 1 | Delivery towns | `serviceAreas` (`name`, `isActive`) | Purulia, Raghunathpur, Chelyama | KB entry `delivery_areas` (**named in the bot answer**), 02-md |
| 2 | Delivery radius per area | `serviceAreas.radiusMeters` | Seed: 6, 5 and 4 km | 02-md |
| 3 | Delivery fee | `config/delivery.feePaise` | Seed: ₹25 (0 when unset) | 03-md |
| 4 | Free-delivery threshold | `config/delivery.freeAbovePaise` | Seed: ₹499 | 03-md |
| 5 | Handling fee | `config/delivery.handlingFeePaise` | Code default: ₹5 | 03-md |
| 6 | Minimum order | `config/delivery.minOrderPaise` | Seed: ₹99 (none when unset) | 02-md |
| 7 | Express ETA and slots | `deliverySlots` (`label`, `etaMinutes`, `isExpress`, `isActive`) | Seed: "In 12 minutes" plus later slots; the app copy hard-codes "12 minutes" | 02-md |
| 8 | Store opening hours | `stores.hours{open,close}` | — | 02-md |
| 9 | Paused areas, maintenance, minimum app version | `config/features.closedAreaIds`, `.maintenance`, `.minAppVersion` | — | 02-md |
| 10 | UPI and card switches | `config/features.payments.upi` / `.card` | — | 03-md |
| 11 | Max sellers per order | `config/marketplace.maxSellersPerOrder` | Default 3 | 02-md |
| 12 | Seller accept time | `config/marketplace.acceptSlaMinutes` | Default 5 min | 04-md |
| 13 | Auto-cancel when a seller doesn't accept | `config/marketplace.autoCancelLateMinutes` | Default 0 (off) | 05-md |
| 14 | Rider wait before "not reachable" | `config/riders.waitMinutes` | Default 10 min | 04-md |
| 15 | Automatic-return limits | `config/claims.autoReturns`, `autoMaxPaise`, `autoMaxClaims30d` | Default on, ₹500, 3 per 30 days | 05-md |
| 16 | Support phone, WhatsApp, email | `config/app.supportPhone`, `whatsappNumber`, `supportEmail` (fallback: the `SUPPORT_PHONE` build define) | — | 05-md |
| 17 | Live coupons | `coupons/{CODE}` | — | 03-md |
| 18 | Refund settlement time for cancelled online orders | PayU / `functions/src/payments/refunds.ts` | App copy says "5–7 working days" for claims; nothing is stated for cancellations | 05-md |
| 19 | Translations | `supportKb-import.json` bn, hi and pa text | Machine-drafted, like the existing seed | All entries: **have a native speaker review them** |

These are fixed in code, so no confirmation is needed: tip cap ₹500 (`MAX_TIP_PAISE`), claim window 2 hours (`CLAIM_WINDOW_MS`), 1–3 claim photos up to 2 MB, delivery code of 4 digits with 5 tries, payment hold of 15 minutes, cancelling only while `placed`.

## 6. How to load this KB

1. Confirm the items in section 5, in particular #1 (towns) and #19 (translations). Edit `supportKb-import.json` if needed.
2. In the admin panel, open **Support → Knowledge base → Import JSON** and pick `chatbot-knowledge-base/supportKb-import.json`.
3. Review the preview. Each row shows **New** or **Replace**; any row with a problem is shown as **Skipped** with the reason, including a leftover `[VERIFY_CONFIG]`. Then click **Import**.
4. Each entry is saved through `adminSaveKbEntry`: validated, embedded and audited. Expect 1–30 seconds per entry; the first one is slowest. **Stop after this one** and **Retry failed** are available. Nothing is deleted.
5. All 15 existing ids are replaced with corrected versions, and 21 new ids are added.
6. Do **not** run `npm run seed:support` afterwards; it would replace the collection with the old seed. Consider updating `kb/seed.ts` from this file, or deleting the seeder.

## 7. Files in this folder

| File | Purpose |
|---|---|
| `01`–`05-*.md` | Customer KB in English. YAML frontmatter (`category`, `audience: end_user`, `keywords`), `##` question headings, self-contained sections, a `Keywords:` line each, `[VERIFY_CONFIG]` markers. |
| `supportKb-import.json` | 44 entries in the exact `supportKb` schema, in en/bn/hi/pa. Passes `validateKbEntry`'s rules (checked by the admin parser and the build script). |
| `common-words-and-synonyms.json` / `.csv` | 44 intents. Each maps the canonical intent name (e.g. `order_tracking`, `refund_status`, `cod_availability`) to its KB id, and lists category, action, phrases (everyday wording, Hinglish/Banglish, typos), keywords and trigger tags. The phrases are already folded into the KB's `questions` and `keywords`; use the tags for analytics or filtering. |
| `ADMIN_PANEL_AND_RAG_AUDIT.md` | This file. |
