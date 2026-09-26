**The asset management plugin for SiYuan: physical items, memberships, and prepaid benefits in one place, covering the full lifecycle from wishlist to active to retired. Automatic daily cost, expiry tracking, a heartbeat wishlist, subscription & prepaid reports, two-way note links, an AI assistant, multi-currency with live exchange rates, and JSON / Markdown export.**

<div align="center">

Your personal asset keeper in SiYuan · Wishlist / Active / Retired · Daily cost · Expiry badges · Reports · Note links · AI assistant · Mobile ready

</div>

| 📖 Full guide | 🐛 Issues |
| :---: | :---: |
| **[Complete guide (LianDi)](https://ld246.com/article/1788492088313)** | **[GitHub Issues](https://github.com/DilyarEziz/siyuan-plugin-asset-management/issues)** |
| ⭐ **[Repository](https://github.com/DilyarEziz/siyuan-plugin-asset-management)** | ⬇️ **Install**: SiYuan marketplace → search "Asset Management" |

## Changelog

### v2.6.7

**Consistent out-of-warranty wording, bold notes, and selectable detail-card text**

- New: asset notes now support inline Markdown — bold `**text**`, italic `*text*`, underline `++text++`, strikethrough `~~text~~`, and inline code render in both the product detail card and the edit-form preview; the saved source text is untouched and HTML is safely escaped.
- New: notes editing supports SiYuan's familiar shortcuts — ⌘/Ctrl+B bold, ⌘/Ctrl+I italic, ⌘/Ctrl+U underline, ⌘/Ctrl+Shift+S strikethrough, ⌘/Ctrl+Shift+K inline code; press once to wrap the selection, again to unwrap.
- New: notes focus mode — the expand button at the top-right of the notes card grows the editor to cover the whole form; the caret line always stays visible above the save button while typing.
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

### v2.6.5

**Brands & purchase channels, upgraded filters, and report dimension analysis**

- New: tag each asset with a brand (e.g. Xiaomi, Huawei) and a purchase channel (e.g. Amazon, a local store). Pick an existing entry or create your own right in the asset editor, with custom names and colors.
- New: the home filter now offers three switchable groups — tags, brands, and purchase channels — each with multi-select, and they combine freely. For example, select "Xiaomi" AND "Amazon" to see only Xiaomi items bought there.
- New: reports gain "Dimension analysis" — spending rankings by brand and by purchase channel. Tap an entry to view the underlying assets, and choose which rankings to show in Settings.
- Improved: the tag limit is gone — add as many tags as you like.
- Improved: required form fields are now marked with a red dot, so you can see at a glance what must be filled in; optional fields can be left empty.

> For the full changelog, see [CHANGELOG.md](./CHANGELOG.md).
