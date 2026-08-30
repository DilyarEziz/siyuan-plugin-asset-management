# Asset Management

**Everything you own and pay for, in one place — and always know if it's worth it.**

Asset Management is a personal asset keeper that lives in your SiYuan Note sidebar. Physical items, subscriptions, stored-value cards — keep them all in one view: what's in service, what's retired, what each purchase costs you per day, and which membership is about to expire. Open the sidebar, and it's all there.

## Changelog

### v2.6.3

**Report analysis card + automatic exchange rate updates**

- New: the report gains a "Subscription analysis" view — the number of subscribed, trial, and stopped subscriptions, monthly spending (normalized by billing cycle), total spent so far, and the subscriptions renewing within the next 30 days with their amounts.
- New: the report gains a "Prepaid analysis" view — total balance and remaining uses, total topped up and consumed, usage rate, and the prepaid assets expiring within the next 30 days.
- New: spending on count-based prepaid assets now flows into "Prepaid analysis" — purchases and paid top-ups count toward the total topped up, used portions are amortized into consumption, and the balance stays consistent with the remaining uses.
- New: the subscribed / trial / stopped numbers in "Subscription analysis" are now clickable — a popup lists all subscriptions in that state, and tapping one opens its details.
- Improved: "Subscription analysis", "Prepaid analysis", and "Wishlist conversion" are now combined into a single analysis card on the report page — switch between them with the "Subscriptions / Prepaid / Wishlist" buttons at the top of the card, keeping the report more compact, with all three views sharing a unified layout.
- Improved: each button appears only when you have the matching assets — "Subscriptions" requires subscription assets and "Prepaid" requires prepaid assets — while "Wishlist" is always shown, leaving the rest of the report untouched.
- New: exchange rates in Settings can now update automatically — when the app opens and more than 24 hours have passed since the last update, it automatically fetches the latest US dollar, euro, and British pound to Chinese yuan rates.
- New: the exchange-rate area shows the current rates, their source (automatic update or manual setting), and the last refresh time, together with a "Refresh now" button.
- New: manual rate adjustments cover the US dollar, euro, and British pound; after a manual adjustment, automatic updates will not overwrite it — use "Restore automatic rates" to switch back at any time.
- Fixed: the 5 preset icons in the "Service" category of the icon picker were not showing; they now display correctly.

### v2.6.2

**Active-only totals, inline recovered amount, and retirement dates in the note index**

- Improved: the home summary now counts only assets in service — the total value and daily average cost no longer include retired items, and when there is resale income, a `Recovered:` amount is shown inline right beside the total value.
- Improved: in the report's asset overview, both the total value and retired recovery are compressed into single lines, each with an asset count.
- New: in the note index document, retired asset entries show their retirement date, aligned with the expiry-date column of active assets.
- Fixed: when a new asset was set to retired right at creation, its sale price was silently discarded; it is now recorded correctly as recovery income.
- Fixed: when editing a retired asset, the sale price is now filled in automatically, and changing it is saved as a new recovery record.
- Improved: asset list cards drop the extra padding above and below, so the list's top and bottom edges are no longer too wide.

### v2.6.1

**Wishlist journey, note link directions, and form polish**

- New: product cards show the wishlist date; purchased assets show the wishlist date, heartbeat count, and purchase date when available.
- New: reports expose wishlist conversion metrics for total wishes, active wishes, purchases, abandons, purchase rate, and abandon rate without changing owned-asset totals.
- New: note links distinguish notes referenced by an asset from notes that reference an asset.
- Improved: wishlist conversion metrics use a compact two-column layout that also works on narrow panels.
- Improved: browser validation bubbles are disabled in favor of field-specific inline messages such as `Please enter a name`, cleared automatically once the field is valid.

> For the full changelog, see [CHANGELOG.md](./CHANGELOG.md).

## Features

### Three kinds of assets, one home

- **Physical** — electronics, appliances, furniture, anything you buy
- **Virtual** — subscriptions and one-time purchases you keep forever
- **Prepaid** — stored-value balances and usage-count packages, always up to date

### A full lifecycle, from "want it" to "done with it"

- Three stages: wishlist (want to buy) → active (in use) → retired
- Bought something from your wishlist? Turn it into an active asset in one step — or drop it when you change your mind
- Expected-price tracking on wishlist items, with a trend curve as prices move

### Know what it's really costing you

- **Daily cost** — automatically works out what each asset costs per day
- **Depreciation** — several methods to watch value fade over time
- **Target daily price** — set a goal and see how close you are to earning it back

### Never miss an expiry

- Five-level expiry badges that get more urgent as the date approaches
- Expired items are detected automatically, and the home page shows a "expiring soon" reminder

### Multiple currencies

- CNY and USD; the home page totals in CNY while each card also shows the converted amount

### Records and organization

- Colored tags to group things your own way
- Maintenance and usage records — every item keeps its own history
- Reports at a glance: category ranking, tag ranking, amount trend, price ranking

### Works with your notes

- Keep an optional asset index document that stays connected even when you move or rename it
- Copy or insert native asset block references, then see backlinks, tagged blocks, and manually linked notes on the product card
- Open a product card directly from its block reference; modifier-key jumps and right-click / long-press actions remain available on desktop and mobile

### Views and search

- List and grid views, comfortable at any width
- Filter by status, category and tag, sort your way, plus keyword search

### Your data stays yours

- JSON backup & restore, Markdown export
- Data lives inside your SiYuan workspace and syncs with SiYuan — uninstalling never deletes it

### Designed for every day

- Liquid-glass interface, full dark mode, and a mobile-friendly layout
