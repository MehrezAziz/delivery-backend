import { NotificationChannel, NotificationPriority, NotificationType } from '@prisma/client';

// Priority → Channel mapping
export const CHANNELS_BY_PRIORITY: Record<NotificationPriority, NotificationChannel[]> = {
  [NotificationPriority.LOW]: [NotificationChannel.IN_APP],
  [NotificationPriority.MEDIUM]: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
  [NotificationPriority.HIGH]: [NotificationChannel.PUSH, NotificationChannel.IN_APP, NotificationChannel.WEB_SOCKET],
  [NotificationPriority.CRITICAL]: [NotificationChannel.PUSH, NotificationChannel.IN_APP, NotificationChannel.WEB_SOCKET],
};

// Default priority per notification type
export const DEFAULT_PRIORITY: Record<NotificationType, NotificationPriority> = {
  // Customer - Order Lifecycle
  [NotificationType.ORDER_CREATED]: NotificationPriority.MEDIUM,
  [NotificationType.DRIVER_ASSIGNED]: NotificationPriority.HIGH,
  [NotificationType.DRIVER_ARRIVED]: NotificationPriority.MEDIUM,
  [NotificationType.PACKAGE_PICKED_UP]: NotificationPriority.MEDIUM,
  [NotificationType.DELIVERY_IN_PROGRESS]: NotificationPriority.MEDIUM,
  [NotificationType.ORDER_DELIVERED]: NotificationPriority.CRITICAL,
  [NotificationType.ORDER_CANCELLED]: NotificationPriority.HIGH,
  [NotificationType.NO_DRIVER_FOUND]: NotificationPriority.HIGH,
  // Customer - Payment & Wallet
  [NotificationType.WALLET_TOPUP_SUCCESS]: NotificationPriority.MEDIUM,
  [NotificationType.WALLET_TOPUP_FAILED]: NotificationPriority.HIGH,
  [NotificationType.LOW_WALLET_BALANCE]: NotificationPriority.HIGH,
  [NotificationType.ORDER_PAYMENT_DEDUCTED]: NotificationPriority.MEDIUM,
  [NotificationType.REFUND_PROCESSED]: NotificationPriority.MEDIUM,
  [NotificationType.WITHDRAWAL_STATUS]: NotificationPriority.MEDIUM,
  // Customer - Referral
  [NotificationType.REFERRAL_BONUS]: NotificationPriority.LOW,
  [NotificationType.REFERRED_FRIEND_REGISTERED]: NotificationPriority.LOW,
  // Customer - Account
  [NotificationType.ACCOUNT_CREATED]: NotificationPriority.MEDIUM,
  [NotificationType.ACCOUNT_SUSPENDED]: NotificationPriority.CRITICAL,
  [NotificationType.ACCOUNT_REACTIVATED]: NotificationPriority.MEDIUM,
  // Customer - Support
  [NotificationType.DISPUTE_OPENED]: NotificationPriority.MEDIUM,
  [NotificationType.DISPUTE_RESOLVED]: NotificationPriority.HIGH,
  [NotificationType.SUPPORT_TICKET_REPLY]: NotificationPriority.MEDIUM,
  // Customer - Chat
  [NotificationType.NEW_MESSAGE_FROM_DRIVER]: NotificationPriority.HIGH,
  // Driver - Order Opportunities
  [NotificationType.NEW_ORDER_AVAILABLE]: NotificationPriority.CRITICAL,
  [NotificationType.ORDER_EXPIRED]: NotificationPriority.MEDIUM,
  // Driver - Active Order
  [NotificationType.ORDER_CANCELLED_BY_CUSTOMER]: NotificationPriority.HIGH,
  [NotificationType.PICKUP_REMINDER]: NotificationPriority.HIGH,
  // Driver - Account
  [NotificationType.DOCUMENTS_SUBMITTED]: NotificationPriority.MEDIUM,
  [NotificationType.VERIFICATION_APPROVED]: NotificationPriority.CRITICAL,
  [NotificationType.VERIFICATION_REJECTED]: NotificationPriority.CRITICAL,
  [NotificationType.DRIVER_ACCOUNT_SUSPENDED]: NotificationPriority.CRITICAL,
  // Driver - Financial
  [NotificationType.PAYMENT_RECEIVED_COD]: NotificationPriority.MEDIUM,
  [NotificationType.PAYMENT_CREDITED_WALLET]: NotificationPriority.MEDIUM,
  [NotificationType.NEGATIVE_BALANCE_WARNING]: NotificationPriority.HIGH,
  [NotificationType.ACCOUNT_BLOCKED_DEBT]: NotificationPriority.CRITICAL,
  [NotificationType.WITHDRAWAL_PROCESSED]: NotificationPriority.MEDIUM,
  // Driver - Performance
  [NotificationType.CUSTOMER_RATED_YOU]: NotificationPriority.LOW,
  [NotificationType.PERFORMANCE_MILESTONE]: NotificationPriority.MEDIUM,
  // Driver - Chat
  [NotificationType.NEW_MESSAGE_FROM_CUSTOMER]: NotificationPriority.HIGH,
  // Admin - Driver Management
  [NotificationType.NEW_DRIVER_REGISTRATION]: NotificationPriority.MEDIUM,
  [NotificationType.DRIVER_DOCUMENTS_SUBMITTED]: NotificationPriority.HIGH,
  [NotificationType.DRIVER_PERFORMANCE_ALERT]: NotificationPriority.HIGH,
  [NotificationType.DRIVER_DEBT_THRESHOLD]: NotificationPriority.HIGH,
  // Admin - Order Management
  [NotificationType.ORDER_STUCK_NO_DRIVER]: NotificationPriority.HIGH,
  [NotificationType.HIGH_VALUE_ORDER]: NotificationPriority.MEDIUM,
  [NotificationType.ORDER_CANCELLED_AFTER_ASSIGNMENT]: NotificationPriority.MEDIUM,
  // Admin - Disputes
  [NotificationType.NEW_DISPUTE_CREATED]: NotificationPriority.CRITICAL,
  [NotificationType.DISPUTE_ESCALATED]: NotificationPriority.HIGH,
  // Admin - Financial
  [NotificationType.LARGE_WITHDRAWAL_REQUEST]: NotificationPriority.HIGH,
  [NotificationType.PAYMENT_GATEWAY_FAILURE]: NotificationPriority.CRITICAL,
  [NotificationType.DAILY_REVENUE_REPORT]: NotificationPriority.LOW,
  // Admin - System Health
  [NotificationType.SERVER_ERROR_SPIKE]: NotificationPriority.CRITICAL,
  [NotificationType.DATABASE_PERFORMANCE_ALERT]: NotificationPriority.CRITICAL,
  // Admin - User Management
  [NotificationType.SUSPICIOUS_ACTIVITY]: NotificationPriority.HIGH,
  [NotificationType.BULK_REGISTRATION_DETECTED]: NotificationPriority.HIGH,
  // CS - Support
  [NotificationType.NEW_SUPPORT_TICKET]: NotificationPriority.MEDIUM,
  [NotificationType.TICKET_ASSIGNED]: NotificationPriority.HIGH,
  [NotificationType.CUSTOMER_REPLIED_TICKET]: NotificationPriority.MEDIUM,
  [NotificationType.URGENT_TICKET_UNRESOLVED]: NotificationPriority.HIGH,
  // CS - Disputes
  [NotificationType.DISPUTE_ASSIGNED]: NotificationPriority.HIGH,
  [NotificationType.DISPUTE_REQUIRES_DECISION]: NotificationPriority.HIGH,
  // CS - Order Monitoring
  [NotificationType.DELAYED_ORDER_ALERT]: NotificationPriority.HIGH,
};
