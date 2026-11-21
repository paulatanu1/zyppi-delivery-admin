---
category: payments_promos_and_fees
audience: end_user
app: Zyppi (customer app)
language: en
source_verified: 2026-11-22
keywords: [payment, upi, card, payu, cod, cash on delivery, wallet, delivery fee, handling fee, tip, coupon, payment failed]
---

# Payments, fees and promos

## What payment methods does Zyppi accept?
<!-- kb_id: payment_methods -->
You can pay with:
- **Cash on delivery**: "Pay cash or UPI at your door".
- **UPI**: GPay, PhonePe, Paytm or any UPI app.
- **Credit or debit card**.

Online payments go through **PayU's secure checkout**: "Payments secured by PayU". Zyppi never stores card details.

You can also use your **Zyppi wallet**, on its own or together with another method. UPI and card can each be switched off temporarily [VERIFY_CONFIG: `config/features.payments.upi` / `.card`]. If that happens, the app says "This payment method is unavailable right now. Please choose another."

Keywords: payment methods, how to pay, upi, gpay, phonepe, paytm, card, debit card, credit card, payu

## Does Zyppi have cash on delivery (COD)?
<!-- kb_id: cod -->
Yes. Choose **Cash on delivery** at checkout and pay at your door, in cash or by UPI to the rider. You're charged nothing until the order is delivered, so cancelling a cash order costs nothing. Before marking the order delivered, the rider must confirm they collected the cash.

If you report a problem with a delivered cash order, the refund always goes to your **Zyppi wallet**.

Keywords: cod, cash on delivery, cash, pay at door, pay later

## What are Zyppi's delivery and handling fees?
<!-- kb_id: delivery_fee -->
The cart bill shows every charge before you pay:
- **Delivery fee** [VERIFY_CONFIG: `config/delivery.feePaise`; seed data uses ₹25]. It's free once your item total reaches the free-delivery amount [VERIFY_CONFIG: `config/delivery.freeAbovePaise`; seed data uses ₹499].
- **Handling fee** per order [VERIFY_CONFIG: `config/delivery.handlingFeePaise`; the code default is ₹5].
- Any **tip** you choose to add.

There is no surge, platform or small-cart fee.

Keywords: delivery fee, delivery charge, handling fee, extra charges, hidden charges, free delivery

## How do I tip my Zyppi delivery partner?
<!-- kb_id: tip -->
Tipping is optional. In your cart, pick an amount under **Tip your delivery partner**, up to **₹500**. The full amount goes to the rider.

Keywords: tip, tip rider, tipping, tip compulsory

## How do I use a coupon on Zyppi, and why isn't it working?
<!-- kb_id: coupons -->
Enter the code in the **Coupons** box in your cart. Codes are 3–20 letters and numbers. A coupon is either a flat discount or a percentage (sometimes with a cap), and it can have a minimum order. If your cart is below the minimum, the app says "Add ₹… more to use CODE".

If a coupon won't apply, the message tells you why:

| Message | Meaning |
|---|---|
| "This coupon isn't valid for this order" | Wrong code, or not valid for this cart |
| "This coupon has expired" | Past its end date |
| "This coupon has been fully used" | The total limit has been reached |
| "You've already used this coupon the maximum number of times" | Your personal limit has been reached |
| "This coupon is only for your first order" | First orders only |
| "This coupon isn't available in your area" | Restricted to other areas |

Current offers are set by the Zyppi team [VERIFY_CONFIG: `coupons` collection].

Keywords: coupon, promo code, discount code, offer, coupon not working, coupon expired, first order coupon

## What is the Zyppi wallet?
<!-- kb_id: wallet -->
The Zyppi wallet is **store credit**:
- Refunds from cancellations, approved problem reports and credits from the Zyppi team land there **instantly**.
- To spend it, turn on **Use Zyppi wallet** at checkout. It can pay for the whole order ("Your wallet pays for this whole order.") or part of it.
- You can't top it up, withdraw from it or transfer it, and refunded money never expires.
- If you delete your account, the balance is lost.

Keywords: wallet, zyppi wallet, wallet balance, store credit, withdraw, top up, expiry

## My money was deducted but no Zyppi order was placed. What now?
<!-- kb_id: payment_failed -->
Don't worry. The Zyppi team either completes the order or refunds it. If PayU confirms the money but the order can't be created, the app says "We received your payment but couldn't confirm the order. Our team will contact you shortly to fulfil or refund it." The system also re-checks unconfirmed payments with PayU every 10 minutes. The bot hands this chat to a person.

Keywords: payment failed, money deducted, amount debited, charged twice, double payment, paisa kat gaya

## My Zyppi payment is still pending. Should I pay again?
<!-- kb_id: payment_pending -->
- **"Payment didn't go through. You haven't been charged."** Just try again.
- **"Your payment is still being confirmed"**: tap **Pay** again in a moment to check. If it isn't confirmed within **15 minutes**, you can pay again. If the first payment goes through later, it's refunded automatically. Your items stay reserved for those 15 minutes.

Keywords: payment pending, processing, not confirmed, pay again, stuck payment
