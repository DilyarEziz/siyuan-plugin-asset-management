**The asset management plugin for SiYuan: physical items, memberships, and prepaid benefits in one place, covering the full lifecycle from wishlist to active to retired. Automatic daily cost, expiry tracking, a heartbeat wishlist, subscription & prepaid reports, two-way note links, an AI assistant, multi-currency with live exchange rates, and JSON / Markdown export.**

<div align="center">

Your personal asset keeper in SiYuan · Wishlist / Active / Retired · Daily cost · Expiry badges · Reports · Note links · AI assistant · Mobile ready

</div>

| 📖 Full guide | 🐛 Issues |
| :---: | :---: |
| **[Complete guide (LianDi)](https://ld246.com/article/1788492088313)** | **[GitHub Issues](https://github.com/DilyarEziz/siyuan-plugin-asset-management/issues)** |
| ⭐ **[Repository](https://github.com/DilyarEziz/siyuan-plugin-asset-management)** | ⬇️ **Install**: SiYuan marketplace → search "Asset Management" |

## Changelog

### v2.7.0

**Note links in remarks, quick retire for perpetual / prepaid assets**

- New: note links in remarks — typing `[[` or `【【` (English and Chinese input methods) in a remark editor pops up a note search panel; pick a document and it is inserted as `[Title](siyuan://blocks/<blockID>)`, clickable in the detail card and edit-form preview to jump straight to the note. Only SiYuan block-ID URLs are accepted; other URLs stay plain text, and jumping from the form preview never discards unsaved input. Supported in asset remarks, wishlist reasons, abandon reasons, and retire / sale / maintenance notes; on mobile the panel auto-scrolls into view, tapping a remark puts the caret at the end (links cannot be split by a stray tap), the caret line stays in view as the keyboard rises, and the caret and panel accent follow the theme color.
- New: quick retire for perpetual and prepaid assets — the card "•••" menu gains "Mark Retired" (centered, theme-colored confirm; retired date = today, prepaid balance-preserved hint when applicable). Retired assets show "Reactivate" to restore service anytime, and the home list refreshes immediately. The perpetual / prepaid edit forms gain the same Status pills as physical, so the retired date is viewable / editable once retired. Physical assets keep their edit-form retire entry and subscriptions stay managed by expiry projection and renewals — no extra retire buttons. Prepaid quick entries (charge / consume / refund / count / adjust) now open as the in-app glass sheet matching the maintenance presentation, no longer a native dialog outside the plugin UI.
- Improved: the `retired` status is no longer exclusive to physical assets — every owned kind can retire. Old data never contained non-physical retired records, so the relaxation is purely additive: existing files validate unchanged, no migration or reset.

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


> For the full changelog, see [CHANGELOG.md](./CHANGELOG.md).
