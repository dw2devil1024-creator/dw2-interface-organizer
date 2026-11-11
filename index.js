import { extensionTypes, openThirdPartyExtensionMenu } from '../../../extensions.js';
import { getRequestHeaders } from '../../../../script.js';
/* DW2 · Interface Organizer | Private-use beta
 * Owns only three surfaces: native hamburger menu, magic-wand entries, and
 * the outer layout of the native Extensions settings drawer.
 * It does NOT edit chat, presets, world books, regex rules, or API data.
 */
const STORE = 'dw2InterfaceOrganizer';
const ROOT_ID = 'dw2io-dialog';
const WAND_MORE_ID = 'dw2io-wand-more';
const SETTINGS_ID = 'dw2io-settings';
const EXTRA_ID = 'dw2io-more-menu';
const EXT_HEADER_ID = 'dw2io-ext-more';
const VERSION = '0.1.21-beta.1';

const NATIVE_MENU = [
  ['option_toggle_AN', '作者注释'],
  ['option_toggle_CFG', 'CFG 缩放'],
  ['option_toggle_logprobs', 'Token 概率'],
  ['option_convert_to_group', '转换为群聊'],
  ['option_impersonate', 'AI 帮答'],
];
const DEFAULTS = Object.freeze({
  enabled: true,
  menuEnabled: true,
  menuFolded: NATIVE_MENU.map(pair => pair[0]),
  wandEnabled: true,
  wandHidden: [],
  wandExpanded: false,
  extensionsEnabled: true,
  extensionsFolded: [],
  extensionsExpanded: false,
  foldExtras: true,
  worldLayoutEnabled: false,
});
const allowedKeys = Object.keys(DEFAULTS);
let active = false, state = null, retries = 0, busy = false;
let ctx = null, overlay = null, settingsEntry = null, wandMore = null;
let menuBox = null, menuBody = null, menuPlan = '', menuExpanded = false;
let extParent = null, extMore = null;
const extOrders = new Map();
let extExtraNodes = new Set();
let extHidden = new Set(), wandBody = null;
const wandMoved = new Map();
const wandHolders = new Map();
const wandEmptyWrappers = new Set();
const moved = new Map();
const observed = new Map();
const cleanup = [];
const openParts = new Set(['menu', 'wand', 'extensions']);
let refreshTimer = 0;
let updateInProgress = false;
let worldRoot = null, worldList = null, worldObserver = null, worldFrame = 0;
let worldToolbar = null, worldTopline = null, worldOriginalTools = null, worldDrawer = null;
let worldCreateOriginalAttributes = null;
const worldMoved = new Map();

const $ = (s, base=document) => base.querySelector(s);
const byId = id => document.getElementById(id);
const el = (tag, className='', label) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (label != null) e.textContent = label;
  return e;
};
const defer = callback => { const id = setTimeout(callback,0); return id; };
function normalize(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = { ...DEFAULTS };
  for (const key of allowedKeys) {
    const fallback = DEFAULTS[key];
    if (Array.isArray(fallback)) out[key] = [...new Set((Array.isArray(raw[key]) ? raw[key] : fallback).filter(x => typeof x === 'string' && x.length < 240))].slice(0,400);
    else out[key] = typeof raw[key] === 'boolean' ? raw[key] : fallback;
  }
  return out;
}
function save(patch) {
  state = normalize({ ...state, ...patch });
  const latest = globalThis.SillyTavern?.getContext?.() || ctx;
  if (latest?.extensionSettings) {
    latest.extensionSettings[STORE] = state;
    latest.saveSettingsDebounced?.();
  }
  scan();
  if (overlay) renderPanel();
}
function tryLoadState() {
  ctx = globalThis.SillyTavern?.getContext?.() || null;
  if (!ctx?.extensionSettings) return false;
  state = normalize(ctx.extensionSettings[STORE]);
  ctx.extensionSettings[STORE] = state;
  return true;
}
function safeLabel(node) {
  return String(node?.querySelector?.('b,strong,span')?.textContent || node?.textContent || node?.getAttribute?.('title') || '')
    .replace(/\s+/g,' ').trim().slice(0,65);
}
function button(text, callback, cls='') {
  const b = el('button','dw2io-button '+cls,text);
  b.type = 'button'; b.addEventListener('click',callback); return b;
}
function checkbox(text, checked, callback, description='') {
  const row = el('label','dw2io-check');
  const input = el('input'); input.type = 'checkbox'; input.checked = !!checked;
  input.addEventListener('change',() => callback(input.checked));
  const mark = el('span','dw2io-check-mark'); mark.setAttribute('aria-hidden','true');
  const span = el('span','dw2io-check-copy'); span.append(el('span','',text));
  if (description) span.append(el('small','',description));
  row.append(input,mark,span);return row;
}
function notify(message,kind='info') {
  if(globalThis.toastr?.[kind])globalThis.toastr[kind](String(message),'DW2 · 界面整理');
  else console[kind==='warning'?'warn':'info']('[DW2 Interface Organizer]',message);
}

// ---------- Surface 1: original native hamburger items ----------
// We move the SAME original elements; native click handlers and listeners survive.
// A placeholder records each original position and makes disable reversible.
function restoreMenu() {
  for (const [item, placeholder] of moved) {
    if (placeholder.isConnected) placeholder.replaceWith(item);
    placeholder.remove();
  }
  moved.clear();
  menuBox?.remove(); menuBody?.remove();
  menuBox = menuBody = null;
  menuPlan = '';
}
function updateMoreButton() {
  if (!menuBox || !menuBody) return;
  menuBody.hidden = !menuExpanded;
  menuBox.setAttribute('aria-expanded',String(menuExpanded));
  const ico=el('i','fa-solid fa-ellipsis fa-lg');
  ico.setAttribute('aria-hidden','true');
  menuBox.replaceChildren(ico,el('span','',menuExpanded?'收起更多工具 ▴':`更多工具（${moved.size}） ▾`));
}
function applyMenu() {
  const root = $('#options .options-content');
  const ids = state.enabled && state.menuEnabled
    ? state.menuFolded.filter(id=>NATIVE_MENU.some(pair=>pair[0]===id)) : [];
  const available = ids.map(id=>byId(id)).filter(item=>item && root?.contains(item));
  const wanted = root && available.length ? available.map(item=>item.id).join('|') : '';
  if (menuBox?.parentElement===root && menuBody?.parentElement===root
      && wanted===menuPlan && moved.size===available.length) return;
  restoreMenu();
  if (!root || !available.length) return;
  // Direct child like native TT menu items: allow active theme rules to style it.
  const native=available.find(item=>item.matches('a,button')) || root.querySelector('a,button');
  menuBox=el('a',native?.className || 'interactable');
  menuBox.id=EXTRA_ID;
  menuBox.classList.add('dw2io-more-trigger');
  menuBox.setAttribute('role','button');menuBox.tabIndex=0;
  menuBox.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();
    menuExpanded=!menuExpanded;updateMoreButton();
  });
  menuBox.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();menuBox.click();}
  });
  menuBody=el('div','dw2io-more-body');
  menuBody.id='dw2io-more-body';
  root.append(menuBox,menuBody);
  for(const item of available){
    const original=document.createComment('DW2 original menu position');
    item.before(original);moved.set(item,original);menuBody.append(item);
  }
  menuPlan=wanted;updateMoreButton();
}
// ---------- Surface 2: wand entry visibility ----------
const keyFor = (e, context) => e.id ? 'id:'+e.id : context+':'+(e.dataset?.extension || e.getAttribute('title') || safeLabel(e));
function listWand() {
  const root = byId('extensionsMenu'); if (!root) return [];
  const found = [], seen = new Map();
  for (const outer of root.children) {
    if (outer.id === WAND_MORE_ID || outer.id === 'dw2io-wand-body' || outer.matches('script,style,hr,template,input,textarea,select')) continue;
    const entries = outer.classList.contains('extension_container') ? [...outer.children] : [outer];
    for (const e of entries) {
      if (e.matches('script,style,hr,template,input,textarea,select')) continue;
      // Do not hide whole containers that contain settings inputs.
      if (e.querySelector('input,textarea,select') && !e.matches('button,a,[role="menuitem"],.list-group-item')) continue;
      const label = safeLabel(e); if (!label) continue;
      const stem = keyFor(e,'wand');
      const count = (seen.get(stem)||0)+1;seen.set(stem,count);
      found.push({key:stem+(count>1?':'+count:''),label,element:e,wrapper:outer});
    }
  }
  // Entries currently inside our folded body still belong to the wand inventory.
  // Keep the original key stable while the DOM node is moved.
  const keys=new Set(found.map(c=>c.key));
  for(const entry of wandMoved.values()){
    const c=entry.choice;
    if(c.element.isConnected && root.contains(c.element) && !keys.has(c.key)){
      found.push(c);keys.add(c.key);
    }
  }
  return found;
}
function restoreWandItem(node,record){
  if(record.marker.parentNode)record.marker.replaceWith(node);
  else node.remove(); // The original plugin rebuilt or removed its source container.
  record.marker.remove();
  wandMoved.delete(node);
}
function clearWand(){
  for(const [node,record] of [...wandMoved])restoreWandItem(node,record);
  for(const node of wandEmptyWrappers)node.classList.remove('dw2io-wand-empty');
  wandEmptyWrappers.clear();
  for(const holder of wandHolders.values())holder.remove();
  wandHolders.clear();
  wandBody?.remove();wandBody=null;
  wandMore?.remove();wandMore=null;
}
function ensureWandMore(root){
  if(wandMore?.parentElement===root && wandBody?.parentElement===root)return;
  // On native menu replacement, restore before constructing a new section.
  clearWand();
  wandMore=el('a','interactable dw2io-wand-more');
  wandMore.id=WAND_MORE_ID;
  wandMore.setAttribute('role','button');wandMore.tabIndex=0;
  wandBody=el('div','dw2io-wand-body');
  wandBody.id='dw2io-wand-body';
  wandMore.setAttribute('aria-controls',wandBody.id);
  wandMore.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();
    save({wandExpanded:!state.wandExpanded});
  });
  wandMore.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();wandMore.click();}
  });
  root.append(wandMore,wandBody);
}
function moveWandItem(choice){
  const node=choice.element;
  if(wandMoved.has(node))return;
  if(!node.parentNode)return;
  const parent=node.parentNode;
  const marker=document.createComment('DW2 original wand position');
  node.before(marker);
  wandMoved.set(node,{choice,marker});
  if(choice.wrapper!==node && choice.wrapper?.classList?.contains('extension_container')){
    let holder=wandHolders.get(parent);
    if(!holder){
      // Preserve the original native extension-container class for child entries.
      holder=el('div',parent.className);
      holder.classList.add('dw2io-wand-group');
      holder.removeAttribute('id');
      wandHolders.set(parent,holder);
      wandBody.append(holder);
    }
    holder.append(node);
  }else{
    wandBody.append(node);
  }
}
function applyWand(choices){
  const root=byId('extensionsMenu');
  const selected=state.enabled && state.wandEnabled
    ?choices.filter(c=>state.wandHidden.includes(c.key)):[];
  if(!root || !selected.length){clearWand();return;}
  ensureWandMore(root);
  const wanted=new Set(selected.map(c=>c.element));
  for(const [node,record] of [...wandMoved]){
    if(!wanted.has(node) || !node.isConnected || !root.contains(node))restoreWandItem(node,record);
  }
  for(const choice of selected)moveWandItem(choice);
  for(const [parent,holder] of [...wandHolders]){
    if(!holder.children.length){holder.remove();wandHolders.delete(parent);}
  }
  for(const outer of wandEmptyWrappers)outer.classList.remove('dw2io-wand-empty');
  wandEmptyWrappers.clear();
  for(const record of wandMoved.values()){
    const outer=record.choice.wrapper;
    if(outer?.classList?.contains('extension_container') && !outer.childElementCount){
      outer.classList.add('dw2io-wand-empty');wandEmptyWrappers.add(outer);
    }
  }
  // Downwards expansion: the ORIGINAL entries live after the trigger,
  // instead of reappearing above their control.
  wandBody.hidden=!state.wandExpanded;
  wandMore.setAttribute('aria-expanded',String(state.wandExpanded));
  wandMore.replaceChildren(
    el('i','fa-solid fa-ellipsis fa-lg'),
    el('span','',`${state.wandExpanded?'收起更多工具':'更多工具'}（${selected.length}）${state.wandExpanded?' ▴':' ▾'}`)
  );
}

// ---------- Surface 3: extension drawer's outer columns ONLY ----------
function listExtensionSettings() {
  const found=[];let i=0;
  for (const id of ['extensions_settings','extensions_settings2']) {
    const root=byId(id); if (!root) continue;
    for (const item of root.children) {
      if (item.id === SETTINGS_ID || item.id === EXT_HEADER_ID || item.matches('script,style,link,template')) continue;
      const header = $('.inline-drawer-header',item) || (item.matches('.inline-drawer-header')?item:null);
      if(!header) continue;
      const label=safeLabel(header) || '扩展设置 '+(++i);
      found.push({key:keyFor(item,'extension'),label,element:item,root});
    }
  }
  // Distinguish two unnamed items without changing their native IDs.
  const dupes=new Map();
  return found.map(item=>{const n=(dupes.get(item.key)||0)+1;dupes.set(item.key,n);return {...item,key:item.key+(n>1?':'+n:'')};});
}
// Preserve a theme's pre-existing inline order. Do not overwrite it permanently.
function setOrder(node,value){
  const applied=String(value);
  if(!extOrders.has(node)){
    extOrders.set(node,{before:node.style.getPropertyValue('order'),
      priority:node.style.getPropertyPriority('order')});
  }
  if(node.style.getPropertyValue('order')!==applied || node.style.getPropertyPriority('order')!=='important'){
    node.style.setProperty('order',applied,'important');
  }
}
function resetOrders(){
  for(const [node,record] of extOrders){
    if(record.before)node.style.setProperty('order',record.before,record.priority);
    else node.style.removeProperty('order');
  }
  extOrders.clear();
}
const SYSTEM_IDS = [
  'regex_container','vectors_container','assets_container','expressions_container',
  'sd_container','tts_container','qr_container','translation_container','caption_container',
  'summarize_container','typing_indicator_container','rvc_container','stt_container',
  'audio_container','objective_container','silence_container','live2d_container',
  'vrm_container','timelines_container','webllm_container','websearch_container',
];
// Pin our five sibling extensions by their REAL setting IDs, rather than
// guessing from title text or whichever order the phone loaded modules.
// Other native or third-party settings must all precede the DW2 family.
const DW2_SETTINGS_ORDER = Object.freeze([
  'jd-bookshelf-settings',
  'dw2-preset-console-settings',
  'dw2-lt-settings',
  'dw2rl-settings',
]);
function extensionRank(choice,index){
  const id=choice.element.id || '';
  const ownIndex=DW2_SETTINGS_ORDER.indexOf(id);
  if(ownIndex>=0)return 8000+ownIndex;
  if(SYSTEM_IDS.includes(id))return 2000+index;
  if(/^酒馆助手|^Tavern\s*Helper\b/i.test(choice.label)
    || /^(TH-settings|tavern[-_]helper[-_]settings)$/i.test(id))return 3000+index;
  // Unknown DW2 entries stay in the family, but behind the four established plugins.
  if(/^DW2\b|^DW2 ·|^✧\s*DW2\b/i.test(choice.label))return 8500+index;
  return 4000+index;
}
// Native obsolete Extras API rows may live outside both extension settings columns.
function findExtras(parent,roots){
  if(!parent || !state.foldExtras)return [];
  const direct=(node)=>{
    while(node && node.parentElement!==parent)node=node.parentElement;
    return node && !roots.includes(node)?node:null;
  };
  const url=direct(byId('extensions_url')),status=direct(byId('extensions_status'));
  if(!url || !status)return [];
  const wanted=new Set([url,status]);
  for(const id of ['extensions_api_key','extensions_connect','extensions_autoconnect']){
    const row=direct(byId(id));if(row)wanted.add(row);
  }
  if(status.previousElementSibling?.matches('hr'))wanted.add(status.previousElementSibling);
  return [...parent.children].filter(e=>wanted.has(e));
}
function resetExtensionLayout(){
  for(const item of extHidden)item.classList.remove('dw2io-ext-invisible');
  for(const item of extExtraNodes)item.classList.remove('dw2io-ext-invisible');
  extHidden.clear();extExtraNodes.clear();
  resetOrders();
  extParent?.classList.remove('dw2io-ext-layout');
  extParent=null;extMore?.remove();extMore=null;
}
function syncExtensionLayout(choices){
  const a=byId('extensions_settings'),b=byId('extensions_settings2');
  const parent=a?.parentElement,roots=[a,b].filter(Boolean);
  const valid=!!(a && b && parent && b.parentElement===parent &&
    parent.matches('.extensions_block,#rm_extensions_block'));
  if(!state.enabled || !state.extensionsEnabled || !valid){resetExtensionLayout();return;}
  if(extParent!==parent){resetExtensionLayout();extParent=parent;parent.classList.add('dw2io-ext-layout');}
  const selected=choices.filter(x=>state.extensionsFolded.includes(x.key));
  const extras=findExtras(parent,roots);
  const next=new Set(selected.map(x=>x.element)), extraSet=new Set(extras);
  for(const node of extHidden)if(!next.has(node))node.classList.remove('dw2io-ext-invisible');
  for(const node of extExtraNodes)if(!extraSet.has(node))node.classList.remove('dw2io-ext-invisible');
  for(const node of next)node.classList.toggle('dw2io-ext-invisible',!state.extensionsExpanded);
  for(const node of extraSet)node.classList.toggle('dw2io-ext-invisible',!state.extensionsExpanded);
  extHidden=next;extExtraNodes=extraSet;
  const count=selected.length+(extras.length?1:0);
  if(!count){extMore?.remove();extMore=null;}else{
    if(!extMore || extMore.parentElement!==parent){
      extMore?.remove();
      extMore=el('div','inline-drawer dw2io-native-extension-more');
      extMore.id=EXT_HEADER_ID;
      const header=el('div','inline-drawer-toggle inline-drawer-header');
      header.setAttribute('role','button');header.tabIndex=0;
      header.setAttribute('aria-controls','extensions_settings');
      const title=el('b'),icon=el('div','fa-solid inline-drawer-icon fa-circle-chevron-down down');
      header.append(title,icon);extMore.append(header);
      header.addEventListener('click',e=>{
        e.preventDefault();e.stopPropagation();
        save({extensionsExpanded:!state.extensionsExpanded});
      });
      header.addEventListener('keydown',e=>{
        if(e.key==='Enter'||e.key===' '){e.preventDefault();header.click();}
      });
      parent.prepend(extMore);
    }
    const header=$('.inline-drawer-header',extMore);
    $('b',header).textContent=`更多扩展设置（${count}）`;
    header.setAttribute('aria-expanded',String(state.extensionsExpanded));
    $('.inline-drawer-icon',header).className='fa-solid inline-drawer-icon fa-circle-chevron-'+
      (state.extensionsExpanded?'up up':'down down');
    // Above the native Regex row (rank 2000), below native Extensions toolbar (rank 0).
    setOrder(extMore,1000);
  }
  // Keep original ST extension containers in place. Only give their immediate
  // rows stable visual order: native systems → Tavern Helper → DW2 → others.
  choices.forEach((choice,index)=>{
    setOrder(choice.element,next.has(choice.element)?(1100+index):extensionRank(choice,index));
  });
  if(settingsEntry?.isConnected)setOrder(settingsEntry,9900); // Always after every other extension row.
  extras.forEach((node,index)=>setOrder(node,1200+index));
  for(const child of parent.children){
    if(child===extMore || roots.includes(child) || extras.includes(child))continue;
    if(!extOrders.has(child))setOrder(child,0);
  }
}

// ---------- Surface 4: reversible native World Info editor layout ----------

const WORLD_TOOL_IDS = Object.freeze([
  'world_create_button', 'world_import_button', 'world_popup_export',
  'world_popup_name_button', 'world_duplicate', 'world_popup_delete',
  'world_popup_new', 'OpenAllWIEntries', 'CloseAllWIEntries',
  'world_backfill_memos', 'world_apply_current_sorting', 'world_refresh',
]);
const WORLD_PAGINATION_ID = 'world_info_pagination';
function restoreWorldToolbar() {
  // The nodes are the exact TT originals, not copies. A comment at each
  // previous position restores native order even after multiple toggles.
  for (const [node, marker] of worldMoved) {
    if (marker.parentNode) marker.parentNode.replaceChild(node, marker);
    marker.remove();
  }
  worldMoved.clear();
  if (worldCreateOriginalAttributes) {
    const create = document.getElementById('world_create_button');
    if (create) {
      for (const [name, value] of Object.entries(worldCreateOriginalAttributes)) {
        if (value === null) create.removeAttribute(name);
        else create.setAttribute(name, value);
      }
    }
    worldCreateOriginalAttributes = null;
  }
  worldDrawer?.classList.remove('dw2io-world-layout-host');
  worldDrawer = null;
  worldTopline?.classList.remove('dw2io-wi-topline');
  worldOriginalTools?.classList.remove('dw2io-wi-original-tools');
  worldToolbar?.remove();
  worldTopline = worldOriginalTools = worldToolbar = null;
}
function moveWorldNode(node, destination) {
  const marker = document.createComment('dw2io-world-original-position');
  node.parentNode.insertBefore(marker, node);
  worldMoved.set(node, marker);
  destination.append(node);
}
function mountWorldToolbar(root) {
  if (worldToolbar?.isConnected) return true;
  restoreWorldToolbar();
  const select = root.querySelector('#world_editor_select');
  const search = root.querySelector('#world_info_search');
  const priority = root.querySelector('#world_info_sort_order');
  const top = select?.closest('.flex-container.alignitemscenter');
  const original = search?.closest('.flex-container.alignitemscenter');
  const nodes = WORLD_TOOL_IDS.map(id => root.querySelector('#' + id));
  const pagination = root.querySelector('#' + WORLD_PAGINATION_ID);
  // Never partially rearrange an unknown TT version or a Select2 popup.
  if (!top || !original || top === original || !original.contains(priority)
      || !pagination?.parentNode || nodes.some(node => !node?.parentNode)) return false;

  const drawer = el('details', 'dw2io-wi-tools');
  const summary = el('summary', 'dw2io-wi-tools-summary');
  summary.append(el('span', 'dw2io-wi-tools-symbol', '☷'),
    el('span', '', '管理工具'));
  const strip = el('div', 'dw2io-wi-tools-strip');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', '世界书原生管理按钮');
  const pages = el('div', 'dw2io-wi-tools-pages');
  pages.setAttribute('aria-label', '世界书原生分页');
  drawer.append(summary, strip, pages);
  root.insertBefore(drawer, original);
  top.classList.add('dw2io-wi-topline');
  original.classList.add('dw2io-wi-original-tools');
  worldTopline = top;
  worldOriginalTools = original;
  worldToolbar = drawer;
  // Selector + small Search and Priority controls share the upper region.
  // The lorebook Select2 remains mounted in its original parent.
  moveWorldNode(search, top);
  moveWorldNode(priority, top);
  // Keep ALL original native action icons and pagination, including events.
  for (const node of nodes) moveWorldNode(node, strip);
  // The native Create action contains text; hide it visually to fit 12 icons
  // but retain an accessible name and tooltip while the toolbar is active.
  const create = nodes.find(node => node.id === 'world_create_button');
  if (create) {
    worldCreateOriginalAttributes = {
      'title': create.getAttribute('title'),
      'aria-label': create.getAttribute('aria-label')
    };
    create.setAttribute('title', '创建世界书');
    create.setAttribute('aria-label', '创建世界书');
  }
  // Pagination stays native but occupies its own row, not the icons row.
  moveWorldNode(pagination, pages);
  worldDrawer = root.closest('#WorldInfo');
  if (worldDrawer) {
    worldDrawer.classList.add('dw2io-world-layout-host');
    // Previous layout could leave this drawer scrolled horizontally.
    worldDrawer.scrollLeft = 0;
  }
  return true;
}

// No original input, select, switch, or save listener is cloned or relocated.
// The native world-book Select2 and Resource Library grouping stay untouched.

/* Native WI nodes are moved, never cloned, and restored by comment markers.
 * All keyword/trigger widgets stay reachable without a redundant tab bar. */
const worldEntryLayouts = new Map();

function moveWorldEntryNode(node, target, moved) {
  const marker = document.createComment('dw2io-entry-original');
  node.parentNode.insertBefore(marker, node);
  moved.push([node, marker]);
  target.append(node);
}
function restoreWorldEntry(editor, layout) {
  for (let i = layout.moved.length - 1; i >= 0; i--) {
    const [node, marker] = layout.moved[i];
    if (marker.parentNode) marker.parentNode.replaceChild(node, marker);
    marker.remove();
  }
  layout.group.classList.remove('dw2io-wi-advanced-groups');
  layout.filters.classList.remove('dw2io-wi-advanced-filters');
  if (layout.contentSettings) {
    layout.contentSettings.caption.classList.remove('dw2io-wi-content-caption');
    layout.contentSettings.overrides.classList.remove('dw2io-wi-overrides-relocated');
    layout.contentSettings.details.remove();
  }
  layout.details.remove();
  worldEntryLayouts.delete(editor);
}
function restoreWorldEntries() {
  for (const [editor, layout] of [...worldEntryLayouts]) restoreWorldEntry(editor, layout);
}

/* This is the native editor's keyword/matching setup, not a second editor.
 * Move original live controls into a compact accordion; retain all listeners.
 * The primary/secondary keyword controls stay visible above the accordion. */
function addWorldContentSettings(contentRow, moved) {
  const keywords = contentRow.querySelector(':scope > [name="keywordsAndLogicBlock"]');
  const overrides = contentRow.querySelector(':scope > [name="perEntryOverridesBlock"]');
  const contentBlock = contentRow.querySelector(':scope > [name="contentAndCharFilterBlock"]');
  if (!keywords || !overrides || !contentBlock) return null;
  const findControl = (base, selector) =>
    base.querySelector(selector)?.closest('.world_entry_form_control');
  const first = [
    findControl(keywords,'select[name="entryLogicType"]'),
    findControl(overrides,'input[name="scanDepth"]'),
    findControl(overrides,'select[name="caseSensitive"]'),
    findControl(overrides,'select[name="matchWholeWords"]')
  ];
  const second = [
    findControl(overrides,'select[name="useGroupScoring"]'),
    findControl(overrides,'input[name="automationId"]')
  ];
  const optional = [
    findControl(overrides,'input[name="outletName"]'),
    findControl(overrides,'input[name="delayUntilRecursionLevel"]')
  ].filter(Boolean);
  const contentCaption = contentBlock.querySelector('.world_entry_form_token_counter')
    ?.closest('.flex-container.flexnowrap');
  const boxGroup = contentCaption && [...contentCaption.children].find(node =>
    node.querySelector('input[name="excludeRecursion"]') &&
    node.querySelector('input[name="preventRecursion"]') &&
    node.querySelector('input[name="delay_until_recursion"]') &&
    node.querySelector('input[name="ignoreBudget"]')
  );
  if (!first.every(Boolean) || !second.every(Boolean) || !contentCaption ||
      !boxGroup || !contentBlock.querySelector('textarea[name="content"]')) return null;

  const details = el('details','dw2io-wi-content-settings');
  const summary = el('summary','dw2io-wi-content-settings-summary','正文设置');
  const body = el('div','dw2io-wi-content-settings-body');
  const matchRow = el('div','dw2io-wi-match-four');
  const extraRow = el('div','dw2io-wi-match-two');
  const recursion = el('div','dw2io-wi-recursion-row');
  details.append(summary,body);
  body.append(matchRow,extraRow,recursion);
  contentBlock.insertAdjacentElement('beforebegin',details);
  for (const item of first) moveWorldEntryNode(item,matchRow,moved);
  for (const item of second) moveWorldEntryNode(item,extraRow,moved);
  moveWorldEntryNode(boxGroup,recursion,moved);

  // Optional TT-specific fields are preserved inside the accordion, only
  // appearing when TT's native conditions show them.
  if (optional.length) {
    const conditions = el('div','dw2io-wi-match-conditional');
    body.append(conditions);
    for (const item of optional) moveWorldEntryNode(item,conditions,moved);
  }

  // Keep the real maximize icon, live token counter, and UID. This only
  // rearranges their caption and exposes TT's existing explanatory label.
  const hiddenDescription = contentBlock.querySelector(
    'small.displayNone > span[data-i18n*="What this keyword should mean"]'
  );
  if (hiddenDescription) moveWorldEntryNode(hiddenDescription,contentCaption,moved);
  contentCaption.classList.add('dw2io-wi-content-caption');
  overrides.classList.add('dw2io-wi-overrides-relocated');
  return {details,caption:contentCaption,overrides};
}
function addWorldAdvanced(editor) {
  if (!editor || worldEntryLayouts.has(editor)) return;
  const children = [...editor.children];
  const content = children.find(node => node.matches('.flex-container.wide100p.alignitemscenter')
    && node.querySelector('textarea[name="content"]'));
  const group = children.find(node => node.matches('.flex-container.wide100p.flexGap10')
    && node.querySelector('input[name="group"]')
    && node.querySelector('input[name="groupWeight"]')
    && node.querySelector('input[name="sticky"]')
    && node.querySelector('input[name="cooldown"]')
    && node.querySelector('input[name="delay"]'));
  const filters = children.find(node => node.matches('.flex-container.wide100p.flexGap10')
    && node.querySelector('select[name="characterFilter"]')
    && node.querySelector('select[name="triggers"]'));
  const groupControl = group?.querySelector('input[name="group"]')?.closest('.flex-container.flexFlowColumn');
  const override = group?.querySelector('input[name="groupOverride"]')?.closest('label');
  const exclusion = filters?.querySelector('input[name="character_exclusion"]')?.closest('label');
  if (!content || !group || !filters || !groupControl || !override || !exclusion) return;
  const sources = children.find(node => node.matches('.inline-drawer.wide100p.flexFlowColumn'));
  const details = el('details','dw2io-wi-advanced');
  const summary = el('summary','dw2io-wi-advanced-summary','高级设置');
  const body = el('div','dw2io-wi-advanced-body');
  const exclusionRow = el('div','dw2io-wi-exclusion-row');
  details.append(summary,body);
  content.insertAdjacentElement('afterend',details);
  const moved=[];
  moveWorldEntryNode(group,body,moved);
  moveWorldEntryNode(filters,body,moved);
  moveWorldEntryNode(override,groupControl,moved);
  body.append(exclusionRow);
  moveWorldEntryNode(exclusion,exclusionRow,moved);
  if (sources) moveWorldEntryNode(sources,body,moved);
  group.classList.add('dw2io-wi-advanced-groups');
  filters.classList.add('dw2io-wi-advanced-filters');
  const contentSettings = addWorldContentSettings(content,moved);
  worldEntryLayouts.set(editor,{details,moved,group,filters,contentSettings});
}
function syncWorldAdvanced() {
  if (!worldList?.isConnected) return;
  for (const [editor, layout] of [...worldEntryLayouts]) {
    if (!worldList.contains(editor) || !layout.details.isConnected) restoreWorldEntry(editor,layout);
  }
  for (const editor of worldList.querySelectorAll('.world_entry .world_entry_edit')) addWorldAdvanced(editor);
}
function disconnectWorldLayout() {
  if (worldFrame) cancelAnimationFrame(worldFrame);
  worldFrame = 0;
  worldObserver?.disconnect(); worldObserver = null;
  restoreWorldEntries();
  worldRoot?.classList.remove('dw2io-world-layout');
  restoreWorldToolbar();
  worldRoot = null; worldList = null;
}
function syncWorldLayout() {
  const enabled = !!(active && state?.enabled && state?.worldLayoutEnabled);
  const root = enabled ? byId('world_popup') : null;
  const list = root?.querySelector('#world_popup_entries_list') || null;
  if (!root || !list) {
    if (worldRoot || worldList) disconnectWorldLayout();
    return;
  }
  if (root !== worldRoot || list !== worldList) {
    disconnectWorldLayout();
    worldRoot = root; worldList = list;
    if (!mountWorldToolbar(root)) {
      // Unknown native structure: show TT without any partial re-layout.
      worldRoot = null; worldList = null;
      return;
    }
    worldRoot.classList.add('dw2io-world-layout');
    worldObserver = new MutationObserver(records => {
      if (!active || !state?.enabled || !state?.worldLayoutEnabled) return;
      // Only native entry additions/replacements need augmentation. Never
      // observe attribute changes or textarea values; typing stays native.
      const changed = records.some(record => [...record.addedNodes].some(node =>
        node.nodeType === 1 && (
          node.matches?.('.world_entry, .world_entry_edit, .inline-drawer-outlet') ||
          node.querySelector?.('.world_entry, .world_entry_edit')
        )
      ));
      if (!changed || worldFrame) return;
      worldFrame = requestAnimationFrame(() => { worldFrame = 0; syncWorldAdvanced(); });
    });
    worldObserver.observe(worldList, { childList: true, subtree: true });
  }
  if (!worldToolbar?.isConnected && !mountWorldToolbar(root)) {
    disconnectWorldLayout();
    return;
  }
  worldRoot.classList.add('dw2io-world-layout');
  syncWorldAdvanced();
}

// ---------- Scan only native menus/settings (never observe chat messages) ----------
function scheduleScan() {
  if (!active || busy || refreshTimer) return;
  refreshTimer=defer(()=>{refreshTimer=0;scan();});
}
function watch(root) {
  if (!root || observed.has(root)) return;
  const observer = new MutationObserver(records => {
    if (records.some(r=>[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1 && !n.id?.startsWith('dw2io-') && !n.classList?.contains('dw2io-more')))) scheduleScan();
  });
  observer.observe(root,{childList:true,subtree:false});observed.set(root,observer);
}
function scan() {
  if (!active || busy || !state) return;
  busy=true;
  try {
    attachAccessPoints();
    const menu=$('#options .options-content');
    watch(menu);watch(byId('extensionsMenu'));
    watch(byId('extensions_settings'));watch(byId('extensions_settings2'));
    applyMenu();
    const wand=listWand(),extensions=listExtensionSettings();
    applyWand(wand);syncExtensionLayout(extensions);
    syncWorldLayout();
    for(const observer of observed.values())observer.takeRecords();
  } catch(error) {
    console.error('[DW2 Interface Organizer] scan failed',error);
  } finally {busy=false;}
}
function mountRetry() {
  if (!active) return;
  if(!state && !tryLoadState()){
    if(retries++<28) { const t=setTimeout(mountRetry,500);cleanup.push(()=>clearTimeout(t)); }
    return;
  }
  scan();
  if(retries++<8) { const t=setTimeout(mountRetry,900);cleanup.push(()=>clearTimeout(t)); }
}
async function checkAndUpdate() {
  if(updateInProgress)return;
  const button=byId('dw2io-check-update');
  updateInProgress=true;
  if(button){button.disabled=true;button.textContent='正在检查…';}
  try{
    const id=Object.keys(extensionTypes||{}).find(key=>
      key==='third-party/dw2-interface-organizer' ||
      key.endsWith('/dw2-interface-organizer')
    );
    if(!id)throw new Error('无法识别安装目录，请到 TT 的「管理扩展」检查更新');
    const res=await fetch('/api/extensions/update',{
      method:'POST',
      headers:getRequestHeaders(),
      body:JSON.stringify({
        extensionName:id.replace(/^third-party/,''),
        global:extensionTypes[id]==='global',
      }),
    });
    if(!res.ok)throw new Error((await res.text() || 'HTTP '+res.status).slice(0,200));
    const data=await res.json();
    notify(data.isUpToDate?'已是最新版本':'更新已安装，请刷新 TT 酒馆', 'success');
  }catch(error){
    notify('更新检查失败：'+(error?.message||String(error)),'warning');
  }finally{
    updateInProgress=false;
    if(button?.isConnected){button.disabled=false;button.textContent='检查并更新';}
  }
}
function refreshTavern(){
  if(window.confirm('重新加载 TT 酒馆？请先保存尚未保存的预设修改。')){
    window.location.reload();
  }
}
function attachAccessPoints() {
  // Drop the one-off hamburger launch entry from v0.1.0.
  byId('dw2io-menu-entry')?.remove();
  const root=byId('extensions_settings2') || byId('extensions_settings');
  if(!root)return;
  if(settingsEntry?.isConnected){
    const checkbox=byId('dw2io-enabled-toggle');
    if(checkbox && checkbox.checked!==state.enabled)checkbox.checked=state.enabled;
    const worldCheckbox=byId('dw2io-world-layout-toggle');
    if(worldCheckbox && worldCheckbox.checked!==state.worldLayoutEnabled)
      worldCheckbox.checked=state.worldLayoutEnabled;
    return;
  }
  settingsEntry=el('div','extension_container dw2io-settings');
  settingsEntry.id=SETTINGS_ID;
  const drawer=el('div','inline-drawer');
  const header=el('div','inline-drawer-toggle inline-drawer-header');
  header.setAttribute('role','button');header.tabIndex=0;
  const heading=el('div','dw2io-settings-heading');
  heading.append(el('b','dw2io-settings-title','✧ DW2 · Interface Organizer'),el('small','dw2io-credits','S.A. · DW2'));
  const arrow=el('div','fa-solid inline-drawer-icon fa-circle-chevron-down down');
  header.append(heading,arrow);
  const body=el('div','inline-drawer-content dw2io-settings-content');
  body.hidden=true;
  body.append(el('p','dw2io-settings-version','三横菜单 · 魔法棒 · 扩展设置 · 世界书  |  v'+VERSION));
  const toggleRow=el('label','dw2io-native-switch');
  const checkbox=el('input');checkbox.type='checkbox';checkbox.id='dw2io-enabled-toggle';
  checkbox.checked=state.enabled;
  checkbox.addEventListener('change',()=>save({enabled:checkbox.checked}));
  // Neutral switch track: preserve a real checkbox for keyboard & settings,
  // but do not let iOS paint it with its native blue accent.
  const track=el('span','dw2io-switch-track');
  track.setAttribute('aria-hidden','true');
  track.append(el('span','dw2io-switch-thumb'));
  checkbox.setAttribute('role','switch');
  toggleRow.append(checkbox,track,el('span','dw2io-switch-copy','启用界面整理'));
  const actions=el('div','dw2io-native-actions');
  const launch=button('打开界面整理',openPanel,'menu_button dw2io-extension-launch');
  const update=button('检查并更新',checkAndUpdate,'menu_button dw2io-check-update');
  update.id='dw2io-check-update';
  const manage=button('管理扩展',()=>void openThirdPartyExtensionMenu(),'menu_button');
  const refresh=button('刷新酒馆',refreshTavern,'menu_button');
  actions.append(launch,update,manage,refresh);
  // Independent one-tap World Info layout switch in the Extensions drawer.
  const worldRow=el('label','dw2io-native-switch dw2io-world-settings-switch');
  const worldCheckbox=el('input');
  worldCheckbox.type='checkbox';worldCheckbox.id='dw2io-world-layout-toggle';
  worldCheckbox.checked=state.worldLayoutEnabled;
  worldCheckbox.setAttribute('role','switch');
  worldCheckbox.addEventListener('change',()=>save({worldLayoutEnabled:worldCheckbox.checked}));
  const worldTrack=el('span','dw2io-switch-track');
  worldTrack.setAttribute('aria-hidden','true');
  worldTrack.append(el('span','dw2io-switch-thumb'));
  worldRow.append(worldCheckbox,worldTrack,
    el('span','dw2io-switch-copy','世界书 · 清透布局（关闭恢复原版）'));
  body.append(toggleRow,worldRow,actions,el('div','dw2io-settings-caption',
    '三横菜单、魔法棒、扩展设置与世界书布局分别控制；只整理界面，不更改原生功能和数据。'));
  drawer.append(header,body);settingsEntry.append(drawer);root.append(settingsEntry);
  let expanded=false;
  const expand=(e)=>{
    e.preventDefault();e.stopPropagation();
    expanded=!expanded;body.hidden=!expanded;
    header.setAttribute('aria-expanded',String(expanded));
    arrow.className='fa-solid inline-drawer-icon fa-circle-chevron-'+
      (expanded?'up up':'down down');
  };
  header.addEventListener('click',expand);
  header.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();header.click();}
  });
}

function openPanel(){
  if(!state || overlay)return;
  overlay=el('div','dw2io-backdrop');overlay.id=ROOT_ID;
  const dialog=el('section','dw2io-panel');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','dw2io-title');
  const head=el('div','dw2io-head');
  const info=el('div');info.append(el('div','dw2io-overline','DW2 · PERSONAL TOOLS'),el('h2','', '界面整理'));
  info.lastChild.id='dw2io-title';
  head.append(info,button('×',closePanel,'dw2io-close'));
  const body=el('div','dw2io-scroll');body.id='dw2io-panel-content';
  dialog.append(head,body);overlay.append(dialog);document.body.append(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay)closePanel();});
  renderPanel();
}
function closePanel(){ overlay?.remove();overlay=null; }
function renderPanel(){
  if(!overlay)return;
  const root=$('#dw2io-panel-content',overlay);if(!root)return;
  const pos=root.scrollTop;root.replaceChildren();
  root.append(el('p','dw2io-lead','整理原生界面的显示方式，不改 TT 的输入、保存、启用状态和原有数据。'));
  root.append(checkbox('启用界面整理',state.enabled,v=>save({enabled:v})));
  const actions=el('div','dw2io-actions');
  actions.append(button('重新识别',()=>{scan();renderPanel();notify('已重新扫描入口');}),button('恢复原界面',()=>{
    save({enabled:false,menuFolded:[],wandHidden:[],wandExpanded:false,extensionsFolded:[],extensionsExpanded:false,foldExtras:false,worldLayoutEnabled:false});
    notify('已关闭整理并恢复所有入口');
  },'dw2io-quiet'));root.append(actions);
  const section=(key,title,desc)=>{
    const s=el('div','dw2io-section');
    const toggle=button((openParts.has(key)?'▾ ':'▸ ')+title,()=>{
      if(openParts.has(key)) openParts.delete(key);else openParts.add(key);
      renderPanel();
    },'dw2io-section-toggle');
    const hint=el('p','dw2io-hint',desc);s.append(toggle,hint);
    const inner=el('div','dw2io-section-body');if(!openParts.has(key))inner.hidden=true;
    s.append(inner);root.append(s);return inner;
  };
  const mb=section('menu','01 · 三横菜单','把原生低频项收进「更多工具」，仍然点击原按钮。');
  mb.append(checkbox('启用「更多工具」',state.menuEnabled,v=>save({menuEnabled:v})));
  for(const [id,label] of NATIVE_MENU){
    mb.append(checkbox('收纳 · '+label,state.menuFolded.includes(id),v=>{
      const next=new Set(state.menuFolded);v?next.add(id):next.delete(id);save({menuFolded:[...next]});
    },byId(id)?'已识别原生按钮':'当前页面未找到，仍可预设选择'));
  }
  const wb=section('wand','02 · 魔法棒入口','勾选要隐藏的入口，隐藏只影响可见性，不关闭插件。');
  wb.append(checkbox('启用魔法棒整理',state.wandEnabled,v=>save({wandEnabled:v})));
  const wand=listWand();
  wb.append(el('p','dw2io-muted','选中的入口会收入魔法棒「更多工具」，需要时可展开。'));
  if(!wand.length) wb.append(el('p','dw2io-muted','尚未识别入口。先展开一次魔法棒，再点「重新识别」。'));
  for(const c of wand) wb.append(checkbox('收进更多 · '+c.label,state.wandHidden.includes(c.key),v=>{
    const next=new Set(state.wandHidden);v?next.add(c.key):next.delete(c.key);save({wandHidden:[...next],wandExpanded:false});
  }));
  const eb=section('extensions','03 · 扩展设置收纳','外层单列排版；勾选低频设置后统一收进「更多扩展设置」。不改变正则卡片内部。');
  eb.append(checkbox('启用扩展页单列与收纳',state.extensionsEnabled,v=>save({extensionsEnabled:v})));
  eb.append(checkbox('把旧 Extras API 设置收进「更多」',state.foldExtras,v=>save({foldExtras:v})));
  const extensions=listExtensionSettings();
  if(!extensions.length)eb.append(el('p','dw2io-muted','未识别标准扩展设置布局；未知布局会保留原样。'));
  for(const c of extensions)eb.append(checkbox('收纳 · '+c.label,state.extensionsFolded.includes(c.key),v=>{
    const next=new Set(state.extensionsFolded);v?next.add(c.key):next.delete(c.key);save({extensionsFolded:[...next]});
  }));
  const wi=section('world','04 · 世界书 · 清透布局','跟随当前主题。图标与分页分行、轻量无边框折叠、修复世界书横向滑动；原生编辑功能保留。');
  wi.append(checkbox('启用世界书新布局',state.worldLayoutEnabled,v=>save({worldLayoutEnabled:v}),
    '扩展设置页面也有一个独立开关；关闭总开关时此项一起暂停。'));
  root.append(el('p','dw2io-foot',`DW2 · Interface Organizer ${VERSION} · 私用测试版 · 不自动更新`));
  root.scrollTop=pos;
}
function onKey(event){if(event.key==='Escape'&&overlay)closePanel();}
function onClick(event) {
  if(event.target.closest?.('#options_button,#extensionsMenuButton,#extensions-settings-button')) scheduleScan();
}
function onReady(){scheduleScan();}
export function onEnable(){
  if(active)return;active=true;retries=0;tryLoadState();
  document.addEventListener('keydown',onKey);
  document.addEventListener('click',onClick,true);
  window.addEventListener('load',onReady);
  cleanup.push(()=>document.removeEventListener('keydown',onKey),()=>document.removeEventListener('click',onClick,true),()=>window.removeEventListener('load',onReady));
  const context=globalThis.SillyTavern?.getContext?.();
  for(const eventName of ['APP_READY','MAIN_API_CHANGED']){
    const event=context?.eventTypes?.[eventName] || context?.event_types?.[eventName];
    if(context?.eventSource?.on && event){context.eventSource.on(event,onReady);cleanup.push(()=>context.eventSource.off?.(event,onReady));}
  }
  mountRetry();
}
export function onDisable(){
  if(!active)return;active=false;
  clearTimeout(refreshTimer);refreshTimer=0;
  closePanel();restoreMenu();clearWand();resetExtensionLayout();disconnectWorldLayout();
  settingsEntry?.remove();settingsEntry=null;byId('dw2io-menu-entry')?.remove();
  for(const observer of observed.values()) observer.disconnect();observed.clear();
  for(const fn of cleanup.splice(0))fn();
  state=null;ctx=null;
}
if(globalThis.SillyTavern?.getContext)onEnable();
else window.addEventListener('load',onEnable,{once:true});
