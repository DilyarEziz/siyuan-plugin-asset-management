**The asset management plugin for SiYuan: physical items, memberships, and prepaid benefits in one place, covering the full lifecycle from wishlist to active to retired. Automatic daily cost, expiry tracking, a heartbeat wishlist, subscription & prepaid reports, two-way note links, an AI assistant, multi-currency with live exchange rates, and JSON / Markdown export.**

<div align="center">

Your personal asset keeper in SiYuan · Wishlist / Active / Retired · Daily cost · Expiry badges · Reports · Note links · AI assistant · Mobile ready

</div>

| 📖 Full guide | 🐛 Issues |
| :---: | :---: |
| **[Complete guide (LianDi)](https://ld246.com/article/1788492088313)** | **[GitHub Issues](https://github.com/DilyarEziz/siyuan-plugin-asset-management/issues)** |
| ⭐ **[Repository](https://github.com/DilyarEziz/siyuan-plugin-asset-management)** | ⬇️ **Install**: SiYuan marketplace → search "Asset Management" |

## Changelog

### v2.6.6

**Smoother deletions, a steadier settings window, and expired subscriptions now count as retired**

- Improved: brands and purchase channels can now be deleted at any time — even when assets still reference them. On deletion, the plugin clears the brand / channel from those assets (shown as "not set") and tells you upfront how many assets are affected, so there is no need to edit each asset first.
- Improved: the settings window now keeps a fixed height — based on the plugin's main panel, it no longer grows and shrinks as you switch between settings pages; longer pages scroll inside the window.
- Fixed: directly created products no longer show a "wishlist journey" — only products that truly went through the wishlist (still wished, or purchased from the wishlist pool) show their wish date and heartbeat records.
- New: on the home page, all retired products are grouped at the bottom of the list, separated from the rest by a "Retired" divider line for a clear overview.
- Improved: expired subscriptions now count as retired — they no longer sit in the "Active" list; the "Active" filter excludes them while "Retired" includes them, and the active / retired numbers on the home page and in reports stay in sync. Expired subscription cards show a grey "Expired" badge, while subscriptions with auto-renew on keep their "Pending renewal" badge as before.

### v2.6.5

**Brands & purchase channels, upgraded filters, and report dimension analysis**

- New: tag each asset with a brand (e.g. Xiaomi, Huawei) and a purchase channel (e.g. Amazon, a local store). Pick an existing entry or create your own right in the asset editor, with custom names and colors.
- New: the home filter now offers three switchable groups — tags, brands, and purchase channels — each with multi-select, and they combine freely. For example, select "Xiaomi" AND "Amazon" to see only Xiaomi items bought there.
- New: reports gain "Dimension analysis" — spending rankings by brand and by purchase channel. Tap an entry to view the underlying assets, and choose which rankings to show in Settings.
- Improved: the tag limit is gone — add as many tags as you like.
- Improved: required form fields are now marked with a red dot, so you can see at a glance what must be filled in; optional fields can be left empty.

### v2.6.4

**Filter memory, subscription monthly spending fix, SiYuan 3.8.3 compatibility, and faster AI actions**

- Improved: the asset page now remembers the filters you last chose — status, type, sort, and tags — and restores them the next time you open the plugin; for example, if you filtered by "Active", it stays on "Active" next time.
- Fixed: monthly spending in the report's "Subscription analysis" no longer disagrees with the daily average — it is now converted by the actual length of the current subscription period, matching the daily average; a subscription costing about 0.55 yuan per day now shows roughly 16.7 yuan per month instead of a doubled figure.
- Improved: compatibility with SiYuan Notes 3.8.3 — the AI assistant can call the asset management tools normally on the latest kernel; the new kernel changed how plugin tools are registered, and the plugin handles this automatically with no action needed.
- Improved: AI edits to your assets (renaming, changing status, updating notes, and so on) now respond faster — results take effect as soon as they are saved, with no fixed waiting period; on environments that don't support this, the plugin automatically falls back to the previous behavior with no loss of stability.

> For the full changelog, see [CHANGELOG.md](./CHANGELOG.md).
