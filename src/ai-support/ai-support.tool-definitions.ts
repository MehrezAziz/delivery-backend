/** OpenAI-compatible tool definitions for Groq. */
export const AI_SUPPORT_TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_user_profile',
      description:
        'Load the signed-in user profile: role (customer vs driver), display-safe name, masked phone, wallet summary fields if present. Use first to know which other tools apply.',
      parameters: {
        type: 'object',
        properties: {},
        required: [] as string[],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_orders',
      description:
        'List recent orders (newest first) for this user: ids, status, price, key assignment timestamps. Use before get_order_details when the user did not give an order id.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max rows (default 8, max 15)' },
        },
        required: [] as string[],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_order_details',
      description:
        'One order the user may access: status, payment type, amounts, pickup/dropoff (street/delegation), dispute, assignment milestones, and whether in-app tracking is recommended.',
      parameters: {
        type: 'object',
        properties: {
          orderId: { type: 'string', description: 'Order UUID' },
        },
        required: ['orderId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_wallet',
      description:
        'Balance and recent transactions: customer digital wallet or driver account. No card or bank account numbers.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Recent transactions (default 12, max 25)' },
        },
        required: [] as string[],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_addresses',
      description:
        'Saved addresses (street, delegation, governorate). Coordinates are not returned here by default.',
      parameters: {
        type: 'object',
        properties: {},
        required: [] as string[],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_support_history',
      description:
        'Past support tickets for this user excluding the current ticket: category, priority, status. For continuity only.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max tickets (default 5, max 10)' },
        },
        required: [] as string[],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_peer_chat_summaries',
      description:
        'Driver–customer order chats (not this support thread): order id, last message preview. Use for “what did we say in the order chat?”.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max rooms (default 6, max 12)' },
        },
        required: [] as string[],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_driver_for_order',
      description:
        'For the customer on that order: driver first name, vehicle type, assignment timeline, masked phone hint. No documents or verification data.',
      parameters: {
        type: 'object',
        properties: {
          orderId: { type: 'string' },
        },
        required: ['orderId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_driver_position',
      description:
        'Latest GPS point for that order (customer-only). Says if the fix is recent; the live map remains in the main app.',
      parameters: {
        type: 'object',
        properties: {
          orderId: { type: 'string' },
        },
        required: ['orderId'],
      },
    },
  },
];
