/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* A presentation over legal alternatives, never a generator of game actions.
   A path is [{key, value, label, kind?}]. Values are stable identities, labels are display only.
   Branches are conditional on the complete prefix; common nodes are selected without a click.
   Confirmation still returns exactly one original option index and only for the same context. */
(function (root) {
  'use strict';
  const identity = node => JSON.stringify([node.key, node.value]);
  function create(options, context) {
    if (!options.length || new Set(options.map(o => o.index)).size !== options.length) throw new Error('Expected distinct legal options');
    const rows = options.map(o => ({index:o.index, label:o.label, path:(o.path || []).map(n => {
      if (typeof n.key !== 'string' || typeof n.label !== 'string' || n.value === undefined) throw new Error('Invalid decision path');
      return structuredClone(n);
    })}));
    return {context:JSON.stringify(context), rows, selections:[]};
  }
  function step(flow) {
    let rows=flow.rows, depth=0, selected=0;
    const trail=[];
    while (rows.length) {
      const ended=rows.filter(r => depth===r.path.length);
      if (ended.length===1 && rows.length===1) {
        if (selected!==flow.selections.length) return {status:'invalid',trail,choices:[]};
        return {status:'confirm',index:ended[0].index,trail,choices:[]};
      }
      const groups=new Map();
      for (const row of rows) {
        // Identical descriptions must not silently collapse different legal indices.
        const node=row.path[depth] || {key:'$answer',value:row.index,label:row.label,kind:'answer'};
        const terminal=depth>=row.path.length;
        const id=JSON.stringify([terminal?'answer':'node',identity(node)]);
        if (!groups.has(id)) groups.set(id,{id,node,terminal,rows:[]});
        groups.get(id).rows.push(row);
      }
      let group;
      const automatic=groups.size===1;
      if (automatic) group=groups.values().next().value;
      else if (selected<flow.selections.length) group=groups.get(flow.selections[selected++]);
      else return {status:'choose',trail,choices:[...groups.values()].map(g => ({id:g.id,...g.node,indices:g.rows.map(r=>r.index)}))};
      if (!group) return {status:'invalid',trail,choices:[]};
      trail.push({...group.node,automatic});
      rows=group.rows;
      if (group.terminal) return selected===flow.selections.length
        ? {status:'confirm',index:rows[0].index,trail,choices:[]} : {status:'invalid',trail,choices:[]};
      depth++;
    }
    return {status:'invalid',trail,choices:[]};
  }
  function select(flow, id) {
    const current=step(flow);
    if (current.status!=='choose' || !current.choices.some(c => c.id===id)) throw new Error('Choice is no longer available');
    return {...flow,selections:[...flow.selections,id]};
  }
  const back=flow => ({...flow,selections:flow.selections.slice(0,-1)});
  function answer(flow, context) {
    const current=step(flow);
    if (JSON.stringify(context)!==flow.context || current.status!=='confirm') return null;
    return {indices:[current.index]};
  }
  const api=Object.freeze({create,step,select,back,answer});
  root.CrankChoiceFlow=api;
  if (typeof module!=='undefined') module.exports=api;
})(globalThis);
