---
category: delivery_and_live_tracking
audience: end_user
app: Zyppi (customer app) + Zyppi Delivery (rider app)
language: en
source_verified: 2026-11-22
keywords: [order status, tracking, rider, live location, eta, delivery code, otp, call rider, late order, missed delivery]
---

# Delivery and live tracking

## Where is my Zyppi order?
<!-- kb_id: where_is_order -->
Open the order in the app to see its live status. If you ask in the support chat, the bot looks up your order and replies with its status and a short order number (the first 8 characters of the order ID). For example: "… is on its way to you. It should reach you in about 6 min." If the estimate has already passed, it says "It's taking longer than expected — sorry about that."

Keywords: where is my order, track order, order status, eta, when will it arrive

## What do the Zyppi order statuses mean?
<!-- kb_id: order_statuses -->
| Status | What's happening |
|---|---|
| **Order placed** | Zyppi has your order, and the store is confirming it and getting it ready ("We're packing your groceries."). A marketplace seller has a few minutes to accept [VERIFY_CONFIG: `config/marketplace.acceptSlaMinutes`, default 5]. |
| **Packed** | Packed and waiting for a delivery partner ("Assigning a delivery partner…" until one accepts). |
| **Out for delivery** | The rider has collected from every store and is on the way. |
| **Delivered** | Handed over using your delivery code. |
| **Cancelled** | Cancelled by you, the store or the Zyppi team; any refund follows automatically. |

You get a push notification at each step: "Order placed", "Order packed", "Out for delivery", "Your rider is here", "Delivered", "Order cancelled".

Keywords: order status, placed, packed, out for delivery, delivered, cancelled, status meaning

## How do I track my Zyppi rider live?
<!-- kb_id: live_tracking -->
While the order is **Out for delivery**, the order screen shows the rider's distance and an estimated time, e.g. "Rider is 1.2 km away · ~4 min". When they're close it says "Your rider is almost there". The rider's phone sends its location about every 20 seconds. If you see "Location updated a few minutes ago", the rider has a weak signal, but the order is still on its way. The ETA is an estimate based on distance.

Keywords: track rider, live tracking, rider location, map, distance, eta, location not updating

## How do I contact my Zyppi delivery partner?
<!-- kb_id: rider_contact -->
Once a rider accepts your order, tap **Call delivery partner** on the order screen, for example to explain a landmark or which gate to use. The rider can also call the mobile number on your profile. Calls use real phone numbers; there is no number masking. When the rider reaches you, you get "Your rider is here – Your Zyppi order is at your door. Keep your delivery code ready."

Keywords: call rider, rider number, contact delivery boy, delivery instructions, rider not answering

## What is the Zyppi delivery code (delivery OTP)?
<!-- kb_id: delivery_code -->
Every Zyppi order has a **4-digit delivery code**, shown under **Delivery code** on the order screen: "Tell this to your rider at the door." The rider can only mark the order delivered after entering it, so nobody else can receive your groceries. The code is the proof of delivery; there is no photo or signature. Only share it when the rider is in front of you. After **5 wrong tries** the code locks, and the Zyppi team helps the rider finish the delivery.

Keywords: delivery code, delivery otp, pin, 4 digit code, rider asking otp, proof of delivery

## My Zyppi order is late. What should I do?
<!-- kb_id: late_order -->
Sorry for the wait. The bot first shows your order's live status and estimated time. If the expected time has passed, tap **Talk to a person** and the team will check with the delivery partner. You can also use **Help → Chat on WhatsApp** or **Call support**.

Keywords: late order, delayed, still waiting, not arrived, taking too long

## The Zyppi rider couldn't deliver my order. What happens now?
<!-- kb_id: failed_delivery -->
If you're not reachable, the rider first waits at your door and calls you [VERIFY_CONFIG: `config/riders.waitMinutes`, default 10 min]. Only after that can they report "Customer not reachable". Other reasons a delivery can fail: the order was refused, the address was wrong or incomplete, or the location felt unsafe. The Zyppi team then decides what happens next. If the order goes back to the store, it's **cancelled and refunded** automatically: online payments go back to the original method, and wallet money goes back to the wallet.

Keywords: missed delivery, not home, rider went back, failed delivery, wrong address, customer not reachable
