/* DW2 · User Interface Accordion for TauriTavern 2.3.
 * Five reversible groups using native <details>/<summary>.
 * Original native setting controls move intact, with comment placeholders
 * preserving exact initial positions. No setting values are written.
 */
const CONFIG=[
  {
    key:'display',
    title:'显示与界面选项',
    parent:'#UI-Theme-Block',
    members:['[name="FontBlurChatWidthBlock"]','[name="themeToggles"]'],
    includeDivider:true
  },
  {
    key:'character',
    title:'角色处理',
    parent:'#UI-Customization',
    members:['[name="CharacterHandlingToggles"]']
  },
  {
    key:'misc',
    title:'杂项',
    parent:'#UI-Customization',
    members:['[name="MiscellaneousToggles"]']
  },
  {
    key:'chat',
    title:'聊天／消息处理',
    parent:'#power-user-option-checkboxes',
    members:['[name="ChatMessageHandlingToggles"]']
  },
  {
    key:'stscript',
    title:'STscript 设置',
    parent:'#power-user-option-checkboxes',
    members:['[name="STscriptToggles"]']
  }
];

export function createUserUILayout(){
  const mounted=new Map();
  let searchInput=null;
  let searching=false;
  let beforeSearch=null;
  let decoratedRoot=null;
  const nativeChevronHeaders=new Set();
  function decorateNativeUI(){
    // Only add reversible classes. The native question-mark, language select,
    // settings search, TT controls and four style selects never move or clone.
    const root=document.getElementById('user-settings-block');
    if(decoratedRoot && decoratedRoot!==root){
      decoratedRoot.classList.remove('dw2io-ui-layout-active');
      decoratedRoot=null;
    }
    if(!root)return;
    root.classList.add('dw2io-ui-layout-active');
    decoratedRoot=root;
    // These are separate native inline-drawers, not children of a single
    // ChatMessageHandling container. All native controls remain untouched.
    const labels=[
      '#UI-Theme-Block [name="themeElements"] .inline-drawer-toggle [data-i18n="Theme Colors"]',
      '[name="ChatMessageHandlingToggles"] .inline-drawer-toggle [data-i18n="Auto-swipe"]',
      '[name="ChatMessageHandlingToggles"] .inline-drawer-toggle [data-i18n="Auto-Continue"]',
      '[name="AutoCompleteToggle"] .inline-drawer-toggle [data-i18n="AutoComplete Settings"]'
    ];
    for(const selector of labels){
      const header=root.querySelector(selector)?.closest('.inline-drawer-toggle');
      if(header && !nativeChevronHeaders.has(header)){
        header.classList.add('dw2io-ui-native-chevron');
        nativeChevronHeaders.add(header);
      }
    }
    for(const header of nativeChevronHeaders){
      if(!root.contains(header)){
        header.classList.remove('dw2io-ui-native-chevron');
        nativeChevronHeaders.delete(header);
      }
    }
  }
  function restoreNativeUI(){
    decoratedRoot?.classList.remove('dw2io-ui-layout-active');
    decoratedRoot=null;
    for(const header of nativeChevronHeaders)header.classList.remove('dw2io-ui-native-chevron');
    nativeChevronHeaders.clear();
  }
  const findTargets=(config)=>{
    const root=document.querySelector(config.parent);
    if(!root)return null;

    // TauriTavern nests #CustomCSS-block inside MiscellaneousToggles.
    // Keep that entire native block (and our CSS toolbar mounted inside it)
    // OUTSIDE the Misc fold. The original Misc container stays in place.
    if(config.key==='misc'){
      const misc=root.querySelector('[name="MiscellaneousToggles"]');
      const css=misc?.querySelector('#CustomCSS-block');
      if(!misc||!css||css.parentElement!==misc)return null;
      const direct=Array.from(misc.children);
      const index=direct.indexOf(css);
      if(index<2||direct[0].tagName!=='H4')return null;
      return direct.slice(0,index);
    }

    // TT also nests the native Auto-swipe and Auto-Continue drawers inside
    // ChatMessageHandlingToggles. Leave both as visible native siblings
    // *after* our fold, with their own intact inline-drawer behavior.
    if(config.key==='chat'){
      const chat=root.querySelector('[name="ChatMessageHandlingToggles"]');
      if(!chat)return null;
      const direct=Array.from(chat.children);
      const firstDrawer=direct.find(child=>child.classList.contains('inline-drawer') &&
        child.querySelector('.inline-drawer-toggle [data-i18n="Auto-swipe"]'));
      const boundary=direct.indexOf(firstDrawer);
      if(boundary<2||direct[0].tagName!=='H4')return null;
      const continueDrawer=direct.slice(boundary+1).find(child=>
        child.classList.contains('inline-drawer') &&
        child.querySelector('.inline-drawer-toggle [data-i18n="Auto-Continue"]'));
      if(!continueDrawer)return null; // Unknown layout: avoid swallowing drawers.
      return direct.slice(0,boundary);
    }

    const nodes=config.members.map(selector=>root.querySelector(selector));
    if(nodes.some(node=>!node||node.parentElement!==nodes[0].parentElement))return null;
    if(config.includeDivider){
      const divider=nodes[0].nextElementSibling;
      if(divider?.tagName==='HR'&&divider.nextElementSibling===nodes[1]){
        nodes.splice(1,0,divider);
      }else if(nodes[0].nextElementSibling!==nodes[1]){
        // Unknown newer TT layout: do not move unrelated controls.
        return null;
      }
    }
    return nodes;
  };
  function removeGroup(key){
    const group=mounted.get(key);
    if(!group)return;
    mounted.delete(key);
    for(const {node,placeholder} of group.entries){
      if(placeholder.parentNode)placeholder.replaceWith(node);
      else placeholder.remove();
    }
    group.details.remove();
  }
  function mountGroup(config){
    if(mounted.has(config.key))return;
    const nodes=findTargets(config);
    if(!nodes?.length)return;
    const details=document.createElement('details');
    details.className='dw2io-ui-fold';
    details.dataset.dw2ioUiFold=config.key;
    details.id='dw2io-ui-fold-'+config.key;
    const summary=document.createElement('summary');
    summary.className='dw2io-ui-fold-summary';
    summary.append(document.createTextNode(config.title));
    const arrow=document.createElement('i');
    arrow.className='fa-solid fa-chevron-down dw2io-ui-fold-arrow';
    arrow.setAttribute('aria-hidden','true');
    summary.append(arrow);
    const content=document.createElement('div');
    content.className='dw2io-ui-fold-content';
    details.append(summary,content);
    nodes[0].before(details);
    const entries=[];
    for(const node of nodes){
      const placeholder=document.createComment('DW2 UI: '+config.key+' original position');
      node.before(placeholder);
      entries.push({node,placeholder});
      content.append(node);
    }
    mounted.set(config.key,{details,entries});
    details.open=searching;
  }
  function bindSearch(){
    const input=document.getElementById('settingsSearch');
    if(input===searchInput)return;
    searchInput?.removeEventListener('input',onSearch);
    searchInput=input;
    searchInput?.addEventListener('input',onSearch);
    onSearch();
  }
  function onSearch(){
    const next=!!searchInput?.value?.trim();
    if(next && !searching){
      beforeSearch=new Map(Array.from(mounted,([key,g])=>[key,g.details.open]));
    }
    searching=next;
    if(searching){
      for(const group of mounted.values())group.details.open=true;
    }else if(beforeSearch){
      for(const [key,group] of mounted){
        if(beforeSearch.has(key))group.details.open=beforeSearch.get(key);
      }
      beforeSearch=null;
    }
  }
  function sync(on){
    if(!on){
      disable();
      return;
    }
    // TT may replace a settings subtree when the UI is rebuilt. Restore any
    // remaining old placeholders before remounting, without duplicate wrappers.
    for(const [key,group] of mounted){
      if(!group.details.isConnected||group.entries.some(({node})=>!group.details.contains(node))){
        removeGroup(key);
      }
    }
    for(const config of CONFIG)mountGroup(config);
    decorateNativeUI();
    bindSearch();
  }
  function disable(){
    searchInput?.removeEventListener('input',onSearch);
    searchInput=null;searching=false;beforeSearch=null;
    for(const key of [...mounted.keys()])removeGroup(key);
    restoreNativeUI();
  }
  return {sync,disable};
}
