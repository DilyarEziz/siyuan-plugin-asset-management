**The asset management plugin for SiYuan: physical items, memberships, and prepaid benefits in one place, covering the full lifecycle from wishlist to active to retired. Automatic daily cost, expiry tracking, a heartbeat wishlist, subscription & prepaid reports, two-way note links, an AI assistant, multi-currency with live exchange rates, and JSON / Markdown export.**

<div align="center">

Your personal asset keeper in SiYuan · Wishlist / Active / Retired · Daily cost · Expiry badges · Reports · Note links · AI assistant · Mobile ready

</div>

| 📖 Full guide | 🐛 Issues |
| :---: | :---: |
| **[Complete guide (LianDi)](https://ld246.com/article/1788492088313)** | **[GitHub Issues](https://github.com/DilyarEziz/siyuan-plugin-asset-management/issues)** |
| ⭐ **[Repository](https://github.com/DilyarEziz/siyuan-plugin-asset-management)** | ⬇️ **Install**: SiYuan marketplace → search "Asset Management" |

## Changelog

### v2.6.8

**Editable & deletable renewal periods, renewed-expiry display fix, mobile dropdown fix**

- New: per-period editing — every entry in the subscription history has an Edit button, so mis-typed start / end dates can be fixed directly; saving validates against overlapping adjacent periods and voids the original record for a traceable audit trail.
- New: delete a mistaken renewal — the latest period shows a Delete button (offered once there are at least two periods); its payment is voided in the same transaction, so net cost, daily cost and subscription reports roll back. Recorded in the operation log.
- Fixed: after renewing, product cards kept showing the original end date — card expiry, home reminders and sorting now use the latest period's end date, matching the "Renewed" badge.
- Fixed: mobile dropdowns not responding — billing-cycle / currency dropdowns and the date picker could pop entirely off-screen; panels now clamp to the viewport, flip above when there is no room below, and close on more touch-reliable pointer events.
- Improved: the four home filter dropdowns (status / type / sort / filter) now share one look — the status menu's filled highlight with 8px rounded corners, consistent in light and dark themes.
- Fixed: deleting a prepaid transaction always failed (its operation-log type was missing from the storage whitelist); whitelisted again.

### v2.6.7

**Consistent out-of-warranty wording, bold notes, and selectable detail-card text**

- New: asset notes now support inline Markdown — bold `**text**`, italic `*text*`, underline `++text++`, strikethrough `~~text~~`, and inline code render in both the product detail card and the edit-form preview; the saved source text is untouched and HTML is safely escaped.
- New: notes editing supports SiYuan's familiar shortcuts — ⌘/Ctrl+B bold, ⌘/Ctrl+I italic, ⌘/Ctrl+U underline, ⌘/Ctrl+Shift+S strikethrough, ⌘/Ctrl+Shift+K inline code; press once to wrap the selection, again to unwrap.
- New: click anywhere on the rendered notes preview to start editing from that exact spot; the caret line stays visible above the save button while typing.
- Improved: text in the product detail card (including notes) can now be drag-selected and copied — SiYuan panels disable text selection by default, and the detail card now opts back in; releasing a selection drag over the backdrop no longer closes the card by accident.
- Improved: warranty and subscription reminders are now clearly separated — physical products nearing warranty end show "Warranty expiring soon" (subscriptions keep the date / "ends in N days" wording) and warranty due today shows "Warranty ends today", consistently on the home expiry reminder and the report's expiring list.
- Improved: physical products past their warranty now show "Out of warranty" instead of the subscription-flavored "Expired" on list and matrix cards.
- Improved: out-of-warranty products no longer turn the status dot grey in the product list — grey now only means retired (including expired subscriptions); warranty state is conveyed by the "Out of warranty" badge.
- Improved: the "N uses left · ¥X/use" figures on count-based prepaid cards now use a muted secondary color, and the home "Retired" divider stretches flush to the card edges.
- Improved: the per-day cost label on product cards is shortened from "Daily cost" to "Daily" for a tighter layout.

### v2.6.6

**Smoother deletions, a steadier settings window, and expired subscriptions now count as retired**

- New: the AI assistant now understands brands and purchase channels — it can create brand / channel entries by name and set them on assets when creating or editing them.
- New: on the home page, all retired products are grouped at the bottom of the list, separated from the rest by a "Retired" divider line for a clear overview.
- Improved: brands, purchase channels, and tags can now be deleted at any time — even when assets still reference them. On deletion, the plugin clears the brand / channel from those assets (shown as "not set") and removes the tag from their tag lists, and tells you upfront how many assets are affected, so there is no need to edit each asset first.
- Improved: deleting a brand, channel, or tag now asks for confirmation first — so a stray click no longer removes anything.
- Improved: the settings window now keeps a fixed height — based on the plugin's main panel, it no longer grows and shrinks as you switch between settings pages; longer pages scroll inside the window.
- Improved: expired subscriptions now count as retired — they no longer sit in the "Active" list; the "Active" filter excludes them while "Retired" includes them, and the active / retired numbers on the home page and in reports stay in sync. Expired subscription cards show a grey "Expired" badge, while subscriptions with auto-renew on keep their "Pending renewal" badge as before.
- Improved: the tag, brand, and channel rankings in reports now always show — the "Report Sections" switches are gone from Settings, so there is nothing to enable manually.
- Fixed: directly created products no longer show a "wishlist journey" — only products that truly went through the wishlist (still wished, or purchased from the wishlist pool) show their wish date and heartbeat records.

> For the full changelog, see [CHANGELOG.md](./CHANGELOG.md).
