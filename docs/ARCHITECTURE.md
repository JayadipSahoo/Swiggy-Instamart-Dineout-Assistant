# Architecture (Scaffold)

## Goal

Build a personal assistant app (chat + voice) that can:

- Suggest food under a budget and optionally place the order
- Build Instamart carts for recipes (“butter chicken ingredients”)
- Respect dietary preferences
- Use Swiggy MCP servers (Food / Instamart / Dineout)

## High-level components

### `apps/mobile` (Expo / React Native)

- Modern minimal “futuristic” UI
- Chat + mic button (voice is stubbed initially)
- Stores API base URL (ngrok) in local storage so **no hardcoded IP**

### `apps/server` (Node API)

Why a server?

- Keep any orchestration logic off-device
- Central place to call MCP servers (and later LLM routing)
- Easy to secure and log requests

Initial endpoints:

- `GET /health` → `{ ok: true }`
- `POST /chat` → accepts `{ message }` and returns:
  - `reply` (string)
  - `cards[]` (suggestions to render)
  - `actions[]` (UI triggers like navigate)
  - `cart` (in-memory demo cart)
- `GET /cart` → current demo cart
- `POST /cart/add` → add an item to demo cart
- `POST /cart/clear` → clear demo cart

Later endpoints (planned):

- `/mcp/food/*` `/mcp/im/*` `/mcp/dineout/*` wrappers
- `/assistant/plan` for structured flows (budget meal, recipe-to-cart)

## MCP integration plan (next)

Right now the server responds with **mock data** so the mobile app can be built end-to-end.

Next we’ll replace the mock intent handlers with real Swiggy MCP tool calls:

- **Food ₹ budget**:
  - `get_addresses` → user selects address
  - `search_restaurants` → shortlist open restaurants
  - `search_menu` → dishes under budget
  - `update_food_cart` → add dish
  - `get_food_cart` → show cart + payment methods
  - `place_food_order` → only after explicit confirm + under ₹1000
- **Instamart recipe-to-cart**:
  - `get_addresses` → select address
  - `search_products` → ingredient variants
  - `update_cart` → add chosen variants
  - `get_cart` → summary + payment methods
  - `checkout` → only after explicit confirm + within allowed limit

## ngrok flow

- Run server locally on `http://localhost:8787`
- Run ngrok: `ngrok http 8787`
- Paste the `https://....ngrok-free.app` URL into the mobile app settings

