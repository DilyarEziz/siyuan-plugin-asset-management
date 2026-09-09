/* eslint-disable no-undef */
/**
 * SiYuan 资产管理插件 v2.6.0 — kernel.template.js（内核插件模板，不带 api IIFE）
 *
 * 通过 scripts/concat.js 把 6 个 api 模块 IIFE（algorithms / utils / media / assets /
 * report / agent-actions）+ 2 行别名注入到下方占位符，生成单文件 kernel.js。
 *
 * 运行环境：思源 3.8.0+ 内核插件 Goja 沙箱。
 *   - 全局对象 `siyuan`（storage / agent / plugin.lifecycle），不能 require，无 DOM，无 console 保障
 *   - `siyuan.storage.get(path)` 返回 Response 风格对象（用 .text() 取字符串）；
 *     `siyuan.storage.put(path, jsonString)` 整文件覆盖写
 *   - 存储目录与前端插件共享：data/storage/petal/siyuan-plugin-asset-management/<path>
 *
 * 职责（v2.6.0 内核 Agent 工具；v2.6.4 适配思源 3.8.3）：
 *   - onload 时注册 9 个资产工具。注册通道按运行时探测自动选择：
 *     siyuan.mcp.registerTool / unregisterTool 仅思源 3.8.1 提供，3.8.2 起内核已移除
 *     （3.8.3 源码 kernel 包零命中）；siyuan.agent.registerCapability 在 3.8.3 保留且
 *     config 字段兼容，因此 3.8.2+ 实际走 registerCapability 分支，3.8.0 同样可用。
 *     （asset_query / asset_create / asset_update / asset_lifecycle / asset_record / asset_price_update / asset_delete / asset_tag_update / asset_tag_create），
 *     最终暴露名 plugin__siyuan-plugin-asset-management__<name>（前缀内核自动加），内置 Agent 与 MCP 均可调用
 *   - 查询类工具实时读 storage 投影（复用 api/agent-actions.js 的脱敏投影）
 *   - v2.6.5 阶段4：asset_query op=tags 同时返回品牌 / 途径目录（dimensions.json）
 *   - 写入类工具经 agent-writes/pending/<requestId>.json 文件桥转发，
 *     由前端插件（index.js 轮询）委托既有业务方法执行后写回 completed/<requestId>.json
 */

(function () {
    'use strict';

    // __AM_API_INJECTION_POINT__

    // ---------- 常量（文件名与 api/storage.js STORAGE_FILES 保持一致） ----------

    var KERNEL_STORAGE_FILES = Object.freeze({
        assets: 'assets.json',
        settings: 'settings.json',
        tags: 'tags.json',
        dimensions: 'dimensions.json',
        maintenance: 'maintenance.json',
        usage: 'usage.json',
        operationLogs: 'operationLogs.json',
        prepaidTransactions: 'prepaidTransactions.json',
        wishlistEvents: 'wishlistEvents.json',
        financialEvents: 'financialEvents.json',
        lifecycleEvents: 'lifecycleEvents.json',
        subscriptionPeriods: 'subscriptionPeriods.json',
    });

    // sidecar 文件 → 域键 / 信封内数组键 的映射（与前端 formal 域快照形状一致）
    var DOMAIN_RECORD_FILES = Object.freeze([
        ['wishlistEvents', KERNEL_STORAGE_FILES.wishlistEvents, 'events'],
        ['operationLogs', KERNEL_STORAGE_FILES.operationLogs, 'logs'],
        ['maintenance', KERNEL_STORAGE_FILES.maintenance, 'records'],
        ['usage', KERNEL_STORAGE_FILES.usage, 'records'],
        ['prepaidTransactions', KERNEL_STORAGE_FILES.prepaidTransactions, 'records'],
        ['financialEvents', KERNEL_STORAGE_FILES.financialEvents, 'events'],
        ['lifecycleEvents', KERNEL_STORAGE_FILES.lifecycleEvents, 'events'],
        ['subscriptionPeriods', KERNEL_STORAGE_FILES.subscriptionPeriods, 'records'],
    ]);

    var WRITE_ROOT = 'agent-writes/';
    var WRITE_PENDING_DIR = WRITE_ROOT + 'pending/';
    var WRITE_PROCESSING_DIR = WRITE_ROOT + 'processing/';
    var WRITE_COMPLETED_DIR = WRITE_ROOT + 'completed/';
    var WRITE_MANIFEST_FILE = WRITE_ROOT + 'pending-manifest.json';
    // 旧文件仅供已在途请求收尾，新请求绝不写入这些共享文件。
    var LEGACY_WRITE_QUEUE_FILE = 'agent-write-queue.json';
    var LEGACY_WRITE_RESULTS_FILE = 'agent-write-results.json';
    var KERNEL_STATUS_FILE = 'agent-kernel-status.json';
    var WRITE_POLL_INTERVAL_MS = 250;
    var WRITE_TIMEOUT_MS = 30 * 1000;
    // v2.6.4：fs-notify 事件驱动唤醒的 watcher 注册超时保护；任何失败仅降级为纯轮询。
    var WRITE_FS_WATCH_TIMEOUT_MS = 3000;

    var WRITE_METHOD_NAMES = Object.freeze([
        'addAsset', 'updateAsset', 'setStatus', 'deleteAsset',
        'retirePhysicalAsset', 'recordPhysicalSaleAsset', 'renewSubscription',
        'toggleSubscriptionAutoRenew', 'addMaintenanceRecord', 'addPrepaidTransaction',
        'recordPrepaidCountAdjustment', 'recordPrepaidConsumption', 'correctPurchaseAmount',
        'correctSubscriptionPaymentAmount', 'updateSubscriptionStartDate', 'updateSubscriptionPeriodEnd',
        'updateAssetTags', 'createAndBindAssetTags',
    ]);

    var state = {
        registeredTools: new Set(),
        registrationApi: null,
        registrationPromise: null,
    };

    // manifest 只由内核追加，使用同一内核实例内的 FIFO 避免追加互相覆盖。
    var writeLane = { tail: Promise.resolve() };

    function enqueueWriteLane(task) {
        var run = writeLane.tail.then(function () { return task(); });
        writeLane.tail = run.then(function () { return undefined; }, function () { return undefined; });
        return run;
    }

    // ---------- storage 读写（仿 task-horizon readJsonState：missing 判定 + put 后读回校验） ----------

    function text(value) {
        return String(value == null ? '' : value).trim();
    }

    function stableJson(value) {
        if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
        if (value && typeof value === 'object') {
            return '{' + Object.keys(value).sort().map(function (key) {
                return JSON.stringify(key) + ':' + stableJson(value[key]);
            }).join(',') + '}';
        }
        return JSON.stringify(value);
    }

    async function readJsonState(path, deadline) {
        var operationDeadline = Number.isFinite(Number(deadline))
            ? Number(deadline) : Date.now() + getWriteTimeoutMs();
        var raw;
        try {
            var response = await withDeadline(
                Promise.resolve().then(function () { return siyuan.storage.get(path); }),
                operationDeadline,
                createWriteTimeoutError()
            );
            raw = await withDeadline(
                Promise.resolve().then(function () { return response.text(); }),
                operationDeadline,
                createWriteTimeoutError()
            );
        } catch (error) {
            if (isWriteTimeout(error)) return { status: 'timeout', value: null, error: error };
            var message = text(error && error.message);
            var missing = /(?:not\s+found|not\s+exist|cannot\s+find|enoent|no\s+such\s+file(?:\s+or\s+directory)?|(?:file|directory)\s+does\s+not\s+exist|找不到|不存在)/i.test(message);
            return { status: missing ? 'missing' : 'unavailable', value: null, error: error };
        }
        if (!text(raw)) return { status: 'corrupt', value: null, error: new Error('empty file: ' + path) };
        try {
            return { status: 'valid', value: JSON.parse(raw), error: null };
        } catch (error) {
            return { status: 'corrupt', value: null, error: error };
        }
    }

    async function readJson(path, fallback, deadline) {
        var record = await readJsonState(path, deadline);
        return record.status === 'valid' ? record.value : fallback;
    }

    async function writeJson(path, value, deadline) {
        var operationDeadline = Number.isFinite(Number(deadline))
            ? Number(deadline) : Date.now() + getWriteTimeoutMs();
        var serialized = JSON.stringify(value, null, 2);
        await withDeadline(
            Promise.resolve().then(function () { return siyuan.storage.put(path, serialized); }),
            operationDeadline,
            createWriteTimeoutError()
        );
        var verified = await readJsonState(path, operationDeadline);
        if (verified.status === 'timeout') throw verified.error || createWriteTimeoutError();
        if (verified.status === 'corrupt') throw queueCorruptError(verified.error);
        if (verified.status !== 'valid') throw queueUnavailableError(verified.error);
        if (stableJson(verified.value) !== stableJson(JSON.parse(serialized))) throw queueCorruptError(new Error('write readback mismatch'));
    }

    // ---------- 设置 / formal 域读取（实时，无缓存） ----------

    async function readAgentSettings() {
        var raw = await readJson(KERNEL_STORAGE_FILES.settings, null);
        return agentActions.normalizeAgentSettings(raw && typeof raw === 'object' ? raw : {});
    }

    function domainUnavailableError(cause) {
        var error = new Error('formal asset data is not fully loaded');
        error.agentCode = 'DOMAIN_UNAVAILABLE';
        error.cause = cause;
        return error;
    }

    function validateCoreDomain(assets, tags) {
        if (!Array.isArray(assets) || !Array.isArray(tags)) {
            throw domainUnavailableError(new Error('core domain arrays are unavailable'));
        }
        for (var index = 0; index < assets.length; index++) {
            var validation = __am_assets.validateFormalV2Asset(assets[index]);
            if (!validation || validation.valid !== true) {
                throw domainUnavailableError(new Error('core asset validation failed'));
            }
        }
        for (var tagIndex = 0; tagIndex < tags.length; tagIndex++) {
            var tag = tags[tagIndex];
            if (!tag || typeof tag !== 'object' || typeof tag.id !== 'string' || typeof tag.label !== 'string') {
                throw domainUnavailableError(new Error('core tag validation failed'));
            }
        }
    }

    async function readWrapperArray(file, envelopeKey, required) {
        var record = await readJsonState(file);
        if (record.status === 'missing') {
            if (required === true) throw domainUnavailableError(new Error('required storage file is missing: ' + file));
            return [];
        }
        if (record.status !== 'valid') throw domainUnavailableError(record.error);
        var wrapper = record.value;
        if (!wrapper || typeof wrapper !== 'object' || !Array.isArray(wrapper[envelopeKey])) {
            throw domainUnavailableError(new Error('unexpected storage shape: ' + file));
        }
        return wrapper[envelopeKey];
    }

    // v2.6.5 阶段4：dimensions.json 双目录（brands/channels）宽松读。整文件缺失
    // → 空目录（旧快照容忍，与前端 readStrictFormalDimensions 缺文件语义一致）；
    // 形状异常 → fail-closed（DOMAIN_UNAVAILABLE），条目级过滤交给
    // agent-actions.safeDimensionCatalog 的脱敏投影。
    async function readDimensionsWrapper() {
        var record = await readJsonState(KERNEL_STORAGE_FILES.dimensions);
        if (record.status === 'missing') return { brands: [], channels: [] };
        if (record.status !== 'valid') throw domainUnavailableError(record.error);
        var wrapper = record.value;
        if (!wrapper || typeof wrapper !== 'object' || !Array.isArray(wrapper.brands) || !Array.isArray(wrapper.channels)) {
            throw domainUnavailableError(new Error('unexpected storage shape: ' + KERNEL_STORAGE_FILES.dimensions));
        }
        return { brands: wrapper.brands, channels: wrapper.channels };
    }

    async function readAgentDomain() {
        var domain = {};
        domain.assets = await readWrapperArray(KERNEL_STORAGE_FILES.assets, 'assets', true);
        domain.tags = await readWrapperArray(KERNEL_STORAGE_FILES.tags, 'tags', true);
        validateCoreDomain(domain.assets, domain.tags);
        await Promise.all(DOMAIN_RECORD_FILES.map(async function (entry) {
            domain[entry[0]] = await readWrapperArray(entry[1], entry[2]);
        }));
        domain.dimensions = await readDimensionsWrapper();
        if (!agentActions.completeDomain(domain)) throw domainUnavailableError(new Error('domain incomplete'));
        return domain;
    }

    // Count/search only need the canonical asset list and tag catalog. Keeping
    // the remaining arrays empty preserves the shared domain contract while
    // avoiding needless reads and JSON parsing of financial/event sidecars.
    async function readAgentQueryDomain(request) {
        var op = request && request.op;
        if (op !== 'count' && op !== 'search' && op !== 'tags') return readAgentDomain();
        var needsTagLabels = op === 'search' || op === 'tags'
            || (op === 'count' && request && typeof request.tag === 'string' && request.tag.trim());
        var values = await Promise.all([
            readWrapperArray(KERNEL_STORAGE_FILES.assets, 'assets', true),
            needsTagLabels ? readWrapperArray(KERNEL_STORAGE_FILES.tags, 'tags', true) : Promise.resolve([]),
        ]);
        validateCoreDomain(values[0], values[1]);
        var domain = {
            assets: values[0],
            tags: values[1],
            financialEvents: [],
            subscriptionPeriods: [],
            prepaidTransactions: [],
            maintenance: [],
            usage: [],
            lifecycleEvents: [],
            wishlistEvents: [],
            operationLogs: [],
        };
        // v2.6.5 阶段4：tags op 现同时返回品牌 / 途径目录，需要读 dimensions.json。
        domain.dimensions = op === 'tags'
            ? await readDimensionsWrapper()
            : { brands: [], channels: [] };
        if (!agentActions.completeDomain(domain)) throw domainUnavailableError(new Error('query domain incomplete'));
        return domain;
    }

    // ---------- 写队列桥（kernel → 前端插件） ----------

    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function createWriteTimeoutError() {
        var error = new Error('kernel storage operation timed out');
        error.agentCode = 'WRITE_TIMEOUT';
        return error;
    }

    function getWriteTimeoutMs() {
        // The private hook keeps I/O tests fast without changing the production deadline.
        var injected = typeof siyuan !== 'undefined' && siyuan
            ? Number(siyuan.__assetManagementTestWriteTimeoutMs) : NaN;
        return Number.isFinite(injected) && injected > 0 ? injected : WRITE_TIMEOUT_MS;
    }

    function withDeadline(promise, deadline, timeoutError) {
        var error = timeoutError || createWriteTimeoutError();
        var remaining = Number(deadline) - Date.now();
        if (!(remaining > 0)) return Promise.reject(error);
        var timer;
        var timeout = new Promise(function (_, reject) {
            timer = setTimeout(function () { reject(error); }, remaining);
        });
        return Promise.race([Promise.resolve(promise), timeout]).then(function (value) {
            clearTimeout(timer);
            return value;
        }, function (failure) {
            clearTimeout(timer);
            throw failure;
        });
    }

    function isWriteTimeout(error) {
        return !!(error && error.agentCode === 'WRITE_TIMEOUT');
    }

    function writeTimeoutResult() {
        return {
            ok: false,
            error: {
                code: 'WRITE_TIMEOUT',
                message: '资产管理前端插件未响应写入请求。请确认插件已启用（重载插件或重启思源）后重试。',
            },
        };
    }

    function queueCorruptError(cause) {
        var error = new Error('写入队列文件不可读（可能已损坏）。请重载插件或重启思源后重试写入。');
        error.agentCode = 'QUEUE_CORRUPT';
        error.cause = cause;
        return error;
    }

    function queueUnavailableError(cause) {
        var error = new Error('写入队列暂时不可用（并发写入冲突，已重试仍失败）。请稍后重试该写入操作。');
        error.agentCode = 'QUEUE_UNAVAILABLE';
        error.cause = cause;
        return error;
    }

    function requestPath(dir, id) {
        return dir + encodeURIComponent(String(id)) + '.json';
    }

    function validateRequest(request, expectedId) {
        return !!(request && typeof request === 'object' && !Array.isArray(request)
            && typeof request.id === 'string' && request.id === expectedId
            && typeof request.method === 'string' && Array.isArray(request.args)
            && typeof request.createdAt === 'string');
    }

    async function appendPendingManifest(id, createdAt, deadline) {
        var record = await readJsonState(WRITE_MANIFEST_FILE, deadline);
        if (record.status === 'corrupt') throw queueCorruptError(record.error);
        if (record.status === 'timeout') throw record.error || createWriteTimeoutError();
        if (record.status === 'unavailable') throw queueUnavailableError(record.error);
        if (record.status !== 'valid' && record.status !== 'missing') throw queueUnavailableError(record.error);
        var manifest = record.status === 'valid' ? record.value : { schemaVersion: 1, requests: [] };
        if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || !Array.isArray(manifest.requests)) {
            throw queueCorruptError(new Error('unexpected pending manifest shape'));
        }
        var exists = manifest.requests.some(function (entry) {
            return entry && typeof entry.id === 'string' && entry.id === id;
        });
        if (!exists) manifest.requests.push({ id: id, createdAt: createdAt });
        await writeJson(WRITE_MANIFEST_FILE, manifest, deadline);
    }

    // ---------- fs-notify 事件驱动写完成唤醒（v2.6.4 适配思源 3.8.3） ----------
    //
    // 前端插件把 completed/<id>.json 写入后，内核通过 siyuan.storage.watcher 监听
    // agent-writes/completed 目录，收到 fs-notify 事件即唤醒对应 submitWrite 的
    // waiter 立即重读结果；事件驱动不可用时 250ms 兜底轮询保证行为不回退。

    // 请求 id → 唤醒函数集合；同一 id 并发等待极少见，仍用 Set 防互相覆盖。
    var writeCompletionWaiters = new Map();
    var writeFsNotify = {
        enabled: false,          // watcher.add 成功后才置 true
        handlerInstalled: false, // siyuan.event.handler 已被本模块接管
        previousEventHandler: null,
        // watcher.add/remove 使用的相对路径（不含尾部斜杠，指向 completed 目录）。
        watchPath: WRITE_COMPLETED_DIR.replace(/\/+$/, ''),
    };

    function registerWriteCompletionWaiter(id) {
        var key = String(id);
        var wake;
        var promise = new Promise(function (resolve) { wake = resolve; });
        var set = writeCompletionWaiters.get(key);
        if (!set) {
            set = new Set();
            writeCompletionWaiters.set(key, set);
        }
        set.add(wake);
        return {
            promise: promise,
            // 收到结果 / 兜底轮询到点 / 异常退出都必须调用，防止 waiter 泄漏。
            dispose: function () {
                var current = writeCompletionWaiters.get(key);
                if (current) {
                    current.delete(wake);
                    if (current.size === 0) writeCompletionWaiters.delete(key);
                }
            },
        };
    }

    function notifyWriteCompletion(id) {
        var key = String(id || '');
        if (!key) return;
        var set = writeCompletionWaiters.get(key);
        if (!set || set.size === 0) return; // 无 waiter：no-op，纯轮询兜底已覆盖
        writeCompletionWaiters.delete(key);
        set.forEach(function (wake) {
            try { wake(); } catch (error) { /* 唤醒回调异常不得外抛到事件处理 */ }
        });
    }

    function clearWriteCompletionWaiters() {
        // 清空后等待中的 submitWrite 由 250ms 兜底轮询自然收尾，不需要显式唤醒。
        writeCompletionWaiters.clear();
    }

    function dispatchFsNotifyEvent(event) {
        if (!event || typeof event !== 'object' || event.type !== 'fs-notify') return;
        var detail = event.detail;
        if (!detail || typeof detail !== 'object') return;
        if (detail.operation === 'REMOVE') return; // 移除事件不表示结果就绪
        var rawPath = typeof detail.path === 'string' ? detail.path : '';
        if (!rawPath) return;
        // path 由 Go filepath.Rel 生成，Windows 上是反斜杠分隔，必须归一化后匹配。
        var normalizedPath = rawPath.replace(/\\/g, '/');
        if (normalizedPath.indexOf(WRITE_COMPLETED_DIR) !== 0) return;
        var fileName = normalizedPath.slice(WRITE_COMPLETED_DIR.length);
        if (!fileName || fileName.indexOf('/') !== -1 || fileName.slice(-5) !== '.json') return;
        var requestId;
        try {
            requestId = decodeURIComponent(fileName.slice(0, -5));
        } catch (error) {
            requestId = fileName.slice(0, -5);
        }
        notifyWriteCompletion(requestId);
    }

    function logFsNotifyDegraded(reason) {
        try {
            if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
                console.warn('[asset-management] fs-notify write completion unavailable, falling back to polling: ' + reason);
            }
        } catch (error) { /* 沙箱无 console 时静默降级 */ }
    }

    // 注册 watcher + event.handler；任何失败只警告并降级，绝不阻塞或破坏 onload。
    async function setupWriteFsNotify() {
        if (writeFsNotify.enabled) return;
        try {
            var watcher = siyuan && siyuan.storage && siyuan.storage.watcher;
            if (!watcher || typeof watcher.add !== 'function' || typeof watcher.remove !== 'function') {
                logFsNotifyDegraded('siyuan.storage.watcher unavailable');
                return;
            }
            if (!siyuan.event || typeof siyuan.event !== 'object') {
                logFsNotifyDegraded('siyuan.event unavailable');
                return;
            }
            // 链式保留既有 handler（防御式；当前内核 JS 侧没有其它 handler）。
            // 内核对 handler 的调用形态是 handler(event, eventJs) 两个参数，两个形态都尝试解析。
            var previousHandler = typeof siyuan.event.handler === 'function' ? siyuan.event.handler : null;
            writeFsNotify.previousEventHandler = previousHandler;
            siyuan.event.handler = function (event, eventJs) {
                try { dispatchFsNotifyEvent(event); } catch (error) { /* 事件解析失败绝不外抛 */ }
                try { dispatchFsNotifyEvent(eventJs); } catch (error) { /* Goja 双参形态防御 */ }
                if (previousHandler) {
                    try { return previousHandler(event, eventJs); }
                    catch (error) { return undefined; }
                }
                return undefined;
            };
            writeFsNotify.handlerInstalled = true;
            // 超时保护：内核不支持文件监听时可能 reject（或挂起），都不能拖死 onload。
            await withDeadline(
                Promise.resolve().then(function () { return watcher.add(writeFsNotify.watchPath); }),
                Date.now() + WRITE_FS_WATCH_TIMEOUT_MS,
                new Error('siyuan.storage.watcher.add timed out')
            );
            writeFsNotify.enabled = true;
        } catch (error) {
            writeFsNotify.enabled = false;
            logFsNotifyDegraded(text(error && (error.message || error.msg)) || 'watcher add failed');
        }
    }

    async function teardownWriteFsNotify() {
        try {
            var watcher = siyuan && siyuan.storage && siyuan.storage.watcher;
            if (watcher && typeof watcher.remove === 'function') {
                await watcher.remove(writeFsNotify.watchPath);
            }
        } catch (error) { /* 卸载阶段尽力而为 */ }
        clearWriteCompletionWaiters();
        if (writeFsNotify.handlerInstalled && siyuan && siyuan.event) {
            try {
                // previousEventHandler 为 null 时显式清空，恢复到接管前状态。
                siyuan.event.handler = writeFsNotify.previousEventHandler;
            } catch (error) { /* 卸载阶段尽力而为 */ }
        }
        writeFsNotify.enabled = false;
        writeFsNotify.handlerInstalled = false;
        writeFsNotify.previousEventHandler = null;
    }

    // ---------- fs-notify 唤醒模块结束 ----------

    async function submitWrite(methodName, argsArray) {
        var deadline = Date.now() + getWriteTimeoutMs();
        var id = createStableId();
        var request = {
            id: id,
            method: methodName,
            args: Array.isArray(argsArray) ? argsArray : [],
            createdAt: new Date().toISOString(),
        };
        try {
            await withDeadline(enqueueWriteLane(async function () {
                if (Date.now() >= deadline) throw createWriteTimeoutError();
                // 先追加只由内核维护的 manifest，再写独立 pending 文件。manifest 先成功时
                // 最多留下一个待补齐的索引项，不会让已写入请求失去发现入口。
                await appendPendingManifest(id, request.createdAt, deadline);
                await writeJson(requestPath(WRITE_PENDING_DIR, id), request, deadline);
                var readback = await readJsonState(requestPath(WRITE_PENDING_DIR, id), deadline);
                if (readback.status === 'timeout') throw readback.error || createWriteTimeoutError();
                if (readback.status !== 'valid' || !validateRequest(readback.value, id)) {
                    throw new Error('pending request readback failed for ' + id);
                }
            }), deadline, createWriteTimeoutError());
        } catch (error) {
            if (isWriteTimeout(error)) return writeTimeoutResult();
            if (error && error.agentCode === 'QUEUE_CORRUPT') throw error;
            throw queueUnavailableError(error);
        }

        for (;;) {
            if (Date.now() >= deadline) return writeTimeoutResult();
            var completed = await readJsonState(requestPath(WRITE_COMPLETED_DIR, id), deadline);
            if (completed.status === 'valid') {
                var file = completed.value;
                if (!file || typeof file !== 'object' || file.id !== id
                    || !Object.prototype.hasOwnProperty.call(file, 'result')) {
                    throw queueCorruptError(new Error('unexpected completed request shape'));
                }
                return file.result;
            }
            // missing 是正常等待态；corrupt 与 unavailable 必须向调用方区分暴露。
            if (completed.status === 'corrupt') throw queueCorruptError(completed.error);
            if (completed.status === 'timeout') return writeTimeoutResult();
            if (completed.status !== 'missing') throw queueUnavailableError(completed.error);
            var remaining = deadline - Date.now();
            if (!(remaining > 0)) return writeTimeoutResult();
            // v2.6.4：fs-notify 事件驱动唤醒——前端写入 completed 后立即重读（不 sleep）；
            // waiter 未命中 / 事件驱动不可用时退回 250ms 兜底轮询，最坏性能与旧实现一致。
            var waiter = registerWriteCompletionWaiter(id);
            try {
                await Promise.race([
                    waiter.promise,
                    sleep(Math.min(WRITE_POLL_INTERVAL_MS, remaining)),
                ]);
            } finally {
                waiter.dispose();
            }
        }
    }

    /**
     * agent-actions 期望 methods[name] 返回业务方法的原始返回值（如资产对象）、
     * 失败时 throw；这里把 submitWrite 的 {ok,data,error} 结果对象适配过去。
     */
    function createAgentWriteMethods() {
        var methods = {};
        WRITE_METHOD_NAMES.forEach(function (name) {
            methods[name] = async function () {
                var args = Array.prototype.slice.call(arguments);
                var result = await submitWrite(name, args);
                if (result && result.ok === true) return result.data;
                var failureBody = (result && result.error) || {};
                var error = new Error(failureBody.message || 'agent write failed');
                error.agentCode = failureBody.code || 'WRITE_FAILED';
                throw error;
            };
        });
        return methods;
    }

    var agentHandlers = null;

    function ensureAgentHandlers() {
        if (!agentHandlers) {
            agentHandlers = agentActions.createAgentActionHandlers({
                getSettings: readAgentSettings,
                getDomain: readAgentDomain,
                getQueryDomain: readAgentQueryDomain,
                methods: createAgentWriteMethods(),
            });
        }
        return agentHandlers;
    }

    // createAgentActionHandlers 返回 {result:jsonString} / {error:jsonString} 字符串信封；
    // registerCapability 的 handler 需要返回对象，这里 parse 回对象。
    var MCP_TOOL_ACTIONS = Object.freeze({
        asset_query: 'query',
        asset_create: 'create',
        asset_update: 'update',
        asset_lifecycle: 'update',
        asset_price_update: 'update',
        asset_delete: 'delete',
        asset_tag_update: 'update',
        asset_tag_create: 'create',
    });

    function expectedToolAction(name, args) {
        if (name === 'asset_record') {
            var op = args && args.op;
            return op === 'purchaseAmount' || op === 'subscriptionPaymentAmount' ? 'update' : 'create';
        }
        return MCP_TOOL_ACTIONS[name];
    }

    function createRegisteredHandler(name, handlers, requireAction) {
        return async function (args) {
            var transport;
            var expectedAction = expectedToolAction(name, args);
            if (requireAction === true && (!args || args.action !== expectedAction)) {
                var actionError = new Error('action must equal ' + expectedAction + ' for this operation');
                actionError.agentCode = 'INVALID_ACTION';
                return JSON.parse(agentActions.failure(actionError));
            }
            try {
                transport = await handlers[name](args == null ? {} : args);
            } catch (error) {
                return JSON.parse(agentActions.failure(error));
            }
            var encoded = transport && typeof transport === 'object'
                ? (typeof transport.result === 'string' ? transport.result : transport.error)
                : null;
            if (typeof encoded !== 'string') {
                return JSON.parse(agentActions.failure((function () {
                    var error = new Error('agent action returned an invalid transport');
                    error.agentCode = 'AGENT_TRANSPORT_INVALID';
                    return error;
                })()));
            }
            try {
                return JSON.parse(encoded);
            } catch (error) {
                return JSON.parse(agentActions.failure((function () {
                    var parseError = new Error('agent action result could not be parsed');
                    parseError.agentCode = 'RESULT_PARSE_FAILED';
                    return parseError;
                })()));
            }
        };
    }

    // ---------- 工具注册表（name / effects / inputSchema） ----------

    function stringSchema(description) {
        return { type: 'string', description: description };
    }

    function stringEnumSchema(values, description) {
        return { type: 'string', enum: values.slice(), description: description };
    }

    function integerSchema(description) {
        return { type: 'integer', description: description };
    }

    function actionSchema(value) {
        return stringEnumSchema([value], 'Required SiYuan Agent action classification');
    }

    function agentToolConfigs() {
        var kinds = __am_assets.FORMAL_ASSET_KINDS;
        var cycles = __am_assets.FORMAL_BILLING_CYCLES;
        return {
            asset_query: {
                effects: { localRead: true },
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: actionSchema('query'),
                        op: stringEnumSchema(['count', 'search', 'detail', 'summary', 'tags'], 'Query operation (tags also returns brand/channel catalogs)'),
                        locale: stringEnumSchema(['zh_CN', 'zh-CN', 'en_US', 'en-US'], 'Display locale (default zh_CN)'),
                        assetId: stringSchema('Exact lowercase asset UUID (detail only)'),
                        search: stringSchema('Name substring filter'),
                        status: stringEnumSchema(['wishlist', 'active', 'retired'], 'Status filter'),
                        kind: stringEnumSchema(kinds, 'Asset kind filter'),
                        categoryId: stringSchema('Category filter: digital/appliance/home/otherPhysical (physical), member/software/service/domain/ai/otherVirtual (virtual), prepaidAmount/prepaidCount (prepaid)'),
                        currency: stringSchema('ISO 4217 currency filter'),
                        tag: stringSchema('Tag label filter'),
                        tagId: stringSchema('Tag UUID filter'),
                        offset: { type: 'integer', description: 'Search page offset' },
                        pageSize: { type: 'integer', description: 'Search page size (default 50, max 200)' },
                        includeNotes: { type: 'boolean', description: 'Include redacted notes in detail' },
                    },
                    required: ['action', 'op'],
                },
            },
            asset_create: {
                effects: { localWrite: true },
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: actionSchema('create'),
                        data: { type: 'object', description: 'formal-v2 asset object; price fields are forbidden here. Owned assets accept name, kind, status, currency, categoryId (kind-matched fixed id), tagIds (existing tag UUIDs, max 3), notes, details (by kind: physical warrantyEndsOn/costGoal; virtualSubscription planName/accountLabel/billingPlan.cycle/autoRenew; virtualPerpetual licenseAccountLabel; prepaid provider/expiresOn), acquiredOn (YYYY-MM-DD start date anchoring the first subscription period; defaults to today). Wishlist items use status=wishlist with wishlist{expectedAmountMinor, reason, targetGroup, heartbeatTarget} only' },
                        purchaseAmountMinor: integerSchema('Optional purchase price in minor units; CNY 99.00 is 9900'),
                        prepaidInitialAmountMinor: integerSchema('Optional prepaid-amount opening balance in minor units'),
                        prepaidOpeningCount: integerSchema('Optional prepaid-count opening count'),
                        subscriptionPeriodEnd: stringSchema('Optional first subscription period end date, YYYY-MM-DD; the first period starts at data.acquiredOn (defaults to today) and must not end before it'),
                    },
                    required: ['action', 'data'],
                },
            },
            asset_update: {
                effects: { localWrite: true },
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: actionSchema('update'),
                        assetId: stringSchema('Exact lowercase asset UUID'),
                        patch: { type: 'object', description: 'Limited patch: name, acquiredOn for owned non-subscriptions, categoryId or exact category label, tagIds of existing tags, notes, restricted kind details (physical warrantyEndsOn/costGoal; virtualSubscription planName/billingPlan.cycle; prepaid provider/expiresOn; virtualPerpetual none); use tag tools for labels' },
                    },
                    required: ['action', 'assetId', 'patch'],
                },
            },
            asset_lifecycle: {
                actionEffects: {
                    setStatus: { localWrite: true },
                    retire: { localWrite: true },
                    sale: { localWrite: true },
                    renewSubscription: { localWrite: true },
                    toggleAutoRenew: { localWrite: true },
                    updateStartDate: { localWrite: true },
                    updatePeriodEnd: { localWrite: true },
                },
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: actionSchema('update'),
                        op: stringEnumSchema(['setStatus', 'retire', 'sale', 'renewSubscription', 'toggleAutoRenew', 'updateStartDate', 'updatePeriodEnd'], 'Lifecycle operation'),
                        assetId: stringSchema('Exact lowercase asset UUID'),
                        status: stringEnumSchema(['active', 'retired'], 'Target status (setStatus)'),
                        retiredDate: stringSchema('YYYY-MM-DD (retire)'),
                        soldOn: stringSchema('YYYY-MM-DD (sale)'),
                        priceMinor: { type: 'integer', description: 'Positive safe-integer minor units (sale)' },
                        startDate: stringSchema('YYYY-MM-DD (renewSubscription; required by updateStartDate)'),
                        endDate: stringSchema('YYYY-MM-DD (renewSubscription / updateStartDate optional re-anchor / updatePeriodEnd required)'),
                        amountMinor: { type: 'integer', description: 'Non-negative safe-integer minor units (renewSubscription)' },
                        cycle: stringEnumSchema(cycles, 'Billing cycle (renewSubscription)'),
                        enabled: { type: 'boolean', description: 'Auto-renew flag (toggleAutoRenew)' },
                        note: stringSchema('Optional note (retire / sale)'),
                    },
                    required: ['action', 'op', 'assetId'],
                },
            },
            asset_record: {
                effects: { localWrite: true },
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: stringEnumSchema(['create', 'update'], 'Use update for purchaseAmount/subscriptionPaymentAmount; use create for all other record operations'),
                        op: stringEnumSchema(['purchaseAmount', 'subscriptionPaymentAmount', 'maintenance', 'prepaidTransaction', 'prepaidAdjust', 'prepaidConsumption'], 'Record operation'),
                        assetId: stringSchema('Exact lowercase asset UUID'),
                        type: stringSchema('maintenance: repair|maintain; prepaidTransaction: amount kind inflow|outflow|adjust|refund, count kind inflow|outflow|adjust'),
                        date: stringSchema('YYYY-MM-DD (maintenance / prepaidTransaction)'),
                        effectiveDate: stringSchema('YYYY-MM-DD (prepaidAdjust / prepaidConsumption)'),
                        amountMinor: { type: 'integer', description: 'purchaseAmount, maintenance, prepaidTransaction: non-negative safe-integer minor units; subscriptionPaymentAmount: positive safe-integer minor units (>0)' },
                        count: { type: 'integer', description: 'Non-negative safe-integer count (prepaidTransaction / prepaidConsumption)' },
                        targetCount: { type: 'integer', description: 'Non-negative safe-integer target count (prepaidAdjust)' },
                        paymentAmountMinor: { type: 'integer', description: 'Optional cash payment for count inflow' },
                        direction: stringEnumSchema(['inflow', 'outflow'], 'Required when type is adjust'),
                        note: stringSchema('Optional note'),
                    },
                    required: ['action', 'op', 'assetId'],
                },
            },
            asset_price_update: {
                effects: { localWrite: true },
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: actionSchema('update'),
                        assetId: stringSchema('Exact lowercase asset UUID'),
                        amountMinor: integerSchema('New price in minor units; CNY 20.00 is 2000'),
                    },
                    required: ['action', 'assetId', 'amountMinor'],
                },
            },
            asset_delete: {
                effects: { localWrite: true },
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: actionSchema('delete'),
                        assetId: stringSchema('Exact lowercase asset UUID'),
                    },
                    required: ['action', 'assetId'],
                },
            },
            asset_tag_update: {
                effects: { localWrite: true },
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: actionSchema('update'),
                        assetId: stringSchema('Exact lowercase asset UUID'),
                        labels: { type: 'array', items: stringSchema('Exact tag label') },
                        mode: stringEnumSchema(['add', 'remove', 'replace'], 'Tag binding mode; replace only runs when explicitly supplied'),
                    },
                    required: ['action', 'assetId', 'labels'],
                },
            },
            asset_tag_create: {
                effects: { localWrite: true },
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: actionSchema('create'),
                        assetId: stringSchema('Exact lowercase asset UUID'),
                        labels: { type: 'array', items: stringSchema('Tag label to create or reuse') },
                        mode: stringEnumSchema(['add', 'replace'], 'Tag binding mode; replace only runs when explicitly supplied'),
                    },
                    required: ['action', 'assetId', 'labels'],
                },
            },
        };
    }

    function agentToolTitle(name) {
        return 'Asset Management: ' + name;
    }

    function requireKernelRuntime() {
        if (typeof siyuan === 'undefined' || !siyuan || !siyuan.plugin || !siyuan.plugin.lifecycle) {
            throw new Error('siyuan.plugin.lifecycle is unavailable; SiYuan 3.8.0+ kernel plugin runtime is required');
        }
        if (!siyuan.storage || typeof siyuan.storage.get !== 'function' || typeof siyuan.storage.put !== 'function') {
            throw new Error('siyuan.storage is unavailable; SiYuan 3.8.0+ kernel plugin runtime is required');
        }
        // 版本事实（v2.6.4）：siyuan.mcp.registerTool / unregisterTool 仅思源 3.8.1 提供，
        // 3.8.2 起内核已移除（3.8.3 源码 kernel 包零命中）；本守卫在 3.8.2+ 上自动放行，
        // 由 registrationRuntime() 选择 siyuan.agent.registerCapability 分支（3.8.3 保留、config 兼容）。
        var hasMcp = siyuan.mcp && typeof siyuan.mcp.registerTool === 'function' && typeof siyuan.mcp.unregisterTool === 'function';
        var hasAgent = siyuan.agent && typeof siyuan.agent.registerCapability === 'function' && typeof siyuan.agent.unregisterCapability === 'function';
        if (!hasMcp && !hasAgent) {
            throw new Error('siyuan.mcp.registerTool / siyuan.agent.registerCapability is unavailable; SiYuan 3.8.0+ kernel plugin runtime is required');
        }
    }

    function registrationRuntime() {
        // 仅 3.8.1 会命中 registerTool 分支；3.8.2+ / 3.8.0 走 registerCapability。
        if (siyuan.mcp && typeof siyuan.mcp.registerTool === 'function' && typeof siyuan.mcp.unregisterTool === 'function') {
            return {
                api: 'registerTool',
                register: function (name, config, handler) { return siyuan.mcp.registerTool(name, config, handler); },
                unregister: function (name) { return siyuan.mcp.unregisterTool(name); },
                requireAction: true,
            };
        }
        return {
            api: 'registerCapability',
            register: function (name, config, handler) { return siyuan.agent.registerCapability(name, config, handler); },
            unregister: function (name) { return siyuan.agent.unregisterCapability(name); },
            requireAction: false,
        };
    }

    function runtimeForApi(api) {
        if (api === 'registerTool' && siyuan.mcp
            && typeof siyuan.mcp.unregisterTool === 'function') {
            return {
                api: 'registerTool',
                unregister: function (name) { return siyuan.mcp.unregisterTool(name); },
            };
        }
        if (api === 'registerCapability' && siyuan.agent
            && typeof siyuan.agent.unregisterCapability === 'function') {
            return {
                api: 'registerCapability',
                unregister: function (name) { return siyuan.agent.unregisterCapability(name); },
            };
        }
        return null;
    }

    function registrationFailureMessage(error) {
        var message = text(error && (error.message || error.msg));
        if (!message || /(?:[A-Za-z]:[\\/]|(?:^|[\s(])[\\/][^\s)]*)/.test(message)) {
            return 'agent tool registration failed';
        }
        return message;
    }

    async function rollbackAgentTools(runtime, cause) {
        var names = Array.from(state.registeredTools).reverse();
        for (var index = 0; index < names.length; index++) {
            try {
                if (runtime) await runtime.unregister(names[index]);
            } catch (error) { /* 回滚继续清理其余工具 */ }
        }
        state.registeredTools.clear();
        var api = state.registrationApi || (runtime && runtime.api) || 'unknown';
        state.registrationApi = null;
        try {
            await writeJson(KERNEL_STATUS_FILE, {
                schemaVersion: 1,
                api: api,
                failedAt: new Date().toISOString(),
                tools: [],
                error: { code: 'REGISTRATION_FAILED', message: registrationFailureMessage(cause) },
            });
        } catch (error) { /* 失败心跳写失败不应阻止上层重试 */ }
    }

    async function registerAgentTools() {
        requireKernelRuntime();
        var handlers = ensureAgentHandlers();
        var configs = agentToolConfigs();
        var names = agentActions.AGENT_ACTION_NAMES.slice();
        var runtime = registrationRuntime();
        state.registrationApi = runtime.api;
        try {
            for (var index = 0; index < names.length; index++) {
                var name = names[index];
                var config = configs[name];
                var description = agentActions.AGENT_ACTION_DESCRIPTIONS && agentActions.AGENT_ACTION_DESCRIPTIONS[name];
                if (!config || typeof description !== 'string' || !description || typeof handlers[name] !== 'function') {
                    throw new Error('agent tool definition is incomplete: ' + name);
                }
                var capability = {
                    title: agentToolTitle(name),
                    description: description,
                    inputSchema: config.inputSchema,
                };
                if (runtime.api === 'registerCapability') {
                    if (config.actionEffects) capability.actionEffects = config.actionEffects;
                    else capability.effects = config.effects;
                }
                state.registeredTools.add(name);
                await runtime.register(name, capability, createRegisteredHandler(name, handlers, runtime.requireAction));
            }
            await writeJson(KERNEL_STATUS_FILE, {
                schemaVersion: 1,
                api: runtime.api,
                registeredAt: new Date().toISOString(),
                tools: names,
            });
            // v2.6.4：工具注册成功后启用 fs-notify 写完成唤醒；
            // setupWriteFsNotify 内部全量 catch，任何失败仅降级为 250ms 兜底轮询。
            await setupWriteFsNotify();
        } catch (error) {
            await rollbackAgentTools(runtimeForApi(runtime.api) || runtime, error);
            throw error;
        }
    }

    async function unregisterAgentTools() {
        var runtime = runtimeForApi(state.registrationApi);
        if (!runtime) {
            try { runtime = registrationRuntime(); } catch (error) { runtime = null; }
        }
        var names = Array.from(state.registeredTools);
        for (var index = 0; index < names.length; index++) {
            try {
                if (runtime) await runtime.unregister(names[index]);
            } catch (error) { /* 卸载阶段尽力而为 */ }
        }
        state.registeredTools.clear();
        try {
            await writeJson(KERNEL_STATUS_FILE, {
                schemaVersion: 1,
                api: state.registrationApi || (runtime && runtime.api) || 'unknown',
                unloadedAt: new Date().toISOString(),
                tools: [],
            });
        } catch (error) { /* 心跳写失败不影响卸载 */ }
        state.registrationApi = null;
    }

    // ---------- 生命周期 ----------

    siyuan.plugin.lifecycle.onload = async function () {
        if (state.registrationPromise) return state.registrationPromise;
        if (state.registeredTools.size > 0) return; // 已注册完成：重复 onload 防重
        var attempt = registerAgentTools();
        state.registrationPromise = attempt;
        try {
            await attempt;
        } finally {
            if (state.registrationPromise === attempt) state.registrationPromise = null;
        }
    };

    siyuan.plugin.lifecycle.onrunning = function () {};

    siyuan.plugin.lifecycle.onunload = async function () {
        // v2.6.4：先停 fs-notify（移除 watcher + 还原 handler + 清空 waiter），
        // 再逐个注销工具；清理路径全部 catch 包裹，不影响工具注销。
        await teardownWriteFsNotify();
        await unregisterAgentTools();
    };
})();
