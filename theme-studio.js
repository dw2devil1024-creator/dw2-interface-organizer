/* DW2 CSS Studio: scoped enhancement for TT's native #customCSS editor.
 * Color edits are exact-span replacements with validation and single-step undo.
 */
const ID='dw2io-css-studio';
const HEX=/^#(?:[a-f\d]{8}|[a-f\d]{6}|[a-f\d]{4}|[a-f\d]{3})\b/i;
const NAMED=/^(?:transparent|black|white|red|green|blue|yellow|cyan|magenta|gray|grey|orange|pink|purple|brown|silver|gold|navy|olive|teal|rebeccapurple)\b/i;
const FUN=/^(?:rgba?|hsla?)\(/i;
function validColor(v) {
  try { return CSS.supports('color',v); } catch {}
  const test=document.createElement('span');test.style.color=v;return !!test.style.color;
}
function tokens(value,offset) {
  const found=[];let quote='',comment=false;
  for(let i=0;i<value.length;i++){
    const c=value[i],n=value[i+1],prev=value[i-1]||'';
    if(comment){if(c==='*'&&n==='/'){comment=false;i++;}continue;}
    if(quote){if(c==='\\'){i++;continue;}if(c===quote)quote='';continue;}
    if(c==='/'&&n==='*'){comment=true;i++;continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(/[\w-]/.test(prev))continue;
    if(/^url\(/i.test(value.slice(i))){
      let depth=0,q='';
      for(;i<value.length;i++){
        const v=value[i];
        if(q){if(v==='\\'){i++;continue;}if(v===q)q='';continue;}
        if(v==='"'||v==="'"){q=v;continue;}
        if(v==='(')depth++;
        if(v===')'&&--depth===0)break;
      }
      continue;
    }
    let raw=value.slice(i).match(HEX)?.[0]||value.slice(i).match(NAMED)?.[0]||'';
    if(!raw && FUN.test(value.slice(i))){
      let depth=0,q='',j=i;
      for(;j<value.length;j++){
        const v=value[j];
        if(q){if(v==='\\'){j++;continue;}if(v===q)q='';continue;}
        if(v==='"'||v==="'"){q=v;continue;}
        if(v==='(')depth++;
        if(v===')'&&--depth===0){j++;break;}
      }
      if(depth===0)raw=value.slice(i,j);
    }
    if(raw && validColor(raw)){
      found.push({start:offset+i,end:offset+i+raw.length,color:raw});
      i+=raw.length-1;
    }
  }
  return found;
}
function extract(css) {
  const found=[],stack=[];let comment=false,quote='',paren=0,start=0;
  const process=(s,e)=>{
    if(!stack.length)return;
    const part=css.slice(s,e),sep=part.indexOf(':');
    if(sep<0)return;
    const property=part.slice(0,sep).replace(/\/\*[\s\S]*?\*\//g,'').trim();
    if(!/^(?:--[\w-]+|-?[a-z][\w-]*)$/i.test(property))return;
    const tail=part.slice(sep+1),space=tail.match(/^\s*/)?.[0].length||0;
    const val=tail.slice(space);
    const selector=stack.map(x=>x.replace(/\/\*[\s\S]*?\*\//g,'').trim()).filter(Boolean).join(' / ');
    const colors=tokens(val,s+sep+1+space);
    colors.forEach((item,index)=>{
      found.push({...item,property,selector,line:css.slice(0,item.start).split('\n').length,
        colorIndex:index+1,colorCount:colors.length});
    });
  };
  for(let i=0;i<css.length;i++){
    const c=css[i],n=css[i+1];
    if(comment){if(c==='*'&&n==='/'){comment=false;i++;}continue;}
    if(quote){if(c==='\\'){i++;continue;}if(c===quote)quote='';continue;}
    if(c==='/'&&n==='*'){comment=true;i++;continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c==='('){paren++;continue;}
    if(c===')'){paren=Math.max(0,paren-1);continue;}
    if(paren)continue;
    if(c==='{'){stack.push(css.slice(start,i));start=i+1;}
    else if(c===';'){process(start,i);start=i+1;}
    else if(c==='}'){process(start,i);stack.pop();start=i+1;}
  }
  return {items:stack.length?[]:found,unbalanced:!!stack.length};
}
function el(tag,cls='',text) {
  const node=document.createElement(tag);
  if(cls)node.className='dw2io-cs-'+cls;
  if(text!=null)node.textContent=text;
  return node;
}
function btn(text,fn,title='') {
  const node=el('button','btn',text);node.type='button';node.title=title||text;node.addEventListener('click',fn);return node;
}
function iconBtn(iconName,label,fn) {
  const node=btn('',fn,label);
  node.classList.add('dw2io-cs-icon-btn');
  node.setAttribute('aria-label',label);
  const icon=document.createElement('i');
  icon.className='fa-solid '+iconName;
  icon.setAttribute('aria-hidden','true');
  node.append(icon);
  return node;
}
function hexColor(v){
  const ctx=document.createElement('canvas').getContext('2d');if(!ctx)return null;
  ctx.fillStyle='#000000';ctx.fillStyle=v;
  const raw=ctx.fillStyle;
  if(/^#[\da-f]{6}$/i.test(raw))return raw;
  if(/^#[\da-f]{3}$/i.test(raw))return '#'+[...raw.slice(1)].map(c=>c+c).join('');
  const rgb=raw.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  return rgb?'#'+rgb.slice(1,4).map(x=>Number(x).toString(16).padStart(2,'0')).join(''):null;
}
function alphaOf(v){
  if(/^#[\da-f]{8}$/i.test(v))return +(parseInt(v.slice(7),16)/255).toFixed(3);
  if(/^#[\da-f]{4}$/i.test(v))return +(parseInt(v.slice(4).repeat(2),16)/255).toFixed(3);
  if(/^transparent$/i.test(v))return null; // Picking a visible color from fully transparent should produce a visible color.
  const old=v.match(/,\s*([\d.]+)\s*\)$/);
  if(/^(?:rgba|hsla)\(/i.test(v)&&old)return Number(old[1]);
  const modern=v.match(/\/\s*([\d.]+)(%)?\s*\)$/);
  if(modern)return Number(modern[1])/(modern[2]?100:1);
  return null;
}
function maintainAlpha(hex,original){
  const a=alphaOf(original);if(a==null||!Number.isFinite(a))return hex;
  const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  return 'rgba('+rgb.join(', ')+', '+a+')';
}
/* These names are guidance, not claims about where a CSS variable is used.
 * The actual appearance depends on the theme's var() references. */
const COLOR_NAMES=Object.freeze({
  '--theme-main':['主题主色','可能是整套主题的主要配色，改变后可能影响不止一处。'],
  '--paper':['页面／纸张底色','可能用于大面积页面或信纸背景。'],
  '--card':['卡片背景色','可能用于卡片底色，实际效果由主题引用决定。'],
  '--card-user':['用户卡片背景','可能用于用户消息卡片。'],
  '--card-bot':['角色卡片背景','可能用于角色回复卡片。'],
  '--card-assistant':['角色卡片背景','可能用于角色回复卡片。'],
  '--panel':['面板背景色','可能用于设置面板或浮层背景。'],
  '--bg':['背景色','可能控制某个区域的背景。'],
  '--background':['背景色','可能控制某个区域的背景。'],
  '--text':['正文文字颜色','可能影响默认文字颜色。'],
  '--text-main':['主要文字颜色','可能影响较重要的文字。'],
  '--text-muted':['次要文字颜色','可能影响提示、说明类文字。'],
  '--border':['边框颜色','可能影响容器轮廓线。'],
  '--accent':['强调／点缀色','可能用于按钮、选中状态或强调内容。'],
  '--shadow':['阴影颜色','可能用于卡片或面板阴影。'],
  '--highlight':['高亮颜色','可能用于选中或重点区域。']
});
function explainColor(item){
  const p=item.property.toLowerCase(),sel=item.selector.toLowerCase();
  let label='',detail='',estimated=true;
  if(COLOR_NAMES[p]){
    [label,detail]=COLOR_NAMES[p];
  }else if(p.startsWith('--')){
    const n=p.replace(/^--/,'');
    const specs=[
      [/user.*(card|bubble|mes|message)|(card|bubble|mes|message).*user/,'用户消息背景','可能用于用户发送的消息。'],
      [/(bot|char|assistant).*(card|bubble|mes|message)|(card|bubble|mes|message).*(bot|char|assistant)/,'角色消息背景','可能用于角色回复的消息。'],
      [/(chat|message|mes).*(bg|background)/,'聊天背景','可能与聊天区或消息背景有关。'],
      [/(panel|drawer|popup|modal)/,'弹窗／面板颜色','可能用于设置面板、抽屉或弹窗。'],
      [/(card|bubble)/,'卡片／气泡颜色','可能用于卡片或消息气泡。'],
      [/(paper|page)/,'页面底色','可能用于页面或信纸。'],
      [/(text|font|foreground|fg)/,'文字颜色','可能用于正文或提示文字。'],
      [/(border|stroke|outline|line)/,'边框／线条颜色','可能用于边框、描边或分隔线。'],
      [/(shadow)/,'阴影颜色','可能用于外阴影或柔光。'],
      [/(accent|highlight|primary|main)/,'主色／强调色','可能用于页面主色或强调元素。'],
      [/(muted|secondary|hint|subtle)/,'次要元素颜色','可能用于提示文字或弱化元素。'],
      [/(background|bg)/,'背景颜色','可能用于某个区域的背景。']
    ];
    const rule=specs.find(([regex])=>regex.test(n));
    if(rule){label=rule[1];detail=rule[2];}
    else {label='自定义颜色变量';detail='这个变量的用途要结合主题中引用它的代码判断。';}
  }else{
    estimated=false;
    const rules=[
      [/^color$/,'文字颜色','修改这里的文字颜色。'],
      [/^(?:background|background-color)$/,'背景颜色','修改此 CSS 规则指定区域的背景颜色。'],
      [/^background-image$/,'背景图／渐变颜色','修改背景图层或渐变中的一个颜色。'],
      [/^border|border$|^outline/,'边框／轮廓颜色','修改这个 CSS 规则中使用的边框或轮廓颜色。'],
      [/shadow/,'阴影／柔光颜色','修改阴影或发光效果中使用的颜色。'],
      [/^fill$/,'图形填充色','修改 SVG 等图形的填充颜色。'],
      [/^stroke$/,'图形描边色','修改 SVG 等图形的描边颜色。'],
      [/^caret/,'输入光标颜色','修改文本输入光标的颜色。']
    ];
    const rule=rules.find(([regex])=>regex.test(p));
    if(rule){label=rule[1];detail=rule[2];}
    else {label='样式颜色';detail='这是 CSS 属性里的一个颜色值，可点「定位」查看上下文。';}
  }
  if(item.colorCount>1)label+=' · 第 '+item.colorIndex+' 色';
  if(sel===':root'&&p.startsWith('--'))detail+=' 这是全局变量。';
  if(item.color.toLowerCase()==='transparent')detail+=' 当前颜色为完全透明。';
  return {label,detail,estimated};
}
export function createThemeStudio({notify=()=>{}}={}){
  let root=null,textarea=null,results=null,search=null,hint=null,undoControl=null;
  let enabled=false,expanded=false,large=false,appearance='auto',timer=0;
  let originalHeight=null,undo=[],lastTheme='',warned=false;
  const currentTheme=()=>document.getElementById('themes')?.value||'';
  const message=(text,warning=false)=>{if(hint)hint.textContent=text;if(warning)notify(text,'warning');};
  function jump(start,length=0){
    if(!textarea)return;
    const pos=Math.min(Math.max(0,start),textarea.value.length);
    const row=textarea.value.slice(0,pos).split('\n').length;
    const size=parseFloat(getComputedStyle(textarea).lineHeight)||18;
    textarea.focus();textarea.setSelectionRange(pos,pos+length);
    textarea.scrollTop=Math.max(0,(row-4)*size);
    textarea.scrollIntoView({block:'center',behavior:'smooth'});
  }
  function writeCSS(code){
    textarea.value=code;
    textarea.dispatchEvent(new Event('input',{bubbles:true}));
    textarea.dispatchEvent(new Event('change',{bubbles:true}));
    const native=document.getElementById('custom-style');
    if(native)native.textContent=code;
    draw();
  }
  function apply(item,value){
    const existing=textarea.value;
    if(existing.slice(item.start,item.end)!==item.color){
      message('代码已变化，请刷新后重新定位颜色。',true);draw();return;
    }
    if(!validColor(value)){message('颜色格式无效，未修改 CSS。',true);return;}
    if(value===item.color)return;
    undo.push({theme:currentTheme(),css:existing,after:existing.slice(0,item.start)+value+existing.slice(item.end)});
    if(undo.length>12)undo.shift();
    if(undoControl)undoControl.disabled=false;
    writeCSS(existing.slice(0,item.start)+value+existing.slice(item.end));
    message('已精确修改这一处颜色。记得保存到 TT 主题。');
  }
  function revert(){
    const previous=undo.pop();
    if(!previous)return;
    if(previous.theme!==currentTheme()){
      undo=[];undoControl.disabled=true;
      message('已切换主题，不能跨主题撤销。',true);return;
    }
    if(textarea.value!==previous.after){
      undo=[];undoControl.disabled=true;
      message('你已手动修改 CSS，为防止覆盖新内容，本次撤销已取消。',true);return;
    }
    writeCSS(previous.css);
    undoControl.disabled=!undo.length;
    message('已撤销上一处通过工作台应用的颜色修改。');
  }
  function draw(){
    if(!expanded||!root||!textarea)return;
    results.replaceChildren();
    const code=textarea.value,query=search.value.trim().toLowerCase();
    const parsed=extract(code);
    if(parsed.unbalanced){
      results.append(el('p','empty','CSS 存在未闭合的代码块，颜色编辑已暂时停用。'));return;
    }
    const explained=parsed.items.map(item=>({...item,guide:explainColor(item)}));
    const filtered=explained.filter(item=>!query||
      (item.selector+' '+item.property+' '+item.color+' '+item.guide.label+' '+item.guide.detail)
        .toLowerCase().includes(query));
    results.append(el('div','result-title','可编辑颜色 · '+filtered.length+' 项'));
    results.append(el('p','guide','中文名称根据 CSS 变量名推测，不代表真实使用位置。修改「--」开头的全局变量，可能影响多个地方；可点「定位」查看原代码。'));
    for(const item of filtered.slice(0,150)){
      const row=el('div','row');
      const meta=el('div','meta');
      const guide=el('strong','friendly-name',item.guide.label);
      const explanation=el('div','friendly-detail',item.guide.detail);
      const technical=el('div','technical',(item.property||'颜色')+' · '+
        (item.selector.trim()===':root'?'全局变量':item.selector||'CSS 规则')+' · 第 '+item.line+' 行');
      meta.append(guide,explanation,technical);
      const tools=el('div','controls');
      const chip=el('span','chip');chip.style.backgroundColor=item.color;
      const value=el('input','value');value.type='text';value.value=item.color;value.spellcheck=false;
      const h=hexColor(item.color);
      if(h){
        const picker=el('input','picker');picker.type='color';picker.value=h;picker.title='挑选新颜色（保留原透明度）';
        picker.addEventListener('input',()=>{value.value=maintainAlpha(picker.value,item.color);chip.style.backgroundColor=value.value;});
        tools.append(picker);
      }
      value.addEventListener('input',()=>{chip.style.backgroundColor=validColor(value.value)?value.value:'transparent';});
      value.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();apply(item,value.value.trim());}});
      tools.append(chip,value,btn('应用',()=>apply(item,value.value.trim())),btn('定位',()=>jump(item.start,item.color.length)));
      row.append(meta,tools);results.append(row);
    }
    if(filtered.length>150)results.append(el('p','empty','为保证手机流畅，仅显示前 150 项；输入关键词可缩小范围。'));
    if(!filtered.length)results.append(el('p','empty','没有匹配的颜色。'));
    if(query){
      results.append(el('div','result-title','原始 CSS 搜索结果'));
      let from=0,count=0;const lower=code.toLowerCase();
      while(count<30){
        const pos=lower.indexOf(query,from);if(pos<0)break;
        const start=code.lastIndexOf('\n',pos-1)+1,end=code.indexOf('\n',pos);
        const row=code.slice(0,pos).split('\n').length;
        const snippet=code.slice(start,end<0?code.length:end).trim().slice(0,100);
        results.append(btn('第 '+row+' 行 · '+snippet,()=>jump(pos,query.length)));
        from=pos+Math.max(1,query.length);count++;
      }
      if(!count)results.append(el('p','empty','原始 CSS 没有匹配内容。'));
    }
    undoControl.disabled=!undo.length;
  }
  function save(asNew=false){
    const native=document.getElementById(asNew?'ui-preset-save-button':'ui-preset-update-button');
    if(!native||getComputedStyle(native).display==='none'){
      message('找不到 TT 原生主题保存按钮，请切换到主题设置页面。',true);return;
    }
    native.click();
    message('已触发 TT 原生'+(asNew?'另存为':'更新主题')+'操作，请以 TT 提示为准。');
  }
  function setLarge(value){
    large=!!value;if(!textarea)return;
    if(large){
      if(!originalHeight)originalHeight={value:textarea.style.getPropertyValue('min-height'),priority:textarea.style.getPropertyPriority('min-height')};
      textarea.style.setProperty('min-height','min(60dvh, 680px)','important');
    }else if(originalHeight){
      if(originalHeight.value)textarea.style.setProperty('min-height',originalHeight.value,originalHeight.priority);
      else textarea.style.removeProperty('min-height');
      originalHeight=null;
    }
  }
  // A deterministic top/bottom action for iOS textareas. Do not focus the
  // textarea here: focusing can re-scroll to the old caret and summon the
  // on-screen keyboard, making "go to top" appear broken.
  function scrollEditor(toBottom){
    if(!textarea)return;
    const target=textarea;
    const position=toBottom?target.value.length:0;
    try{target.setSelectionRange(position,position);}catch{}
    const scroll=()=>{if(target.isConnected)target.scrollTop=toBottom?target.scrollHeight:0;};
    scroll();
    requestAnimationFrame(scroll);
  }
  function inputChanged(){clearTimeout(timer);if(expanded)timer=setTimeout(draw,240);}
  function themeChanged(event){
    if(event.target?.id!=='themes')return;
    undo=[];lastTheme=currentTheme();
    if(undoControl)undoControl.disabled=true;
    clearTimeout(timer);if(expanded)timer=setTimeout(draw,180);
  }
  function mount(){
    const t=document.getElementById('customCSS'),block=document.getElementById('CustomCSS-textAreaBlock');
    if(!(t instanceof HTMLTextAreaElement)||!block?.parentNode)return false;
    if(document.querySelector('#visual-css-editor-new,#native-css-toolbar-new')){
      if(!warned){notify('检测到旧 ThemeEditor。请先停用它并刷新 TT，再开启 DW2 CSS 工作台。','warning');warned=true;}
      return false; // Never stack two editing panels on the same native textarea.
    }
    textarea=t;root=el('section','root');root.id=ID;
    const bar=el('div','toolbar'),title=el('strong','title','DW2 · CSS 工作台');
    const actions=el('div','actions'),body=el('div','body');
    body.hidden=true;
    let toggle;
    const setExpanded=(value)=>{
      expanded=!!value;
      body.hidden=!expanded;
      if(toggle){
        const label=expanded?'收起颜色结果':'展开颜色结果';
        toggle.title=label;
        toggle.setAttribute('aria-label',label);
        toggle.setAttribute('aria-expanded',String(expanded));
        toggle.firstElementChild.className='fa-solid '+(expanded?'fa-chevron-up':'fa-chevron-down');
      }
      if(expanded)draw();
    };
    toggle=iconBtn('fa-chevron-down','展开颜色结果',()=>setExpanded(!expanded));
    const height=iconBtn('fa-maximize','扩大 CSS 编辑框',()=>{
      setLarge(!large);
      const label=large?'恢复 CSS 编辑框高度':'扩大 CSS 编辑框';
      height.title=label;
      height.setAttribute('aria-label',label);
      height.firstElementChild.className='fa-solid '+(large?'fa-minimize':'fa-maximize');
    });
    const goTop=iconBtn('fa-arrow-up','CSS 代码回到顶部',()=>scrollEditor(false));
    const goBottom=iconBtn('fa-arrow-down','CSS 代码跳到底部',()=>scrollEditor(true));
    // Follow TT appearance by default. Explicit day/night override only this panel.
    // One tap cycles: follow theme → night → day → follow theme.
    const viewModes={
      auto:{icon:'fa-circle-half-stroke',label:'跟随 TT 主题',next:'夜间'},
      dark:{icon:'fa-moon',label:'夜间',next:'日间'},
      light:{icon:'fa-sun',label:'日间',next:'跟随主题'}
    };
    const mode=iconBtn('fa-circle-half-stroke','工作台外观：跟随 TT 主题',()=>{
      appearance=appearance==='auto'?'dark':appearance==='dark'?'light':'auto';
      root.dataset.mode=appearance;
      const info=viewModes[appearance];
      const label='工作台外观：'+info.label+'；再次点击切换为'+info.next;
      mode.title=label;
      mode.setAttribute('aria-label',label);
      mode.firstElementChild.className='fa-solid '+info.icon;
      message('工作台外观：'+info.label+'（只调整工作台，不影响 TT 主题）');
      notify('CSS 工作台：'+info.label,'info');
    });
    root.dataset.mode='auto';
    actions.append(
      btn('保存',()=>save()),btn('另存',()=>save(true)),
      btn('刷新',draw),goTop,goBottom,
      height,mode,toggle
    );
    bar.append(title,actions);
    const filters=el('div','filters');
    search=el('input','search');search.type='search';search.placeholder='搜索颜色、选择器、原始 CSS';
    search.setAttribute('aria-label','搜索 CSS 代码、颜色、选择器');
    search.addEventListener('input',()=>{
      if(!expanded && search.value.trim())setExpanded(true);
      else draw();
    });
    // Undo belongs beside search, not inside the collapsible results.
    undoControl=btn('↶ 撤销',revert,'撤销最近一次通过工作台「应用」的颜色修改（最多12次）');
    undoControl.disabled=true;
    filters.append(search,undoControl);
    results=el('div','results');
    hint=el('p','hint','颜色方块可选色、旁边可输入色值；点「应用」才会修改 CSS，点「定位」看原位置。撤销仅恢复工作台已应用的颜色。');
    body.append(results,hint);
    // Search remains available even while the color results are collapsed.
    root.append(bar,filters,body);
    // Mount above the original CSS textarea, directly below "自定义 CSS".
    // Leave TT's heading, maximize icon, textarea, and native handlers intact.
    block.insertAdjacentElement('beforebegin',root);
    lastTheme=currentTheme();
    textarea.addEventListener('input',inputChanged);
    document.addEventListener('change',themeChanged);
    return true;
  }
  function disable(){
    enabled=false;clearTimeout(timer);timer=0;
    textarea?.removeEventListener('input',inputChanged);
    document.removeEventListener('change',themeChanged);
    setLarge(false);root?.remove();
    root=textarea=results=search=hint=undoControl=null;
    undo=[];expanded=false;large=false;
  }
  function sync(on){
    if(!on){if(root||enabled)disable();return;}
    if(root && (!root.isConnected||textarea!==document.getElementById('customCSS')))disable();
    enabled=true;if(!root)mount();
  }
  return {sync,disable};
}
