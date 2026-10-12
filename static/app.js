// ---------- state ----------
let wageRows = [
  {uan:"101181233310", name:"Mr.Arun Kumar Mallik", gross:4516, epf:2258, ncp:0, refund:0},
  {uan:"100604907142", name:"Mr.Bishnu Charan Pradhan", gross:7742, epf:3871, ncp:0, refund:0},
  {uan:"100604933738", name:"Ms.Bijayini Pattnaik", gross:9678, epf:4839, ncp:0, refund:0},
];

let exitRows = [
  {uan:"100604936427", name:"Mr.Surendra Patra", date:"2026-08-14", code:"S"},
];

let pendingUploadFile = null; // held between the "needs_mapping" round trip and the confirmed import

const fmt = n => Math.round(Number(n)||0).toLocaleString('en-IN');

// Wage ceiling revised 15,000 -> 25,000 by S.O. 5109(E), w.e.f. 17.09.2026.
// September 2026 is split: days 1-16 at the old ceiling, 17-30 at the new
// one (EPFO FAQ Q7/Q9). Keep in sync with calc_row() in app.py.
const OLD_CEILING = 15000, NEW_CEILING = 25000, SPLIT_MONTH = '2026-09';
const SPLIT_BEFORE = 16/30, SPLIT_AFTER = 14/30;

const SEP_BASES = {
  cap:   'EPS member throughout',
  noeps: 'EPF only till 16th, joins EPS 17th',
  new:   'Newly covered from 17th',
};

const roundHalfUp = x => Math.floor(x + 0.5 + 1e-9);
const wageMonth = () => document.getElementById('wage-month').value;
const ceilingFor = month => (month || '') > SPLIT_MONTH ? NEW_CEILING : OLD_CEILING;

function calc(row){
  const w = Number(row.epf)||0;
  const month = wageMonth();
  const epsMember = row.eps !== 'N';
  // Higher EPF: EPF on actual wages above the ceiling. EPS/EDLI stay capped,
  // so the excess employer share goes to the diff.
  const higher = row.higher !== 'N';
  let epfW, epsW, edliW;
  if(month === SPLIT_MONTH){
    const old = Math.min(w, OLD_CEILING), neu = Math.min(w, NEW_CEILING);
    const split = old*SPLIT_BEFORE + neu*SPLIT_AFTER;
    edliW = split;
    if(epsMember && row.sep === 'new'){
      epfW = (higher ? w : neu)*SPLIT_AFTER;
      epsW = edliW = neu*SPLIT_AFTER;
    }else{
      epfW = higher ? w : split;
      if(!epsMember) epsW = 0;
      else if(row.sep === 'noeps') epsW = neu*SPLIT_AFTER;
      else epsW = split;
    }
  }else{
    const ceiling = ceilingFor(month);
    epfW = higher ? w : Math.min(w, ceiling);
    epsW = epsMember ? Math.min(w, ceiling) : 0;
    edliW = Math.min(w, ceiling);
  }
  // VPF is a voluntary employee contribution on top of the 12%. It is
  // remitted with the employee share (ECR "EPF contribution", A/c 1) and
  // does not change the employer's diff.
  const baseContri = roundHalfUp(epfW*0.12);
  const vpf = vpfIssue(row.vpf) ? 0 : roundHalfUp(Number(row.vpf)||0);
  const epsContri = roundHalfUp(epsW*0.0833);
  return {
    epfW: roundHalfUp(epfW), eps: roundHalfUp(epsW), edli: roundHalfUp(edliW),
    vpf, epfContri: baseContri + vpf, epsContri, diff: baseContri - epsContri,
  };
}

function isValidUAN(uan){ return /^\d{12}$/.test(String(uan||'').trim()); }

function daysInMonth(month){
  const m = /^(\d{4})-(\d{2})$/.exec(month || '');
  return m ? new Date(Number(m[1]), Number(m[2]), 0).getDate() : 31;
}

// NCP days: whole days, 0 up to the number of days in the wage month.
// Keep in sync with ncp_issue() in app.py.
function ncpIssue(ncp){
  const s = String(ncp ?? '').trim();
  if(s === '' || s === '0') return '';
  if(!/^\d+$/.test(s)) return 'whole days only';
  const max = daysInMonth(wageMonth());
  return Number(s) > max ? `max ${max} days` : '';
}

// VPF: rupee amount, zero or more. Keep in sync with vpf_issue() in app.py.
function vpfIssue(vpf){
  const s = String(vpf ?? '').trim();
  if(s === '' || s === '0') return '';
  return /^\d+(\.\d+)?$/.test(s) ? '' : 'not a valid amount';
}

const rowHasIssue = row => !isValidUAN(row.uan) || !!ncpIssue(row.ncp) || !!vpfIssue(row.vpf);

// ---------- wage table ----------
function renderWageTable(){
  const tbody = document.getElementById('wage-tbody');
  tbody.innerHTML = '';
  const isSplit = wageMonth() === SPLIT_MONTH;
  document.getElementById('wage-table').classList.toggle('split-month', isSplit);
  wageRows.forEach((row, i)=>{
    const c = calc(row);
    const uanBad = !isValidUAN(row.uan);
    const ncpBad = ncpIssue(row.ncp);
    const vpfBad = vpfIssue(row.vpf);
    const tr = document.createElement('tr');
    if(rowHasIssue(row)) tr.classList.add('issue-row');
    const epsOpts = [['Y','Yes'],['N','No']].map(([v,l])=>
      `<option value="${v}" ${(row.eps||'Y')===v?'selected':''}>${l}</option>`).join('');
    const higherOpts = [['Y','Yes'],['N','No']].map(([v,l])=>
      `<option value="${v}" ${(row.higher||'Y')===v?'selected':''}>${l}</option>`).join('');
    const sepOpts = Object.entries(SEP_BASES).map(([v,l])=>
      `<option value="${v}" ${(row.sep||'cap')===v?'selected':''}>${l}</option>`).join('');
    const epfNote = c.epfW !== Math.round(Number(row.epf)||0)
      ? `<span class="calc-note" contenteditable="false">ECR: ${fmt(c.epfW)}</span>` : '';
    tr.innerHTML = `
      <td class="rownum">${i+1}</td>
      <td class="left editable" contenteditable="true" data-field="uan" data-i="${i}">${row.uan}${uanBad ? '<span class="issue-note">not 12 digits</span>' : ''}</td>
      <td class="left editable" contenteditable="true" data-field="name" data-i="${i}">${row.name}</td>
      <td class="editable input-box" contenteditable="true" inputmode="decimal" data-field="gross" data-i="${i}">${row.gross}</td>
      <td class="editable input-box" contenteditable="true" inputmode="decimal" data-field="epf" data-i="${i}">${row.epf}${epfNote}</td>
      <td class="editable input-box" contenteditable="true" inputmode="numeric" data-field="ncp" data-i="${i}">${row.ncp ?? 0}${ncpBad ? `<span class="issue-note">${ncpBad}</span>` : ''}</td>
      <td class="editable input-box" contenteditable="true" inputmode="decimal" data-field="vpf" data-i="${i}">${row.vpf ?? 0}${vpfBad ? `<span class="issue-note">${vpfBad}</span>` : ''}</td>
      <td><select class="cell-select" data-sfield="higher" data-i="${i}">${higherOpts}</select></td>
      <td><select class="cell-select" data-sfield="eps" data-i="${i}">${epsOpts}</select></td>
      <td class="split-col"><select class="cell-select" data-sfield="sep" data-i="${i}" ${row.eps==='N'?'disabled':''}>${sepOpts}</select></td>
      <td class="calc">${fmt(c.eps)}</td>
      <td class="calc">${fmt(c.edli)}</td>
      <td class="calc">${fmt(c.epfContri)}</td>
      <td class="calc">${fmt(c.epsContri)}</td>
      <td class="calc">${fmt(c.diff)}</td>
      <td class="editable input-box" contenteditable="true" inputmode="decimal" data-field="refund" data-i="${i}">${row.refund}</td>
      <td class="delete-cell"><button class="del-btn" data-del="${i}">×</button></td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('wage-count').textContent = `${wageRows.length} entries`;

  tbody.querySelectorAll('.editable').forEach(cell=>{
    cell.addEventListener('blur', onWageEdit);
  });
  tbody.querySelectorAll('.editable').forEach(cell=>{
    // Amount/day cells open blank for typing; leaving one blank keeps the
    // old value (see onWageEdit).
    if(BLANK_ON_FOCUS.includes(cell.dataset.field)){
      cell.addEventListener('focus', ()=>{ cell.textContent = ''; });
    }
  });
  tbody.querySelectorAll('.cell-select').forEach(sel=>{
    sel.addEventListener('change', ()=>{
      wageRows[Number(sel.dataset.i)][sel.dataset.sfield] = sel.value;
      rerenderKeepingFocus(sel);
    });
  });
  tbody.querySelectorAll('.del-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      wageRows.splice(Number(btn.dataset.del),1);
      renderWageTable();
      renderStub();
    });
  });
}

const BLANK_ON_FOCUS = ['gross','epf','ncp','vpf','refund'];

function onWageEdit(e){
  const i = Number(e.target.dataset.i);
  const field = e.target.dataset.field;
  const note = e.target.querySelector('.issue-note, .calc-note');
  let val = e.target.textContent.replace(note ? note.textContent : '', '').trim();
  // A cell cleared on focus and left blank keeps its previous value.
  const keepOld = val === '' && BLANK_ON_FOCUS.includes(field);
  if(['gross','epf','refund'].includes(field)){ val = Number(val)||0; }
  // Keep a non-numeric NCP/VPF entry as typed so the row is flagged instead
  // of silently becoming 0.
  if(['ncp','vpf'].includes(field)){ val = val === '' ? 0 : (isNaN(Number(val)) ? val : Number(val)); }
  if(!keepOld) wageRows[i][field] = val;
  // Tab/Shift+Tab/click has already moved focus to e.relatedTarget, which
  // the re-render is about to replace.
  rerenderKeepingFocus(e.relatedTarget);
}

// Re-rendering rebuilds every row, so the element that had (or was about
// to get) focus is destroyed. Find its replacement and focus that instead.
function cellSelector(el){
  if(!el || !el.dataset || el.dataset.i === undefined) return null;
  if(el.dataset.field) return `[data-field="${el.dataset.field}"][data-i="${el.dataset.i}"]`;
  if(el.dataset.sfield) return `[data-sfield="${el.dataset.sfield}"][data-i="${el.dataset.i}"]`;
  return null;
}

function rerenderKeepingFocus(target){
  const tbody = document.getElementById('wage-tbody');
  const sel = target && tbody.contains(target) ? cellSelector(target) : null;
  renderWageTable();
  renderStub();
  const next = sel && tbody.querySelector(sel);
  if(!next) return;
  next.focus();
  if(next.isContentEditable){
    // Select the value (not the red/grey note under it) so typing replaces it.
    const text = next.firstChild;
    const range = document.createRange();
    if(text && text.nodeType === Node.TEXT_NODE) range.selectNodeContents(text);
    else range.selectNodeContents(next);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(range);
  }
}

// ---------- exit table ----------
function renderExitTable(){
  const tbody = document.getElementById('exit-tbody');
  tbody.innerHTML = '';
  exitRows.forEach((row,i)=>{
    const tr = document.createElement('tr');
    const [y,m,d] = (row.date||'').split('-');
    tr.innerHTML = `
      <td class="rownum">${i+1}</td>
      <td class="left editable" contenteditable="true" data-efield="uan" data-i="${i}">${row.uan}</td>
      <td class="left editable" contenteditable="true" data-efield="name" data-i="${i}">${row.name}</td>
      <td class="editable" contenteditable="true" data-efield="date" data-i="${i}">${d?`${d}-${m}-${y}`:''}</td>
      <td class="editable" contenteditable="true" data-efield="code" data-i="${i}">${row.code}</td>
      <td class="delete-cell"><button class="del-btn" data-edel="${i}">×</button></td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('exit-count').textContent = `${exitRows.length} entries`;

  tbody.querySelectorAll('.editable').forEach(cell=>{
    cell.addEventListener('blur', onExitEdit);
  });
  tbody.querySelectorAll('.del-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      exitRows.splice(Number(btn.dataset.edel),1);
      renderExitTable();
    });
  });
}

function onExitEdit(e){
  const i = Number(e.target.dataset.i);
  const field = e.target.dataset.efield;
  let val = e.target.textContent.trim();
  if(field === 'date'){
    const m = val.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if(m) val = `${m[3]}-${m[2]}-${m[1]}`;
  }
  exitRows[i][field] = val;
}

// ---------- challan stub ----------
function renderStub(){
  let gross=0, epfw=0, epsw=0, edliw=0, ac1ee=0, ac1er=0, ac10=0, vpf=0;
  wageRows.forEach(row=>{
    const c = calc(row);
    gross += Number(row.gross)||0;
    vpf += c.vpf;
    epfw += c.epfW;
    epsw += c.eps;
    edliw += c.edli;
    ac1ee += c.epfContri;
    ac1er += c.diff;
    ac10 += c.epsContri;
  });
  const ac1t = ac1ee + ac1er;
  const ac2 = epfw < 1 ? 75 : Math.max(Math.round(epfw*0.005), 500);
  const ac21 = Math.round(edliw*0.005);
  const ac22 = 0;
  const grand = ac1t + ac10 + ac2 + ac21 + ac22;

  document.getElementById('s-gross').textContent = fmt(gross);
  document.getElementById('s-epfw').textContent = fmt(epfw);
  document.getElementById('s-epsw').textContent = fmt(epsw);
  document.getElementById('s-edliw').textContent = fmt(edliw);
  document.getElementById('s-ac1ee').textContent = fmt(ac1ee);
  document.getElementById('s-vpf').textContent = fmt(vpf);
  document.getElementById('s-vpf-row').hidden = vpf === 0;
  document.getElementById('s-ac1er').textContent = fmt(ac1er);
  document.getElementById('s-ac1t').textContent = fmt(ac1t);
  document.getElementById('s-ac10').textContent = fmt(ac10);
  document.getElementById('s-ac2').textContent = fmt(ac2);
  document.getElementById('s-ac21').textContent = fmt(ac21);
  document.getElementById('s-ac22').textContent = fmt(ac22);
  document.getElementById('s-grand').textContent = '₹' + fmt(grand);

  const code = document.getElementById('estab-code').value.trim() || 'ESTABCODE';
  const monthVal = document.getElementById('wage-month').value; // yyyy-mm
  const [yy,mm] = monthVal.split('-');
  document.getElementById('stub-estab').textContent = code;
  document.getElementById('fname-ecr').textContent = `${code}${yy}${mm}.txt`;
  document.getElementById('fname-exit').textContent = `${code}${yy}${mm}exit.txt`;

  if(monthVal){
    const monthName = new Date(monthVal+'-01').toLocaleString('en-IN',{month:'long', year:'numeric'});
    document.querySelector('.stub-top h3').textContent = monthName;
  }
  document.getElementById('stub-ceiling').textContent = monthVal === SPLIT_MONTH
    ? 'Wage ceiling: ₹15,000 for 1–16 Sep, ₹25,000 from 17 Sep (S.O. 5109(E))'
    : `Wage ceiling: ₹${fmt(ceilingFor(monthVal))}`;
}

// ---------- registration gate ----------
// Server refuses uploads / file generation (403) until the visitor registers.
function showRegistrationGate(){
  document.body.classList.add('gated');
  document.getElementById('reg-name').focus();
}

function handleNeedsRegistration(resp){
  if(resp.status !== 403) return false;
  showRegistrationGate();
  return true;
}

document.getElementById('reg-form').addEventListener('submit', async e=>{
  e.preventDefault();
  const form = e.target;
  form.querySelectorAll('.reg-err').forEach(el=>{ el.textContent = ''; });
  const btn = document.getElementById('reg-submit');
  btn.disabled = true;
  const payload = {
    name: document.getElementById('reg-name').value,
    mobile: document.getElementById('reg-mobile').value,
    email: document.getElementById('reg-email').value,
    website: form.elements.namedItem('website').value,
    consent: document.getElementById('reg-consent').checked,
  };
  let resp, data;
  try{
    resp = await fetch('/api/register', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload),
    });
    data = await resp.json().catch(()=>({}));
  }catch(err){
    document.getElementById('reg-error').textContent = 'Could not reach the server — please try again';
    btn.disabled = false;
    return;
  }
  btn.disabled = false;
  if(!resp.ok){
    Object.entries(data.fields || {}).forEach(([field, msg])=>{
      const el = form.querySelector(`[data-err="${field}"]`);
      if(el) el.textContent = msg;
    });
    document.getElementById('reg-error').textContent = data.error || 'Registration failed';
    return;
  }
  document.body.classList.remove('gated');
  showToast(`Welcome, ${data.name}!`);
});

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2600);
}

// ---------- tabs ----------
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('panel-wage').classList.toggle('active', tab==='wage');
    document.getElementById('panel-exit').classList.toggle('active', tab==='exit');
  });
});

document.getElementById('add-row-btn').addEventListener('click', ()=>{
  wageRows.push({uan:"", name:"New employee", gross:0, epf:0, ncp:0, vpf:0, refund:0, higher:'Y', eps:'Y', sep:'cap'});
  renderWageTable();
  renderStub();
});
document.getElementById('add-exit-btn').addEventListener('click', ()=>{
  const today = new Date().toISOString().slice(0,10);
  exitRows.push({uan:"", name:"New exit", date: today, code:"S"});
  renderExitTable();
});
document.getElementById('estab-code').addEventListener('input', renderStub);
document.getElementById('wage-month').addEventListener('input', ()=>{
  renderWageTable();
  renderStub();
});

// ---------- month picker fallback ----------
// Firefox/Safari desktop render <input type="month"> as a plain text box,
// so give them a picker like Chrome's. Value stays "YYYY-MM" either way.
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function setupMonthPicker(input){
  input.type = 'text';
  input.readOnly = true;
  input.classList.add('month-fallback');
  const wrap = document.createElement('div');
  wrap.className = 'month-picker-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const icon = document.createElement('button');
  icon.type = 'button';
  icon.className = 'month-picker-icon';
  icon.setAttribute('aria-label', 'Choose month');
  icon.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2 6.5h12M5 1.5v3M11 1.5v3" stroke="currentColor" stroke-width="1.5"/></svg>';
  wrap.appendChild(icon);
  const pop = document.createElement('div');
  pop.className = 'month-picker';
  wrap.appendChild(pop);

  let viewYear;
  const current = () => {
    const m = /^(\d{4})-(\d{2})$/.exec(input.value);
    return m ? {y: Number(m[1]), m: Number(m[2])} : null;
  };
  const setValue = val => {
    input.value = val;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    close();
  };
  function render(){
    const cur = current();
    pop.innerHTML = `
      <div class="mp-head">
        <button type="button" class="mp-nav" data-step="-1" aria-label="Previous year">‹</button>
        <span class="mp-year">${viewYear}</span>
        <button type="button" class="mp-nav" data-step="1" aria-label="Next year">›</button>
      </div>
      <div class="mp-grid">${MONTHS.map((name, i)=>{
        const sel = cur && cur.y === viewYear && cur.m === i+1 ? ' selected' : '';
        return `<button type="button" class="mp-month${sel}" data-m="${i+1}">${name}</button>`;
      }).join('')}</div>
      <div class="mp-foot">
        <button type="button" class="mp-link" data-act="clear">Clear</button>
        <button type="button" class="mp-link" data-act="today">This month</button>
      </div>`;
  }
  function open(){
    const cur = current();
    viewYear = cur ? cur.y : new Date().getFullYear();
    render();
    pop.classList.add('show');
  }
  function close(){ pop.classList.remove('show'); }

  input.addEventListener('click', ()=> pop.classList.contains('show') ? close() : open());
  icon.addEventListener('click', ()=> pop.classList.contains('show') ? close() : open());
  pop.addEventListener('click', e=>{
    // render() replaces the clicked button, so the document "click outside"
    // check would no longer find it inside wrap and close the picker.
    e.stopPropagation();
    const btn = e.target.closest('button');
    if(!btn) return;
    if(btn.dataset.step){ viewYear += Number(btn.dataset.step); render(); }
    else if(btn.dataset.m){ setValue(`${viewYear}-${String(btn.dataset.m).padStart(2,'0')}`); }
    else if(btn.dataset.act === 'clear'){ setValue(''); }
    else if(btn.dataset.act === 'today'){
      const d = new Date();
      setValue(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    }
  });
  document.addEventListener('click', e=>{ if(!wrap.contains(e.target)) close(); });
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape') close(); });
}

{
  const monthInput = document.getElementById('wage-month');
  if(monthInput.type !== 'month') setupMonthPicker(monthInput);
}

// ---------- file upload ----------
const uploadInput = document.getElementById('upload-input');
document.getElementById('upload-btn').addEventListener('click', ()=> uploadInput.click());
uploadInput.addEventListener('change', async ()=>{
  const file = uploadInput.files[0];
  if(!file) return;
  pendingUploadFile = file;
  await attemptUpload(file, null);
  uploadInput.value = '';
});

async function attemptUpload(file, mapping){
  const formData = new FormData();
  formData.append('file', file);
  if(mapping) formData.append('mapping', JSON.stringify(mapping));

  let resp;
  try{
    resp = await fetch('/api/upload', { method:'POST', body: formData });
  }catch(err){
    showToast('Upload failed — could not reach the server');
    return;
  }
  if(handleNeedsRegistration(resp)) return;
  if(!resp.ok){
    const err = await resp.json().catch(()=>({error:'Upload failed'}));
    showToast(err.error || 'Upload failed');
    return;
  }
  const data = await resp.json();
  if(data.status === 'needs_mapping'){
    openMappingModal(data);
  } else if(data.status === 'ok'){
    importRows(data.rows, data.issues);
  }
}

function importRows(rows, issues){
  const badRows = [];
  rows.forEach((r, i)=>{
    wageRows.push({
      uan: r.uan, name: r.name,
      gross: Number(r.gross)||0, epf: Number(r.epf)||0,
      ncp: isNaN(Number(r.ncp)) ? r.ncp : Number(r.ncp),
      vpf: isNaN(Number(r.vpf)) ? r.vpf : Number(r.vpf),
      refund: Number(r.refund)||0,
      higher: 'Y', eps: 'Y', sep: 'cap',
    });
    if((issues && issues[i] && issues[i].length) || rowHasIssue(wageRows[wageRows.length-1])) badRows.push(i+1);
  });
  renderWageTable();
  renderStub();
  if(badRows.length){
    showToast(`Imported ${rows.length} rows — ${badRows.length} need a look (highlighted in red)`);
  }else{
    showToast(`Imported ${rows.length} rows`);
  }
}

// ---------- mapping modal ----------
const FIELD_LABELS = {
  uan: 'UAN', name: 'Member name', gross: 'Gross wages', epf: 'EPF wages',
  ncp: 'NCP days (optional)', vpf: 'VPF amount (optional)',
  refund: 'Refund of advances (optional)',
};

function openMappingModal(data){
  const container = document.getElementById('mapping-fields');
  container.innerHTML = '';
  const allFields = [...data.required_fields, ...data.optional_fields];
  allFields.forEach(field=>{
    const row = document.createElement('div');
    row.className = 'mapping-row';
    const options = ['<option value="">— not in file —</option>']
      .concat(data.headers.map(h=>{
        const sel = (data.guessed_mapping[field] === h) ? 'selected' : '';
        return `<option value="${h}" ${sel}>${h}</option>`;
      }));
    row.innerHTML = `
      <label>${FIELD_LABELS[field]}</label>
      <select data-map-field="${field}">${options.join('')}</select>
    `;
    container.appendChild(row);
  });

  const table = document.getElementById('mapping-preview-table');
  const headRow = data.headers.map(h=>`<th class="left">${h}</th>`).join('');
  const bodyRows = data.sample_rows.map(r=>
    `<tr>${data.headers.map(h=>`<td class="left">${r[h] ?? ''}</td>`).join('')}</tr>`
  ).join('');
  table.innerHTML = `<thead><tr>${headRow}</tr></thead><tbody>${bodyRows}</tbody>`;

  document.getElementById('mapping-modal').classList.add('show');
}

document.getElementById('mapping-cancel').addEventListener('click', ()=>{
  document.getElementById('mapping-modal').classList.remove('show');
  pendingUploadFile = null;
});

document.getElementById('mapping-confirm').addEventListener('click', async ()=>{
  const mapping = {};
  document.querySelectorAll('#mapping-fields select').forEach(sel=>{
    mapping[sel.dataset.mapField] = sel.value || null;
  });
  if(!mapping.uan || !mapping.name || !mapping.gross || !mapping.epf){
    showToast('UAN, Name, Gross wages and EPF wages must all be mapped');
    return;
  }
  document.getElementById('mapping-modal').classList.remove('show');
  if(pendingUploadFile){
    await attemptUpload(pendingUploadFile, mapping);
    pendingUploadFile = null;
  }
});

// ---------- generate files ----------
async function downloadGenerated(url, payload, fallbackName){
  let resp;
  try{
    resp = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload),
    });
  }catch(err){
    showToast('Could not reach the server');
    return;
  }
  if(handleNeedsRegistration(resp)) return;
  if(!resp.ok){
    const err = await resp.json().catch(()=>({error:'Generation failed'}));
    showToast(err.error || 'Generation failed');
    return;
  }
  const blob = await resp.blob();
  const disposition = resp.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast(`Downloaded ${filename}`);
}

document.getElementById('gen-ecr-btn').addEventListener('click', ()=>{
  const estab_code = document.getElementById('estab-code').value.trim();
  const wage_month = document.getElementById('wage-month').value;
  if(!estab_code || !wage_month){
    showToast('Enter establishment code and wage month first');
    return;
  }
  const badRow = wageRows.find(rowHasIssue);
  if(badRow){
    showToast('Fix the rows highlighted in red (UAN, NCP days or VPF) before generating');
    return;
  }
  downloadGenerated('/api/ecr/generate', {estab_code, wage_month, rows: wageRows}, 'ecr.txt');
});

document.getElementById('gen-exit-btn').addEventListener('click', ()=>{
  const estab_code = document.getElementById('estab-code').value.trim();
  const wage_month = document.getElementById('wage-month').value;
  if(!estab_code || !wage_month){
    showToast('Enter establishment code and wage month first');
    return;
  }
  downloadGenerated('/api/exit/generate', {estab_code, wage_month, rows: exitRows}, 'exit.txt');
});

// ---------- init ----------
// Default wage month: the month before the current one (ECRs are filed for
// the previous month's wages).
{
  const d = new Date();
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  document.getElementById('wage-month').value =
    `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}`;
}
renderWageTable();
renderExitTable();
renderStub();
