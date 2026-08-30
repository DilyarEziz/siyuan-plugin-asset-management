'use strict';

const Module = require('node:module');
const { parseHTML } = require('linkedom');
const { createStorage } = require('../api/storage');
const { createFormalV2AssetWrapper, newFormalV2Asset } = require('../api/assets');

const NOW = '2026-07-19T08:00:00.000Z';
const clone = value => value == null ? value : structuredClone(value);

function loadProductionPlugin(document, dialogStats) {
    const original = Module._load;
    Object.defineProperty(global, 'navigator', { value: { userAgent: '' }, configurable: true });
    Object.defineProperty(global, 'document', { value: document, configurable: true });
    Module._load = function(request, parent, isMain) {
        if (request === 'siyuan') return {
            Plugin: class { constructor(options) { Object.assign(this, options || {}); } },
            Dialog: class {
                constructor(options) {
                    this.destroyed = false;
                    this.element = document.createElement('div');
                    this.element.innerHTML = `<div class="b3-dialog"><h2>${options.title}</h2>${options.content}</div>`;
                    wireForms(this.element);
                    document.body.appendChild(this.element);
                    dialogStats.created += 1;
                    dialogStats.instances.push(this);
                }
                destroy() {
                    if (this.destroyed) return;
                    this.destroyed = true;
                    dialogStats.destroyed += 1;
                    this.element.remove();
                }
            },
            Menu: class {},
        };
        return original.call(this, request, parent, isMain);
    };
    try { delete require.cache[require.resolve('../index.js')]; return require('../index.js'); }
    finally { Module._load = original; }
}

function wireForms(root) {
    root.querySelectorAll('form').forEach(form => {
        const elements = new Proxy({}, { get(_target, name) { return form.querySelector(`[name="${String(name)}"]`) || undefined; } });
        Object.defineProperty(form, 'elements', { value: elements, configurable: true });
        form.checkValidity = () => true;
        form.reportValidity = () => {};
        // linkedom 的 css-select 编译不了 :invalid 伪类（浏览器标准，生产代码正常使用）。
        // 忠实模拟浏览器语义：表单 checkValidity()=false 时 :invalid 命中首个命名控件，
        // 否则无命中返回 null。harness 通过 stub checkValidity 控制校验结果。
        const nativeQuery = form.querySelector.bind(form);
        form.querySelector = selector => {
            if (String(selector) === ':invalid') {
                const formValid = typeof form.checkValidity === 'function' ? form.checkValidity() : true;
                if (formValid) return null;
                return nativeQuery('[name]') || null;
            }
            return nativeQuery(selector);
        };
    });
}

function setValue(root, name, value) {
    const control = root.querySelector(`[name="${name}"]`);
    if (!control) throw new Error('missing control ' + name);
    if (control.localName === 'select') {
        control.querySelectorAll('option').forEach(option => {
            if (option.value === String(value)) option.setAttribute('selected', ''); else option.removeAttribute('selected');
        });
    } else control.value = String(value);
    return control;
}

const flushDialog = () => new Promise(resolve => setTimeout(resolve, 5));

function details(kind, usageEnabled) {
    if (kind === 'physical') return { warrantyEndsOn: null, costGoal: null };
    if (kind === 'virtualSubscription') return { planName: 'Pro', accountLabel: null, billingPlan: { cycle: 'monthly' }, autoRenew: true };
    if (kind === 'virtualPerpetual') return { licenseAccountLabel: null };
    return { provider: kind === 'prepaidAmount' ? 'Store' : 'Gym', expiresOn: null };
}

function asset(id, kind, name, usageEnabled) {
    return newFormalV2Asset({ id, kind, name: name || kind, status: 'active', currency: 'CNY', acquiredOn: '2026-07-01',
        statusChangedOn: '2026-07-01', tagIds: [], cover: { kind: 'none' }, notes: '',
        createdAt: NOW, updatedAt: NOW, details: details(kind, usageEnabled) });
}

function createHarness(assets) {
    const { document, window } = parseHTML('<!doctype html><html><body></body></html>');
    Object.defineProperty(global, 'window', { value: window, configurable: true });
    if (!global.URL.createObjectURL) global.URL.createObjectURL = () => 'blob:test';
    if (!global.URL.revokeObjectURL) global.URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function() { this._clicked = true; };
    const dialogStats = { created: 0, destroyed: 0, instances: [] };
    const Plugin = loadProductionPlugin(document, dialogStats);
    const state = {
        'assets.json': createFormalV2AssetWrapper(assets, { updatedAt: NOW }),
        'tags.json': { schemaVersion: 1, tags: [], updatedAt: NOW },
        'wishlistEvents.json': { schemaVersion: 1, events: [], updatedAt: NOW },
        'operationLogs.json': { schemaVersion: 1, logs: [], updatedAt: NOW },
        'maintenance.json': { schemaVersion: 1, records: [], updatedAt: NOW },
        'usage.json': { schemaVersion: 1, records: [], updatedAt: NOW },
        'prepaidTransactions.json': { schemaVersion: 1, records: [], updatedAt: NOW },
        'financialEvents.json': { schemaVersion: 1, events: [], updatedAt: NOW },
        'lifecycleEvents.json': { schemaVersion: 1, events: [], updatedAt: NOW },
        'subscriptionPeriods.json': { schemaVersion: 1, records: [], updatedAt: NOW },
        'exchangeRates.json': { schemaVersion: 1, baseCurrency: 'CNY', rates: {}, updatedAt: NOW },
    };
    const io = { failFile: null, failReadFile: null, writes: [] };
    const plugin = new Plugin({
        async loadData(name) {
            if (io.failReadFile === name) throw new Error('injected read failure for ' + name);
            return clone(state[name] == null ? null : state[name]);
        },
        async saveData(name, value) {
            io.writes.push(name);
            if (io.failFile === name) return false;
            state[name] = clone(value);
            return true;
        },
        async removeData(name) { delete state[name]; return true; },
    });
    plugin.storage = createStorage(plugin);
    plugin.assets = clone(assets);
    plugin._assetsLoadedOk = true;
    plugin._assetLoadError = null;
    plugin._formalDomainLoaded = true;
    plugin._tags = [];
    plugin._formalDomainStateSnapshot = {
        assets: clone(assets), tags: [], financialEvents: [], lifecycleEvents: [],
        subscriptionPeriods: [], prepaidTransactions: [], usage: [], maintenance: [],
        wishlistEvents: [], operationLogs: [],
        exchangeRates: { schemaVersion: 1, baseCurrency: 'CNY', rates: {} },
    };
    plugin.toasts = [];
    plugin.showToast = message => { plugin.toasts.push(String(message)); };
    plugin._onDataCommitted = () => {};
    return { plugin, state, io, document, clone, dialogStats,
        connectedDialogs: () => dialogStats.instances.filter(dialog => dialog.element.isConnected) };
}

module.exports = { NOW, asset, createHarness, flushDialog, setValue, wireForms };
