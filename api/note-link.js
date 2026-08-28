/* eslint-disable no-undef */
/**
 * v2.5.0 笔记双链 · 阶段2 —— 资产索引文档引擎（note-link engine）。
 *
 * 职责：在用户指定笔记本里维护一篇由用户显式创建的资产索引文档，每个资产对应一个真实
 * 段落块（custom-asset-id 属性打标），供笔记通过块引用关联资产。
 *
 * 设计铁律：
 *   1. 防递归：syncNow 全程持有 syncing 标志。引擎回写 indexBlockId /
 *      indexDocId 时，宿主插件的 CRUD 钩子（scheduleSync）会被 syncing 守卫
 *      直接 no-op，绝不产生二次同步循环。
 *   2. 文档 ID 是唯一事实源：文档移动、重命名或跨笔记本移动后继续按 ID 同步；
 *      文档被删或笔记本关闭时暂停同步，只有显式 create/recreate 才会创建文档。
 *   3. 幂等：每个资产块打 custom-am-hash（渲染内容 FNV-1a 哈希）属性；哈希不变
 *      则不 updateBlock，避免无变化也广播。（不用 blocks.content 比较：内核对
 *      段落块该列存纯文本，与 markdown 永远不相等，会造成每轮全量 update。）
 *   4. 容错：scheduleSync 内部所有异常 catch + log，绝不向外抛；syncNow 返回
 *      {ok, skipped?/error?} 结构体，调用方无需 try/catch。
 *
 * 内核 API 形态（v3.7+ 源码核实）：
 *   - appendBlock/prependBlock → data = transactions 数组，新块 ID 在
 *     data[0].doOperations[0].id（doAppendInsert 末尾回填 operation.ID）
 *   - createDocWithMd → data = 新文档 id（string）
 *   - getBlockInfo → data.rootID；块不存在 code!==0（code 3 = 正在索引）
 *   - setBlockAttrs attrs 值为 string；null 删除属性
 *   - 响应一律 {code, msg, data}，code!==0 视为失败
 *
 * wishlist 资产特殊处理：formal-v2 wishlist 极简 schema 不携带 indexBlockId，
 * 因此 wishlist 块只靠 custom-asset-id 属性定位（不回写实体），同步语义不变。
 *
 * v2.5.0 阶段4（资产 → 笔记反链）：
 *   - getAssetIndexBlockId / getRelatedNotes：详情卡「相关笔记」数据源，合并
 *     ref（块引反链）/ tag（custom-asset-id 打标）/ manual（relatedNotes 登记）
 *     三源，索引文档自身过滤、blockId 去重（ref 优先）；
 *   - linkBlockToAsset / unlinkBlockFromAsset / getBlockAssetTag：块图标菜单
 *     的写/删/读 custom-asset-id 属性入口（null 删除语义）。
 *
 * v2.5.0 资产块引用直达：
 *   - 维护 indexBlockId → assetId 同步内存映射；owned 可从实体立即 seed，
 *     wishlist 与当前索引文档真值由一次属性 SQL 刷新；同步完成后按本轮 diff
 *     原子替换映射，资产删除、重复块/孤儿清理不会残留旧入口。
 */

'use strict';

const { todayISO, formatAmountMinor } = require('./algorithms');
const { projectFormalAsset, formalDailyAmountMinor, FORMAL_ASSET_KIND, ASSET_STATUS } = require('./assets');

// =====
// 常量
// =====

const NOTE_LINK_ASSET_ATTR = 'custom-asset-id';
const NOTE_LINK_HASH_ATTR = 'custom-am-hash';
const NOTE_LINK_HEADER_ATTR = 'custom-am-header';
const NOTE_LINK_HEADER_ATTR_VALUE = 'v1';
const NOTE_LINK_INDEX_OWNER_ATTR = 'custom-am-index-doc';
const NOTE_LINK_INDEX_VERSION_ATTR = 'custom-am-index-version';
const NOTE_LINK_INDEX_OWNER = 'siyuan-plugin-asset-management';
const NOTE_LINK_INDEX_VERSION = '1';
const NOTE_LINK_INDEX_DOC_TITLE = '资产管理插件索引文档——不建议手动操作';
const NOTE_LINK_INDEX_DOC_PATH = '/' + NOTE_LINK_INDEX_DOC_TITLE;
const NOTE_LINK_DEBOUNCE_MS = 2000;
const NOTE_LINK_SQL_CHUNK = 400;
const NOTE_LINK_ID_PATTERN = /^[0-9]{14}-[a-z0-9]{7}$/;

// =====
// 纯工具
// =====

function normalizeSiYuanId(value) {
    const id = String(value == null ? '' : value).trim();
    return NOTE_LINK_ID_PATTERN.test(id) ? id : null;
}

/** SQLite 字符串字面量转义；动态 SQL 的文本值统一经此函数处理。 */
function quoteSqlString(value) {
    return "'" + String(value == null ? '' : value).replace(/'/g, "''") + "'";
}

/** 名称等用户文本注入单行 markdown 前的转义：竖线/方括号/星号/反斜杠/换行。 */
function escapeBlockText(value) {
    return String(value == null ? '' : value)
        .replace(/[\r\n]+/g, ' ')
        .replace(/\\/g, '\\\\')
        .replace(/[|[\]*]/g, '\\$&')
        .trim();
}

/** 标签文本注入 `#tag` 前的净化：去 # 与空白（思源行内标签不允许空白）。 */
function sanitizeTagLabel(value) {
    return String(value == null ? '' : value).replace(/[\s#]+/g, '').trim();
}

/** FNV-1a 32 位字符串哈希（内容指纹，非安全用途）。 */
function fnv1aHash(text) {
    const str = String(text == null ? '' : text);
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
}

/** 同步时间展示文本（本地时区 YYYY-MM-DD HH:mm）。 */
function formatSyncTime(date) {
    const d = date instanceof Date ? date : new Date();
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
        + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/** appendBlock / prependBlock 事务返回中提取新块 ID（内核回填 doOperations[0].id）。 */
function blockIdFromAppendResult(data) {
    const transactions = Array.isArray(data) ? data : [];
    for (let i = 0; i < transactions.length; i++) {
        const operations = transactions[i] && Array.isArray(transactions[i].doOperations)
            ? transactions[i].doOperations : [];
        for (let j = 0; j < operations.length; j++) {
            const id = normalizeSiYuanId(operations[j] && operations[j].id);
            if (id) return id;
        }
    }
    return null;
}

// =====
// 块内容渲染（单段落单行）
// =====

/**
 * 文档头提示块 markdown（引用块，两行同属一个 quote 容器块）。
 * @param {function} t i18n 取值 (key, fallback) => string
 * @param {string} timeText 最后同步时间展示文本
 */
function renderHeaderMarkdown(t, timeText) {
    const label = t('noteIndexLastSync', '最后同步');
    const fallbackHint = label === 'Last synced'
        ? 'This document is maintained automatically by the plugin. Do not edit asset entries manually. You may move or rename the document; the plugin will continue maintaining it by document ID.'
        : '本文档由插件自动维护、请勿手改资产条目；文档可以移动或重命名，插件根据文档 ID 继续维护。';
    const hint = t('noteIndexHeaderHintMovable', fallbackHint);
    return '> ' + hint + '\n> ' + label + ': ' + String(timeText || '');
}

/**
 * 渲染单个资产的索引块 markdown（单段落单行）。
 * 格式：**名称** ｜ 状态·类型 ｜ 日均 ¥x.xx（次卡=剩余次数）｜ 购入日期 ｜ 到期日期 ｜ #标签
 * 退役行（v2.6.2）：**名称** ｜ 退役·类型 ｜ 购入日期 购入 ｜ 退役日期 退役 ｜ #标签
 *   （退役资产无日均与到期投影；退役日期取实体顶层 statusChangedOn，对应在役行的「到期」列）
 * wishlist：**名称** ｜ 种草·类型 ｜ 期望价 ¥x.xx
 *
 * @param {object} asset formal-v2 资产实体
 * @param {object} ctx { today, domain: {financialEvents, subscriptionPeriods, prepaidTransactions, tags}, t }
 */
function renderAssetBlockMarkdown(asset, ctx) {
    const context = ctx || {};
    const t = typeof context.t === 'function' ? context.t : (key, fallback) => (fallback != null ? fallback : key);
    const domain = context.domain || {};
    const today = context.today || todayISO();
    const name = escapeBlockText(asset && asset.name);
    const kindLabel = t('formalKind' + String(asset && asset.kind), String(asset && asset.kind));
    // v2.5.0 阶段3B：末尾追加 siyuan:// 深链。桌面端点击 → shell.openExternal →
    // OS 协议回传 → onGetConfig 的 SIYUAN_OPEN_URL IPC → processSiYuanUriPlugins
    // 匹配 plugin.name → eventBus emit "open-siyuan-url-plugin"（detail={url}）；
    // 移动端 openByMobile 直接进 processSiYuanUri（siyuan-master app/src/util/uri.ts L52-102）。
    const deepLinkSegment = '[' + t('deepLinkOpenDetail', '打开详情')
        + '](siyuan://plugins/siyuan-plugin-asset-management/asset?id='
        + encodeURIComponent(String((asset && asset.id) || '')) + ')';

    if (asset && asset.status === ASSET_STATUS.WISHLIST) {
        const segments = ['**' + name + '**', t('statusWishlist', '种草') + ' · ' + kindLabel];
        const wishlist = asset.wishlist || {};
        if (Number.isSafeInteger(wishlist.expectedAmountMinor) && wishlist.expectedAmountMinor > 0) {
            segments.push(t('wishlistExpectedPrice', '期望价') + ' '
                + formatAmountMinor(wishlist.expectedAmountMinor, asset.currency || 'CNY'));
        }
        segments.push(deepLinkSegment);
        return segments.join(' ｜ ');
    }

    const statusLabel = asset && asset.status === ASSET_STATUS.RETIRED
        ? t('statusRetired', '退役') : t('statusActive', '在役');
    const segments = ['**' + name + '**', statusLabel + ' · ' + kindLabel];

    // 投影要求 sidecar 严格按 assetId 过滤（projectFormalFinancials /
    // projectFormalPrepaid 对跨资产记录直接抛错），故此处逐资产裁剪后再投影。
    const allFinancialEvents = Array.isArray(domain.financialEvents) ? domain.financialEvents : [];
    const allPeriods = Array.isArray(domain.subscriptionPeriods) ? domain.subscriptionPeriods : [];
    const allPrepaidTransactions = Array.isArray(domain.prepaidTransactions) ? domain.prepaidTransactions : [];
    const assetFinancialEvents = allFinancialEvents.filter(event => event && event.assetId === asset.id);
    const projection = projectFormalAsset(asset, {
        financialEvents: assetFinancialEvents,
        subscriptionPeriods: allPeriods.filter(period => period && period.assetId === asset.id),
        prepaidTransactions: allPrepaidTransactions.filter(record => record && record.assetId === asset.id),
    }, today);

    const currency = (asset && asset.currency) || 'CNY';
    if (asset.kind === FORMAL_ASSET_KIND.PREPAID_COUNT && projection.prepaid && projection.prepaid.dimension === 'count') {
        segments.push(t('noteIndexRemaining', '剩余') + ' ' + String(projection.prepaid.remainingCount)
            + ' ' + t('noteIndexTimes', '次'));
    } else if (projection.financials) {
        const daily = formalDailyAmountMinor({
            kind: asset.kind,
            acquiredOn: asset.acquiredOn || today,
            cashNetAmountMinor: Number(projection.financials.netAmountMinor) || 0,
            referenceDate: today,
            subscription: projection.subscription,
            financialEvents: assetFinancialEvents,
        });
        if (daily && Number.isSafeInteger(daily.amountMinor) && daily.amountMinor > 0) {
            segments.push(t('noteIndexDaily', '日均') + ' ' + formatAmountMinor(daily.amountMinor, currency));
        }
    }

    if (asset && asset.acquiredOn) {
        segments.push(asset.acquiredOn + ' ' + t('noteIndexAcquired', '购入'));
    }
    // v2.6.2：退役行补「退役日期」列，取实体顶层 statusChangedOn（所有退役/转让
    // 路径都会写该字段），位置对应在役行的「到期」列。仅接受合法 YYYY-MM-DD。
    if (asset && asset.status === ASSET_STATUS.RETIRED
        && typeof asset.statusChangedOn === 'string'
        && /^\d{4}-\d{2}-\d{2}$/.test(asset.statusChangedOn)) {
        segments.push(asset.statusChangedOn + ' ' + t('noteIndexRetired', '退役'));
    }
    if (projection.expiryOn) {
        segments.push(projection.expiryOn + ' ' + t('noteIndexExpires', '到期'));
    }

    const tagById = new Map((Array.isArray(domain.tags) ? domain.tags : [])
        .filter(tag => tag && tag.id).map(tag => [tag.id, tag.label]));
    const tagText = (Array.isArray(asset && asset.tagIds) ? asset.tagIds : [])
        .map(id => sanitizeTagLabel(tagById.get(id)))
        .filter(Boolean)
        .map(label => '#' + label)
        .join(' ');
    if (tagText) segments.push(tagText);

    segments.push(deepLinkSegment);

    return segments.join(' ｜ ');
}

/** 投影失败时的降级渲染：只有名称 + 状态，保证块仍然存在且可自愈。 */
function renderFallbackBlockMarkdown(asset, t) {
    const _t = typeof t === 'function' ? t : (key, fallback) => (fallback != null ? fallback : key);
    const name = escapeBlockText(asset && asset.name);
    const statusLabel = asset && asset.status === ASSET_STATUS.WISHLIST ? _t('statusWishlist', '种草')
        : (asset && asset.status === ASSET_STATUS.RETIRED ? _t('statusRetired', '退役') : _t('statusActive', '在役'));
    return '**' + name + '** ｜ ' + statusLabel;
}

// =====
// 引擎
// =====

/**
 * 创建索引文档引擎。
 *
 * @param {object} deps
 * @param {function} deps.getSettings        () => settings 对象（含 6 个 index* 键）
 * @param {function} deps.saveSettings       (patch) => Promise<boolean>，宿主 Object.assign 合并保存
 * @param {function} deps.getAssets          () => formal-v2 资产数组（含 wishlist/在役/退役）
 * @param {function} deps.patchAssetIndexBlockId (assetId, blockId) => Promise<boolean>，回写 indexBlockId
 * @param {function} [deps.fetcher]          (path, options) => Promise<Response>，默认全局 fetch（测试可 mock）
 * @param {function} [deps.getDomain]        () => {financialEvents, subscriptionPeriods, prepaidTransactions, tags}
 * @param {function} [deps.t]                i18n (key, fallback) => string
 * @param {function} [deps.log]              日志输出（默认 console.warn）
 * @param {number}   [deps.debounceMs]       scheduleSync 防抖毫秒（默认 2000，测试可调）
 */
function createNoteLinkEngine(deps) {
    const d = deps || {};
    const getSettings = typeof d.getSettings === 'function' ? d.getSettings : () => ({});
    const saveSettings = typeof d.saveSettings === 'function' ? d.saveSettings : () => Promise.resolve(false);
    const getAssets = typeof d.getAssets === 'function' ? d.getAssets : () => [];
    const getDomain = typeof d.getDomain === 'function' ? d.getDomain : () => ({});
    const patchAssetIndexBlockId = typeof d.patchAssetIndexBlockId === 'function'
        ? d.patchAssetIndexBlockId : () => Promise.resolve(false);
    const fetcher = typeof d.fetcher === 'function' ? d.fetcher
        : (typeof fetch === 'function' ? fetch : null);
    const t = typeof d.t === 'function' ? d.t : (key, fallback) => (fallback != null ? fallback : key);
    const log = typeof d.log === 'function' ? d.log : function () {
        try { console.warn.apply(console, ['[AssetManagement][noteLink]'].concat([].slice.call(arguments))); } catch (e) {}
    };
    const debounceMs = Number.isFinite(d.debounceMs) && d.debounceMs >= 0 ? d.debounceMs : NOTE_LINK_DEBOUNCE_MS;

    const state = { timer: null, syncing: false, creating: false, disposed: false, lastSyncAt: null, lastError: null };
    let assetBlockMap = new Map();
    let assetBlockMapDocId = null;
    let assetBlockMapReady = false;
    let assetBlockMapRevision = 0;

    function safeLog() {
        try { log.apply(null, [].slice.call(arguments)); } catch (e) {}
    }

    function commitAssetBlockMap(nextMap, docId) {
        assetBlockMapRevision += 1;
        assetBlockMap = nextMap instanceof Map ? nextMap : new Map();
        assetBlockMapDocId = normalizeSiYuanId(docId);
        assetBlockMapReady = true;
    }

    function invalidateAssetBlockMap(docId) {
        assetBlockMapRevision += 1;
        assetBlockMap = new Map();
        assetBlockMapDocId = normalizeSiYuanId(docId);
        assetBlockMapReady = false;
    }

    /** owned 实体可在 SQL 前提供同步命中；wishlist 等待属性 SQL 补齐。 */
    function buildOwnedAssetBlockMap(assets, docId) {
        const next = new Map();
        if (docId) {
            (Array.isArray(assets) ? assets : []).forEach(asset => {
                if (!asset || !asset.id || asset.status === ASSET_STATUS.WISHLIST) return;
                const blockId = normalizeSiYuanId(asset.indexBlockId);
                if (blockId) next.set(blockId, String(asset.id));
            });
        }
        return next;
    }

    function seedOwnedAssetBlockMap() {
        const settings = getSettings() || {};
        const docId = settings.indexEnabled === true ? normalizeSiYuanId(settings.indexDocId) : null;
        const assets = Array.isArray(getAssets()) ? getAssets() : [];
        const next = buildOwnedAssetBlockMap(assets, docId);
        commitAssetBlockMap(next, docId);
    }

    /** CRUD 调度时同步剔除已删除资产，防抖窗口内也不保留旧点击映射。 */
    function pruneAssetBlockMap() {
        const settings = getSettings() || {};
        const docId = settings.indexEnabled === true ? normalizeSiYuanId(settings.indexDocId) : null;
        if (!docId || docId !== assetBlockMapDocId) {
            invalidateAssetBlockMap(docId);
            return;
        }
        // 每次 CRUD 调度都让在途刷新失效，避免它提交 mutation 前取得的 SQL/owned 快照。
        assetBlockMapRevision += 1;
        if (!assetBlockMapReady) return;
        const ids = new Set((Array.isArray(getAssets()) ? getAssets() : [])
            .filter(asset => asset && asset.id).map(asset => String(asset.id)));
        const next = new Map();
        assetBlockMap.forEach((assetId, blockId) => {
            if (ids.has(assetId)) next.set(blockId, assetId);
        });
        if (next.size !== assetBlockMap.size) assetBlockMap = next;
    }

    /** 捕获阶段点击入口只读此同步缓存；未建立、跨文档或 miss 一律返回 null。 */
    function getAssetIdByIndexBlockId(blockId) {
        const id = normalizeSiYuanId(blockId);
        if (!id || state.disposed || !assetBlockMapReady) return null;
        const settings = getSettings() || {};
        const docId = settings.indexEnabled === true ? normalizeSiYuanId(settings.indexDocId) : null;
        if (docId !== assetBlockMapDocId) {
            invalidateAssetBlockMap(docId);
            return null;
        }
        if (!docId) return null;
        const assetId = assetBlockMap.get(id);
        return assetId == null ? null : String(assetId);
    }

    /**
     * 用当前索引文档内 custom-asset-id 属性一次性刷新完整映射。先在局部 Map
     * seed owned，再以 SQL 属性补齐/覆盖当前真值；只有最新 revision 可原子提交。
     * pending 与失败期间继续保留上次完整快照。
     */
    async function refreshAssetBlockMap() {
        const settings = getSettings() || {};
        const docId = settings.indexEnabled === true ? normalizeSiYuanId(settings.indexDocId) : null;
        const revision = ++assetBlockMapRevision;
        const assets = Array.isArray(getAssets()) ? getAssets() : [];
        const assetIds = new Set(assets.filter(asset => asset && asset.id).map(asset => String(asset.id)));
        const next = buildOwnedAssetBlockMap(assets, docId);
        if (!docId) {
            if (revision !== assetBlockMapRevision) {
                return { ok: false, skipped: 'stale', docId: null, count: 0 };
            }
            commitAssetBlockMap(new Map(), null);
            return { ok: true, docId: null, count: 0 };
        }

        const rows = await sqlQuery('SELECT a.block_id, a.value, a.root_id, b.root_id AS block_root_id '
            + 'FROM attributes a JOIN blocks b ON b.id = a.block_id WHERE a.name = '
            + quoteSqlString(NOTE_LINK_ASSET_ATTR) + ' AND a.root_id = ' + quoteSqlString(docId)
            + ' AND b.root_id = ' + quoteSqlString(docId));
        const sqlEntries = [];
        const sqlAssetIds = new Set();
        rows.forEach(row => {
            const blockId = normalizeSiYuanId(row && row.block_id);
            const assetId = String((row && row.value) || '');
            const attrRootId = normalizeSiYuanId(row && row.root_id);
            const blockRootId = normalizeSiYuanId(row && row.block_root_id);
            if (blockId && assetIds.has(assetId) && attrRootId === docId && blockRootId === docId) {
                sqlEntries.push([blockId, assetId]);
                sqlAssetIds.add(assetId);
            }
        });
        // SQL 属性是当前文档真值；若 owned seed 指向旧块，先按 assetId 移除再补入。
        if (sqlAssetIds.size > 0) {
            Array.from(next.entries()).forEach(entry => {
                if (sqlAssetIds.has(entry[1])) next.delete(entry[0]);
            });
        }
        sqlEntries.forEach(entry => next.set(entry[0], entry[1]));

        if (revision !== assetBlockMapRevision) {
            return { ok: false, skipped: 'stale', docId: docId, count: 0 };
        }
        const currentSettings = getSettings() || {};
        const currentDocId = currentSettings.indexEnabled === true
            ? normalizeSiYuanId(currentSettings.indexDocId) : null;
        if (currentDocId !== docId) {
            // 只有本轮仍为最新时才推进 token；不要误伤已启动的新文档刷新。
            assetBlockMapRevision += 1;
            return { ok: false, skipped: 'stale', docId: docId, count: 0 };
        }
        const currentAssets = Array.isArray(getAssets()) ? getAssets() : [];
        const currentAssetIds = new Set(currentAssets
            .filter(asset => asset && asset.id).map(asset => String(asset.id)));
        const filtered = new Map();
        next.forEach((assetId, blockId) => {
            if (currentAssetIds.has(assetId)) filtered.set(blockId, assetId);
        });
        commitAssetBlockMap(filtered, docId);
        return { ok: true, docId: docId, count: filtered.size };
    }

    seedOwnedAssetBlockMap();

    async function callApi(path, body) {
        if (typeof fetcher !== 'function') throw new Error('fetcher is unavailable');
        let response;
        try {
            response = await fetcher(path, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
            });
        } catch (cause) {
            const error = new Error((cause && cause.message) || 'SiYuan API network request failed');
            error.kind = 'network';
            throw error;
        }
        if (!response || !response.ok) {
            const error = new Error('SiYuan API HTTP ' + ((response && response.status) || 0));
            error.kind = 'http';
            error.httpStatus = (response && response.status) || 0;
            throw error;
        }
        let payload;
        try { payload = await response.json(); } catch (cause) {
            const error = new Error('SiYuan API returned invalid JSON');
            error.kind = 'response';
            throw error;
        }
        if (!payload || payload.code !== 0) {
            const error = new Error((payload && payload.msg) || 'SiYuan API request failed');
            error.kind = 'api';
            error.apiCode = payload && payload.code;
            error.apiMessage = String((payload && payload.msg) || '');
            throw error;
        }
        return payload.data;
    }

    async function sqlQuery(stmt) {
        const data = await callApi('/api/query/sql', { stmt: stmt });
        if (!Array.isArray(data)) {
            const error = new Error('SiYuan SQL API returned an invalid response');
            error.kind = 'response';
            throw error;
        }
        return data;
    }

    function quoteIdList(ids) {
        // ids 已全部通过 normalizeSiYuanId 校验（仅数字/小写字母/连字符），可安全内插 SQL。
        return ids.map(id => "'" + id + "'").join(',');
    }

    function ownershipAttrs() {
        const attrs = {};
        attrs[NOTE_LINK_INDEX_OWNER_ATTR] = NOTE_LINK_INDEX_OWNER;
        attrs[NOTE_LINK_INDEX_VERSION_ATTR] = NOTE_LINK_INDEX_VERSION;
        return attrs;
    }

    /** 仅在当前索引文档内批量验存块 ID。空输入返回空 Set（不发请求）。 */
    async function queryLiveBlockIds(ids, docId) {
        const rootId = normalizeSiYuanId(docId);
        if (!rootId) throw new Error('invalid index document id for block lookup');
        const unique = Array.from(new Set((Array.isArray(ids) ? ids : [])
            .map(normalizeSiYuanId).filter(Boolean)));
        const live = new Set();
        for (let start = 0; start < unique.length; start += NOTE_LINK_SQL_CHUNK) {
            const chunk = unique.slice(start, start + NOTE_LINK_SQL_CHUNK);
            const rows = await sqlQuery('SELECT id FROM blocks WHERE root_id = ' + quoteSqlString(rootId)
                + ' AND id IN (' + quoteIdList(chunk) + ')');
            rows.forEach(row => { if (row && row.id) live.add(String(row.id)); });
        }
        return live;
    }

    /** 索引文档内全部 custom-asset-id / custom-am-hash 属性行（一次 SQL）。 */
    async function queryDocAttributes(docId) {
        const rows = await sqlQuery('SELECT block_id, name, value FROM attributes WHERE root_id = \''
            + docId + '\' AND name IN (\'' + NOTE_LINK_ASSET_ATTR + '\', \'' + NOTE_LINK_HASH_ATTR + '\')');
        return rows.filter(row => row && row.block_id);
    }

    /**
     * 块/文档探测：'live' | 'missing' | 'unknown'。
     * 网络/HTTP/索引中(code 3) 一律 'unknown'——不得把瞬时故障当成误删而重建文档。
     */
    async function probeBlock(id) {
        const blockId = normalizeSiYuanId(id);
        if (!blockId) return 'missing';
        try {
            const data = await callApi('/api/block/getBlockInfo', { id: blockId });
            return data && typeof data === 'object' ? 'live' : 'missing';
        } catch (error) {
            if (error && error.kind === 'api') {
                return error.apiCode === 3 ? 'unknown' : 'missing';
            }
            return 'unknown';
        }
    }

    async function readNotebooks() {
        const data = await callApi('/api/notebook/lsNotebooks', {});
        if (!data || typeof data !== 'object' || !Array.isArray(data.notebooks)) {
            const error = new Error('SiYuan notebook list returned an invalid response');
            error.kind = 'response';
            throw error;
        }
        const notebooks = data.notebooks;
        return notebooks.filter(notebook => notebook && notebook.id).map(notebook => ({
            id: String(notebook.id),
            name: String(notebook.name || ''),
            closed: notebook.closed === true ? true : (notebook.closed === false ? false : null),
        }));
    }

    function findNotebook(notebooks, notebookId) {
        const id = String(notebookId || '');
        return (Array.isArray(notebooks) ? notebooks : []).find(notebook => notebook.id === id) || null;
    }

    function validateDocumentRootInfo(docId, info) {
        const id = normalizeSiYuanId(docId);
        if (!id || !info || typeof info !== 'object' || normalizeSiYuanId(info.rootID) !== id) {
            const error = new Error('configured indexDocId is not a document root block');
            error.kind = 'validation';
            throw error;
        }
        return info;
    }

    async function ensureDocumentOwnership(docId, knownInfo) {
        const id = normalizeSiYuanId(docId);
        if (!id) throw new Error('invalid index document id');
        const info = knownInfo || await callApi('/api/block/getBlockInfo', { id: id });
        validateDocumentRootInfo(id, info);
        const attrs = await callApi('/api/attr/getBlockAttrs', { id: id });
        if (attrs && attrs[NOTE_LINK_INDEX_OWNER_ATTR] === NOTE_LINK_INDEX_OWNER
            && String(attrs[NOTE_LINK_INDEX_VERSION_ATTR] || '') === NOTE_LINK_INDEX_VERSION) {
            return false;
        }
        await callApi('/api/attr/setBlockAttrs', { id: id, attrs: ownershipAttrs() });
        return true;
    }

    async function queryBlockRecord(blockId) {
        const id = normalizeSiYuanId(blockId);
        if (!id) return null;
        const rows = await sqlQuery('SELECT id, type, root_id, box FROM blocks WHERE id = '
            + quoteSqlString(id) + ' LIMIT 1');
        return rows.length > 0 ? rows[0] : null;
    }

    async function checkBlockExist(blockId) {
        const id = normalizeSiYuanId(blockId);
        if (!id) throw new Error('invalid block id for block-tree lookup');
        const exists = await callApi('/api/block/checkBlockExist', { id: id });
        if (typeof exists !== 'boolean') {
            const error = new Error('SiYuan block existence check returned an invalid response');
            error.kind = 'response';
            throw error;
        }
        return exists;
    }

    function inspectionError(snapshot, error) {
        const message = String((error && error.message) || error);
        return Object.assign(snapshot, { state: 'error', lastError: message, error: message });
    }

    function inspectionBase(docId, settings) {
        const configuredNotebookId = normalizeSiYuanId(settings && settings.indexNotebookId);
        return {
            state: docId ? 'error' : 'unconfigured',
            docId: docId || null,
            notebookId: configuredNotebookId || null,
            box: configuredNotebookId || null,
            hPath: null,
            title: null,
            notebookName: '',
            lastSyncAt: state.lastSyncAt,
            lastError: state.lastError,
        };
    }

    /** 按 indexDocId 动态解析文档当前位置；旧文档在确认存活后补所有权属性。 */
    async function inspectIndexDocument() {
        const settings = getSettings() || {};
        const docId = normalizeSiYuanId(settings.indexDocId);
        const snapshot = inspectionBase(docId, settings);
        if (!docId) return snapshot;

        let info;
        try {
            info = await callApi('/api/block/getBlockInfo', { id: docId });
        } catch (error) {
            if (error && error.kind === 'api'
                && (error.apiCode === -1 || error.apiCode === 3)) {
                const evidence = await Promise.allSettled([
                    queryBlockRecord(docId),
                    readNotebooks(),
                    checkBlockExist(docId),
                ]);
                if (evidence[0].status !== 'fulfilled') {
                    return inspectionError(snapshot, evidence[0].reason);
                }
                if (evidence[1].status !== 'fulfilled') {
                    return inspectionError(snapshot, evidence[1].reason);
                }

                const row = evidence[0].value;
                const notebooks = evidence[1].value;
                let actualNotebook = null;
                if (row) {
                    const rowId = normalizeSiYuanId(row.id);
                    const rowRootId = normalizeSiYuanId(row.root_id);
                    const rowBox = normalizeSiYuanId(row.box);
                    if (rowId !== docId || String(row.type || '') !== 'd' || rowRootId !== docId || !rowBox) {
                        return inspectionError(snapshot, new Error('configured indexDocId is not a document root block'));
                    }
                    actualNotebook = findNotebook(notebooks, rowBox);
                    if (actualNotebook && actualNotebook.closed === true) {
                        return Object.assign(snapshot, {
                            state: 'closed', notebookId: actualNotebook.id, box: actualNotebook.id,
                            notebookName: actualNotebook.name,
                        });
                    }
                }

                if (evidence[2].status !== 'fulfilled') {
                    return inspectionError(snapshot, evidence[2].reason);
                }
                if (evidence[2].value === true) {
                    return inspectionError(snapshot, error);
                }

                const storedNotebook = findNotebook(notebooks, settings.indexNotebookId);
                const openNotebook = actualNotebook && actualNotebook.closed === false
                    ? actualNotebook
                    : (storedNotebook && storedNotebook.closed === false ? storedNotebook : null);
                if (openNotebook) {
                    return Object.assign(snapshot, {
                        state: 'missing', notebookId: openNotebook.id, box: openNotebook.id,
                        notebookName: openNotebook.name,
                    });
                }
                return inspectionError(snapshot, new Error('index document notebook availability could not be verified'));
            }
            return inspectionError(snapshot, error);
        }

        try {
            validateDocumentRootInfo(docId, info);
            const box = normalizeSiYuanId(info && info.box)
                || normalizeSiYuanId(settings.indexNotebookId);
            const notebooks = await readNotebooks();
            const notebook = findNotebook(notebooks, box);
            if (notebook && notebook.closed === true) {
                return Object.assign(snapshot, {
                    state: 'closed', notebookId: box, box: box, notebookName: notebook.name,
                });
            }
            if (!notebook || notebook.closed !== false) {
                throw new Error('index document notebook availability could not be verified');
            }
            const hPathData = await callApi('/api/filetree/getHPathByID', { id: docId });
            const hPath = typeof hPathData === 'string' ? hPathData : '';
            await ensureDocumentOwnership(docId, info);
            if (box && box !== String(settings.indexNotebookId || '')) {
                try { await saveSettings({ indexNotebookId: box }); }
                catch (error) { safeLog('[note-link] cache moved notebook failed:', error && error.message); }
            }
            return Object.assign(snapshot, {
                state: 'ready', notebookId: box || null, box: box || null,
                hPath: hPath || null,
                title: String((info && info.rootTitle) || (hPath ? hPath.split('/').pop() : '') || ''),
                notebookName: notebook ? notebook.name : '',
            });
        } catch (error) {
            return inspectionError(snapshot, error);
        }
    }

    async function queryOwnedIndexDocuments(notebookId) {
        const rows = await sqlQuery('SELECT DISTINCT a.root_id AS id FROM attributes a '
            + 'JOIN blocks b ON b.id = a.root_id WHERE a.name = ' + quoteSqlString(NOTE_LINK_INDEX_OWNER_ATTR)
            + ' AND a.value = ' + quoteSqlString(NOTE_LINK_INDEX_OWNER)
            + ' AND b.box = ' + quoteSqlString(notebookId));
        return Array.from(new Set(rows.map(row => normalizeSiYuanId(row && (row.id || row.root_id))).filter(Boolean)));
    }

    async function queryFixedPathDocuments(notebookId) {
        const rows = await sqlQuery('SELECT id FROM blocks WHERE box = ' + quoteSqlString(notebookId)
            + ' AND hpath = ' + quoteSqlString(NOTE_LINK_INDEX_DOC_PATH) + " AND type = 'd'");
        return Array.from(new Set(rows.map(row => normalizeSiYuanId(row && row.id)).filter(Boolean)));
    }

    async function persistIndexDocument(docId, notebookId) {
        const saved = await saveSettings({
            indexDocId: docId,
            indexNotebookId: notebookId,
            indexDocPath: NOTE_LINK_INDEX_DOC_PATH,
            indexEnabled: true,
            indexAutoSync: true,
        });
        if (saved === false) throw new Error('failed to persist index document settings');
    }

    function snapshotIndexSettings(settings) {
        const source = settings || {};
        return {
            indexEnabled: source.indexEnabled,
            indexNotebookId: source.indexNotebookId,
            indexDocPath: source.indexDocPath,
            indexDocId: source.indexDocId,
            indexAutoSync: source.indexAutoSync,
            indexIncludeCover: source.indexIncludeCover,
        };
    }

    async function restoreIndexSettings(snapshot) {
        const saved = await saveSettings(snapshot);
        if (saved === false) throw new Error('failed to restore previous index document settings');
    }

    async function removeCreatedDocument(docId) {
        await callApi('/api/filetree/removeDocByID', { id: docId });
    }

    /** 用户显式创建入口：先接管唯一 owner 文档，再检查固定路径冲突，最后才新建。 */
    async function createIndexDocument(notebookId) {
        if (state.disposed) return { ok: false, state: 'error', reason: 'disposed', error: 'engine is disposed' };
        if (state.creating || state.syncing) return { ok: false, state: 'error', reason: 'reentrant', error: 'index operation is already running' };
        state.creating = true;
        cancelScheduled();
        let docId = null;
        let created = false;
        let adopted = false;
        let settingsPersisted = false;
        const previousSettings = snapshotIndexSettings(getSettings() || {});
        try {
            const current = await inspectIndexDocument();
            if (current.state === 'ready') {
                try { await refreshAssetBlockMap(); }
                catch (error) { safeLog('[note-link] refresh existing index block map failed:', error && error.message); }
                return {
                    ok: true, state: 'ready', reason: 'already-ready', alreadyReady: true,
                    docId: current.docId, created: false, adopted: false,
                };
            }
            if (current.state !== 'missing' && current.state !== 'unconfigured') {
                return {
                    ok: false, state: current.state, reason: 'invalid-state',
                    error: current.error || current.lastError || 'index document cannot be created in the current state',
                };
            }

            const targetNotebookId = normalizeSiYuanId(notebookId);
            if (!targetNotebookId) return { ok: false, state: 'error', reason: 'invalid-notebook', error: 'invalid notebook id' };
            const notebooks = await readNotebooks();
            const notebook = findNotebook(notebooks, targetNotebookId);
            if (!notebook || notebook.closed !== false) {
                return { ok: false, state: 'closed', reason: 'closed', error: 'index notebook is closed or missing' };
            }

            const owned = await queryOwnedIndexDocuments(targetNotebookId);
            if (owned.length > 1) {
                return { ok: false, state: 'error', reason: 'owner-conflict', error: 'multiple owned index documents found' };
            }

            docId = owned.length === 1 ? owned[0] : null;
            adopted = !!docId;
            if (!docId) {
                const conflicts = await queryFixedPathDocuments(targetNotebookId);
                if (conflicts.length > 0) {
                    return { ok: false, state: 'error', reason: 'name-conflict', error: 'index document name is already in use' };
                }
                const data = await callApi('/api/filetree/createDocWithMd', {
                    notebook: targetNotebookId, path: NOTE_LINK_INDEX_DOC_PATH, markdown: '',
                });
                docId = normalizeSiYuanId(typeof data === 'string' ? data : (data && data.id));
                if (!docId) throw new Error('createDocWithMd returned no document id');
                created = true;
            }

            try {
                await persistIndexDocument(docId, targetNotebookId);
                settingsPersisted = true;
            } catch (error) {
                let cleanupError = null;
                let restoreError = null;
                if (created) {
                    try { await removeCreatedDocument(docId); }
                    catch (cause) { cleanupError = cause; safeLog('[note-link] cleanup created document failed:', cause && cause.message); }
                }
                try { await restoreIndexSettings(previousSettings); }
                catch (cause) { restoreError = cause; safeLog('[note-link] restore previous settings failed:', cause && cause.message); }
                const message = String((error && error.message) || error);
                state.lastError = message;
                return {
                    ok: false, state: 'error', reason: 'settings-save-failed', error: message,
                    docId: docId, created: created, adopted: adopted,
                    cleanupFailed: !!cleanupError, restoreFailed: !!restoreError,
                };
            }

            try {
                await ensureDocumentOwnership(docId);
            } catch (error) {
                const message = String((error && error.message) || error);
                state.lastError = message;
                safeLog('[note-link] index document owner marker pending:', message);
                return {
                    ok: false, state: 'error', reason: 'marker-pending', markerPending: true,
                    error: message, docId: docId, created: created, adopted: adopted,
                };
            }
            state.creating = false;
            const synced = await syncNow({ manual: true });
            return Object.assign({}, synced, { docId: docId, created: created, adopted: adopted });
        } catch (error) {
            const message = String((error && error.message) || error);
            state.lastError = message;
            safeLog('[note-link] create index document failed:', message);
            return {
                ok: false, state: 'error', reason: settingsPersisted ? 'create-post-save-failed' : 'create-failed',
                error: message, docId: docId, created: created, adopted: adopted,
            };
        } finally {
            state.creating = false;
        }
    }

    /** missing/unconfigured 状态下的显式重建入口；成功前保留旧 indexDocId。 */
    async function recreateIndexDocument(notebookId) {
        const inspected = await inspectIndexDocument();
        if (inspected.state !== 'missing' && inspected.state !== 'unconfigured') {
            return {
                ok: false, state: inspected.state, reason: 'invalid-state',
                error: 'index document can only be recreated when missing or unconfigured',
            };
        }
        return createIndexDocument(notebookId);
    }

    /**
     * 文档头提示块维护（幂等 + 存量去重）。
     *
     * 内核事实（siyuan-master 源码核实）：/api/block/updateBlock 用新 markdown 整块
     * 替换——block_op.go 仅复位新块 id，model.doUpdate 中 oldNode.Unlink 丢弃旧块
     * 全部 IAL——即 custom-* 属性会被剥离。因此 update 分支必须立即重打
     * custom-am-header，否则下一轮定位失败 → 重复 prepend（v2.5.0 线上 bug）。
     *
     * 定位 = 属性打标块（确认）∪ 内容特征块（quote 块且含「最后同步」标签，
     * 捞回历史 bug 遗留的失属性重复段）；多段时保留一段（属性优先），其余
     * deleteBlock。资产块为段落块（type='p'），内容扫描不会误伤。
     */
    async function ensureHeaderBlock(docId, timeText) {
        const markdown = renderHeaderMarkdown(t, timeText);
        const headerAttr = {};
        headerAttr[NOTE_LINK_HEADER_ATTR] = NOTE_LINK_HEADER_ATTR_VALUE;

        // 定位源 1：custom-am-header 属性（确认的 header）。
        const attrRows = await sqlQuery('SELECT block_id FROM attributes WHERE name = \''
            + NOTE_LINK_HEADER_ATTR + '\' AND root_id = \'' + docId + '\'');
        const confirmed = [];
        for (let i = 0; i < attrRows.length; i++) {
            const headerId = normalizeSiYuanId(attrRows[i] && attrRows[i].block_id);
            if (headerId && confirmed.indexOf(headerId) < 0
                && await probeBlock(headerId) === 'live') {
                confirmed.push(headerId);
            }
        }

        // 定位源 2：内容特征匹配（无属性的历史遗留重复段）。
        const suspected = [];
        const label = String(t('noteIndexLastSync', '最后同步') || '').replace(/['%_\\]/g, '');
        if (label) {
            try {
                const contentRows = await sqlQuery('SELECT block_id FROM blocks WHERE root_id = \''
                    + docId + '\' AND type = \'b\' AND content LIKE \'%' + label + '%\'');
                contentRows.forEach(row => {
                    const id = normalizeSiYuanId(row && row.block_id);
                    if (id && confirmed.indexOf(id) < 0 && suspected.indexOf(id) < 0) suspected.push(id);
                });
            } catch (error) {
                safeLog('[note-link] header content scan failed:', error && error.message);
            }
        }

        let keepId = confirmed.length > 0 ? confirmed[0] : null;
        let duplicates = confirmed.slice(1).concat(suspected);
        if (!keepId && suspected.length > 0) {
            // 无属性块中保留最新（思源块 id 前 14 位为时间戳，字典序≈创建时间序）。
            keepId = suspected[0];
            for (let i = 1; i < suspected.length; i++) {
                if (suspected[i] > keepId) keepId = suspected[i];
            }
            duplicates = suspected.filter(id => id !== keepId);
        }

        // 存量去重：删除多余段（容忍失败，下一轮 sync 幂等再清）。
        for (let i = 0; i < duplicates.length; i++) {
            try {
                await callApi('/api/block/deleteBlock', { id: duplicates[i] });
            } catch (error) {
                safeLog('[note-link] duplicate header cleanup failed:', error && error.message);
            }
        }

        if (keepId) {
            await callApi('/api/block/updateBlock', { dataType: 'markdown', data: markdown, id: keepId });
            // updateBlock 剥离旧块 IAL —— 必须重打属性，否则下轮定位失败重复 prepend。
            await callApi('/api/attr/setBlockAttrs', { id: keepId, attrs: headerAttr });
            return keepId;
        }

        const data = await callApi('/api/block/prependBlock', { dataType: 'markdown', data: markdown, parentID: docId });
        const newId = blockIdFromAppendResult(data);
        if (!newId) throw new Error('failed to create the index header block');
        await callApi('/api/attr/setBlockAttrs', { id: newId, attrs: headerAttr });
        return newId;
    }

    async function runSync(options) {
        const settings = getSettings() || {};
        if (settings.indexEnabled !== true) {
            commitAssetBlockMap(new Map(), null);
            return { ok: true, skipped: 'disabled' };
        }
        const manual = !!(options && options.manual);
        const force = !!(options && options.force); // rebuildNow：忽略哈希幂等，全部强制 update
        if (!manual && settings.indexAutoSync === false) return { ok: true, skipped: 'autoSyncDisabled' };
        const configuredDocId = normalizeSiYuanId(settings.indexDocId);
        if (!configuredDocId) {
            commitAssetBlockMap(new Map(), null);
            return { ok: true, skipped: 'unconfigured', state: 'unconfigured' };
        }
        invalidateAssetBlockMap(configuredDocId);

        const inspected = await inspectIndexDocument();
        if (inspected.state !== 'ready') {
            const error = inspected.state === 'closed' ? 'index notebook is closed'
                : (inspected.state === 'missing' ? 'index document is missing'
                    : (inspected.error || inspected.lastError || 'index document inspection failed'));
            return { ok: false, state: inspected.state, error: error, docId: configuredDocId };
        }
        const docId = inspected.docId;
        const assets = Array.isArray(getAssets()) ? getAssets() : [];
        const domain = getDomain() || {};
        const today = todayISO();
        const stats = { appended: 0, updated: 0, unchanged: 0, deleted: 0 };

        // 1) 属性索引 + 批量验存（候选 = 实体 indexBlockId ∪ 属性打标块）。
        const attrRows = await queryDocAttributes(docId);
        const taggedBlocks = [];
        const hashByBlock = new Map();
        attrRows.forEach(row => {
            if (row.name === NOTE_LINK_ASSET_ATTR) {
                taggedBlocks.push({ blockId: String(row.block_id), assetId: String(row.value) });
            } else if (row.name === NOTE_LINK_HASH_ATTR) {
                hashByBlock.set(String(row.block_id), String(row.value));
            }
        });
        const candidateIds = assets.map(asset => asset && asset.indexBlockId).filter(Boolean)
            .concat(taggedBlocks.map(entry => entry.blockId));
        const liveBlockIds = await queryLiveBlockIds(candidateIds, docId);

        // wishlist（或回写失败）资产靠属性找回现有块，避免重复 append。
        const attrBlockByAsset = new Map();
        taggedBlocks.forEach(entry => {
            if (liveBlockIds.has(entry.blockId) && !attrBlockByAsset.has(entry.assetId)) {
                attrBlockByAsset.set(entry.assetId, entry.blockId);
            }
        });

        // 2) 全量 diff：缺块 append + 打标 + 回写；哈希漂移才 update（幂等）。
        const currentBlockByAsset = new Map();
        for (let i = 0; i < assets.length; i++) {
            const asset = assets[i];
            if (!asset || !asset.id) continue;
            let markdown;
            try {
                markdown = renderAssetBlockMarkdown(asset, { today: today, domain: domain, t: t });
            } catch (error) {
                safeLog('[note-link] render failed for asset ' + asset.id + ':', error && error.message);
                markdown = renderFallbackBlockMarkdown(asset, t);
            }
            const hash = fnv1aHash(markdown);
            const attrBlockId = attrBlockByAsset.get(asset.id) || null;
            let blockId = attrBlockId || (asset.indexBlockId && liveBlockIds.has(asset.indexBlockId)
                ? asset.indexBlockId : null);
            if (blockId && !liveBlockIds.has(blockId)) blockId = null;

            if (!blockId) {
                const data = await callApi('/api/block/appendBlock', { dataType: 'markdown', data: markdown, parentID: docId });
                const newId = blockIdFromAppendResult(data);
                if (!newId) throw new Error('appendBlock returned no block id for asset ' + asset.id);
                const attrs = {};
                attrs[NOTE_LINK_ASSET_ATTR] = String(asset.id);
                attrs[NOTE_LINK_HASH_ATTR] = hash;
                await callApi('/api/attr/setBlockAttrs', { id: newId, attrs: attrs });
                if (asset.status !== ASSET_STATUS.WISHLIST) {
                    // 回写处于 syncing 态，宿主 CRUD 钩子不会再次触发同步（防递归铁律）。
                    try { await patchAssetIndexBlockId(asset.id, newId); }
                    catch (error) { safeLog('[note-link] patchAssetIndexBlockId failed for ' + asset.id + ':', error && error.message); }
                }
                currentBlockByAsset.set(asset.id, newId);
                liveBlockIds.add(newId);
                stats.appended += 1;
            } else {
                currentBlockByAsset.set(asset.id, blockId);
                if (asset.status !== ASSET_STATUS.WISHLIST && asset.indexBlockId !== blockId) {
                    try { await patchAssetIndexBlockId(asset.id, blockId); }
                    catch (error) { safeLog('[note-link] patchAssetIndexBlockId failed for ' + asset.id + ':', error && error.message); }
                }
                if (force || hashByBlock.get(blockId) !== hash) {
                    await callApi('/api/block/updateBlock', { dataType: 'markdown', data: markdown, id: blockId });
                    // 内核 updateBlock 剥离旧块全部 IAL —— 必须整体重打两个属性：
                    // custom-asset-id 丢失会让 wishlist 块定位/孤儿清理退化（重复 append），
                    // custom-am-hash 丢失会让下一轮误判哈希漂移而反复 update。
                    const attrs = {};
                    attrs[NOTE_LINK_ASSET_ATTR] = String(asset.id);
                    attrs[NOTE_LINK_HASH_ATTR] = hash;
                    await callApi('/api/attr/setBlockAttrs', { id: blockId, attrs: attrs });
                    stats.updated += 1;
                } else {
                    stats.unchanged += 1;
                }
            }
        }

        // 3) 孤儿清理：属性 value 不在资产集合，或块已不属于该资产当前登记块（含重复块）。
        for (let i = 0; i < taggedBlocks.length; i++) {
            const entry = taggedBlocks[i];
            if (!liveBlockIds.has(entry.blockId)) continue;
            if (currentBlockByAsset.get(entry.assetId) === entry.blockId) continue;
            try {
                await callApi('/api/block/deleteBlock', { id: entry.blockId });
                liveBlockIds.delete(entry.blockId);
                stats.deleted += 1;
            } catch (error) {
                safeLog('[note-link] orphan cleanup failed for block ' + entry.blockId + ':', error && error.message);
            }
        }

        // 本轮资产块与孤儿清理均已落地，用 diff 真值原子重建同步点击映射。
        const nextAssetBlockMap = new Map();
        currentBlockByAsset.forEach((blockId, assetId) => {
            const normalizedBlockId = normalizeSiYuanId(blockId);
            if (normalizedBlockId) nextAssetBlockMap.set(normalizedBlockId, String(assetId));
        });
        commitAssetBlockMap(nextAssetBlockMap, docId);

        // 4) 文档头提示块（最后更新，携带本轮同步时间）。
        await ensureHeaderBlock(docId, formatSyncTime(new Date()));

        return { ok: true, state: 'ready', docId: docId, stats: stats };
    }

    /**
     * 立即同步（设置页手动触发与测试入口）。永不抛错：异常一律转成
     * {ok:false, error}，并写日志。手动同步不受 indexAutoSync 限制，
     * 但 indexEnabled=false / 未配置笔记本时静默跳过。
     */
    async function syncNow(options) {
        if (state.disposed) return { ok: false, skipped: 'disposed' };
        if (state.syncing) return { ok: false, skipped: 'reentrant' };
        state.syncing = true;
        try {
            const result = await runSync(options || {});
            if (result && result.ok && !result.skipped) {
                state.lastSyncAt = new Date().toISOString();
                state.lastError = null;
            } else if (result && result.error) {
                state.lastError = String(result.error);
            }
            return result;
        } catch (error) {
            state.lastError = String((error && error.message) || error);
            invalidateAssetBlockMap(normalizeSiYuanId((getSettings() || {}).indexDocId));
            safeLog('[note-link] sync failed:', state.lastError);
            return { ok: false, error: state.lastError };
        } finally {
            state.syncing = false;
        }
    }

    /**
     * 防抖调度（CRUD 钩子入口）。2 秒内合并；总开关/自动同步关闭时直接 no-op。
     * 内部所有异常 catch + log，绝不向外抛。
     */
    function scheduleSync() {
        try {
            pruneAssetBlockMap();
            if (state.disposed || state.syncing || state.creating || state.timer) return;
            const settings = getSettings() || {};
            if (settings.indexEnabled !== true || settings.indexAutoSync === false
                || !normalizeSiYuanId(settings.indexDocId)) return;
            state.timer = setTimeout(function () {
                state.timer = null;
                if (state.disposed) return;
                Promise.resolve()
                    .then(function () { return syncNow(); })
                    .catch(function (error) { safeLog('[note-link] scheduled sync failed:', error && error.message); });
            }, debounceMs);
            if (state.timer && typeof state.timer.unref === 'function') state.timer.unref();
        } catch (error) {
            safeLog('[note-link] scheduleSync failed:', error && error.message);
        }
    }

    /**
     * 强制全量重建（设置页「重建索引」入口）。与 syncNow 同一道 syncing 守卫与
     * 容错管道，唯一差别：忽略 custom-am-hash 幂等——所有已定位块强制 updateBlock
     * 并重写哈希，缺块 append，孤儿删除，文档头刷新。语义上等同「内容未变也重写」，
     * 用于修复手工改动 / 哈希漂移 / 显示异常。返回结构与 syncNow 一致（含 stats）。
     */
    async function rebuildNow() {
        return syncNow({ manual: true, force: true });
    }

    /**
     * 取资产在索引文档里的段落块 id（v2.5.0 阶段4 从 getBlockRefMarkdown 抽出）：
     * - owned 资产：用实体 indexBlockId（为空 → null）；
     * - wishlist 资产：极简 schema 不回写 indexBlockId，改用 custom-asset-id 属性
     *   在索引文档内 SQL 定位（属性随文档删除而清空，文档不存在时自然查不到）；
     * - 索引未启用 / indexDocId 未配置 / 找不到块 → null。
     * SQL 查询失败会抛错，由调用方 catch 后 toast。
     */
    async function getAssetIndexBlockId(asset) {
        const settings = getSettings() || {};
        if (settings.indexEnabled !== true) return null;
        const docId = normalizeSiYuanId(settings.indexDocId);
        if (!docId) return null;
        if (!asset || !/^[0-9a-z-]+$/.test(String(asset.id || ''))) return null;

        if (asset.status !== ASSET_STATUS.WISHLIST) {
            return normalizeSiYuanId(asset.indexBlockId);
        }
        const rows = await sqlQuery('SELECT block_id FROM attributes WHERE name = \'' + NOTE_LINK_ASSET_ATTR
            + '\' AND value = \'' + String(asset.id) + '\' AND root_id = \'' + docId + '\'');
        for (let i = 0; i < rows.length; i++) {
            const candidate = normalizeSiYuanId(rows[i] && rows[i].block_id);
            if (candidate) return candidate;
        }
        return null;
    }

    /**
     * 生成资产索引块的块引用 markdown：((blockId "资产名"))。
     * 块定位逻辑见 getAssetIndexBlockId；资产名中的双引号转义为 \"，
     * 避免破坏块引锚文本语法。
     */
    async function getBlockRefMarkdown(asset) {
        const blockId = await getAssetIndexBlockId(asset);
        if (!blockId) return null;
        const anchor = String(asset.name == null ? '' : asset.name)
            .replace(/[\r\n]+/g, ' ')
            .replace(/"/g, '\\"')
            .trim();
        return '((' + blockId + ' "' + anchor + '"))';
    }

    /**
     * v2.5.0 阶段4 —— 资产 → 笔记方向反链聚合（详情卡「相关笔记」区数据源）。
     * 合并三源并按 blockId 去重（ref → tag → manual 优先级递减）：
     *   - ref：块引反链。索引块被笔记 ((id "锚文本")) 引用时 refs 表出现
     *     def_block_id = 索引块 id 的行，blockId 即引用所在块；
     *   - tag：块打标。任意笔记块 custom-asset-id 属性 = assetId（块菜单关联），
     *     双 JOIN blocks 同时取关联块正文与 root 文档标题；
     *   - manual：asset.relatedNotes 手动登记，逐条查活，查不到标 dead:true。
     * 过滤：rootId === indexDocId 的行（索引文档自身）不展示；索引未启用时
     * ref/tag 源依赖索引文档，跳过，仅剩 manual（relatedNotes 不依赖索引）。
     * docTitle 优先级：root 文档块 content → manual 登记时标题 → blockId 前 8 位。
     * 容错：单源 SQL 失败仅记日志跳过，绝不整体抛错。
     */
    async function getRelatedNotes(asset) {
        if (!asset || !/^[0-9a-z-]+$/.test(String(asset.id || ''))) return [];
        const settings = getSettings() || {};
        const indexDocId = normalizeSiYuanId(settings.indexDocId);
        const indexOn = settings.indexEnabled === true && !!indexDocId;
        const seen = new Set();
        const entries = [];
        const titleNeeded = new Set();

        function push(source, blockId, rootId, preview, fallbackTitle, extra) {
            if (!blockId || seen.has(blockId)) return;
            if (indexDocId && rootId === indexDocId) return;
            seen.add(blockId);
            entries.push(Object.assign({
                source: source, blockId: blockId, rootId: rootId || blockId,
                preview: preview || '', fallbackTitle: fallbackTitle || '',
            }, extra || {}));
            if (rootId && rootId !== blockId && !fallbackTitle) titleNeeded.add(rootId);
        }

        if (indexOn) {
            try {
                const defBlockId = await getAssetIndexBlockId(asset);
                if (defBlockId) {
                    const rows = await sqlQuery('SELECT block_id, root_id, content FROM refs WHERE def_block_id = \''
                        + defBlockId + '\'');
                    rows.forEach(row => push('ref',
                        normalizeSiYuanId(row && row.block_id),
                        normalizeSiYuanId(row && row.root_id),
                        String((row && row.content) || '')));
                }
            } catch (error) {
                safeLog('[note-link] getRelatedNotes ref source failed:', error && error.message);
            }
            try {
                const tagRows = await sqlQuery('SELECT a.block_id, a.root_id, tagged.content AS content, root.content AS root_content FROM attributes a '
                    + 'LEFT JOIN blocks tagged ON a.block_id = tagged.id LEFT JOIN blocks root ON a.root_id = root.id WHERE a.name = \'' + NOTE_LINK_ASSET_ATTR
                    + '\' AND a.value = \'' + String(asset.id) + '\'');
                tagRows.forEach(row => push('tag',
                    normalizeSiYuanId(row && row.block_id),
                    normalizeSiYuanId(row && row.root_id),
                    String((row && row.content) || ''), String((row && row.root_content) || '')));
            } catch (error) {
                safeLog('[note-link] getRelatedNotes tag source failed:', error && error.message);
            }
        }

        const related = Array.isArray(asset.relatedNotes) ? asset.relatedNotes : [];
        const manualIds = related.map(item => normalizeSiYuanId(item && item.id)).filter(Boolean);
        const liveMap = new Map();
        if (manualIds.length) {
            try {
                for (let start = 0; start < manualIds.length; start += NOTE_LINK_SQL_CHUNK) {
                    const rows = await sqlQuery('SELECT id, root_id, content FROM blocks WHERE id IN ('
                        + quoteIdList(manualIds.slice(start, start + NOTE_LINK_SQL_CHUNK)) + ')');
                    rows.forEach(row => {
                        if (row && row.id) liveMap.set(String(row.id), row);
                    });
                }
            } catch (error) {
                safeLog('[note-link] getRelatedNotes manual source failed:', error && error.message);
            }
        }
        related.forEach(item => {
            const id = normalizeSiYuanId(item && item.id);
            if (!id || seen.has(id)) return;
            const title = String((item && item.title) || '');
            const live = liveMap.get(id);
            if (live) {
                push('manual', id, normalizeSiYuanId(live.root_id) || id, String(live.content || ''), title);
            } else {
                if (indexDocId && id === indexDocId) return;
                seen.add(id);
                entries.push({
                    source: 'manual', blockId: id, rootId: id,
                    preview: '', fallbackTitle: title, dead: true,
                });
            }
        });

        const titleMap = new Map();
        if (titleNeeded.size) {
            const titleIds = Array.from(titleNeeded);
            try {
                for (let start = 0; start < titleIds.length; start += NOTE_LINK_SQL_CHUNK) {
                    const rows = await sqlQuery('SELECT id, content FROM blocks WHERE id IN ('
                        + quoteIdList(titleIds.slice(start, start + NOTE_LINK_SQL_CHUNK)) + ')');
                    rows.forEach(row => {
                        if (row && row.id) titleMap.set(String(row.id), String(row.content || ''));
                    });
                }
            } catch (error) {
                safeLog('[note-link] getRelatedNotes title lookup failed:', error && error.message);
            }
        }

        return entries.map(entry => {
            const record = {
                source: entry.source, blockId: entry.blockId, rootId: entry.rootId,
                // manual is an asset -> note association; ref/tag are note -> asset.
                direction: entry.source === 'manual' ? 'references' : 'referencedBy',
                docTitle: (titleMap.get(entry.rootId) || '') || entry.fallbackTitle
                    || entry.blockId.slice(0, 8),
                preview: entry.preview,
            };
            if (entry.dead) record.dead = true;
            return record;
        });
    }

    /**
     * 块菜单「关联到资产」：给笔记块写 custom-asset-id 属性。
     * id 先过 normalizeSiYuanId / asset id 白名单正则再内插，SQL/attr 载荷安全。
     */
    async function linkBlockToAsset(blockId, assetId) {
        const id = normalizeSiYuanId(blockId);
        if (!id) throw new Error('invalid block id');
        const assetKey = String(assetId == null ? '' : assetId);
        if (!/^[0-9a-z-]+$/.test(assetKey)) throw new Error('invalid asset id');
        await callApi('/api/attr/setBlockAttrs', { id: id, attrs: { [NOTE_LINK_ASSET_ATTR]: assetKey } });
        return true;
    }

    /** 块菜单「取消关联」：attrs 值 null 表示删除属性（内核语义）。 */
    async function unlinkBlockFromAsset(blockId) {
        const id = normalizeSiYuanId(blockId);
        if (!id) throw new Error('invalid block id');
        await callApi('/api/attr/setBlockAttrs', { id: id, attrs: { [NOTE_LINK_ASSET_ATTR]: null } });
        return true;
    }

    /**
     * 读块的 custom-asset-id 属性（块图标菜单判定入口）。
     * 查询失败返回 null（视为未标记，菜单仍可注入关联项），不抛错。
     */
    async function getBlockAssetTag(blockId) {
        const id = normalizeSiYuanId(blockId);
        if (!id) return null;
        try {
            const data = await callApi('/api/attr/getBlockAttrs', { id: id });
            const value = data ? data[NOTE_LINK_ASSET_ATTR] : null;
            return (value == null || value === '') ? null : String(value);
        } catch (error) {
            safeLog('[note-link] getBlockAssetTag failed:', error && error.message);
            return null;
        }
    }

    /** 兼容现有设置页的同步内存快照；动态位置与 ready/closed/missing 请用 inspectIndexDocument。 */
    function getStatus() {
        const settings = getSettings() || {};
        const notebookId = String(settings.indexNotebookId || '').trim();
        const docId = normalizeSiYuanId(settings.indexDocId);
        const assets = Array.isArray(getAssets()) ? getAssets() : [];
        return {
            enabled: settings.indexEnabled === true,
            configured: !!docId,
            docId: docId || null,
            notebookId: normalizeSiYuanId(notebookId),
            assetTotal: assets.filter(asset => asset && asset.id).length,
            lastSyncAt: state.lastSyncAt,
            lastError: state.lastError,
        };
    }

    function cancelScheduled() {
        try { if (state.timer) clearTimeout(state.timer); } catch (e) {}
        state.timer = null;
    }

    function dispose() {
        cancelScheduled();
        state.disposed = true;
        invalidateAssetBlockMap(null);
    }

    /** 设置页笔记本下拉数据（不过滤已关闭笔记本，由 UI 标注）。 */
    async function listNotebooks() {
        return readNotebooks();
    }

    return {
        scheduleSync: scheduleSync,
        syncNow: syncNow,
        inspectIndexDocument: inspectIndexDocument,
        createIndexDocument: createIndexDocument,
        recreateIndexDocument: recreateIndexDocument,
        rebuildNow: rebuildNow,
        getAssetIdByIndexBlockId: getAssetIdByIndexBlockId,
        refreshAssetBlockMap: refreshAssetBlockMap,
        getBlockRefMarkdown: getBlockRefMarkdown,
        getAssetIndexBlockId: getAssetIndexBlockId,
        getRelatedNotes: getRelatedNotes,
        linkBlockToAsset: linkBlockToAsset,
        unlinkBlockFromAsset: unlinkBlockFromAsset,
        getBlockAssetTag: getBlockAssetTag,
        getStatus: getStatus,
        cancelScheduled: cancelScheduled,
        dispose: dispose,
        listNotebooks: listNotebooks,
        isSyncing: function () { return state.syncing; },
        getState: function () {
            return { syncing: state.syncing, creating: state.creating, lastSyncAt: state.lastSyncAt, lastError: state.lastError };
        },
    };
}

// =====
// 模块导出
// =====
module.exports = {
    NOTE_LINK_ASSET_ATTR: NOTE_LINK_ASSET_ATTR,
    NOTE_LINK_HASH_ATTR: NOTE_LINK_HASH_ATTR,
    NOTE_LINK_HEADER_ATTR: NOTE_LINK_HEADER_ATTR,
    NOTE_LINK_INDEX_OWNER_ATTR: NOTE_LINK_INDEX_OWNER_ATTR,
    NOTE_LINK_INDEX_VERSION_ATTR: NOTE_LINK_INDEX_VERSION_ATTR,
    NOTE_LINK_INDEX_OWNER: NOTE_LINK_INDEX_OWNER,
    NOTE_LINK_INDEX_VERSION: NOTE_LINK_INDEX_VERSION,
    NOTE_LINK_INDEX_DOC_TITLE: NOTE_LINK_INDEX_DOC_TITLE,
    NOTE_LINK_INDEX_DOC_PATH: NOTE_LINK_INDEX_DOC_PATH,
    NOTE_LINK_DEBOUNCE_MS: NOTE_LINK_DEBOUNCE_MS,
    createNoteLinkEngine: createNoteLinkEngine,
    renderAssetBlockMarkdown: renderAssetBlockMarkdown,
    renderHeaderMarkdown: renderHeaderMarkdown,
    renderFallbackBlockMarkdown: renderFallbackBlockMarkdown,
    blockIdFromAppendResult: blockIdFromAppendResult,
    normalizeSiYuanId: normalizeSiYuanId,
    quoteSqlString: quoteSqlString,
    escapeBlockText: escapeBlockText,
    sanitizeTagLabel: sanitizeTagLabel,
    fnv1aHash: fnv1aHash,
    formatSyncTime: formatSyncTime,
};
