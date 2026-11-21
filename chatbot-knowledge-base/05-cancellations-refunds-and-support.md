---
category: cancellations_refunds_and_support
audience: end_user
app: Zyppi (customer app)
language: en
source_verified: 2026-11-22
keywords: [cancel order, refund, money back, missing item, damaged, wrong item, report a problem, return, support, whatsapp, talk to a person]
---

# Cancellations, refunds and support

## How do I cancel my Zyppi order?
<!-- kb_id: cancel_order -->
You can cancel your order yourself **while it still says "Order placed"**. Open the order, tap **Cancel order**, and pick a reason: changed my mind, ordered by mistake, delivery too slow, wrong address, or other. The app notes "You can cancel until your order is packed. Wallet money goes back to your wallet; online payments are refunded to the original method."

Once the store has packed the order, the app says "Your order is already packed and can't be cancelled now. Contact support for help." Cash-on-delivery orders are never charged, so a cancelled cash order needs no refund.

Keywords: cancel order, cancle, cancellation, ordered by mistake, stop order, cancel kaise kare

## Why was my Zyppi order cancelled when I didn't cancel it?
<!-- kb_id: order_cancelled_by_us -->
An order can be cancelled for you when:
- a store or seller can't fulfil it (an item is out of stock, the shop is closing, or the shop is too busy);
- a seller doesn't accept it in time [VERIFY_CONFIG: `config/marketplace.autoCancelLateMinutes`; the default 0 means auto-cancel is off];
- the delivery failed and the order went back to the store;
- the Zyppi team cancelled it.

You get an **"Order cancelled"** notification. The whole order is cancelled; Zyppi does not move the items to another seller. Online payments are refunded to the original method, and wallet money goes back to your wallet. To get the items, place the order again.

Keywords: order cancelled, auto cancelled, seller rejected, store rejected, why cancelled

## When will I get my Zyppi refund?
<!-- kb_id: refund -->
| You paid with | Refund goes to | Timing |
|---|---|---|
| Zyppi wallet | Zyppi wallet | Instant |
| UPI / card (cancelled order) | Original payment method | After the cancellation, per PayU [VERIFY_CONFIG: refund settlement time] |
| UPI / card (reported problem) | Your choice: wallet (instant) or original method | Original method: "5–7 working days" |
| Cash on delivery | Nothing charged before delivery; reported problems go to the wallet | Instant once approved |

If a refund is late, contact support.

Keywords: refund, refund status, money back, paisa wapas, refund not received, refund time

## How do I report a missing, wrong, damaged or expired item on Zyppi?
<!-- kb_id: missing_item -->
On the delivered order, tap **Report a problem**, or tap **Start a return** in the support chat. You have **2 hours after delivery**.

1. Choose the item and the problem: Missing, Wrong item, Damaged, or Expired / bad quality.
2. Add 1–3 photos, up to 2 MB each. Photos are optional for missing items.
3. Choose what you'd like: **Refund to Zyppi wallet** (instant once approved), **Refund to original payment** (UPI or card only; 5–7 working days), or a **free replacement**.

Wrong, damaged or expired items can qualify for an **automatic return**: a rider collects the item, and your refund goes out as soon as the store receives it. Hand the item to the rider and tell them the code shown. Missing items and bigger claims are checked by the team [VERIFY_CONFIG: `config/claims.autoReturns`, `autoMaxPaise` (default ₹500), `autoMaxClaims30d` (default 3)]. If you're not home for the pickup twice, the return is marked failed.

Keywords: missing item, wrong item, damaged, broken, expired, bad quality, report a problem, return, replacement

## Why can't I report a problem on my Zyppi order?
<!-- kb_id: report_too_late -->
- **"Problems can be reported up to 2 hours after delivery…"**: the 2-hour window has passed.
- **"You already have a report under review for this order."**: there's already a report open for this order; only one can be open at a time.
- **"You've already reported all units of that item."**

In any of these cases you can still ask the support team, and the bot hands the chat to a person.

Keywords: cant report, report window, report under review, claim rejected, report not approved

## How do I contact Zyppi customer support?
<!-- kb_id: talk_to_person -->
Open **Help** in the app ("Our support team usually replies within a few minutes."). Your options are:
- **Chat with us**: the support chat; the bot answers first, and **Talk to a person** hands you to the team.
- **Chat on WhatsApp**: opens WhatsApp with "Hi Zyppi, I need help with order …" already typed.
- **Call support**.

The phone, WhatsApp and email contacts are set by the Zyppi team [VERIFY_CONFIG: `config/app.supportPhone`, `whatsappNumber`, `supportEmail`]. The chat works in English, Bengali, Hindi and Punjabi.

Keywords: customer care, support, talk to a person, human, agent, helpline, whatsapp, call support, complaint
