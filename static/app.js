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
  cap:   'EPS member, capped ₹15,000 till 16th',
  full:  'EPS member, on full wages till 16th',
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
  let epfW, epsW, edliW;
  if(month === SPLIT_MONTH){
    const old = Math.min(w, OLD_CEILING), neu = Math.min(w, NEW_CEILING);
    const split = old*SPLIT_BEFORE + neu*SPLIT_AFTER;
    if(!epsMember){ epfW = w; epsW = 0; edliW = split; }
    else if(row.sep === 'new'){ epfW = epsW = edliW = neu*SPLIT_AFTER; }
    else if(row.sep === 'noeps'){ epfW = w; epsW = neu*SPLIT_AFTER; edliW = split; }
    else if(row.sep === 'full'){ epfW = w; epsW = edliW = split; }
    else { epfW = epsW = edliW = split; }
  }else{
    const ceiling = ceilingFor(month);
    epfW = w;
    epsW = epsMember ? Math.min(w, ceiling) : 0;
    edliW = Math.min(w, ceiling);
  }
  const epfContri = roundHalfUp(epfW*0.12);
  const epsContri = roundHalfUp(epsW*0.0833);
  return {
    epfW: roundHalfUp(epfW), eps: roundHalfUp(epsW), edli: roundHalfUp(edliW),
    epfContri, epsContri, diff: epfContri - epsContri,
  };
}

function isValidUAN(uan){ return /^\d{12}$/.test(String(uan||'').trim()); }

// ---------- wage table ----------
function renderWageTable(){
  const tbody = document.getElementById('wage-tbody');
  tbody.innerHTML = '';
  const isSplit = wageMonth() === SPLIT_MONTH;
  document.getElementById('wage-table').classList.toggle('split-month', isSplit);
  wageRows.forEach((row, i)=>{
    const c = calc(row);
    const uanBad = !isValidUAN(row.uan);
    const tr = document.createElement('tr');
    if(uanBad) tr.classList.add('issue-row');
    const epsOpts = [['Y','Yes'],['N','No']].map(([v,l])=>
      `<option value="${v}" ${(row.eps||'Y')===v?'selected':''}>${l}</option>`).join('');
    const sepOpts = Object.entries(SEP_BASES).map(([v,l])=>
      `<option value="${v}" ${(row.sep||'cap')===v?'selected':''}>${l}</option>`).join('');
    const epfNote = c.epfW !== Math.round(Number(row.epf)||0)
      ? `<span class="calc-note">ECR: ${fmt(c.epfW)}</span>` : '';
    tr.innerHTML = `
      <td class="rownum">${i+1}</td>
      <td class="left editable" contenteditable="true" data-field="uan" data-i="${i}">${row.uan}${uanBad ? '<span class="issue-note">not 12 digits</span>' : ''}</td>
      <td class="left editable" contenteditable="true" data-field="name" data-i="${i}">${row.name}</td>
      <td class="editable" contenteditable="true" data-field="gross" data-i="${i}">${row.gross}</td>
      <td class="editable" contenteditable="true" data-field="epf" data-i="${i}">${row.epf}${epfNote}</td>
      <td><select class="cell-select" data-sfield="eps" data-i="${i}">${epsOpts}</select></td>
      <td class="split-col"><select class="cell-select" data-sfield="sep" data-i="${i}" ${row.eps==='N'?'disabled':''}>${sepOpts}</select></td>
      <td class="calc">${fmt(c.eps)}</td>
      <td class="calc">${fmt(c.edli)}</td>
      <td class="calc">${fmt(c.epfContri)}</td>
      <td class="calc">${fmt(c.epsContri)}</td>
      <td class="calc">${fmt(c.diff)}</td>
      <td class="editable" contenteditable="true" data-field="ncp" data-i="${i}">${row.ncp}</td>
      <td class="editable" contenteditable="true" data-field="refund" data-i="${i}">${row.refund}</td>
      <td class="delete-cell"><button class="del-btn" data-del="${i}">×</button></td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('wage-count').textContent = `${wageRows.length} entries`;

  tbody.querySelectorAll('.editable').forEach(cell=>{
    cell.addEventListener('blur', onWageEdit);
  });
  tbody.querySelectorAll('.cell-select').forEach(sel=>{
    sel.addEventListener('change', ()=>{
      wageRows[Number(sel.dataset.i)][sel.dataset.sfield] = sel.value;
      renderWageTable();
      renderStub();
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

function onWageEdit(e){
  const i = Number(e.target.dataset.i);
  const field = e.target.dataset.field;
  const note = e.target.querySelector('.issue-note, .calc-note');
  let val = e.target.textContent.replace(note ? note.textContent : '', '').trim();
  if(['gross','epf','ncp','refund'].includes(field)){ val = Number(val)||0; }
  wageRows[i][field] = val;
  renderWageTable();
  renderStub();
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
  let gross=0, epfw=0, epsw=0, edliw=0, ac1ee=0, ac1er=0, ac10=0;
  wageRows.forEach(row=>{
    const c = calc(row);
    gross += Number(row.gross)||0;
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
  wageRows.push({uan:"", name:"New employee", gross:0, epf:0, ncp:0, refund:0, eps:'Y', sep:'cap'});
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
      ncp: Number(r.ncp)||0, refund: Number(r.refund)||0,
      eps: 'Y', sep: 'cap',
    });
    if(issues && issues[i] && issues[i].length) badRows.push(i+1);
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
  ncp: 'NCP days (optional)', refund: 'Refund of advances (optional)',
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
  const badRow = wageRows.find(r=>!isValidUAN(r.uan));
  if(badRow){
    showToast('Fix invalid UAN(s) before generating — highlighted in red');
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
renderWageTable();
renderExitTable();
renderStub();
