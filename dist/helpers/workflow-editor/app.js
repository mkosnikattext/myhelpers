(()=>{
'use strict';
const viewport=document.getElementById('viewport'),world=document.getElementById('world'),nodesEl=document.getElementById('nodes'),edgesEl=document.getElementById('edges');
const statusEl=document.getElementById('status'),emptyEl=document.getElementById('empty'),sidePanel=document.getElementById('sidePanel'),propsEl=document.getElementById('props'),jsonEditor=document.getElementById('jsonEditor'),toast=document.getElementById('toast');
let manifest=null,fileName='workflow-manifest.json',graph=[],nodeMap=new Map(),edgeGraph=[],selectedId=null,history=[];
let scale=1,panX=0,panY=0,panning=false,panStart=null,draggingNode=null,dragOffset=null,dragGroup=null,connectionDrag=null;
const W=220,H=58,GAPY=96,BRANCHX=330,ROOTX=2800,ROOTY=130;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=(task,path)=>task.taskReferenceName||`${task.name||task.type||'task'}__${path.join('_')}`;
const getAt=(root,path)=>{let x=root;for(const k of path)x=x?.[k];return x};
const samePrefix=(a,b)=>a.length<=b.length&&a.every((v,i)=>v===b[i]);
function setStatus(s){statusEl.textContent=s}
function showToast(s){toast.textContent=s;toast.style.display='block';clearTimeout(showToast.t);showToast.t=setTimeout(()=>toast.style.display='none',2400)}
function saveHist(){if(manifest){history.push(JSON.stringify(manifest));if(history.length>40)history.shift()}}
function layoutStore(){if(!manifest)return{};manifest._workflowEditorLayout??={version:2,positions:{}};manifest._workflowEditorLayout.version=2;manifest._workflowEditorLayout.positions??={};return manifest._workflowEditorLayout.positions}
function setPos(id,x,y){layoutStore()[id]={x:Math.round(x),y:Math.round(y)}}
function nestedNodeIds(rootId){
  const root=nodeMap.get(rootId);if(!root)return[rootId];
  return graph.filter(n=>n.id===rootId||(n.path.length>root.path.length&&samePrefix(root.path,n.path))).map(n=>n.id);
}
function makeDragGroup(rootId){
  const st=layoutStore(),root=st[rootId];if(!root)return null;
  const ids=nestedNodeIds(rootId),offsets={};
  ids.forEach(id=>{const p=st[id];if(p)offsets[id]={x:p.x-root.x,y:p.y-root.y}});
  return{rootId,ids,offsets};
}
function moveDragGroup(rootId,x,y){
  if(!dragGroup||dragGroup.rootId!==rootId){setPos(rootId,x,y);return}
  const st=layoutStore();
  dragGroup.ids.forEach(id=>{const o=dragGroup.offsets[id];if(!o)return;st[id]={x:Math.round(x+o.x),y:Math.round(y+o.y)};const el=nodesEl.querySelector(`.node[data-id="${CSS.escape(id)}"]`);if(el){el.style.left=st[id].x+'px';el.style.top=st[id].y+'px'}});
}
function updateTransform(){world.style.transform=`translate(${panX}px,${panY}px) scale(${scale})`;document.getElementById('zoomReadout').textContent=Math.round(scale*100)+'%'}
function taskIcon(task){if(task.type==='SWITCH')return['purple','⇄'];if(task.type==='HTTP')return['orange','◯'];return['gray','◆']}
function taskSubtitle(task){if(task.type==='SWITCH')return 'General';if(task.type==='HTTP')return 'Chats';return task.type||'Task'}
function isSwitch(task){return !!task&&(task.type==='SWITCH'||task.decisionCases||task.defaultCase)}

function copyBlock(id,withChildren){
  collect();const source=nodeMap.get(id);if(!source)return;
  const siblings=getAt(manifest,source.arrayPath);if(!Array.isArray(siblings))return;
  const originalIds=withChildren?nestedNodeIds(id):[id];
  const positions=layoutStore(),originalPositions=new Map(originalIds.map(key=>[key,positions[key]?{...positions[key]}:null]));
  const clone=JSON.parse(JSON.stringify(source.task));
  if(!withChildren){
    if(clone.decisionCases)for(const key of Object.keys(clone.decisionCases))if(Array.isArray(clone.decisionCases[key]))clone.decisionCases[key]=[];
    if(Array.isArray(clone.defaultCase))clone.defaultCase=[];
  }
  const used=new Set(graph.map(n=>n.task.taskReferenceName).filter(Boolean));
  const refs=new Map();
  function nextNumberedRef(ref){
    const match=ref.match(/^(.*)_([0-9]+)$/),base=match?match[1]:ref;
    const pattern=new RegExp('^'+base.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'_([0-9]+)$');
    let highest=0;
    used.forEach(candidate=>{const numbered=String(candidate).match(pattern);if(numbered)highest=Math.max(highest,Number(numbered[1]))});
    let candidate=base+'_'+(highest+1);
    while(used.has(candidate))candidate=base+'_'+(++highest);
    return candidate;
  }
  function rename(task){
    if(task.taskReferenceName){
      const old=task.taskReferenceName,candidate=nextNumberedRef(old);
      used.add(candidate);refs.set(old,candidate);task.taskReferenceName=candidate;
    }
    if(isSwitch(task)){
      Object.values(task.decisionCases||{}).forEach(arr=>{if(Array.isArray(arr))arr.forEach(rename)});
      if(Array.isArray(task.defaultCase))task.defaultCase.forEach(rename);
    }
  }
  rename(clone);
  function remap(value){
    if(typeof value==='string')return refs.get(value)||value;
    if(Array.isArray(value))return value.map(remap);
    if(value&&typeof value==='object')for(const key of Object.keys(value))value[key]=remap(value[key]);
    return value;
  }
  for(const key of Object.keys(clone))if(key!=='taskReferenceName')clone[key]=remap(clone[key]);
  saveHist();siblings.splice(source.index+1,0,clone);
  collect();const copied=nodeMap.get(uid(clone,[...source.arrayPath,source.index+1]));
  if(copied){
    const copiedNodes=graph.filter(n=>n.id===copied.id||(n.path.length>copied.path.length&&samePrefix(copied.path,n.path)));
    copiedNodes.forEach((n,i)=>{
      const old=originalPositions.get(originalIds[i]);
      positions[n.id]=old?{x:old.x+280,y:old.y+40}:{x:(positions[id]?.x??ROOTX)+280,y:(positions[id]?.y??ROOTY)+40+i*GAPY};
    });
    selectedId=copied.id;
  }
  render();if(selectedId)selectNode(selectedId);
  const count=withChildren?originalIds.length:1;
  setStatus(`Copied ${count} block${count===1?'':'s'} into the workflow`);
  showToast(count===1?'Block copied':'Branch and children copied');
}

function collect(){
  graph=[];nodeMap.clear();edgeGraph=[];
  const root=manifest?.definition?.tasks;if(!Array.isArray(root))return;
  function walk(arr,arrayPath,parentSwitchId=null,branch=null){
    let prevId=null;
    arr.forEach((task,i)=>{
      const path=[...arrayPath,i],id=uid(task,path);
      const n={id,task,path,arrayPath:[...arrayPath],index:i,parentSwitchId,branch};
      graph.push(n);nodeMap.set(id,n);
      if(prevId) edgeGraph.push({sourceId:prevId,targetId:id,kind:'sequence',branch:null});
      else if(parentSwitchId) edgeGraph.push({sourceId:parentSwitchId,targetId:id,kind:'branch',branch});
      prevId=id;
      if(isSwitch(task)){
        const dc=task.decisionCases||{};
        Object.keys(dc).forEach(k=>{if(Array.isArray(dc[k]))walk(dc[k],[...path,'decisionCases',k],id,k)});
        if(Array.isArray(task.defaultCase))walk(task.defaultCase,[...path,'defaultCase'],id,'DEFAULT');
      }
    });
  }
  walk(root,['definition','tasks']);
}

function autoLayout(force=false){
  collect();const positions=layoutStore();
  function placeArray(arr,path,x,y){
    let cy=y;
    arr.forEach((task,i)=>{
      const taskPath=[...path,i],id=uid(task,taskPath);
      if(force||!positions[id])positions[id]={x,y:cy};
      const own=positions[id];cy=Math.max(cy,own.y)+GAPY;
      if(isSwitch(task)){
        const dc=task.decisionCases||{};
        const keys=Object.keys(dc).filter(k=>Array.isArray(dc[k]));
        keys.forEach((k,branchIdx)=>{
          const a=dc[k];if(!a.length)return;
          let bx=x+(branchIdx-(keys.length-1)/2)*BRANCHX;
          if(k==='TRUE')bx=x-BRANCHX;if(k==='FALSE')bx=x+BRANCHX;
          placeArray(a,[...taskPath,'decisionCases',k],bx,own.y+GAPY);
        });
        if(Array.isArray(task.defaultCase)&&task.defaultCase.length)placeArray(task.defaultCase,[...taskPath,'defaultCase'],x+BRANCHX*(keys.length||1),own.y+GAPY);
      }
    });
  }
  const root=manifest?.definition?.tasks;if(Array.isArray(root))placeArray(root,['definition','tasks'],ROOTX,ROOTY);
  render();
}

function outputPoint(sourceId,branch){
  const p=layoutStore()[sourceId];const n=nodeMap.get(sourceId);if(!p||!n)return null;
  let x=p.x+W/2;
  if(isSwitch(n.task)&&branch==='TRUE')x=p.x+W*.18;
  else if(isSwitch(n.task)&&branch==='FALSE')x=p.x+W*.82;
  return{x,y:p.y+H};
}
function inputPoint(targetId){const p=layoutStore()[targetId];return p?{x:p.x+W/2,y:p.y}:null}
function addEdgePath(a,b,cls='edge'){
  const mid=a.y+(b.y-a.y)*.42;const d=`M ${a.x} ${a.y} C ${a.x} ${mid}, ${b.x} ${mid}, ${b.x} ${b.y}`;
  const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',d);p.setAttribute('class',cls);edgesEl.appendChild(p);return p;
}
function buildEdges(){
  edgesEl.innerHTML='';if(!manifest)return;
  edgeGraph.forEach(e=>{
    const a=outputPoint(e.sourceId,e.branch),b=inputPoint(e.targetId);if(!a||!b)return;addEdgePath(a,b,'edge');
    if(e.branch){
      const lx=a.x+(b.x-a.x)*.70,ly=a.y+(b.y-a.y)*.57,label=String(e.branch).toUpperCase(),width=Math.max(44,label.length*8+16);
      const r=document.createElementNS('http://www.w3.org/2000/svg','rect');r.setAttribute('x',lx-width/2);r.setAttribute('y',ly-11);r.setAttribute('width',width);r.setAttribute('height',22);r.setAttribute('rx',6);r.setAttribute('class','edgeLabelBg');edgesEl.appendChild(r);
      const t=document.createElementNS('http://www.w3.org/2000/svg','text');t.setAttribute('x',lx);t.setAttribute('y',ly+.5);t.setAttribute('class','edgeLabel');t.textContent=label;edgesEl.appendChild(t);
    }
  });
  if(connectionDrag){const a=outputPoint(connectionDrag.sourceId,connectionDrag.branch);if(a)addEdgePath(a,connectionDrag.pointer,'edge temp')}
}

function render(){
  if(!manifest)return;collect();emptyEl.style.display='none';nodesEl.innerHTML='';const pos=layoutStore();
  graph.forEach((n,idx)=>{
    if(!pos[n.id])pos[n.id]={x:ROOTX,y:ROOTY+idx*GAPY};
    const [tone,ico]=taskIcon(n.task);const d=document.createElement('div');
    d.className='node'+(isSwitch(n.task)?' switch':'')+(selectedId===n.id?' selected':'');d.dataset.id=n.id;d.style.left=pos[n.id].x+'px';d.style.top=pos[n.id].y+'px';
    const outputs=isSwitch(n.task)
      ? `<div class="branchPort true" data-port="out" data-branch="TRUE" title="Drag TRUE branch connection"></div><div class="branchPort next" data-port="out" data-branch="NEXT" title="Drag connection to the block after this condition"></div><div class="branchPort false" data-port="out" data-branch="FALSE" title="Drag FALSE branch connection"></div><div class="branchMini true">TRUE</div><div class="branchMini next">AFTER</div><div class="branchMini false">FALSE</div>`
      : `<div class="port out" data-port="out" data-branch="NEXT" title="Drag next connection"></div>`;
    d.innerHTML=`<div class="icon ${tone}">${ico}</div><div class="nodeText"><div class="nodeTitle"><span class="nodeNum">${idx+1}.</span>${esc(n.task.name||n.task.type||'Task')}</div><div class="nodeSub">${esc(taskSubtitle(n.task))}</div></div><div class="port in" data-port="in" title="Drop a connection here"></div>${outputs}`;

    d.addEventListener('pointerdown',e=>{
      if(e.button!==0||e.target.closest('[data-port]'))return;e.stopPropagation();selectNode(n.id);saveHist();draggingNode=n.id;dragGroup=makeDragGroup(n.id);d.classList.add('dragging');
      if(dragGroup&&dragGroup.ids.length>1)dragGroup.ids.forEach(id=>{const el=nodesEl.querySelector(`.node[data-id="${CSS.escape(id)}"]`);if(el)el.classList.add('dragging-subtree')});
      const wp=screenToWorld(e.clientX,e.clientY);dragOffset={x:wp.x-pos[n.id].x,y:wp.y-pos[n.id].y};d.setPointerCapture(e.pointerId);
    });
    d.addEventListener('pointermove',e=>{if(draggingNode!==n.id)return;const wp=screenToWorld(e.clientX,e.clientY);const nx=wp.x-dragOffset.x,ny=wp.y-dragOffset.y;moveDragGroup(n.id,nx,ny);buildEdges()});
    d.addEventListener('pointerup',()=>{if(draggingNode!==n.id)return;d.classList.remove('dragging');document.querySelectorAll('.node.dragging-subtree').forEach(el=>el.classList.remove('dragging-subtree'));const count=dragGroup?.ids?.length||1;draggingNode=null;dragGroup=null;setStatus(count>1?`Moved ${n.task.taskReferenceName||n.task.name||'block'} with ${count-1} nested block${count-1===1?'':'s'}`:`Moved ${n.task.taskReferenceName||n.task.name||'block'}`)});

    d.querySelectorAll('[data-port="out"]').forEach(port=>port.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;e.preventDefault();e.stopPropagation();beginConnection(n.id,port.dataset.branch,e.clientX,e.clientY);
    }));
    nodesEl.appendChild(d);
  });
  buildEdges();jsonEditor.value=JSON.stringify(manifest,null,2);
}

function screenToWorld(cx,cy){const r=viewport.getBoundingClientRect();return{x:(cx-r.left-panX)/scale,y:(cy-r.top-panY)/scale}}
function beginConnection(sourceId,branch,cx,cy){
  connectionDrag={sourceId,branch,pointer:screenToWorld(cx,cy)};document.body.classList.add('connecting');selectNode(sourceId);buildEdges();setStatus(`Rewiring ${branch==='NEXT'?'next':branch} connection — drop on another block`);
  window.addEventListener('pointermove',connectionMove,true);window.addEventListener('pointerup',connectionEnd,true);
}
function connectionMove(e){
  if(!connectionDrag)return;connectionDrag.pointer=screenToWorld(e.clientX,e.clientY);buildEdges();
  document.querySelectorAll('.node.connectTarget').forEach(x=>x.classList.remove('connectTarget'));
  const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest('.node');if(hit&&hit.dataset.id!==connectionDrag.sourceId)hit.classList.add('connectTarget');
}
function connectionEnd(e){
  if(!connectionDrag)return;const drag={...connectionDrag};connectionDrag=null;document.body.classList.remove('connecting');window.removeEventListener('pointermove',connectionMove,true);window.removeEventListener('pointerup',connectionEnd,true);
  document.querySelectorAll('.node.connectTarget').forEach(x=>x.classList.remove('connectTarget'));
  const targetEl=document.elementFromPoint(e.clientX,e.clientY)?.closest('.node');buildEdges();
  if(!targetEl){setStatus('Connection unchanged');return}
  const targetId=targetEl.dataset.id;if(targetId===drag.sourceId){showToast('A block cannot connect to itself.');return}
  rewire(drag.sourceId,drag.branch,targetId);
}

function removeTarget(targetId){
  collect();const t=nodeMap.get(targetId);if(!t)return null;const arr=getAt(manifest,t.arrayPath);if(!Array.isArray(arr))return null;const removed=arr.splice(t.index,1)[0];return removed;
}
function positionAfterRewire(targetId,sourceId,branch){
  const st=layoutStore();const s=st[sourceId];if(!s)return;
  if(!st[targetId])st[targetId]={x:s.x,y:s.y+GAPY};
  if(branch==='TRUE')st[targetId]={x:s.x-BRANCHX,y:s.y+GAPY};
  else if(branch==='FALSE')st[targetId]={x:s.x+BRANCHX,y:s.y+GAPY};
  else st[targetId]={x:s.x,y:s.y+GAPY};
}
function rewire(sourceId,branch,targetId){
  collect();let source=nodeMap.get(sourceId),target=nodeMap.get(targetId);if(!source||!target)return;
  if(samePrefix(target.path,source.path)){showToast('Cannot connect a block to one of its own descendants/ancestors in a way that creates a cycle.');setStatus('Connection rejected to avoid a cycle');return}
  saveHist();
  const targetTask=removeTarget(targetId);if(!targetTask)return;
  collect();source=nodeMap.get(sourceId);if(!source){manifest=JSON.parse(history.pop());render();showToast('Could not reconnect: source path changed unexpectedly.');return}
  if(branch==='TRUE'||branch==='FALSE'||branch==='DEFAULT'){
    if(!isSwitch(source.task)){manifest=JSON.parse(history.pop());render();showToast('Branch handles are only valid on conditional blocks.');return}
    if(branch==='DEFAULT')source.task.defaultCase??=[];
    else {source.task.decisionCases??={};source.task.decisionCases[branch]??=[]}
    const dest=branch==='DEFAULT'?source.task.defaultCase:source.task.decisionCases[branch];
    dest.unshift(targetTask);
  }else{
    const arr=getAt(manifest,source.arrayPath);if(!Array.isArray(arr)){manifest=JSON.parse(history.pop());render();return}
    const sourceIdx=arr.findIndex(t=>uid(t,[...source.arrayPath,0])===sourceId||t.taskReferenceName===sourceId);
    const idx=sourceIdx>=0?sourceIdx:source.index;arr.splice(idx+1,0,targetTask);
  }
  positionAfterRewire(targetId,sourceId,branch);collect();render();
  setStatus(`Connection changed: ${sourceId} → ${branch==='NEXT'?'next':branch} → ${targetId}`);showToast('Connection updated in the manifest structure.');
}

function selectNode(id){selectedId=id;nodesEl.querySelectorAll('.node').forEach(x=>x.classList.toggle('selected',x.dataset.id===id));const n=nodeMap.get(id);if(!n)return;document.getElementById('panelTitle').textContent=n.task.taskReferenceName||n.task.name||'Block';sidePanel.classList.add('open');renderProps(n)}
function renderProps(n){
  const t=n.task;propsEl.innerHTML=`<div class="field"><label>Name</label><input id="fName" value="${esc(t.name||'')}"></div><div class="field"><label>Type</label><input id="fType" value="${esc(t.type||'')}"></div><div class="field"><label>Task reference</label><input id="fRef" value="${esc(t.taskReferenceName||'')}"></div><div class="field"><label>Input parameters (JSON)</label><textarea id="fInput">${esc(JSON.stringify(t.inputParameters??{},null,2))}</textarea></div><button class="btn primary" id="saveBlock">Save block</button><div class="copyActions"><button class="btn" id="copySingle" type="button">Copy block only</button><button class="btn" id="copyBranch" type="button">Copy branch with children</button></div><div style="font-size:11px;color:var(--muted);margin-top:11px;line-height:1.5">The copy is inserted after this block. Copying a conditional block alone leaves its branches empty.</div>`;
  document.getElementById('copySingle').onclick=()=>copyBlock(n.id,false);
  document.getElementById('copyBranch').onclick=()=>copyBlock(n.id,true);
  document.getElementById('saveBlock').onclick=()=>{try{saveHist();const old=n.id;t.name=document.getElementById('fName').value;t.type=document.getElementById('fType').value;t.taskReferenceName=document.getElementById('fRef').value;t.inputParameters=JSON.parse(document.getElementById('fInput').value||'{}');const newId=t.taskReferenceName||old;if(newId!==old){const st=layoutStore();st[newId]=st[old];delete st[old];selectedId=newId}render();setStatus('Block updated')}catch(err){alert('Invalid inputParameters JSON: '+err.message)}}
}
function fitView(){if(!graph.length)return;const pos=layoutStore();let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;graph.forEach(n=>{const p=pos[n.id];if(!p)return;minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x+W);maxY=Math.max(maxY,p.y+H)});const vr=viewport.getBoundingClientRect(),pad=90;scale=Math.max(.18,Math.min(1.2,Math.min((vr.width-pad*2)/(maxX-minX||1),(vr.height-pad*2)/(maxY-minY||1))));panX=(vr.width-(maxX-minX)*scale)/2-minX*scale;panY=(vr.height-(maxY-minY)*scale)/2-minY*scale;updateTransform()}
function zoomAt(factor,cx,cy){const r=viewport.getBoundingClientRect();cx??=r.left+r.width/2;cy??=r.top+r.height/2;const before=screenToWorld(cx,cy);scale=Math.max(.18,Math.min(2,scale*factor));const sx=cx-r.left,sy=cy-r.top;panX=sx-before.x*scale;panY=sy-before.y*scale;updateTransform()}
viewport.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.deltaY<0?1.1:.9,e.clientX,e.clientY)},{passive:false});
viewport.addEventListener('pointerdown',e=>{if(connectionDrag)return;if(e.target!==viewport&&e.target!==world&&e.target!==edgesEl)return;if(e.button!==0)return;panning=true;viewport.classList.add('panning');panStart={x:e.clientX-panX,y:e.clientY-panY};viewport.setPointerCapture(e.pointerId)});
viewport.addEventListener('pointermove',e=>{if(!panning)return;panX=e.clientX-panStart.x;panY=e.clientY-panStart.y;updateTransform()});viewport.addEventListener('pointerup',()=>{panning=false;viewport.classList.remove('panning')});
document.getElementById('fileInput').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{manifest=JSON.parse(await f.text());fileName=f.name;history=[];autoLayout(false);fitView();setStatus(`${f.name} loaded · ${graph.length} blocks · drag connector dots to rewire`)}catch(err){alert('Could not parse JSON: '+err.message)}});
document.getElementById('autoLayoutBtn').onclick=()=>{if(!manifest)return;saveHist();autoLayout(true);fitView();setStatus('Automatic workflow layout applied')};document.getElementById('fitBtn').onclick=fitView;
document.getElementById('zoomIn').onclick=()=>zoomAt(1.15);document.getElementById('zoomOut').onclick=()=>zoomAt(.87);
document.getElementById('undoBtn').onclick=()=>{if(!history.length){setStatus('Nothing to undo');return}manifest=JSON.parse(history.pop());selectedId=null;render();setStatus('Undo applied')};
document.getElementById('jsonBtn').onclick=()=>{if(!manifest)return;sidePanel.classList.add('open');document.querySelector('[data-tab="json"]').click()};document.getElementById('closePanel').onclick=()=>sidePanel.classList.remove('open');
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.getElementById(b.dataset.tab+'Panel').classList.add('active');if(b.dataset.tab==='json'&&manifest)jsonEditor.value=JSON.stringify(manifest,null,2)});
document.getElementById('applyJson').onclick=()=>{try{const next=JSON.parse(jsonEditor.value);saveHist();manifest=next;autoLayout(false);setStatus('JSON edits applied')}catch(err){alert('Invalid JSON: '+err.message)}};
document.getElementById('downloadBtn').onclick=()=>{if(!manifest){alert('Upload a manifest first.');return}const {_workflowEditorLayout:editorLayout,...exportManifest}=manifest;const blob=new Blob([JSON.stringify(exportManifest,null,2)+'\n'],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);const base=fileName.replace(/\.json$/i,'');a.download=base+' - rewired.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);setStatus('Updated manifest downloaded without editor layout')};
updateTransform();
})();
