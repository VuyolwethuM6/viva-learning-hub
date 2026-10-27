# Viva accounting implementation

Confirmed scope: ZAR, no VAT, EFT and cash only, zero opening balances for the
test books. Teaching and routine tuition billing run February–November. Bank,
cash, expenses and collection of old balances continue all year. Reporting uses
explicit date ranges and a February–November preset; no statutory year-end is
assumed.

The ledger uses immutable balanced journals in integer cents. Invoices debit
receivables and credit deferred tuition. Earned tuition is recognised against
the invoice's saved programme dates. Incoming money debits bank/cash and credits
the family's available credit; allocations move that credit to receivables.
This supports split payments, payments covering siblings with the same guardian
email, and advances before an invoice exists. Cash deposits are transfers.

Credits reduce unearned tuition first, then earned income. Any resulting
over-allocation is released back to family credit. Refunds use available credit.
Payment reversals release allocations and reverse the original money receipt.
Corrections never delete issued documents or journal rows. Closed periods
reject backdating; owner-only reopening requires a reason.

Supplier bills accrue expenses/payables. Their settlements debit payables and
credit bank/cash. Bank imports require a stable transaction ID, ISO date,
description and signed decimal rand amount. Matching links an existing bank
journal and does not post income a second time. Statement opening/closing totals
are checked, and matching/unmatching retains history.

Student controls include withdrawal, suspension/reactivation and dated payment
arrangements. Suspension does not waive debt. Withdrawal sets a final billing
date and prevents later invoices. Notice by the 20th defaults to that month's
end; later notice requires an explicitly agreed final date. Existing charges
need a separate credit note if an adjustment is agreed.

Daily scheduled work uses Africa/Johannesburg dates: invoice generation from the
25th for an eligible following month, reminders from the 3rd, and earned-income
recognition. December/January invoices are skipped. Runs are idempotent and
visible. Automation and automatic email dispatch start disabled. Email dispatch
uses the durable outbox, sends only never-attempted items automatically, and
leaves ambiguous attempts for manual review.

Owner/bookkeeper/viewer finance permissions are enforced on the server and in
SQL. Existing enabled admins become owners during setup. The migration refuses
an unreviewed first import of legacy financial rows; the owner has confirmed
clearing the test records before installation. Reruns preserve posted books.

The implementation includes private expense evidence, branded financial PDFs,
CSV exports, learner statements, trial balance, profit/loss, balance sheet,
cash movements, debtor ageing, reconciliation and period-close checks. Existing
invoice numbers and enrollment/receipt branding are retained.
