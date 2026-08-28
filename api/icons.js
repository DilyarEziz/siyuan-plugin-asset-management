/* eslint-disable no-undef */
/**
 * SiYuan 资产管理插件 — icons.js
 *
 * 内置 SVG symbol 库（addIcons 注册到思源顶栏 / TabBar）：
 *   iconAssetManagement, iconHome, iconChart, iconFilter, iconChevronDown, iconDots, iconGithub
 *
 * ICONS_BY_CATEGORY 当前为空对象（4 分类都是 emoji，不需要 SVG），
 * 预留字段为以后扩展「系统图标选择器」（v1 方案 M18）使用。
 *
 * 接口：
 *   icons.getAllSymbols() → 返回所有 symbol 拼接字符串
 */

'use strict';

const ICON_DEFS = {
    iconAssetManagement:
        '<path fill="currentColor" fill-rule="evenodd" d="M12 1.25c-.605 0-1.162.15-1.771.402c-.589.244-1.273.603-2.124 1.05L6.037 3.787c-1.045.548-1.88.987-2.527 1.418c-.668.447-1.184.917-1.559 1.554c-.374.635-.542 1.323-.623 2.142c-.078.795-.078 1.772-.078 3.002v.194c0 1.23 0 2.207.078 3.002c.081.82.25 1.507.623 2.142c.375.637.89 1.107 1.56 1.554c.645.431 1.481.87 2.526 1.418l2.068 1.085c.851.447 1.535.806 2.124 1.05c.61.252 1.166.402 1.771.402s1.162-.15 1.771-.402c.589-.244 1.273-.603 2.124-1.05l2.068-1.084c1.045-.549 1.88-.988 2.526-1.419c.67-.447 1.185-.917 1.56-1.554c.374-.635.542-1.323.623-2.142c.078-.795.078-1.772.078-3.001v-.196c0-1.229 0-2.206-.078-3.001c-.081-.82-.25-1.507-.623-2.142c-.375-.637-.89-1.107-1.56-1.554c-.645-.431-1.481-.87-2.526-1.418l-2.068-1.085c-.851-.447-1.535-.806-2.124-1.05c-.61-.252-1.166-.402-1.771-.402M8.77 4.046c.89-.467 1.514-.793 2.032-1.007c.504-.209.859-.289 1.198-.289c.34 0 .694.08 1.198.289c.518.214 1.141.54 2.031 1.007l2 1.05c1.09.571 1.855.974 2.428 1.356c.282.189.503.364.683.54l-3.331 1.665l-8.5-4.474zm-1.825.958l-.174.092c-1.09.571-1.855.974-2.427 1.356a4.7 4.7 0 0 0-.683.54L12 11.162l3.357-1.68l-8.206-4.318a.8.8 0 0 1-.206-.16M2.938 8.307c-.05.214-.089.457-.117.74c-.07.714-.071 1.617-.071 2.894v.117c0 1.278 0 2.181.071 2.894c.069.697.2 1.148.423 1.528c.222.377.543.696 1.1 1.068c.572.382 1.337.785 2.427 1.356l2 1.05c.89.467 1.513.793 2.031 1.007q.244.101.448.165v-8.663zm9.812 12.818q.204-.063.448-.164c.518-.214 1.141-.54 2.031-1.007l2-1.05c1.09-.572 1.855-.974 2.428-1.356c.556-.372.877-.691 1.1-1.068c.223-.38.353-.83.422-1.528c.07-.713.071-1.616.071-2.893v-.117c0-1.278 0-2.181-.071-2.894a6 6 0 0 0-.117-.74L17.75 9.963V13a.75.75 0 0 1-1.5 0v-2.286l-3.5 1.75z" clip-rule="evenodd"/>',
    iconHome: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"/>',
    iconChart: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 3v18h18M7 16V11M11 16V8M15 16V13M19 16V6"/>',
    iconFilter: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    iconChevronDown: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6"/>',
    iconDots: '<circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>',
    iconGithub: '<path fill="currentColor" d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.92c.58.1.79-.25.79-.55v-2.13c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.27-1.68-1.27-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.45.11-3.03 0 0 .97-.31 3.18 1.18c.92-.26 1.91-.39 2.89-.39s1.97.13 2.89.39c2.21-1.49 3.18-1.18 3.18-1.18.62 1.58.23 2.74.11 3.03.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.13v3.16c0 .31.21.66.79.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z"/>',
};

const ICONS_BY_CATEGORY = Object.freeze({
    digital: [],
    appliance: [],
    home: [],
    other: [],
});

function makeSymbol(id, inner) {
    return '<symbol id="' + id + '" viewBox="0 0 24 24">' + inner + '</symbol>';
}

function getIconSymbol(name) {
    const inner = ICON_DEFS[name];
    return inner ? makeSymbol(name, inner) : '';
}

function getIconSVG(name) {
    const inner = ICON_DEFS[name];
    return inner ? '<svg viewBox="0 0 24 24" fill="none">' + inner + '</svg>' : '';
}

function getAllSymbols() {
    return Object.keys(ICON_DEFS).map(k => makeSymbol(k, ICON_DEFS[k])).join('');
}

function getCategorySymbols(category) {
    const list = ICONS_BY_CATEGORY[category];
    if (!list) return '';
    return list.map(name => makeSymbol(name, ICON_DEFS[name] || '')).join('');
}

function getIconsByCategory(category) {
    const list = ICONS_BY_CATEGORY[category];
    return list ? list.slice() : [];
}

function getAllIconNames() {
    return Object.keys(ICON_DEFS);
}

function getIconCounts() {
    const result = {};
    let total = 0;
    for (const cat of Object.keys(ICONS_BY_CATEGORY)) {
        const n = ICONS_BY_CATEGORY[cat].length;
        result[cat] = n;
        total += n;
    }
    result.total = total;
    return result;
}

module.exports = {
    ICON_DEFS: ICON_DEFS,
    ICONS_BY_CATEGORY: ICONS_BY_CATEGORY,
    getIconSVG: getIconSVG,
    getIconSymbol: getIconSymbol,
    getAllSymbols: getAllSymbols,
    getCategorySymbols: getCategorySymbols,
    getIconsByCategory: getIconsByCategory,
    getAllIconNames: getAllIconNames,
    getIconCounts: getIconCounts,
};
