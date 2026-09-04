**The asset management plugin for SiYuan: physical items, memberships, and prepaid benefits in one place, covering the full lifecycle from wishlist to active to retired. Automatic daily cost, expiry tracking, a heartbeat wishlist, subscription & prepaid reports, two-way note links, an AI assistant, multi-currency with live exchange rates, and JSON / Markdown export.**

<div align="center">

Your personal asset keeper in SiYuan · Wishlist / Active / Retired · Daily cost · Expiry badges · Reports · Note links · AI assistant · Mobile ready

</div>

| 📖 Full guide | 🐛 Issues |
| :---: | :---: |
| **[Complete guide (LianDi)](https://ld246.com/article/1788492088313)** | **[GitHub Issues](https://github.com/DilyarEziz/siyuan-plugin-asset-management/issues)** |
| ⭐ **[Repository](https://github.com/DilyarEziz/siyuan-plugin-asset-management)** | ⬇️ **Install**: SiYuan marketplace → search "Asset Management" |

## Changelog

### v2.6.4

**Filter memory and subscription monthly spending fix**

- Improved: the asset page now remembers the filters you last chose — status, type, sort, and tags — and restores them the next time you open the plugin; for example, if you filtered by "Active", it stays on "Active" next time.
- Fixed: monthly spending in the report's "Subscription analysis" no longer disagrees with the daily average — it is now converted by the actual length of the current subscription period, matching the daily average; a subscription costing about 0.55 yuan per day now shows roughly 16.7 yuan per month instead of a doubled figure.

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

> For the full changelog, see [CHANGELOG.md](./CHANGELOG.md).
