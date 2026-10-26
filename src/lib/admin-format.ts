export const humanStatus = (value: string) =>
  ({
    pending_review: "Pending review",
    pending_payment: "Awaiting payment",
    part_paid: "Part paid",
    active: "Active",
    rejected: "Rejected",
    draft: "Draft",
    archived: "Archived",
    paid: "Paid",
    overdue: "Overdue",
    unpaid: "Unpaid",
    pending: "Queued",
    sending: "Sending",
    sent: "Accepted",
    failed: "Needs attention",
  })[value] || value.replaceAll("_", " ");
