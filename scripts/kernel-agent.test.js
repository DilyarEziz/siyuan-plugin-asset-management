'use strict';

/**
 * v2.6.0 内核 Agent 工具接入测试。
 *
 * 覆盖：
 *   1. kernel.js 在 Goja 风格 siyuan 全局下的 lifecycle.onload → 3.8.1 registerTool 优先、
 *      registerCapability 回退（6 个工具、inputSchema required、心跳文件）
 *   2. asset_query 四种 op 的返回形状与白名单（实时读 storage 投影）
 *   3. 权限矩阵（AGENT_DISABLED / PERMISSION_DENIED / DOMAIN_UNAVAILABLE）
 *   4. 写端到端：kernel handler → agent-writes/pending/<id>.json → 前端轮询
 *      （stub 业务方法）→ processing/<id>.json + completed/<id>.json → kernel handler resolve
 *   5. onunload 注销 + 心跳更新；onload 单飞防重
 *   6. 静态断言：src.template.js 不再调用 addAgentAction；plugin.json 声明 kernels
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const KERNEL_FILE = path.join(ROOT, 'kernel.js');
const { createFormalV2AssetWrapper } = require('../api/assets');
const { createHarness, asset } = require('./formal-workflow-harness');

const NOW = '2026-08-19T08:00:00.000Z';
const ASSET_IDS = {
    physical: '11111111-1111-4111-8111-111111111111',
    subscription: '22222222-2222-4222-8222-222222222222',
    prepaid: '33333333-3333-4333-8333-333333333333',
};
const TOOL_NAMES = ['asset_query', 'asset_create', 'asset_update', 'asset_lifecycle', 'asset_price_update', 'asset_record', 'asset_delete', 'asset_tag_update', 'asset_tag_create'];

function putJson(map, file, value) {
    map.set(file, JSON.stringify(value, null, 2));
}

function requestFile(id, directory) {
    return 'agent-writes/' + directory + '/' + encodeURIComponent(id) + '.json';
}

function seedPendingRequest(map, request) {
    const manifest = map.has('agent-writes/pending-manifest.json')
        ? JSON.parse(map.get('agent-writes/pending-manifest.json'))
        : { schemaVersion: 1, requests: [] };
    if (!manifest.requests.some(item => item && item.id === request.id)) {
        manifest.requests.push({ id: request.id, createdAt: request.createdAt });
    }
    putJson(map, 'agent-writes/pending-manifest.json', manifest);
    putJson(map, requestFile(request.id, 'pending'), request);
}

async function waitPendingRequest(map, timeoutMs, label) {
    return waitFor(() => {
        const manifestRaw = map.get('agent-writes/pending-manifest.json');
        if (!manifestRaw) return null;
        const manifest = JSON.parse(manifestRaw);
        const entry = manifest.requests && manifest.requests[manifest.requests.length - 1];
        if (!entry || !entry.id) return null;
        const raw = map.get(requestFile(entry.id, 'pending'));
        return raw ? JSON.parse(raw) : null;
    }, timeoutMs, label);
}

function createSiyuanMock(mode, options) {
    const storageMap = new Map();
    const registry = new Map();
    const getCalls = [];
    const runtimeMode = mode || 'agent';
    const testOptions = options || {};
    let registerCalls = 0;
    const siyuan = {
        storage: {
            async get(filePath) {
                getCalls.push(filePath);
                if (!storageMap.has(filePath)) {
                    throw new Error('open ' + filePath + ': no such file or directory');
                }
                const value = storageMap.get(filePath);
                return { text: async () => value };
            },
            async put(filePath, content) { storageMap.set(filePath, String(content)); },
        },
        plugin: { lifecycle: {} },
    };
    if (runtimeMode === 'agent' || runtimeMode === 'both') {
        siyuan.agent = {
            async registerCapability(name, config, handler) {
                registerCalls++;
                if (testOptions.failRegisterAt && registerCalls === testOptions.failRegisterAt) {
                    if (testOptions.storeBeforeFail) registry.set(name, { config, handler, api: 'registerCapability' });
                    throw new Error(testOptions.failRegisterMessage || 'injected register failure');
                }
                registry.set(name, { config, handler, api: 'registerCapability' });
            },
            async unregisterCapability(name) { registry.delete(name); },
        };
    }
    if (runtimeMode === 'mcp' || runtimeMode === 'both') {
        siyuan.mcp = {
            async registerTool(name, config, handler) {
                registerCalls++;
                if (testOptions.failRegisterAt && registerCalls === testOptions.failRegisterAt) {
                    if (testOptions.storeBeforeFail) registry.set(name, { config, handler, api: 'registerTool' });
                    throw new Error(testOptions.failRegisterMessage || 'injected register failure');
                }
                registry.set(name, { config, handler, api: 'registerTool' });
            },
            async unregisterTool(name) { registry.delete(name); },
        };
    }
    return {
        storageMap,
        registry,
        getCalls,
        siyuan,
    };
}

async function waitFor(predicate, timeoutMs, label) {
    const deadline = Date.now() + (timeoutMs || 5000);
    for (;;) {
        const value = predicate();
        if (value) return value;
        if (Date.now() >= deadline) throw new Error('waitFor timeout: ' + (label || 'condition'));
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}

function seedDomainFiles(map) {
    putJson(map, 'assets.json', createFormalV2AssetWrapper([
        asset(ASSET_IDS.physical, 'physical', 'Kernel desk'),
        asset(ASSET_IDS.subscription, 'virtualSubscription', 'Kernel cloud'),
        asset(ASSET_IDS.prepaid, 'prepaidCount', 'Kernel gym'),
    ], { updatedAt: NOW }));
    putJson(map, 'tags.json', { schemaVersion: 1, tags: [], updatedAt: NOW });
    // 记录类 sidecar 文件不预置：missing → 空数组（readAgentDomain 契约）
}

function seedSettings(map, patch) {
    putJson(map, 'settings.json', Object.assign({
        schemaVersion: 2,
        aiEnabled: true,
        aiAllowQuery: true,
        aiAllowCreate: true,
        aiAllowModify: true,
        aiAllowLifecycle: true,
        aiAllowRecords: true,
        aiAllowDelete: true,
    }, patch || {}));
}

/** 把前端 harness 插件的 loadData/saveData 桥接到 kernel 的 storageMap（字符串协议）。 */
function bridgeHarnessToKernelStorage(harness, storageMap) {
    const plugin = harness.plugin;
    plugin.loadData = async name => (storageMap.has(name) ? storageMap.get(name) : null);
    plugin.saveData = async (name, value) => {
        storageMap.set(name, typeof value === 'string' ? value : JSON.stringify(value));
        return true;
    };
    return plugin;
}

function createSharedWebLockMock() {
    let held = false;
    const calls = [];
    return {
        calls,
        request(name, options, callback) {
            calls.push({ name, options });
            assert.equal(options && options.ifAvailable, true);
            if (held) return Promise.resolve().then(() => callback(null));
            held = true;
            return Promise.resolve()
                .then(() => callback({ name }))
                .finally(() => { held = false; });
        },
    };
}

function installWebLockMock(locks) {
    if (!global.navigator) global.navigator = { userAgent: '' };
    global.navigator.locks = locks;
}

async function testRegistration(mock) {
    assert.equal(fs.existsSync(KERNEL_FILE), true, 'kernel.js is built before running this test');
    await global.siyuan.plugin.lifecycle.onload();
    assert.equal(mock.registry.size, 9);
    TOOL_NAMES.forEach(name => assert.ok(mock.registry.has(name), 'registered: ' + name));

    const query = mock.registry.get('asset_query');
    assert.deepEqual(query.config.effects, { localRead: true });
    assert.deepEqual(query.config.inputSchema.required, ['action', 'op']);
    assert.deepEqual(query.config.inputSchema.properties.op.enum, ['count', 'search', 'detail', 'summary', 'tags']);
    assert.deepEqual(query.config.inputSchema.properties.locale.enum, ['zh_CN', 'zh-CN', 'en_US', 'en-US']);
    assert.equal(typeof query.config.description, 'string');
    assert.ok(query.config.description.length > 40);
    assert.equal(typeof query.config.title, 'string');

    ['asset_create', 'asset_update', 'asset_record', 'asset_delete', 'asset_tag_update', 'asset_tag_create'].forEach(name => {
        const tool = mock.registry.get(name);
        assert.deepEqual(tool.config.effects, { localWrite: true }, name + ' is a write tool');
    });
    const create = mock.registry.get('asset_create');
    assert.deepEqual(create.config.inputSchema.required, ['action', 'data']);
    assert.equal(create.config.inputSchema.properties.purchaseAmountMinor.type, 'integer');
    assert.match(create.config.inputSchema.properties.purchaseAmountMinor.description, /9900/);
    assert.equal(create.config.inputSchema.properties.options, undefined, 'nested create options are not advertised');
    assert.deepEqual(mock.registry.get('asset_update').config.inputSchema.required, ['action', 'assetId', 'patch']);
    assert.deepEqual(mock.registry.get('asset_delete').config.inputSchema.required, ['action', 'assetId']);
    assert.ok(mock.registry.get('asset_record').config.inputSchema.properties.op.enum.includes('purchaseAmount'));
    assert.ok(mock.registry.get('asset_record').config.inputSchema.properties.op.enum.includes('subscriptionPaymentAmount'));
    assert.deepEqual(mock.registry.get('asset_record').config.inputSchema.properties.action.enum, ['create', 'update']);
    const priceUpdate = mock.registry.get('asset_price_update');
    assert.deepEqual(priceUpdate.config.effects, { localWrite: true });
    assert.deepEqual(priceUpdate.config.inputSchema.required, ['action', 'assetId', 'amountMinor']);
    assert.equal(priceUpdate.config.inputSchema.properties.action.enum[0], 'update');
    assert.match(priceUpdate.config.description, /dedicated tool first/);
    const lifecycle = mock.registry.get('asset_lifecycle');
    assert.equal(lifecycle.config.effects, undefined, 'lifecycle uses actionEffects instead of effects');
    assert.deepEqual(lifecycle.config.actionEffects, {
        setStatus: { localWrite: true },
        retire: { localWrite: true },
        sale: { localWrite: true },
        renewSubscription: { localWrite: true },
        toggleAutoRenew: { localWrite: true },
        updateStartDate: { localWrite: true },
        updatePeriodEnd: { localWrite: true },
    });
    assert.deepEqual(lifecycle.config.inputSchema.required, ['action', 'op', 'assetId']);
    assert.deepEqual(mock.registry.get('asset_record').config.inputSchema.properties.op.enum,
        ['purchaseAmount', 'subscriptionPaymentAmount', 'maintenance', 'prepaidTransaction', 'prepaidAdjust', 'prepaidConsumption']);

    const heartbeat = JSON.parse(mock.storageMap.get('agent-kernel-status.json'));
    assert.equal(heartbeat.schemaVersion, 1);
    assert.equal(heartbeat.api, 'registerCapability');
    assert.ok(heartbeat.registeredAt);
    assert.deepEqual(heartbeat.tools, TOOL_NAMES);

    // 单飞：重复 onload 不重复注册
    await global.siyuan.plugin.lifecycle.onload();
    assert.equal(mock.registry.size, 9);
}

async function testQuery(mock) {
    seedDomainFiles(mock.storageMap);
    seedSettings(mock.storageMap);
    const handler = mock.registry.get('asset_query').handler;

    mock.getCalls.length = 0;
    const count = await handler({ op: 'count' });
    assert.equal(count.ok, true);
    assert.equal(count.data.count, 3);
    assert.deepEqual(count.data.byKind.physical, 1);
    assert.deepEqual(mock.getCalls.sort(), ['assets.json', 'settings.json'],
        'count fast path only reads settings and assets');

    mock.getCalls.length = 0;
    const taggedCount = await handler({ op: 'count', tag: 'desk' });
    assert.equal(taggedCount.ok, true);
    assert.deepEqual(mock.getCalls.sort(), ['assets.json', 'settings.json', 'tags.json'],
        'count with a tag label reads the tag catalog');

    mock.getCalls.length = 0;
    const search = await handler({ op: 'search', search: 'desk' });
    assert.equal(search.ok, true);
    assert.equal(search.data.length, 1);
    assert.equal(search.data[0].name, 'Kernel desk');
    assert.equal(search.meta.total, 1, 'search 过滤后的匹配总数');
    assert.equal(Object.prototype.hasOwnProperty.call(search.data[0], 'notes'), false, 'notes 默认脱敏不返回');
    assert.equal(search.data[0].risk, null, 'search uses the lightweight summary projection');
    assert.deepEqual(mock.getCalls.sort(), ['assets.json', 'settings.json', 'tags.json'],
        'search fast path reads the tag catalog for display labels');

    mock.storageMap.delete('assets.json');
    const missingAssets = await handler({ op: 'count' });
    assert.equal(missingAssets.error.code, 'DOMAIN_UNAVAILABLE', 'missing assets.json must fail closed');
    seedDomainFiles(mock.storageMap);
    mock.storageMap.delete('tags.json');
    const missingTags = await handler({ op: 'search', search: 'desk' });
    assert.equal(missingTags.error.code, 'DOMAIN_UNAVAILABLE', 'missing tags.json must fail closed');
    seedDomainFiles(mock.storageMap);

    putJson(mock.storageMap, 'subscriptionPeriods.json', {
        schemaVersion: 1,
        records: [
            {
                id: '44444444-4444-4444-8444-444444444444', schemaVersion: 1,
                assetId: ASSET_IDS.subscription, occurredAt: NOW, effectiveDate: '2026-08-01',
                createdAt: NOW, source: 'user', correlationId: null, note: '', metadata: {},
                replacesEventId: null, startDate: '2026-08-01',
                endDate: '2026-08-31', paymentEventId: null, kind: 'trial',
            },
            {
                id: '55555555-5555-4555-8555-555555555555', schemaVersion: 1,
                assetId: ASSET_IDS.physical, occurredAt: NOW, effectiveDate: '2026-01-01',
                createdAt: NOW, source: 'user', correlationId: null, note: '', metadata: {},
                replacesEventId: null, voidedAt: null, kind: 'billing', startDate: '2026-01-01',
                endDate: '2026-01-31', paymentEventId: null,
            },
        ],
    });
    const detail = await handler({ op: 'detail', assetId: ASSET_IDS.subscription, includeNotes: true });
    assert.equal(detail.ok, true);
    assert.equal(detail.data.id, ASSET_IDS.subscription);
    assert.ok(detail.data.subscription, '订阅投影存在');

    const summary = await handler({ op: 'summary' });
    assert.equal(summary.ok, true);
    assert.equal(summary.data.counts.total, 3);

    // 总开关关闭
    seedSettings(mock.storageMap, { aiEnabled: false });
    assert.equal((await handler({ op: 'count' })).error.code, 'AGENT_DISABLED');
    // 查询权限关闭
    seedSettings(mock.storageMap, { aiAllowQuery: false });
    assert.equal((await handler({ op: 'count' })).error.code, 'PERMISSION_DENIED');
    // 权限错误 message 带开启位置提示（双语）
    const denied = await handler({ op: 'count' });
    assert.ok(denied.error.message.includes('资产管理设置 → AI'), 'denied message hints where to enable');
    // 数据损坏 → DOMAIN_UNAVAILABLE（不暴露本地路径）
    seedSettings(mock.storageMap);
    mock.storageMap.set('assets.json', '{not valid json');
    const broken = await handler({ op: 'count' });
    assert.equal(broken.ok, false);
    assert.equal(broken.error.code, 'DOMAIN_UNAVAILABLE');
    assert.ok(!JSON.stringify(broken).includes('D:/'));
    seedDomainFiles(mock.storageMap);
}

async function testWriteEndToEnd(mock) {
    seedDomainFiles(mock.storageMap);
    seedSettings(mock.storageMap, { aiAllowCreate: true });
    const createHandler = mock.registry.get('asset_create').handler;

    // 前端插件 stub：复用 formal-workflow-harness 的真实 Plugin 实例，
    // loadData/saveData 桥接到 kernel storageMap，业务方法打桩记录调用。
    const harness = createHarness([]);
    const plugin = bridgeHarnessToKernelStorage(harness, mock.storageMap);
    installWebLockMock(createSharedWebLockMock());
    plugin.settings = { aiEnabled: true, aiAllowCreate: true, aiAllowLifecycle: true, aiAllowRecords: true };
    plugin._formalDomainLoaded = true;
    const addAssetCalls = [];
    plugin._agentWriteMethods.addAsset = async (data, options) => {
        addAssetCalls.push({ data, options });
        return data;
    };

    let createSettled = false;
    const createPromise = createHandler({
        data: {
            kind: 'physical', name: 'Kernel bridge desk', status: 'active', currency: 'CNY',
            acquiredOn: '2026-08-18', categoryId: 'digital', tagIds: [], cover: { kind: 'none' },
            notes: '', details: { warrantyEndsOn: null, costGoal: null },
        },
        purchaseAmountMinor: '8800',
    }).then(body => {
        createSettled = true;
        return body;
    });

    // 等待 kernel 把请求写进独立 pending 文件
    const request = await waitPendingRequest(mock.storageMap, 5000, 'agent write pending request');
    assert.equal(request.method, 'addAsset');
    assert.equal(typeof request.id, 'string');
    assert.ok(request.createdAt);
    assert.equal(request.args[1].purchaseAmountMinor, 8800);
    await waitFor(() => mock.getCalls.includes(requestFile(request.id, 'completed')),
        5000, 'initial missing completed request');
    assert.equal(createSettled, false, 'missing completed file keeps the handler waiting');

    // 模拟前端轮询：认领 + 执行 + 写回结果
    await plugin._pollAgentWriteQueue();
    assert.equal(addAssetCalls.length, 1);
    assert.equal(addAssetCalls[0].data.name, 'Kernel bridge desk');
    assert.ok(mock.storageMap.has(requestFile(request.id, 'pending')), 'pending is retained as durable input');
    const processing = JSON.parse(mock.storageMap.get(requestFile(request.id, 'processing')));
    assert.equal(processing.state, 'completed');

    const body = await createPromise;
    assert.equal(body.ok, true, JSON.stringify(body));
    assert.equal(body.data.name, 'Kernel bridge desk');
    assert.equal(body.meta.operation, 'asset_create');
    const completed = JSON.parse(mock.storageMap.get(requestFile(request.id, 'completed')));
    assert.equal(completed.result.ok, true, 'completed result is durable and independently addressed');

    // 权限二次校验（前端侧拦截）：Create 关闭 → 结果 PERMISSION_DENIED，方法不被调用
    plugin.settings = { aiEnabled: true, aiAllowCreate: false };
    plugin._agentWriteMethods.updateAsset = async () => { throw new Error('should not run'); };
    const updatePromise = mock.registry.get('asset_update').handler({
        assetId: ASSET_IDS.physical,
        patch: { name: 'Should be denied' },
    });
    await waitFor(() => {
        const raw = mock.storageMap.get('agent-writes/pending-manifest.json');
        if (!raw) return null;
        const manifest = JSON.parse(raw);
        return manifest.requests && manifest.requests.find(item => item.id !== request.id);
    }, 5000, 'second pending request');
    await plugin._pollAgentWriteQueue();
    const deniedBody = await updatePromise;
    assert.equal(deniedBody.ok, false);
    assert.equal(deniedBody.error.code, 'PERMISSION_DENIED');
}

/** completed 已含 id 的 pending 请求不被重复执行，且 pending 不会被删除。 */
async function testRevivalGuard(mock) {
    seedDomainFiles(mock.storageMap);
    seedSettings(mock.storageMap);
    const harness = createHarness([]);
    const plugin = bridgeHarnessToKernelStorage(harness, mock.storageMap);
    installWebLockMock(createSharedWebLockMock());
    plugin.settings = { aiEnabled: true, aiAllowCreate: true };
    plugin._formalDomainLoaded = true;
    let calls = 0;
    plugin._agentWriteMethods.addAsset = async () => { calls++; throw new Error('revived request must not re-execute'); };

    const revivedId = 'revived-0001';
    const freshAt = new Date().toISOString();
    const request = { id: revivedId, method: 'addAsset', args: [], createdAt: freshAt };
    seedPendingRequest(mock.storageMap, request);
    putJson(mock.storageMap, requestFile(revivedId, 'completed'), {
        schemaVersion: 1, id: revivedId, completedAt: freshAt,
        result: { ok: true, data: { id: 'already-done' } },
    });

    await plugin._pollAgentWriteQueue();
    assert.equal(calls, 0, 'revived request must not re-execute');
    assert.ok(mock.storageMap.has(requestFile(revivedId, 'pending')), 'pending is never pruned');
    const resultFile = JSON.parse(mock.storageMap.get(requestFile(revivedId, 'completed')));
    assert.equal(resultFile.result.data.id, 'already-done', 'existing result not overwritten by skip');
}

/** processing 收据结构损坏或状态不确定时禁止重放业务，并返回可恢复错误。 */
async function testProcessingReceiptSafety(mock) {
    seedDomainFiles(mock.storageMap);
    seedSettings(mock.storageMap);
    const harness = createHarness([]);
    const plugin = bridgeHarnessToKernelStorage(harness, mock.storageMap);
    installWebLockMock(createSharedWebLockMock());
    plugin.settings = { aiEnabled: true, aiAllowCreate: true };
    plugin._formalDomainLoaded = true;
    let calls = 0;
    plugin._agentWriteMethods.addAsset = async () => { calls++; return { ok: true }; };

    const uncertainId = 'processing-uncertain-0001';
    const uncertainRequest = { id: uncertainId, method: 'addAsset', args: [], createdAt: NOW };
    seedPendingRequest(mock.storageMap, uncertainRequest);
    putJson(mock.storageMap, requestFile(uncertainId, 'processing'), {
        schemaVersion: 1, id: uncertainId, state: 'processing', ownerId: 'old-owner',
        token: 'old-token', claimedAt: NOW, requestCreatedAt: NOW,
    });
    await plugin._pollAgentWriteQueue();
    assert.equal(calls, 0, 'uncertain processing receipt must not replay business');
    const uncertainCompleted = JSON.parse(mock.storageMap.get(requestFile(uncertainId, 'completed')));
    assert.equal(uncertainCompleted.result.error.code, 'WRITE_RESULT_UNCERTAIN');

    const corruptId = 'processing-corrupt-0001';
    const corruptRequest = { id: corruptId, method: 'addAsset', args: [], createdAt: NOW };
    seedPendingRequest(mock.storageMap, corruptRequest);
    putJson(mock.storageMap, requestFile(corruptId, 'processing'), {
        schemaVersion: 1, id: corruptId, state: 'unexpected', ownerId: 'bad', token: 'bad', claimedAt: NOW,
    });
    await plugin._pollAgentWriteQueue();
    assert.equal(calls, 0, 'corrupt processing receipt must not execute business');
}

/** 多个 kernel 调用使用独立文件，manifest 追加不会丢失任一请求。 */
async function testQueuePushRetry(mock) {
    seedDomainFiles(mock.storageMap);
    seedSettings(mock.storageMap);
    const harness = createHarness([]);
    const plugin = bridgeHarnessToKernelStorage(harness, mock.storageMap);
    installWebLockMock(createSharedWebLockMock());
    plugin.settings = { aiEnabled: true, aiAllowCreate: true };
    plugin._formalDomainLoaded = true;
    const addAssetCalls = [];
    plugin._agentWriteMethods.addAsset = async data => { addAssetCalls.push(data); return data; };

    const handler = mock.registry.get('asset_create').handler;
    const createInput = {
        data: {
            kind: 'physical', name: 'Retry bridge desk', status: 'active', currency: 'CNY',
            acquiredOn: '2026-08-18', categoryId: 'digital', tagIds: [], cover: { kind: 'none' },
            notes: '', details: { warrantyEndsOn: null, costGoal: null },
        },
    };
    const createPromise = handler(createInput);
    const secondPromise = handler(Object.assign({}, createInput, {
        data: Object.assign({}, createInput.data, { name: 'Retry bridge chair' }),
    }));
    const manifestBefore = mock.storageMap.has('agent-writes/pending-manifest.json')
        ? JSON.parse(mock.storageMap.get('agent-writes/pending-manifest.json')).requests.length : 0;
    await waitFor(() => {
        const raw = mock.storageMap.get('agent-writes/pending-manifest.json');
        if (!raw) return null;
        const manifest = JSON.parse(raw);
        return manifest.requests && manifest.requests.length === manifestBefore + 2 ? manifest.requests : null;
    }, 5000, 'independent pending requests');
    const manifest = JSON.parse(mock.storageMap.get('agent-writes/pending-manifest.json'));
    assert.ok(mock.storageMap.has(requestFile(manifest.requests[0].id, 'pending')));
    assert.ok(mock.storageMap.has(requestFile(manifest.requests[1].id, 'pending')));
    await plugin._pollAgentWriteQueue();
    const body = await createPromise;
    const secondBody = await secondPromise;
    assert.equal(body.ok, true, JSON.stringify(body));
    assert.equal(secondBody.ok, true, JSON.stringify(secondBody));
    assert.equal(addAssetCalls.length, 2, 'independent requests execute exactly once');
    assert.equal(body.data.name, 'Retry bridge desk');
}

/** completed 文件损坏 → QUEUE_CORRUPT，且不执行 pending 请求。 */
async function testQueueCorrupt(mock) {
    seedDomainFiles(mock.storageMap);
    seedSettings(mock.storageMap);
    const handler = mock.registry.get('asset_delete').handler;
    const before = JSON.parse(mock.storageMap.get('agent-writes/pending-manifest.json')).requests.length;
    const bodyPromise = handler({ assetId: ASSET_IDS.physical });
    const request = await waitFor(() => {
        const manifest = JSON.parse(mock.storageMap.get('agent-writes/pending-manifest.json'));
        const entry = manifest.requests && manifest.requests.length > before
            ? manifest.requests[manifest.requests.length - 1] : null;
        const raw = entry && mock.storageMap.get(requestFile(entry.id, 'pending'));
        return raw ? JSON.parse(raw) : null;
    }, 5000, 'corrupt completed request');
    mock.storageMap.set(requestFile(request.id, 'completed'), '{not valid json');
    const body = await bodyPromise;
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'QUEUE_CORRUPT');
    assert.ok(!JSON.stringify(body).includes('D:/'), 'no local paths leaked');
    assert.equal(mock.storageMap.get(requestFile(request.id, 'completed')), '{not valid json', 'corrupt completed file must not be overwritten');
}

/** 多前端实例并发轮询：共享 Web Lock 选出单一执行者，持久回执阻止结果消费后的重放。 */
async function testMultiFrontendCoordinator(mock) {
    seedDomainFiles(mock.storageMap);
    seedSettings(mock.storageMap);
    mock.storageMap.delete('agent-write-lease.json');
    const request = { id: 'multi-frontend-0001', method: 'addAsset', args: [{ id: 'coordinated' }, {}], createdAt: NOW };
    seedPendingRequest(mock.storageMap, request);

    const first = bridgeHarnessToKernelStorage(createHarness([]), mock.storageMap);
    const second = bridgeHarnessToKernelStorage(createHarness([]), mock.storageMap);
    const locks = createSharedWebLockMock();
    installWebLockMock(locks);
    [first, second].forEach(plugin => {
        plugin.settings = { aiEnabled: true, aiAllowCreate: true };
        plugin._formalDomainLoaded = true;
    });
    let calls = 0;
    const execute = async data => { calls++; return data; };
    first._agentWriteMethods.addAsset = execute;
    second._agentWriteMethods.addAsset = execute;

    await Promise.all([first._pollAgentWriteQueue(), second._pollAgentWriteQueue()]);
    assert.equal(calls, 1, 'only one frontend instance executes a request');
    assert.equal(locks.calls.length, 2, 'both frontend instances use the same Web Lock coordinator');
    assert.ok(mock.storageMap.has(requestFile(request.id, 'pending')));
    const receipt = JSON.parse(mock.storageMap.get(requestFile(request.id, 'processing')));
    assert.equal(receipt.state, 'completed');

    // Simulate completed result loss followed by a stale manifest observation.
    // The durable processing receipt repairs the result without replaying business logic.
    mock.storageMap.delete(requestFile(request.id, 'completed'));
    await first._pollAgentWriteQueue();
    assert.equal(calls, 1, 'durable receipt prevents replay after result consumption');
    assert.ok(mock.storageMap.has(requestFile(request.id, 'completed')), 'completed result repaired from processing receipt');
}

/** completed 文件状态必须区分损坏、暂不可用和初始缺失。 */
async function testResultsFileErrors(mock) {
    seedDomainFiles(mock.storageMap);
    seedSettings(mock.storageMap);
    const handler = mock.registry.get('asset_delete').handler;

    const corruptBefore = JSON.parse(mock.storageMap.get('agent-writes/pending-manifest.json')).requests.length;
    const corruptPromise = handler({ assetId: ASSET_IDS.physical });
    const corruptRequest = await waitFor(() => {
        const manifest = JSON.parse(mock.storageMap.get('agent-writes/pending-manifest.json'));
        const entry = manifest.requests && manifest.requests.length > corruptBefore
            ? manifest.requests[manifest.requests.length - 1] : null;
        const raw = entry && mock.storageMap.get(requestFile(entry.id, 'pending'));
        return raw ? JSON.parse(raw) : null;
    }, 5000, 'corrupt-completed request');
    mock.storageMap.set(requestFile(corruptRequest.id, 'completed'), '{broken json');
    const corrupt = await corruptPromise;
    assert.equal(corrupt.error.code, 'QUEUE_CORRUPT');

    const unavailableBefore = JSON.parse(mock.storageMap.get('agent-writes/pending-manifest.json')).requests.length;
    const unavailablePromise = handler({ assetId: ASSET_IDS.physical });
    const unavailableRequest = await waitFor(() => {
        const manifest = JSON.parse(mock.storageMap.get('agent-writes/pending-manifest.json'));
        const entry = manifest.requests && manifest.requests.length > unavailableBefore
            ? manifest.requests[manifest.requests.length - 1] : null;
        const raw = entry && mock.storageMap.get(requestFile(entry.id, 'pending'));
        return raw ? JSON.parse(raw) : null;
    }, 5000, 'unavailable-completed request');
    const originalGet = mock.siyuan.storage.get;
    mock.siyuan.storage.get = async filePath => {
        if (filePath === requestFile(unavailableRequest.id, 'completed')) throw new Error('temporary I/O failure');
        return originalGet(filePath);
    };
    const unavailable = await unavailablePromise;
    mock.siyuan.storage.get = originalGet;
    assert.equal(unavailable.error.code, 'QUEUE_UNAVAILABLE');
}

/** 永不 resolve 的 kernel storage I/O 必须在注入的短 deadline 内返回 WRITE_TIMEOUT。 */
async function testStorageIoTimeouts(mock) {
    seedDomainFiles(mock.storageMap);
    seedSettings(mock.storageMap);
    const handler = mock.registry.get('asset_delete').handler;
    const originalGet = mock.siyuan.storage.get;
    const originalPut = mock.siyuan.storage.put;
    const targetManifest = 'agent-writes/pending-manifest.json';
    const never = () => new Promise(() => {});
    mock.siyuan.__assetManagementTestWriteTimeoutMs = 40;

    async function assertTimeout(label) {
        const startedAt = Date.now();
        const body = await handler({ assetId: ASSET_IDS.physical });
        assert.equal(body.ok, false, label);
        assert.equal(body.error.code, 'WRITE_TIMEOUT', label);
        assert.ok(Date.now() - startedAt < 1000, label + ' must honor the short deadline');
    }

    try {
        mock.siyuan.storage.get = async filePath => filePath === targetManifest
            ? never() : originalGet(filePath);
        await assertTimeout('storage.get that never resolves');

        mock.siyuan.storage.get = async filePath => filePath === targetManifest
            ? { text: never } : originalGet(filePath);
        await assertTimeout('response.text that never resolves');

        mock.siyuan.storage.get = originalGet;
        mock.siyuan.storage.put = async (filePath, content) => filePath === targetManifest
            ? never() : originalPut(filePath, content);
        await assertTimeout('storage.put that never resolves');

        mock.siyuan.storage.put = originalPut;
        mock.siyuan.storage.get = async filePath => filePath.indexOf('agent-writes/completed/') === 0
            ? never() : originalGet(filePath);
        await assertTimeout('completed storage.get that never resolves');
    } finally {
        mock.siyuan.storage.get = originalGet;
        mock.siyuan.storage.put = originalPut;
        delete mock.siyuan.__assetManagementTestWriteTimeoutMs;
    }
}

async function testUnload(mock) {
    await global.siyuan.plugin.lifecycle.onunload();
    assert.equal(mock.registry.size, 0, 'all capabilities unregistered');
    const heartbeat = JSON.parse(mock.storageMap.get('agent-kernel-status.json'));
    assert.ok(heartbeat.unloadedAt);
    assert.deepEqual(heartbeat.tools, []);

    // 卸载后可重新注册（registeredTools 已清空）
    await global.siyuan.plugin.lifecycle.onload();
    assert.equal(mock.registry.size, 9);
}

async function testMcpRegistrationPriority() {
    await global.siyuan.plugin.lifecycle.onunload();
    const mock = createSiyuanMock('both');
    global.siyuan = mock.siyuan;
    delete require.cache[require.resolve(KERNEL_FILE)];
    require(KERNEL_FILE);
    await global.siyuan.plugin.lifecycle.onload();

    assert.equal(mock.registry.size, 9);
    mock.registry.forEach(tool => assert.equal(tool.api, 'registerTool', '3.8.1 MCP API has priority'));
    const status = JSON.parse(mock.storageMap.get('agent-kernel-status.json'));
    assert.equal(status.api, 'registerTool');
    const create = mock.registry.get('asset_create');
    assert.equal(create.config.effects, undefined, 'MCP config omits legacy effects metadata');
    const missingAction = await create.handler({ data: {} });
    assert.equal(missingAction.error.code, 'INVALID_ACTION', 'MCP writes require an action for confirmation');
    const forgedReadAction = await create.handler({ action: 'query', data: {} });
    assert.equal(forgedReadAction.error.code, 'INVALID_ACTION', 'read action cannot authorize a write tool');

    seedDomainFiles(mock.storageMap);
    seedSettings(mock.storageMap);
    const createPromise = create.handler({
        action: 'create',
        data: {
            kind: 'physical', name: 'MCP numeric price', status: 'active', currency: 'CNY',
            acquiredOn: '2026-08-19', categoryId: 'digital', tagIds: [], cover: { kind: 'none' },
            notes: '', details: { warrantyEndsOn: null, costGoal: null },
        },
        purchaseAmountMinor: 1,
    });
    const request = await waitFor(() => {
        const raw = mock.storageMap.get('agent-writes/pending-manifest.json');
        if (!raw) return null;
        const manifest = JSON.parse(raw);
        const entry = manifest.requests && manifest.requests[manifest.requests.length - 1];
        const pending = entry && mock.storageMap.get(requestFile(entry.id, 'pending'));
        return pending ? JSON.parse(pending) : null;
    }, 5000, 'MCP numeric create queue request');
    assert.equal(request.args[1].purchaseAmountMinor, 1, 'top-level numeric amount survives MCP parsing');
    putJson(mock.storageMap, requestFile(request.id, 'completed'), {
        schemaVersion: 1, id: request.id, completedAt: NOW,
        result: { ok: true, data: request.args[0] },
    });
    const created = await createPromise;
    assert.equal(created.ok, true);

    const record = mock.registry.get('asset_record');
    const wrongCorrectionAction = await record.handler({
        action: 'create', op: 'subscriptionPaymentAmount', assetId: ASSET_IDS.subscription, amountMinor: 2000,
    });
    assert.equal(wrongCorrectionAction.error.code, 'INVALID_ACTION', 'price correction requires update action');
    const correctionPromise = record.handler({
        action: 'update', op: 'subscriptionPaymentAmount', assetId: ASSET_IDS.subscription, amountMinor: 2000,
    });
    const correctionRequest = await waitFor(() => {
        const raw = mock.storageMap.get('agent-writes/pending-manifest.json');
        if (!raw) return null;
        const manifest = JSON.parse(raw);
        const entry = manifest.requests && manifest.requests.find(item => {
            const pending = mock.storageMap.get(requestFile(item.id, 'pending'));
            return pending && JSON.parse(pending).method === 'correctSubscriptionPaymentAmount';
        });
        return entry ? JSON.parse(mock.storageMap.get(requestFile(entry.id, 'pending'))) : null;
    }, 5000, 'subscription price correction queue request');
    assert.deepEqual(correctionRequest.args, [ASSET_IDS.subscription, { amountMinor: 2000 }]);
    putJson(mock.storageMap, requestFile(correctionRequest.id, 'completed'), {
        schemaVersion: 1, id: correctionRequest.id, completedAt: NOW,
        result: { ok: true, data: { corrected: true } },
    });
    const correction = await correctionPromise;
    assert.equal(correction.ok, true);

    const wrongCreateAction = await record.handler({
        action: 'update', op: 'maintenance', assetId: ASSET_IDS.physical, type: 'maintain', amountMinor: 0,
    });
    assert.equal(wrongCreateAction.error.code, 'INVALID_ACTION', 'new records require create action');
    await global.siyuan.plugin.lifecycle.onunload();
    assert.equal(mock.registry.size, 0);
}

async function testRegistrationRollbackAndRetry() {
    const options = {
        failRegisterAt: 3,
        storeBeforeFail: true,
        failRegisterMessage: 'injected register failure at D:/private/agent-registry.js',
    };
    const mock = createSiyuanMock('agent', options);
    global.siyuan = mock.siyuan;
    delete require.cache[require.resolve(KERNEL_FILE)];
    require(KERNEL_FILE);
    await assert.rejects(() => global.siyuan.plugin.lifecycle.onload(), /injected register failure/);
    assert.equal(mock.registry.size, 0, 'partial registration is rolled back');
    const failed = JSON.parse(mock.storageMap.get('agent-kernel-status.json'));
    assert.equal(failed.api, 'registerCapability');
    assert.ok(failed.failedAt);
    assert.equal(failed.error.code, 'REGISTRATION_FAILED');
    assert.deepEqual(failed.tools, []);
    assert.ok(!JSON.stringify(failed).includes('D:/private'), 'failed heartbeat redacts local paths');

    options.failRegisterAt = 0;
    await global.siyuan.plugin.lifecycle.onload();
    assert.equal(mock.registry.size, 9, 'onload can retry after rollback');
    const recovered = JSON.parse(mock.storageMap.get('agent-kernel-status.json'));
    assert.deepEqual(recovered.tools, TOOL_NAMES);
    await global.siyuan.plugin.lifecycle.onunload();
}

function testStaticAssertions() {
    const template = fs.readFileSync(path.join(ROOT, 'src.template.js'), 'utf8');
    assert.doesNotMatch(template, /this\.addAgentAction\(/, 'frontend no longer calls addAgentAction');
    const kernel = fs.readFileSync(KERNEL_FILE, 'utf8');
    assert.doesNotMatch(kernel, /require\s*\(\s*["']siyuan["']\s*\)/, 'kernel.js cannot require siyuan');
    assert.ok(kernel.includes('__am_agent_actions'), 'kernel.js inlines agent-actions IIFE');
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugin.json'), 'utf8'));
    assert.deepEqual(pkg.kernels, ['all'], 'plugin.json declares kernel plugin');
    assert.equal(pkg.version, '2.6.0');
}

(async () => {
    const mock = createSiyuanMock();
    global.siyuan = mock.siyuan;
    delete require.cache[require.resolve(KERNEL_FILE)];
    require(KERNEL_FILE);

    await testRegistration(mock);
    await testQuery(mock);
    await testWriteEndToEnd(mock);
    await testRevivalGuard(mock);
    await testProcessingReceiptSafety(mock);
    await testQueuePushRetry(mock);
    await testMultiFrontendCoordinator(mock);
    await testResultsFileErrors(mock);
    await testStorageIoTimeouts(mock);
    await testQueueCorrupt(mock);
    await testUnload(mock);
    testStaticAssertions();
    await testMcpRegistrationPriority();
    await testRegistrationRollbackAndRetry();
    console.log('[kernel-agent] passed');
})().catch(error => {
    console.error('[kernel-agent] failed:', error && error.stack || error);
    process.exitCode = 1;
});
