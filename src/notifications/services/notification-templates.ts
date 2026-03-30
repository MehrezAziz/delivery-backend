import { NotificationType } from '@prisma/client';

export interface NotificationTemplate {
  title: string;
  body: string;
}

type TemplateData = Record<string, string | number | undefined>;

// Track line builder: ◉ = completed, ⛟ = current position, ⌖ = pending
function track(step: number): string {
  const total = 7;
  const parts: string[] = [];
  for (let i = 0; i < total; i++) {
    if (i < step) parts.push('◉');
    else if (i === step) parts.push('⛟');
    else parts.push('⌖');
    if (i < total - 1) parts.push('———');
  }
  return parts.join('');
}

// Template functions for each notification type
const templates: Record<NotificationType, (data?: TemplateData) => NotificationTemplate> = {
  // Customer - Order Lifecycle
  ORDER_CREATED: (d) => ({
    title: '📦 Order Confirmed — Searching for a driver...',
    body: track(0),
  }),
  DRIVER_ASSIGNED: (d) => ({
    title: `✅ Driver Assigned — ${d?.driverName || 'Your driver'} is on the way!`,
    body: track(2),
  }),
  DRIVER_ARRIVED: (d) => ({
    title: '📍 Driver Arrived — At the pickup location',
    body: track(3),
  }),
  PACKAGE_PICKED_UP: (d) => ({
    title: '📦 Package Picked Up — On its way!',
    body: track(4),
  }),
  DELIVERY_IN_PROGRESS: (d) => ({
    title: '🚚 Delivery In Progress',
    body: track(5),
  }),
  ORDER_DELIVERED: (d) => ({
    title: '✅ Order Delivered!',
    body: track(6),
  }),
  ORDER_CANCELLED: (d) => ({
    title: '⊘ Order Cancelled',
    body: d?.reason ? `${d.reason}` : 'Your order has been cancelled.',
  }),
  NO_DRIVER_FOUND: (d) => ({
    title: '⊘ No Driver Found',
    body: 'No driver was available. Please try again.',
  }),

  // Customer - Payment & Wallet
  WALLET_TOPUP_SUCCESS: (d) => ({
    title: 'Wallet Top-Up Successful',
    body: `${d?.amount || ''} coins have been added to your wallet.`,
  }),
  WALLET_TOPUP_FAILED: (d) => ({
    title: 'Wallet Top-Up Failed',
    body: `Your wallet top-up could not be processed. Please try again.`,
  }),
  LOW_WALLET_BALANCE: (d) => ({
    title: 'Low Wallet Balance',
    body: `Your wallet balance is low. Top up to continue using wallet payments.`,
  }),
  ORDER_PAYMENT_DEDUCTED: (d) => ({
    title: 'Payment Deducted',
    body: `${d?.amount || ''} coins were deducted for your order.`,
  }),
  REFUND_PROCESSED: (d) => ({
    title: 'Refund Processed',
    body: `A refund of ${d?.amount || ''} coins has been credited to your wallet.`,
  }),
  WITHDRAWAL_STATUS: (d) => ({
    title: 'Withdrawal Update',
    body: `Your withdrawal request has been ${d?.status || 'updated'}.`,
  }),

  // Customer - Referral
  REFERRAL_BONUS: (d) => ({
    title: 'Referral Bonus Earned! 🎉',
    body: `You earned ${d?.amount || ''} coins from a referral.`,
  }),
  REFERRED_FRIEND_REGISTERED: (d) => ({
    title: 'Friend Joined!',
    body: `Your referred friend has registered on the platform.`,
  }),

  // Customer - Account
  ACCOUNT_CREATED: (d) => ({
    title: 'Welcome!',
    body: `Your account has been created successfully.`,
  }),
  ACCOUNT_SUSPENDED: (d) => ({
    title: 'Account Suspended',
    body: `Your account has been suspended. Contact support for details.`,
  }),
  ACCOUNT_REACTIVATED: (d) => ({
    title: 'Account Reactivated',
    body: `Your account has been reactivated. Welcome back!`,
  }),

  // Customer - Support
  DISPUTE_OPENED: (d) => ({
    title: 'Dispute Opened',
    body: `Your dispute has been submitted and is under review.`,
  }),
  DISPUTE_RESOLVED: (d) => ({
    title: 'Dispute Resolved',
    body: `Your dispute has been resolved.`,
  }),
  SUPPORT_TICKET_REPLY: (d) => ({
    title: 'Support Reply',
    body: `You have a new reply on your support ticket.`,
  }),

  // Customer - Chat
  NEW_MESSAGE_FROM_DRIVER: (d) => ({
    title: 'New Message',
    body: `${d?.driverName || 'Your driver'} sent you a message.`,
  }),

  // Driver - Order Opportunities
  NEW_ORDER_AVAILABLE: (d) => ({
    title: 'New Order Available 🔔',
    body: `A new delivery is available in your area.`,
  }),
  ORDER_EXPIRED: (d) => ({
    title: 'Order Expired',
    body: `An order opportunity has expired.`,
  }),

  // Driver - Active Order
  ORDER_CANCELLED_BY_CUSTOMER: (d) => ({
    title: 'Order Cancelled',
    body: `The customer has cancelled the order.`,
  }),
  PICKUP_REMINDER: (d) => ({
    title: 'Pickup Reminder',
    body: `Don't forget to pick up the package for your current order.`,
  }),

  // Driver - Account
  DOCUMENTS_SUBMITTED: (d) => ({
    title: 'Documents Submitted',
    body: `Your documents have been submitted for review.`,
  }),
  VERIFICATION_APPROVED: (d) => ({
    title: 'Verification Approved! 🎉',
    body: `Your account has been verified. You can now accept orders.`,
  }),
  VERIFICATION_REJECTED: (d) => ({
    title: 'Verification Rejected',
    body: d?.reason ? `Your verification was rejected: ${d.reason}` : 'Your verification was rejected. Please resubmit.',
  }),
  DRIVER_ACCOUNT_SUSPENDED: (d) => ({
    title: 'Account Suspended',
    body: `Your driver account has been suspended. Contact support.`,
  }),

  // Driver - Financial
  PAYMENT_RECEIVED_COD: (d) => ({
    title: 'COD Payment Recorded',
    body: `Cash payment of ${d?.amount || ''} has been recorded.`,
  }),
  PAYMENT_CREDITED_WALLET: (d) => ({
    title: 'Payment Credited',
    body: `${d?.amount || ''} has been credited to your account.`,
  }),
  NEGATIVE_BALANCE_WARNING: (d) => ({
    title: 'Negative Balance Warning ⚠️',
    body: `Your account balance is negative. Please settle your dues.`,
  }),
  ACCOUNT_BLOCKED_DEBT: (d) => ({
    title: 'Account Blocked',
    body: `Your account has been blocked due to outstanding debt.`,
  }),
  WITHDRAWAL_PROCESSED: (d) => ({
    title: 'Withdrawal Processed',
    body: `Your withdrawal of ${d?.amount || ''} has been processed.`,
  }),

  // Driver - Performance
  CUSTOMER_RATED_YOU: (d) => ({
    title: 'New Rating',
    body: `A customer rated you ${d?.score || ''}/10.`,
  }),
  PERFORMANCE_MILESTONE: (d) => ({
    title: 'Milestone Reached! 🎉',
    body: `Congratulations! You've completed ${d?.count || ''} deliveries.`,
  }),

  // Driver - Chat
  NEW_MESSAGE_FROM_CUSTOMER: (d) => ({
    title: 'New Message',
    body: `${d?.customerName || 'Your customer'} sent you a message.`,
  }),

  // Admin - Driver Management
  NEW_DRIVER_REGISTRATION: (d) => ({
    title: 'New Driver Registration',
    body: `A new driver has registered: ${d?.driverName || 'Unknown'}.`,
  }),
  DRIVER_DOCUMENTS_SUBMITTED: (d) => ({
    title: 'Documents Pending Review',
    body: `${d?.driverName || 'A driver'} has submitted documents for verification.`,
  }),
  DRIVER_PERFORMANCE_ALERT: (d) => ({
    title: 'Driver Performance Alert',
    body: `${d?.driverName || 'A driver'} has low performance metrics.`,
  }),
  DRIVER_DEBT_THRESHOLD: (d) => ({
    title: 'Driver Debt Alert',
    body: `${d?.driverName || 'A driver'} has exceeded the debt threshold.`,
  }),

  // Admin - Order Management
  ORDER_STUCK_NO_DRIVER: (d) => ({
    title: 'Order Stuck',
    body: `An order has been waiting for a driver beyond the threshold.`,
  }),
  HIGH_VALUE_ORDER: (d) => ({
    title: 'High-Value Order',
    body: `A high-value order of ${d?.amount || ''} has been created.`,
  }),
  ORDER_CANCELLED_AFTER_ASSIGNMENT: (d) => ({
    title: 'Order Cancelled After Assignment',
    body: `An order was cancelled after a driver was assigned.`,
  }),

  // Admin - Disputes
  NEW_DISPUTE_CREATED: (d) => ({
    title: 'New Dispute',
    body: `A new dispute has been filed.`,
  }),
  DISPUTE_ESCALATED: (d) => ({
    title: 'Dispute Escalated',
    body: `A dispute has been escalated and requires attention.`,
  }),

  // Admin - Financial
  LARGE_WITHDRAWAL_REQUEST: (d) => ({
    title: 'Large Withdrawal Request',
    body: `A withdrawal of ${d?.amount || ''} has been requested.`,
  }),
  PAYMENT_GATEWAY_FAILURE: (d) => ({
    title: 'Payment Gateway Failure ⚠️',
    body: `The payment gateway is experiencing issues.`,
  }),
  DAILY_REVENUE_REPORT: (d) => ({
    title: 'Daily Revenue Report',
    body: `Today's revenue: ${d?.amount || 'N/A'}.`,
  }),

  // Admin - System Health
  SERVER_ERROR_SPIKE: (d) => ({
    title: 'Server Error Spike ⚠️',
    body: `Server error rate has spiked. Immediate attention required.`,
  }),
  DATABASE_PERFORMANCE_ALERT: (d) => ({
    title: 'Database Alert ⚠️',
    body: `Database performance degradation detected.`,
  }),

  // Admin - User Management
  SUSPICIOUS_ACTIVITY: (d) => ({
    title: 'Suspicious Activity',
    body: `Suspicious account activity detected.`,
  }),
  BULK_REGISTRATION_DETECTED: (d) => ({
    title: 'Bulk Registration Alert',
    body: `Unusual bulk registration activity detected.`,
  }),

  // CS - Support
  NEW_SUPPORT_TICKET: (d) => ({
    title: 'New Support Ticket',
    body: `A new support ticket has been created.`,
  }),
  TICKET_ASSIGNED: (d) => ({
    title: 'Ticket Assigned to You',
    body: `A support ticket has been assigned to you.`,
  }),
  CUSTOMER_REPLIED_TICKET: (d) => ({
    title: 'Customer Replied',
    body: `A customer has replied to a support ticket.`,
  }),
  URGENT_TICKET_UNRESOLVED: (d) => ({
    title: 'Urgent Ticket Unresolved',
    body: `An urgent support ticket remains unresolved.`,
  }),

  // CS - Disputes
  DISPUTE_ASSIGNED: (d) => ({
    title: 'Dispute Assigned to You',
    body: `A dispute has been assigned to you for review.`,
  }),
  DISPUTE_REQUIRES_DECISION: (d) => ({
    title: 'Dispute Requires Decision',
    body: `A dispute is awaiting your decision.`,
  }),

  // CS - Order Monitoring
  DELAYED_ORDER_ALERT: (d) => ({
    title: 'Delayed Order Alert',
    body: `An order delivery is delayed beyond the expected time.`,
  }),
};

export function getNotificationTemplate(
  type: NotificationType,
  data?: TemplateData,
): NotificationTemplate {
  const templateFn = templates[type];
  return templateFn(data);
}
