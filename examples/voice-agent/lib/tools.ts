export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCallResult {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface OrderItem {
  item: string;
  quantity: number;
  size?: string;
  modifiers?: string[];
  price?: number;
}

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface ToolState {
  orderItems?: OrderItem[];
  orderConfirmed?: boolean;
  checklist?: ChecklistItem[];
  flaggedIssues?: string[];
}

export function createInitialToolState(scenarioId: string): ToolState {
  if (scenarioId === "customer-service") {
    return {
      checklist: [
        { id: "greet", label: "Greeted the customer", checked: false },
        { id: "identify", label: "Identified the issue", checked: false },
        { id: "empathy", label: "Showed empathy", checked: false },
        { id: "solution", label: "Offered a solution", checked: false },
        { id: "confirm", label: "Confirmed resolution", checked: false },
        { id: "closing", label: "Professional closing", checked: false },
      ],
      flaggedIssues: [],
    };
  }
  if (scenarioId === "restaurant-kiosk") {
    return { orderItems: [], orderConfirmed: false };
  }
  return {};
}

export function executeTool(call: ToolCallResult, state: ToolState): ToolState {
  const next = { ...state };

  switch (call.name) {
    case "add_to_order": {
      const args = call.arguments as Partial<OrderItem>;
      const items = [...(next.orderItems ?? [])];
      items.push({
        item: String(args.item ?? "Unknown item"),
        quantity: Number(args.quantity ?? 1),
        size: args.size ? String(args.size) : undefined,
        modifiers: Array.isArray(args.modifiers) ? args.modifiers.map(String) : undefined,
        price: args.price != null ? Number(args.price) : undefined,
      });
      next.orderItems = items;
      break;
    }
    case "remove_from_order": {
      const idx = Number(call.arguments.item_index ?? -1);
      const items = [...(next.orderItems ?? [])];
      if (idx >= 0 && idx < items.length) items.splice(idx, 1);
      next.orderItems = items;
      break;
    }
    case "modify_order_item": {
      const idx = Number(call.arguments.item_index ?? -1);
      const items = [...(next.orderItems ?? [])];
      if (idx >= 0 && idx < items.length) {
        const changes = call.arguments.changes as Partial<OrderItem> | undefined;
        if (changes) items[idx] = { ...items[idx], ...changes };
      }
      next.orderItems = items;
      break;
    }
    case "confirm_order": {
      next.orderConfirmed = true;
      break;
    }
    case "check_item": {
      const itemId = String(call.arguments.item_id ?? "");
      next.checklist = (next.checklist ?? []).map((c) =>
        c.id === itemId ? { ...c, checked: true } : c,
      );
      break;
    }
    case "flag_issue": {
      const desc = String(call.arguments.description ?? "");
      if (desc) next.flaggedIssues = [...(next.flaggedIssues ?? []), desc];
      break;
    }
  }

  return next;
}

export const RESTAURANT_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "add_to_order",
      description: "Add an item to the customer's order",
      parameters: {
        type: "object",
        properties: {
          item: { type: "string", description: "Name of the menu item" },
          quantity: { type: "number", description: "Quantity ordered" },
          size: { type: "string", description: "Size (small/medium/large) if applicable" },
          modifiers: { type: "array", items: { type: "string" }, description: "Modifications (e.g., no onions, extra cheese)" },
          price: { type: "number", description: "Price of the item if known from the menu" },
        },
        required: ["item", "quantity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_from_order",
      description: "Remove an item from the order by its index",
      parameters: {
        type: "object",
        properties: {
          item_index: { type: "number", description: "Index of the item to remove (0-based)" },
        },
        required: ["item_index"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "modify_order_item",
      description: "Modify an existing order item",
      parameters: {
        type: "object",
        properties: {
          item_index: { type: "number", description: "Index of the item to modify (0-based)" },
          changes: {
            type: "object",
            properties: {
              size: { type: "string" },
              modifiers: { type: "array", items: { type: "string" } },
              quantity: { type: "number" },
            },
          },
        },
        required: ["item_index", "changes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirm_order",
      description: "Confirm the complete order when the customer is done ordering",
      parameters: { type: "object", properties: {} },
    },
  },
];

export const SERVICE_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "check_item",
      description: "Mark a service checklist item as completed",
      parameters: {
        type: "object",
        properties: {
          item_id: { type: "string", description: "ID of the checklist item: greet, identify, empathy, solution, confirm, closing" },
        },
        required: ["item_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "flag_issue",
      description: "Flag a service quality issue observed during the interaction",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "Description of the issue" },
        },
        required: ["description"],
      },
    },
  },
];
