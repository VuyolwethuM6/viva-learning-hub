# High-priority audit fixes — setup and testing

Updated **29 October 2026, South African time**. This release addresses findings F01–F04 in the [platform audit](platform-audit-2026-10-28.md). Existing tuition pricing, grade programmes, invoice numbering, EFT/cash recording and teaching workflows remain in use.

## Changes

- Scheduled/manual accounting runs recover missing **current-month** tuition invoices, including learners activated after an earlier run that day. Catch-up starts no earlier than the stored tuition start and initial activation date, using the grade programme for any prorating. Normal next-month generation still begins on the 25th. December/January routine billing remains excluded.
- Finance → Controls → **Billing recovery & PDF sales** previews missing invoices. Older months require an owner's selected learners, actual-service/charge review, reason and explicit confirmation. Preview fingerprints reject stale changes; stable request IDs make retries safe.
- Contact, subject-request and checkout APIs accept bounded streamed and pre-parsed JSON. PayFast ITNs support bounded raw or pre-parsed form fields while preserving signature and provider validation. Duplicate/structured fields are rejected. External email/provider calls have deadlines.
- Checkout requires configured delivery and creates a durable order before signing the PayFast form. A verified ITN records a unique provider payment **before email**. Database claims serialize each customer/admin delivery independently; provider idempotency keys and frozen email dates protect retries. The existing branded HTML templates and private PDF attachments are preserved.
- Verified sales, provider fees and net PayFast clearing can post to accounting under an authorized owner. A bank settlement is a separate verified entry, avoiding double-counting the sale. Source/payment history is protected; settlement corrections use reversals.
- Vite restores sensitive-file deny rules and adds middleware before its file transforms to reject environment files, keys, Git internals and private files, including raw/query/`@fs` URL variants.
- System Health checks current-month invoice coverage, unposted PDF payments and pending/problem PDF emails. A successful cron observation or balanced ledger is no longer the only signal.

## 1. Apply the complete SQL setup

Do not clear existing records or run the fresh schema over live data.

While signed into GitHub with repository access, open the [downloadable setup ZIP](https://github.com/VuyolwethuM6/viva-learning-hub/blob/work/docs/downloads/viva-high-priority-recovery.zip). Click **Download raw file** and extract it. The ZIP contains `high-priority-setup.sql` and this guide. A private raw URL opened without signing in may return 404.

Alternatively open [high-priority-setup.sql](https://github.com/VuyolwethuM6/viva-learning-hub/blob/work/docs/high-priority-setup.sql).

1. Open Supabase → SQL Editor → New query on the intended test project.
2. Paste **all** of `high-priority-setup.sql`, including `begin;` and the final `commit;`.
3. Run the whole query. It combines these ordered migrations:
   - `20261029010000_billing_recovery.sql`
   - `20261029020000_payfast_purchase_ledger.sql`
4. This requires the existing accounting setup. A transaction failure rolls back the setup; fix the reported prerequisite/conflict and rerun the complete file.
5. Account codes **1020 / 4110 / 5060** are reserved for PayFast clearing, study-material sales and PayFast fees. The setup rejects conflicting existing meanings instead of silently reusing them. Review an actual conflict before choosing a revised account mapping.
6. Rerunning the complete setup preserves orders, payments, claims, authorization and existing books. If deliberately reinstalling an older setup package later, reapply newer migrations in order.

Verify:

```sql
select to_regprocedure('public.accounting_billing_preview(uuid,date)') as billing_preview,
       to_regprocedure('public.accounting_recover_billing(uuid,date,jsonb)') as reviewed_recovery,
       to_regprocedure('public.payfast_order_create(uuid,text,text,text,text,text)') as checkout_order,
       to_regprocedure('public.payfast_record_payment(jsonb)') as verified_payment,
       to_regprocedure('public.payfast_claim_delivery(uuid,text,text)') as private_delivery_claim,
       to_regprocedure('public.accounting_safety_health(uuid)') as health_checks;

select code, name, kind from public.accounting_accounts
where code in ('1020','4110','5060') order by code;
```

The coding task does not apply this migration to your live Supabase project.

## 2. Configure and authorize paid PDF accounting

Use the intended Vercel environment. The existing server-only Supabase and Resend variables remain required. Never expose service credentials through `VITE_` variables.

| Variable | Purpose |
| --- | --- |
| `PAYFAST_MODE` | `sandbox` for a controlled test project/preview, `live` for actual payments. Default is live; an unknown value is rejected. |
| `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY` | Credentials for the selected mode, taken from the appropriate PayFast account/configuration. |
| `PAYFAST_PASSPHRASE` | Matching private security passphrase in PayFast and Vercel. Live checkout/verification requires it. |
| `PUBLIC_SITE_URL` | Public HTTPS URL for the environment being tested, used for return/cancel URLs. |
| `PAYFAST_NOTIFY_URL` | Optional explicit public webhook URL; otherwise `${PUBLIC_SITE_URL}/api/payfast/notify`. |
| `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL` | Existing verified sender, provider key and admin recipient. |

Redeploy after changing environment variables. Sandbox checkout and validation both use the sandbox host; they do not mix sandbox payment verification with live processing. For work-preview testing, set both `PUBLIC_SITE_URL` and any `PAYFAST_NOTIFY_URL` override to the intended test deployment. Do not send preview callbacks to an older main deployment: the callback must reach this release’s handler with the matching mode and credentials.

PayFast must be able to reach the notify URL. A Vercel deployment-protection login can block external webhooks. Use an appropriately public **test** endpoint or a narrowly scoped webhook exception; admin authentication remains required. Do not test with an actual live charge unless you intend to make that payment.

In the admin portal:

1. Open **Finance → Controls → Billing recovery & PDF sales → PDF sales**.
2. As an enabled finance **owner**, choose **Authorize PDF sales accounting**, supply a reason, review and confirm.
3. Future verified payments with known fees can post automatically under that authorized owner. If that account loses owner access, the verified payment remains saved and posting needs review. Authorize the intended enabled owner and review pending postings.
4. Already-unposted payments are not silently back-posted on authorization. Use **Review posting** after checking provider and existing books. The correction is posted into today's open books; the original verification date remains retained.

No authorization or automatic-dispatch flag from tuition is silently changed by this release. PayFast paid PDFs are a separate transactional sales flow. Tuition remains EFT/cash.

## 3. Understand purchase and delivery states

### Payments and books

A callback must match a known product/amount, configured merchant, valid signature and successful PayFast validation before a payment is recorded. New callbacks are bound to the checkout order/customer. The provider payment ID is unique, and conflicting replays are rejected.

Normal verified payment posting records:

- **1020 PayFast clearing:** net amount owed by PayFast.
- **5060 PayFast processing fees:** provider fee.
- **4110 Study-material sales:** gross sales income, with no VAT.

This does not claim that money has reached the bank. After checking an actual payout, **Record bank settlement** moves the received net amount from clearing to the business bank. Match that bank entry through existing reconciliation. Duplicate references and clearing overdraw are rejected. For an erroneous entry, unmatch reconciliation if necessary and use **Reverse incorrect settlement**; do not delete history.

If fees are missing, configuration/permissions are unavailable, or books reject posting, the payment remains durable with a review reason. An owner can supply a fee verified against provider records. Confirmed callback fees cannot be silently edited.

A second genuine provider payment for the **same order** is retained separately for owner review. It creates no additional fulfillment and is posted as money owed back to the customer (other liabilities) when reviewed, rather than a second sale. Any real refund must follow a separately verified refund/correction procedure; this release does not execute provider refunds or automate chargebacks.

### Email outcomes

- **Pending:** never attempted, or deliberately requeued after owner review. Use **Send pending emails** to send only eligible pending records.
- **Sending:** claimed by one worker. Other callbacks skip it.
- **Accepted by provider:** the provider returned a message ID. This is not proof of inbox delivery.
- **Failed:** a definite rejection or unavailable local PDF requires correction/review.
- **Uncertain:** network/ambiguous provider outcome, or an interrupted sending claim older than 15 minutes. It is not automatically resent.

The webhook attempts pending delivery after recording payment. Missing configuration or an interrupted call can leave pending records; staff can safely dispatch these from Finance. There is no new background PDF-email worker in this release. Existing tuition cron behavior remains separate.

For a failed/uncertain/interrupted attempt, choose **Review provider outcome**. Check the provider's actual history first:

- If accepted, record the provider message ID and reason.
- If the provider confirms nothing was accepted, authorize one retry with a reason, then use **Send pending emails**.

Customer/admin sends are independent. A failed admin alert cannot cause a previously accepted customer PDF to be automatically sent again. Repeated callbacks and cold function instances use the same persisted records and provider keys.

Legacy callbacks without a new checkout order are recorded for review with **uncertain** delivery states. The old in-memory sender cannot establish whether those emails were already sent, or whether a sale was manually entered. No automatic re-send or financial back-post is made for these legacy events. Verify provider/email/book history before authorizing either action.

## 4. Test tuition recovery

Use synthetic learners and controlled inboxes; leave automatic tuition email dispatch off unless you deliberately want those test messages sent.

1. Confirm the existing no-VAT, ZAR, first-payment activation and grade-specific programme rules remain in place.
2. Open **Finance → Controls → Billing recovery**. Select a relevant month. No missing eligible invoices should show an empty state rather than invented entries.
3. In a controlled test fixture, simulate an active learner missing the current month's invoice after the preceding generation window. Run existing **Run accounting now**. Confirm one invoice is created with the stored fee/programme/closure dates. Run again: no duplicate invoice or invoice notification should appear.
4. Activate another eligible learner after that day's completed run, then run accounting again. The current-month coverage check must still run.
5. For an older eligible missing month, select learners, check actual service/agreed charges, provide the reason, review and confirm. Refresh the screen and inspect **Audit** and the invoice. Existing issued invoices must retain their original numbers, dates and earning calendar.
6. Change the underlying eligible records/calendar after opening a preview in a second test session: the stale first confirmation must reject and ask you to refresh.
7. Review December/January: no routine tuition invoice is created. Grade 8–11 include Saturday, Grade 12 includes Sunday, and Rewrite uses five weekdays; configured closures are excluded.

The isolated regression suite uses overridden clocks to exercise month boundaries; it does not change a live project clock. Do not replace live time functions to manufacture these scenarios. Use a disposable isolated database/test project for clock-based acceptance.

Historical preview uses the stored fee/programme, initial activation date and **current** learner lifecycle/start/end records. It is not automatic proof that a past service was delivered. Owners must verify historical eligibility before choosing the reviewed recovery action. Up to 100 selected learners are recovered per confirmation.

## 5. Test public forms and paid PDF recovery

1. In a test environment, submit a contact enquiry and subject request to a controlled admin inbox. Check success and actual arrival. Oversized/malformed requests must fail without a send.
2. Set sandbox credentials/passphrase/URLs, deploy the work preview/test project, and confirm the notify endpoint is reachable by PayFast.
3. Start one paid PDF checkout. Retrying a timed-out checkout with the same unchanged form should reserve the same order; editing details starts a different checkout request.
4. Complete the sandbox payment. Confirm the order/payment appears in Finance and both expected branded emails contain the original PDF attachment. Check provider message IDs and the actual inboxes.
5. Verify gross sale, fee and net clearing balances; bank remains unchanged until a verified settlement is recorded. Spot-check trial balance, profit/loss, balance sheet and integrity checks.
6. Replay the same sandbox callback, including concurrent replays in an isolated test harness. There must be one verified payment, one accounting posting and at most one claimed send for each recipient record. A cold process must retain these protections.
7. Simulate a response loss **after** provider acceptance in the isolated harness. The message must stay uncertain and repeated callbacks must skip it. Only a reviewed provider outcome can release another attempt.
8. Simulate customer success/admin failure and missing sender/file configuration. Customer acceptance must remain recorded; only the unresolved recipient needs correction.
9. Record an actual/synthetic bank settlement against available clearing, reconcile it, and test a reviewed reversal in the isolated environment. Repeated submissions must not move money twice.
10. Sign in with a finance viewer: purchase records may be read, but authorization, posting, dispatch, review and settlement controls must be absent and rejected server-side.
11. Open **System Health** and **Audit**. Missing invoices, unresolved purchases/delivery and human-readable recovery/payment events should be clear. Refreshing records must not send emails.

These tests deliberately distinguish provider acceptance, inbox arrival, financial posting and bank settlement. The local test suite uses synthetic external responses; it does not certify real PayFast, SMTP or live account settings.

## 6. Verify development file protection

Use files containing synthetic markers only. Start the configured Vite server, confirm a normal public asset loads, and confirm environment/key/Git/private paths return 403 through direct URLs, `?raw`, `?url` and `/@fs/` variants. Do not put real keys in a preview merely to test denial. The automatic regression test creates and deletes synthetic fixtures.

The development guard is separate from production Vercel's static deployment. If a real credential-bearing development preview was previously reachable by unintended people, review access and rotate the affected credentials; this implementation cannot establish historical exposure.

## Troubleshooting older/bounded records

Finance shows bounded recent/review lists and complete attention counts. Owners with SQL access can locate one older provider ID without exporting unrelated customer data:

```sql
select p.id, p.provider_id, p.order_id, p.verified_on, p.gross_cents,
       p.fee_cents, p.journal_id, p.posting_error, p.review_reason
from public.payfast_payments p
where p.provider_id = 'REPLACE_WITH_VERIFIED_PROVIDER_PAYMENT_ID';

select d.id, d.kind, d.state, d.claimed_at, d.finished_at, d.provider_id
from public.payfast_deliveries d
join public.payfast_payments p on p.order_id=d.order_id
where p.provider_id = 'REPLACE_WITH_VERIFIED_PROVIDER_PAYMENT_ID';
```

Preserve event/source history. Use reviewed application operations for corrections; investigate a new bulk exception before making any manual data change. Privacy-retention tooling, the remaining medium audit findings, automatic provider refunds/chargebacks and a dynamic public materials catalogue remain separate work.
