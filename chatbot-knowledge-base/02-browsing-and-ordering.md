---
category: browsing_and_ordering
audience: end_user
app: Zyppi (customer app) + Zyppi Marketplace sellers
language: en
source_verified: 2026-11-22
keywords: [delivery area, search, out of stock, cart, sellers, minimum order, schedule, slot, store closed, ratings]
---

# Browsing and ordering

## Where does Zyppi deliver?
<!-- kb_id: delivery_areas -->
Zyppi currently delivers in **Purulia, Raghunathpur and Chelyama** [VERIFY_CONFIG: active `serviceAreas` documents, `name` + `isActive`]. Each area is a circle around a centre point, with its own radius [VERIFY_CONFIG: `serviceAreas.radiusMeters`; seed data uses 6 / 5 / 4 km]. To check your address, set it from the location bar on Home. If it's outside every area, the app says "We don't deliver to this address yet. Choose another address."

Keywords: delivery area, serviceable, not serviceable, my area, town, radius, pincode, purulia, raghunathpur, chelyama

## How do I find products on Zyppi? What if an item is out of stock?
<!-- kb_id: out_of_stock -->
Use the **search bar on Home** ("Search for oil, rice, atta...") or browse the categories. Products come in sizes or variants. There are no add-ons or custom options.

If an item runs out, the cart shows either "… is out of stock. Reduce the quantity or remove it." or "… is no longer available. Please remove it from your cart." If a store finds an item has run out **after** you ordered, the Zyppi team replaces it or refunds that item.

Keywords: search, find product, out of stock, unavailable, not available, variant, size, back in stock

## Can one Zyppi order have items from different sellers?
<!-- kb_id: multi_seller_cart -->
Yes. Zyppi is a marketplace, so one order can have items from several sellers, up to a limit [VERIFY_CONFIG: `config/marketplace.maxSellersPerOrder`, default 3]. The rider collects from each store; the order screen says "Collecting your order from 2 stores". Over the limit, the app says "Your basket has items from more than 3 sellers. Remove some, or pick the same seller for them."

Zyppi takes the payment and delivers for every seller. For any problem with an order, contact **Zyppi support**, not the seller. Sellers only ever see your first name, and never your address.

Keywords: seller, sellers, marketplace, multiple stores, different shops, too many sellers, basket

## Is there a minimum order value on Zyppi?
<!-- kb_id: min_order -->
There may be one [VERIFY_CONFIG: `config/delivery.minOrderPaise`; no minimum when this is unset; seed data uses ₹99]. If your cart is below it, checkout shows "Minimum order is ₹…. Add a little more to your cart." Coupons can also have their own minimum.

Keywords: minimum order, min order, minimum amount, small order

## Can I schedule a Zyppi delivery for later?
<!-- kb_id: schedule_slot -->
Yes. At checkout, under **Schedule**, pick **Express** (the fastest option; the app advertises about 12 minutes [VERIFY_CONFIG: `deliverySlots` where `isExpress` is set, `etaMinutes`]) or a later same-day or next-day slot [VERIFY_CONFIG: active `deliverySlots`]. If a slot is switched off before you pay, the app says "That delivery time is no longer available. Pick another."

Keywords: schedule, slot, later, tomorrow, time slot, express, 12 minutes

## Why can't I place an order on Zyppi right now?
<!-- kb_id: cant_order -->
The checkout message tells you why:

| Message | Meaning |
|---|---|
| "Stores in your area are closed right now. Please order during opening hours." | No store in your area is open right now [VERIFY_CONFIG: `stores.hours`]. |
| "Ordering is paused in your area right now." | The Zyppi team has paused your area for a while [VERIFY_CONFIG: `config/features.closedAreaIds`]. |
| Maintenance message | Zyppi is under maintenance [VERIFY_CONFIG: `config/features.maintenance.message`]. |
| "This version of Zyppi is no longer supported. Update from the Play Store to keep ordering." | Your app version is too old [VERIFY_CONFIG: `config/features.minAppVersion`]. |
| "Save your account to place an order." | You're a guest. Link Google or an email first. |
| "Your account can't place orders. Please contact support." | Your account is blocked. Contact support. |
| "Too many tries. Wait a minute and try again." | You hit a rate limit. Wait a minute. |
| "Couldn't place your order. Please try again." | A temporary error. Try again, or contact support. |

Keywords: cant order, checkout not working, store closed, ordering paused, maintenance, update app, account blocked

## How do I rate my Zyppi rider or seller?
<!-- kb_id: ratings -->
After delivery, open the order and choose **Rate your delivery partner**. You can add tags: Polite, On time, Careful with items, Late, Rude, Items damaged. You can also choose **Rate the sellers**. Ratings help other customers, and seller listings are sorted by price, ratings, reliability and stock. For anything serious, also contact support.

Keywords: rate, rating, review, feedback, stars, rude rider, seller rating
