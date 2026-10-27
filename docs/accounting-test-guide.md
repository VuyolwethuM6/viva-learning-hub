# Accounting setup and complete test guide

Updated 27 October 2026 (Africa/Johannesburg). This release adds the accounting
ledger and controls to the existing admin workspace. Use synthetic learners,
dummy documents and inboxes you control. Recording EFT/cash does not initiate a
bank transfer, debit order or card charge.

## 1. Apply the database migration

The owner has confirmed clearing the test operational/financial records.
In Supabase **SQL Editor**, paste and run the complete file
[accounting-setup.sql](accounting-setup.sql). Run that file as one query. It wraps
the six accounting migrations in a transaction. Do not also run the individual
migrations unless you are deliberately managing them separately.

The migration keeps Auth accounts, enabled admin membership, existing invoice
counters, programme definitions and closure settings. Existing admins receive
the finance owner role. It creates a private `accounting-documents` bucket.
Opening balances are zero; no VAT is added. The initial books start date is
1 January 2026 and can be changed in Controls before the first journal is posted.

First installation rejects existing, unposted legacy invoice/payment records
rather than guessing an accounting import. If this error appears, stop and
inspect whether more test financial records were created after the reset.
Rerunning an installed accounting setup preserves posted records and settings.
Do not drop tables or reset counters to work around an installation error.

Verify the migration:

```sql
select public.accounting_integrity();
select currency, vat_enabled, books_start, closed_through,
       automation_enabled, auto_send
from public.accounting_settings;
select user_id, enabled, finance_role from public.admin_users;
```

Every integrity difference should be zero. Currency should be ZAR; VAT,
automation and automatic dispatch should initially be false. Your admin account
should remain enabled with finance role `owner`.

## 2. Deployment and service settings

Use the `work` deployment containing this release and open `/admin`. Apply the
SQL before using its review/financial actions. The server checks accounting
readiness before allowing the existing review/payment operations.

Keep the existing Supabase and verified email settings. Add a server-only
`CRON_SECRET` containing a long random value (32 or more characters recommended)
when testing automation; redeploy after changing environment settings. Never
prefix this secret or the Supabase service key with `VITE_`.

Keep **Finance → Controls → scheduled accounting** and **automatic email
dispatch** disabled during the initial tests. Initial application-received
emails remain the separate existing enrollment flow. Tuition emails wait in
Notifications until manually sent or automatic dispatch is explicitly enabled.

## 3. Enrollment, invoice and first-payment gate

1. Submit a dummy Grade 12 enrollment with two subjects and a dummy report card.
2. In Applications, check the document, details and review note. Approve with a
   valid future programme start date in February–November.
3. For the exact example below, use a full-month R800 invoice, such as a
   1 November 2026 start while testing in October. If you choose a mid-month
   start, use the actual prorated amount instead. Grade-specific programme days
   and configured closures still drive prorating.
4. Verify the invoice number uses its tuition month and continues the preserved
   counter. It need not end in `01` after a test reset.
5. Verify activation remains unavailable while the invoice is unpaid.

## 4. Payment, available credit and activation

1. Open **Finance → Receipts & credits → Record money received**.
2. Select the family, record **R1,000 Cash**, use today's actual payment date,
   a unique cash receipt reference, and a verification note.
3. Allocate **R800** to the invoice. Review and confirm.
4. Expect one physical receipt for R1,000, R800 allocated and **R200 available
   family credit**. Cash on hand is R1,000; tuition income is still deferred
   when the teaching period has not begun.
5. Open the receipt PDF. Confirm the payer, method, reference, allocations and
   remaining credit. Open the invoice's allocation receipt too.
6. Activate the learner from their application. The learner should move into
   Students; Applications should show its empty state if no other applications
   remain. Activation does not provision a teaching portal.

Repeat with EFT in another synthetic account to check that money goes to Bank
instead of Cash. For siblings, use the same guardian email and allocate one
physical payment across their invoices. An unrelated guardian's invoice must
be rejected. Advance payments can remain as credit before an invoice exists.

## 5. Credit note and refund

1. Open the R800 invoice and issue a **R200 credit note**, with a reason.
2. The revised charge is R600. R200 of its earlier allocation is released, so
   family credit becomes **R400**. The original invoice remains unchanged.
3. From the physical receipt, record a **R100 Cash refund** with a unique
   reference and reason. Confirm it was paid.
4. Expect available family credit **R300**, cash **R900**, invoice balance zero.
5. Check the credit-note and refund PDFs and their queued notifications.

Corrections: reverse a receipt/refund/credit note using its dedicated action and
a reason. These are corrections to the books, not instructions to the bank.
Reverse refunds before their original receipt. Unmatch reconciled bank entries
before reversing them. Original rows remain, and downloaded corrected source
documents show their reversed status. After a reversed receipt, its transaction
reference may be used for a corrected replacement; the replacement links to
the original. Reversing a credit note restores the invoice charge; released
family funds remain available for explicit reallocation.

## 6. Expenses and private evidence

1. Open **Expenses → Record expense**. Add `Test Tutor`, category Tutor payments,
   description, **R200**, today's bill/due dates, and tick already paid.
2. Select Cash, record the actual date, unique reference and verification note.
   Review and confirm.
3. Expect expense R200, supplier balance zero and **Cash R700**.
4. Attach a dummy PDF/JPEG/PNG under Supporting documents; preview/download it.
   The file must stay private. If an upload confirmation is interrupted, use
   **Verify upload**; the expense remains saved independently of its evidence.
5. Also test an unpaid bill and a partial supplier payment. The bill recognises
   the expense once; paying it settles the payable rather than adding another
   expense. Correct payments before reversing a paid bill.

## 7. Cash deposit and bank reconciliation

1. Record **R500 cash deposited into Bank**, with a verified deposit reference.
2. Expect **Bank R500 and Cash R200**. The transfer adds no income.
3. Create this synthetic CSV, replacing `YYYY-MM-DD` with the actual deposit
   date used in the app:

```csv
transaction_id,date,description,amount
BANK-DEP-TEST-001,YYYY-MM-DD,Synthetic cash deposit,500.00
```

4. Import it with the same start/end date, opening R0 and closing R500.
5. Match the statement line to the existing cash-deposit journal. The balances
   must remain R500/R200; matching must not post another payment.
6. Reimporting the same active bank transaction ID must fail. Incorrect totals
   must fail. To correct an import, unmatch its rows and **Void import** with a
   reason, then import the corrected file. The old import remains in history.

For a deposit/payment that clears on a later statement, use **Bank entries
awaiting clearing → Record clearing-date difference**, with evidence and an
expected date after posting. Closing compares the bank statement plus these
verified differences to the ledger. Match the entry when it later clears.
Empty statements can use just the CSV header with equal opening/closing totals.
Cash withdrawals from Bank are available as the opposite transfer.

## 8. Reports, exports and statements

Open Reports, choose dates and download the PDF and CSVs. For the example above,
before November teaching begins, expect:

| Check | Expected |
| --- | ---: |
| Bank | R500 |
| Cash | R200 |
| Expenses / loss so far | R200 / -R200 |
| Deferred tuition | R600 |
| Family credit liability | R300 |
| Total assets | R700 |
| Liabilities plus accumulated result | R900 - R200 = R700 |
| Every control difference | R0 |

Use **Update earned tuition** through today to post the earned part of a
currently running programme. Future teaching must remain deferred. Repeating
recognition must not duplicate income. Saved programme dates preserve invoice
calculations when calendars later change. Missed earlier months are recognised
in their teaching period when open; corrections affecting closed periods post
their newly recognised amount in an open period instead.

Family statements show charges, money received, credits/refunds and a net
balance. Positive means owed to Viva; negative means family credit. Allocating
existing money does not count as another receipt. Reports use the complete
ledger. Display lists have explicit row limits; ledger/ageing CSV exports read
the complete requested results up to 10,000 rows and refuse larger exports.
Amounts dated after today are not presented as completed future activity.

## 9. Student lifecycle

- Record an arrangement with terms and an end date. It pauses unpaid reminders
  and unpaid-tuition suspension without erasing the debt or changing due dates.
- Suspension for unpaid tuition requires an overdue balance, the 10th or later,
  notice to the family and no current arrangement. An agreed non-payment pause
  can be recorded separately. New routine invoices pause while suspended.
- Withdrawal notice by the 20th defaults to that month's end. Later notice
  requires an agreed final date. Existing issued charges need explicit credit
  notes if an adjustment is agreed; they are not silently deleted.
- Reactivation checks overdue debt/arrangements and the return month's charge.
  If unpaid, it prepares the invoice but retains the suspended/withdrawn state.
  Settle it and repeat the return confirmation. A fully credited return month
  needs a later billing period or reviewed charging arrangement.

These controls manage the learner/billing record. Teaching access is still
managed by the team because learner/class portals are a separate feature.

## 10. Permissions and closing

Finance owner can manage settings, chart accounts, roles, manual journals and
period closing/reopening. Bookkeepers perform daily receipt, expense,
reconciliation and learner-account operations. Viewers can read/download but
cannot post. Keep one enabled owner. Create additional test Auth accounts and
authorize them in `admin_users` before testing role changes; ordinary public
sign-in cannot grant admin access.

Test a completed month with no financial activity first, using cash count R0.
Closing requires a month-end before today, a reviewed closing note, bank
reconciliation where applicable, a matching cash count and zero ledger/control
differences. Attempt a backdated expense in that closed month: it must fail.
Reopen its first day with an owner reason, then the corrected posting can be
recorded. Owner funding/other reviewed journals must balance; tuition and other
control accounts use their dedicated workflows.

## 11. Automation and date-boundary tests

**Run scheduled work now** is available to an owner without enabling unattended
work. It recognises tuition through yesterday, generates next eligible month's
invoices from the 25th and queues due unpaid reminders from the 3rd. Repeated
completed runs on the same day do not duplicate financial events. Failed runs
record an error and roll back their financial work; correct the cause and retry.

Vercel has a daily 08:05 SAST cron configured, which runs on production
deployments. For continuous outbox processing, optionally configure the
five-minute Supabase worker in [accounting-scheduler.sql](accounting-scheduler.sql).
Store its deployment URL and matching cron secret in Vault as described there.
A protected Preview may additionally need its Automation Bypass secret.

After a successful manual test, enable scheduled accounting in Controls.
Enable automatic email dispatch separately, only with verified email and bank
settings and controlled recipients. Each call handles at most five queued,
never-attempted messages within a bounded execution window; recurring calls
drain larger queues. Ambiguous/failed attempts are left for manual provider
history review. Stale payment-request balances are left for review; settled
requests and reminders covered by current arrangements are skipped safely.
Provider acceptance is not proof of inbox delivery.

Date-dependent controls intentionally use the real SAST date. Do not replace
production date functions to force a test. The automated PostgreSQL tests use
an isolated clock to cover the 25th/1st/3rd/10th and the November→December,
December→January and January→February boundaries immediately.

## Automated verification and boundaries

```bash
npm ci
npm test
npm run lint
npx --no-install tsc -p tsconfig.app.json --noEmit
npx --no-install tsc -p tsconfig.node.json --noEmit
npm run build
```

Final local verification: **119 tests passed across 15 files**, both TypeScript
targets passed, lint had zero errors (seven existing warnings), and the
production build exited successfully. Chromium exercised the accounting flow
and mobile Finance sections; WebKit checked the mobile sections, More/logout
and signed-out access.

The database tests execute real PostgreSQL functions through PGlite. Browser
checks use the actual HTTP handlers/database functions with synthetic Auth and
Storage. These checks do not prove live Supabase permissions/connectivity,
Vercel asset bundling, Resend delivery or actual bank receipt. Complete the
deployment/inbox/private-file checks above before live use. No live migration,
real payment or external email is performed by the implementation tests.

Scope: one operating bank ledger plus cash, ZAR and no VAT. This provides the
bookkeeping workflows above; payroll calculation, inventory, asset schedules,
statutory tax submissions and online tuition checkout are not implemented.
Grade progression and future fee changes are not automatic; review continuing
learner details and agreed fees before a new teaching season. Do not enable
unattended billing for records whose withdrawal/return terms remain unresolved.
