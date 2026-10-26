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
    cancelled: "Cancelled",
    skipped: "Skipped",
  })[value] || value.replaceAll("_", " ");

export const auditTime = (value: string) =>
  new Date(value).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }) + " SAST";

export const notificationName = (kind: string) =>
  ({
    invoice: "Tuition invoice",
    receipt: "Payment receipt",
    reminder: "Payment reminder",
    activation: "Enrollment activated",
  })[kind] || humanStatus(kind);

export const auditName = (action: string) =>
  ({
    approve: "Application approved",
    reject: "Application rejected",
    note: "Review note added",
    payment: "Verified payment recorded",
    activate: "Learner activated",
    generate_month: "Monthly billing run",
    queue_reminders: "Payment reminder run",
    send_message: "Notification send attempted",
    cancel_message: "Queued email cancelled",
    view_document: "Private document requested",
  })[action] || humanStatus(action);
