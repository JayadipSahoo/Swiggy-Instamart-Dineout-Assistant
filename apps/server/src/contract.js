/**
 * Assistant API contract (v0 - MCP-ready)
 *
 * This is intentionally simple:
 * - Mobile sends a message
 * - Server responds with text + optional UI "cards" + optional "actions"
 *
 * Later, we can swap mock logic with Swiggy MCP calls without changing the app.
 */

export const ActionType = {
  NAVIGATE: "navigate",
  OPEN_CHECKOUT: "open_checkout",
  ADD_TO_CART: "add_to_cart",
  SET_CHIPS: "set_chips"
};

/**
 * @typedef {Object} AssistantAction
 * @property {"navigate"|"open_checkout"|"add_to_cart"|"set_chips"} type
 * @property {any} payload
 */

/**
 * @typedef {Object} AssistantCard
 * @property {"dish"|"restaurant"|"info"|"grocery"} kind
 * @property {string} id
 * @property {string} title
 * @property {string=} subtitle
 * @property {string=} priceText
 * @property {string=} metaText
 */

