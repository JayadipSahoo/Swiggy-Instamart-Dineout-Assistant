# MCP Servers: Tools & Resources

This repository is configured with 3 MCP servers:

- `swiggy-instamart` (`serverIdentifier`: `user-swiggy-instamart`)
- `swiggy-dineout` (`serverIdentifier`: `user-swiggy-dineout`)
- `swiggy-food` (`serverIdentifier`: `user-swiggy-food`)

Notes:

- **Authentication** is handled by the MCP servers (tools assume an authenticated Swiggy user).
- Some tools have **required workflows** (example: you must call `get_addresses` first and use the returned `addressId`).
- **Resources** are read-only “UI widgets” (HTML MCP apps) that can be rendered by an MCP-capable client.

---

## swiggy-instamart (Grocery)

### Tools

#### `get_addresses`
- **Use**: List saved delivery addresses (for Instamart + Food).
- **Args**: none
- **Typical next step**: user selects an `addressId` which is then reused in later calls.

#### `create_address`
- **Use**: Create a new saved delivery address.
- **Required args**:
  - `fullAddress` (string)
  - `addressLine` (string) *(parsed from `fullAddress`)*
  - `addressLine2` (string) *(parsed; can be `""`)*
  - `city` (string) *(parsed)*
  - `postalCode` (string) *(parsed)*
  - `latitude` (number)
  - `longitude` (number)
  - `addressCategory` (`HOME` | `WORK` | `OFFICE` | `FRIENDS_AND_FAMILY` | `OTHER`)
  - `userName` (string)
  - `userPhone` (string)
- **Optional args**: `locality`, `addressTag`, `receiverName`, `receiverPhone`

#### `delete_address`
- **Use**: Permanently delete a saved address.
- **Required args**: `addressId` (string)
- **Typical workflow**: call `get_addresses` → user chooses → confirm → `delete_address`.

#### `search_products`
- **Use**: Search grocery products available at a selected delivery address (returns variants).
- **Required args**:
  - `addressId` (string) *(must come from `get_addresses`)*
  - `query` (string)
- **Optional args**: `offset` (number)
- **Common workflow**: `get_addresses` → `search_products` → user picks a variant → `update_cart`.

#### `your_go_to_items`
- **Use**: Fetch “Your Go To Items” (frequently/recently ordered grocery items) for an address.
- **Required args**: `addressId` (string)
- **Optional args**: `offset` (number)
- **Tip**: choose a variant’s `spinId` when adding to cart.

#### `get_cart`
- **Use**: Read current Instamart grocery cart + bill breakdown.
- **Args**: none
- **Important**: response includes `availablePaymentMethods` (only show/assume those).

#### `update_cart`
- **Use**: Replace the entire Instamart cart with the provided items.
- **Required args**:
  - `selectedAddressId` (string) *(from `get_addresses`)*
  - `items` (array of `{ spinId: string, quantity: number }`)

#### `clear_cart`
- **Use**: Empty the Instamart cart.
- **Args**: none

#### `checkout`
- **Use**: Place & confirm Instamart grocery order.
- **Required args**: `addressId` (string)
- **Optional args**: `paymentMethod` (string) *(should match `availablePaymentMethods` from `get_cart`)*
- **Constraints**:
  - **Explicit user confirmation required**
  - **Cart value restriction**: checkout not allowed above the limit (user should use app for large carts)
  - **Multi-store carts**: can result in multiple store orders in one operation

#### `get_orders`
- **Use**: Instamart order list / last 15 days history and basic details.
- **Args** (all optional):
  - `count` (number)
  - `orderType` (string; default described as `"DASH"`)
  - `activeOnly` (boolean)
- **Tip**: use this first to get `orderId` (and coordinates) for detailed or tracking calls.

#### `get_order_details`
- **Use**: Detailed Instamart order breakdown for a specific `orderId`.
- **Required args**: `orderId` (string)

#### `track_order`
- **Use**: Real-time Instamart order tracking (status, ETA, etc.).
- **Required args**:
  - `orderId` (string)
  - `lat` (number)
  - `lng` (number)
- **Typical workflow**: `get_orders` → pick order → `track_order`.

#### `report_error`
- **Use**: Generate an error report for the Swiggy MCP team (returns a `mailto:` link + summary; logs server-side).
- **Required args**:
  - `tool` (string)
  - `errorMessage` (string)
- **Optional args**: `domain`, `flowDescription`, `toolContext` (object of IDs), `userNotes`
- **Tip**: include identifiers like `orderId`, `addressId`, `spinId`, `paymentMethod`, etc. in `toolContext`.

### Resources

- **None** (this server exposes tools only).

---

## swiggy-dineout (Table Reservations)

### Tools

#### `get_saved_locations`
- **Use**: Fetch saved locations used specifically for Dineout searches (returns IDs usable in Dineout search).
- **Args**: none
- **Typical workflow**: user says “near my home” → `get_saved_locations` → choose `addressId` → `search_restaurants_dineout`.

#### `search_restaurants_dineout`
- **Use**: Search restaurants for table booking/reservations.
- **Required args**: `query` (string)
- **Optional args**:
  - `entityType` (`locality` | `CUISINE` | `RESTAURANT_CATEGORY`)
  - `addressId` (string) *(from `get_saved_locations`)*
  - `latitude` (number), `longitude` (number)
- **Important**: `entityType` must be used carefully; when unsure, omit it.

#### `get_restaurant_details`
- **Use**: Fetch full dineout details for a restaurant (amenities, deals, timings, etc.).
- **Required args**:
  - `restaurantId` (string)
  - `latitude` (number)
  - `longitude` (number)

#### `get_available_slots`
- **Use**: Fetch available time slots (breakfast/lunch/dinner) for up to 7 days from a start date.
- **Required args**:
  - `restaurantId` (string)
  - `date` (string; `YYYY-MM-DD` or epoch string)
  - `latitude` (number)
  - `longitude` (number)
- **Tip**: you typically do **not** re-call this when the user switches dates in the widget (7 days already included).

#### `book_table`
- **Use**: Book a table for a specific slot (free reservations only).
- **Required args**:
  - `restaurantId` (string)
  - `slotId` (number)
  - `itemId` (string)
  - `reservationTime` (number)
  - `guestCount` (number)
  - `latitude` (number)
  - `longitude` (number)
- **Tip**: slot fields come from `get_available_slots` (use **free** deals only).

#### `get_booking_status`
- **Use**: Check booking status/details for a reservation.
- **Required args**: `orderId` (string)

#### `create_cart`
- **Use**: Low-level cart primitive (rare). For “book a table”, prefer `book_table`.
- **Required args**:
  - `restaurantId` (string)
  - `cartType` (`DEAL_TICKET_PURCHASE` | `DINEOUT`)
  - `latitude` (number)
  - `longitude` (number)
- **Additional args depend on cartType**: `slotId`, `itemId`, `reservationTime`, `guestCount` (booking) or `billAmount`, `source` (bill-pay).

#### `report_error`
- **Use**: Same error reporting helper as other servers.
- **Required args**: `tool`, `errorMessage`
- **Optional args**: `domain`, `flowDescription`, `toolContext`, `userNotes`

### Resources (UI widgets)

All resources below are `mimeType: text/html;profile=mcp-app` and can be rendered by the client:

- `dineout-locations-widget`
  - **URI**: `ui://widget/dineout-locations.html`
  - **Use**: interactive location selection for dineout flows
- `dineout-search-widget`
  - **URI**: `ui://widget/dineout-search.html`
  - **Use**: restaurant search experience
- `dineout-details-widget`
  - **URI**: `ui://widget/dineout-details.html`
  - **Use**: restaurant details view
- `dineout-slots-widget`
  - **URI**: `ui://widget/dineout-slots.html`
  - **Use**: slot/date picker experience
- `dineout-cart-widget`
  - **URI**: `ui://widget/dineout-cart.html`
  - **Use**: cart/summary experience
- `dineout-booking-widget`
  - **URI**: `ui://widget/dineout-booking.html`
  - **Use**: booking confirmation experience
- `dineout-status-widget`
  - **URI**: `ui://widget/dineout-status.html`
  - **Use**: booking status view

---

## swiggy-food (Food Delivery)

### Tools

#### `get_addresses`
- **Use**: List saved delivery addresses (for Instamart + Food).
- **Args**: none

#### `create_address`
- **Use**: Create a new saved delivery address.
- **Required args**: same as Instamart `create_address`.

#### `delete_address`
- **Use**: Permanently delete a saved address.
- **Required args**: `addressId` (string)

#### `search_restaurants`
- **Use**: Search restaurants for food delivery.
- **Required args**:
  - `addressId` (string) *(must come from `get_addresses`)*
  - `query` (string)
- **Optional args**: `offset` (number)
- **Tip**: only recommend restaurants with `availabilityStatus: "OPEN"`.

#### `get_restaurant_menu`
- **Use**: Browse a restaurant’s menu by category (compact view).
- **Required args**:
  - `addressId` (string)
  - `restaurantId` (string)
- **Optional args**: `page` (number), `pageSize` (number)

#### `search_menu`
- **Use**: Search for dishes/menu items (returns customization details used to add to cart).
- **Required args**:
  - `addressId` (string)
  - `query` (string)
- **Optional args**: `restaurantIdOfAddedItem`, `vegFilter`, `offset`
- **Important**: each item uses either `variations` (legacy) or `variantsV2` (new); use the same format in cart updates.

#### `update_food_cart`
- **Use**: Add/update food cart items with variants/addons.
- **Required args**:
  - `restaurantId` (string)
  - `cartItems` (array)
  - `addressId` (string)
- **Optional args**: `restaurantName` (string)
- **Important**: after calling this, call `get_food_cart` to show the updated cart (this tool itself renders no widget).

#### `get_food_cart`
- **Use**: Read current food cart + `availablePaymentMethods` + `valid_addons` (based on chosen variants).
- **Required args**: `addressId` (string)
- **Optional args**: `restaurantName` (string)

#### `flush_food_cart`
- **Use**: Empty the food cart.
- **Args**: none

#### `fetch_food_coupons`
- **Use**: Fetch available coupons/offers for a restaurant + address.
- **Required args**:
  - `restaurantId` (string)
  - `addressId` (string)
- **Optional args**: `couponCode` (string)

#### `apply_food_coupon`
- **Use**: Apply a coupon to the cart.
- **Required args**:
  - `couponCode` (string)
  - `addressId` (string)
- **Optional args**: `cartId` (string)

#### `place_food_order`
- **Use**: Place food order (requires explicit user confirmation).
- **Required args**: `addressId` (string)
- **Optional args**: `paymentMethod` (string)
- **Constraint**: **order placement not allowed for cart total \(₹1000\) or more** (beta restriction).

#### `get_food_orders`
- **Use**: Fetch active food delivery orders.
- **Required args**: `addressId` (string)
- **Optional args**: `orderCount` (number)

#### `get_food_order_details`
- **Use**: Fetch detailed info for a specific food order.
- **Required args**: `orderId` (string)

#### `track_food_order`
- **Use**: Track an order’s delivery progress (or all active orders if `orderId` omitted).
- **Args** (all optional): `orderId` (string)

#### `report_error`
- **Use**: Same error reporting helper as other servers.
- **Required args**: `tool`, `errorMessage`
- **Optional args**: `domain`, `flowDescription`, `toolContext`, `userNotes`

### Resources (UI widgets)

All resources below are `mimeType: text/html;profile=mcp-app` and can be rendered by the client:

- `food-addresses-widget`
  - **URI**: `ui://widget/food-addresses.html`
  - **Use**: interactive address selection
- `food-search-widget`
  - **URI**: `ui://widget/food-search.html`
  - **Use**: restaurant search experience
- `food-restaurant-menu-widget`
  - **URI**: `ui://widget/food-restaurant-menu.html`
  - **Use**: menu browsing experience
- `food-menu-search-widget`
  - **URI**: `ui://widget/food-menu-search.html`
  - **Use**: item search + customization experience
- `food-cart-widget`
  - **URI**: `ui://widget/food-cart.html`
  - **Use**: cart view
- `food-confirmation-widget`
  - **URI**: `ui://widget/food-confirmation.html`
  - **Use**: order confirmation experience

