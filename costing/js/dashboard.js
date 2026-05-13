// dashboard.js
var allProjects = [];
var STAGES = {
  'Inquiry':{'color':'#757575','bg':'#F5F5F5','phase':'DISCOVER'},
  'Consultation Done':{'color':'#1565C0','bg':'#E3F2FD','phase':'DISCOVER'},
  'Design Fee Paid':{'color':'#6A1B9A','bg':'#F3E5F5','phase':'DISCOVER'},
  '2D Design':{'color':'#E65100','bg':'#FFF3E0','phase':'DESIGN'},
  '3D Design':{'color':'#BF360C','bg':'#FBE9E7','phase':'DESIGN'},
  'Design Approved':{'color':'#2E7D32','bg':'#E8F5E9','phase':'DESIGN'},
  'In Production':{'color':'#00695C','bg':'#E0F2F1','phase':'DELIVER'},
  'Dispatched':{'color':'#1B5E20','bg':'#E8F5E9','phase':'DELIVER'},
  'Installed':{'color':'#1B5E20','bg':'#C8E6C9','phase':'DELIVER'},
  'Closed':{'color':'#1B5E20','bg':'#A5D6A7','phase':'DELIVER'},
  'On Hold':{'color':'#F57F17','bg':'#FFFDE7','phase':'OTHER'},
  'Lost':{'color':'#C62828','bg':'#FFEBEE','phase':'OTHER'},
  'Lead':{'color':'#757575','bg':'#F5F5F5','phase':'DISCOVER'},
  'Active':{'color':'#1565C0','bg':'#E3F2FD','phase':'DESIGN'},
  'Won':{'color':'#2E7D32','bg':'#E8F5E9','phase':'DELIVER'}
};
function getStageStyle(s){return STAGES[s]||{color:'#757575',bg:'#F5F5F5',phase:'OTHER'};}
document.addEventListener('DOMContentLoaded',async function(){
  if(!api.requireLogin())return;
  var u=api.getCurrentUser();
  document.getElementById('userName').textContent=u.displayName;
  document.getElementById('userRole').textContent=u.role;
  if(u.role==='admin')document.getElementById('adminLinks').style.display='flex';
  await loadProjects();
});
async function loadProjects(){
  var container=document.getElementById('projectsContainer');
  var cached=sessionStorage.getItem('mmm_all_projects');
  if(cached){try{allProjects=JSON.parse(cached);renderProjects(allProjects);renderStageSummary(allProjects);}catch(e){sessionStorage.removeItem('mmm_all_projects');}}
  else{container.innerHTML='<div style="padding:60px;text-align:center;"><div style="font-size:2rem;">🛕</div><div style="color:var(--grey);margin-top:12px;">Loading projects...</div></div>';}
  try{
    var result=await api.call('list_projects',{});
    if(!result.ok){if(!allProjects.length)container.innerHTML='<div class="empty-state"><h3>Error</h3><p>'+escapeHtml(result.error||'')+'</p></div>';return;}
    allProjects=result.projects||[];
    sessionStorage.setItem('mmm_all_projects',JSON.stringify(allProjects));
    renderProjects(allProjects);
    renderStageSummary(allProjects);
  }catch(err){console.error(err);if(!allProjects.length)container.innerHTML='<div class="empty-state"><h3>Connection error</h3><p>Please refresh.</p></div>';}
}
function renderStageSummary(projects){
  var counts={};
  projects.forEach(function(p){var ph=getStageStyle(p.status).phase;counts[ph]=(counts[ph]||0)+1;});
  var phases=[{key:'DISCOVER',label:'Discover',color:'#1565C0',bg:'#E3F2FD'},{key:'DESIGN',label:'Design',color:'#E65100',bg:'#FFF3E0'},{key:'DELIVER',label:'Deliver',color:'#2E7D32',bg:'#E8F5E9'},{key:'OTHER',label:'Other',color:'#757575',bg:'#F5F5F5'}];
  var html='';
  phases.forEach(function(ph){
    var count=counts[ph.key]||0;
    if(!count)return;
    html+='<div onclick="filterByPhase(\''+ph.key+'\')" style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;background:'+ph.bg+';cursor:pointer;">';
    html+='<span style="font-size:0.85rem;font-weight:700;color:'+ph.color+';">'+ph.label+'</span>';
    html+='<span style="background:'+ph.color+';color:white;border-radius:10px;padding:1px 7px;font-size:0.75rem;font-weight:700;">'+count+'</span></div>';
  });
  html+='<div onclick="clearPhaseFilter()" style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;background:#F5F5F5;cursor:pointer;"><span style="font-size:0.85rem;color:#757575;">All ('+projects.length+')</span></div>';
  document.getElementById('stageSummary').innerHTML=html;
}
var currentPhaseFilter='';
function filterByPhase(phase){currentPhaseFilter=phase;filterProjects();}
function clearPhaseFilter(){currentPhaseFilter='';document.getElementById('statusFilter').value='';filterProjects();}
function filterProjects(){
  var term=(document.getElementById('searchInput').value||'').toLowerCase().trim();
  var statusVal=document.getElementById('statusFilter').value;
  var filtered=allProjects.filter(function(p){
    var ms=!term||(p.client_name||'').toLowerCase().includes(term)||(p.location||'').toLowerCase().includes(term)||(p.framework||'').toLowerCase().includes(term)||(p.project_id||'').toLowerCase().includes(term);
    var mv=!statusVal||p.status===statusVal;
    var mp=!currentPhaseFilter||getStageStyle(p.status).phase===currentPhaseFilter;
    return ms&&mv&&mp;
  });
  renderProjects(filtered);
}
function renderProjects(projects){
  var container=document.getElementById('projectsContainer');
  if(!projects.length){container.innerHTML='<div class="empty-state"><h3>No projects found</h3><button class="btn-primary" onclick="openNewProjectModal()" style="margin-top:16px;">+ New Project</button></div>';return;}
  var html='<table class="project-table"><thead><tr><th>Project ID</th><th>Client</th><th>City</th><th>Framework</th><th>Stage</th><th>Design Fee</th><th>Created</th><th></th></tr></thead><tbody>';
  projects.forEach(function(p){
    var st=getStageStyle(p.status);
    var fs=p.design_fee_status||'';
    var fb=fs==='Paid'?'<span style="background:#E8F5E9;color:#2E7D32;padding:2px 8px;border-radius:10px;font-size:0.75rem;font-weight:600;">Paid</span>':fs==='Redeemable Used'?'<span style="background:#F3E5F5;color:#6A1B9A;padding:2px 8px;border-radius:10px;font-size:0.75rem;font-weight:600;">Redeemed</span>':'<span style="background:#FFEBEE;color:#C62828;padding:2px 8px;border-radius:10px;font-size:0.75rem;font-weight:600;">Not Paid</span>';
    html+='<tr onclick="openProject(\''+p.project_id+'\')" style="cursor:pointer;">';
    html+='<td><span class="project-id-cell">'+escapeHtml(p.project_id)+'</span></td>';
    html+='<td><strong>'+escapeHtml(p.client_name||'—')+'</strong></td>';
    html+='<td style="color:var(--grey);">'+escapeHtml(p.location||'—')+'</td>';
    html+='<td style="color:var(--grey);font-size:0.85rem;">'+escapeHtml(p.framework||'—')+'</td>';
    html+='<td><span class="status-badge" style="background:'+st.bg+';color:'+st.color+';border:none;">'+escapeHtml(p.status||'Inquiry')+'</span></td>';
    html+='<td>'+fb+'</td>';
    html+='<td style="color:var(--grey);font-size:0.85rem;">'+formatDate(p.created_at)+'</td>';
    html+='<td><button class="btn-text" onclick="event.stopPropagation();openProject(\''+p.project_id+'\')">Open</button></td>';
    html+='</tr>';
  });
  html+='</tbody></table>';
  container.innerHTML=html;
}
function openProject(id){window.location.href='project.html?id='+encodeURIComponent(id);}
function openNewProjectModal(){
  document.getElementById('newProjectModal').style.display='flex';
  document.getElementById('newProjectError').style.display='none';
  document.getElementById('createProjectBtn').disabled=false;
  document.getElementById('createProjectBtn').textContent='Create Project';
  ['np_client_name','np_contact','np_email','np_location','np_consultation_notes'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  ['np_framework','np_budget','np_timeline','np_customer_type','np_design_fee_status','np_source'].forEach(function(id){var el=document.getElementById(id);if(el)el.selectedIndex=0;});
  ['np_width','np_depth','np_height'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  setTimeout(function(){var el=document.getElementById('np_client_name');if(el)el.focus();},100);
}
function closeNewProjectModal(){document.getElementById('newProjectModal').style.display='none';}
async function createProject(){
  var btn=document.getElementById('createProjectBtn');
  var errorEl=document.getElementById('newProjectError');
  errorEl.style.display='none';
  var clientName=document.getElementById('np_client_name').value.trim();
  var contact=document.getElementById('np_contact').value.trim();
  var location=document.getElementById('np_location').value.trim();
  var framework=document.getElementById('np_framework').value;
  if(!clientName){errorEl.textContent='Client name is required.';errorEl.style.display='block';return;}
  if(!contact){errorEl.textContent='WhatsApp number is required.';errorEl.style.display='block';return;}
  if(!location){errorEl.textContent='City is required.';errorEl.style.display='block';return;}
  if(!framework){errorEl.textContent='Framework is required.';errorEl.style.display='block';return;}
  var user=api.getCurrentUser();
  btn.disabled=true;btn.textContent='Creating...';
  var wEl=document.getElementById('np_width'),dEl=document.getElementById('np_depth'),hEl=document.getElementById('np_height');
  var project={
    client_name:clientName,contact:contact,
    email:document.getElementById('np_email').value.trim(),
    location:location,framework:framework,
    width_ft:wEl.value!==''?parseFloat(wEl.value):'',
    depth_ft:dEl.value!==''?parseFloat(dEl.value):'',
    height_ft:hEl.value!==''?parseFloat(hEl.value):'',
    customer_type:document.getElementById('np_customer_type').value||'B2C',
    design_fee_status:document.getElementById('np_design_fee_status').value||'Not Paid',
    consultation_notes:document.getElementById('np_consultation_notes').value.trim(),
    source:document.getElementById('np_source').value,
    status:'Inquiry',created_by:user.username
  };
  try{
    var result=await api.call('create_project',{project:project});
    if(result.ok){toast('Project created: '+result.project_id,'success');closeNewProjectModal();sessionStorage.removeItem('mmm_all_projects');await loadProjects();}
    else{errorEl.textContent=result.error||'Failed';errorEl.style.display='block';btn.disabled=false;btn.textContent='Create Project';}
  }catch(err){console.error(err);errorEl.textContent='Connection error.';errorEl.style.display='block';btn.disabled=false;btn.textContent='Create Project';}
}
function formatDate(iso){if(!iso)return '';try{var d=new Date(iso);if(isNaN(d.getTime()))return '';return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});}catch(e){return '';}}
function escapeHtml(str){if(str===null||str===undefined)return '';return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
function toast(msg,type){type=type||'success';var ex=document.querySelector('.toast');if(ex)ex.remove();var t=document.createElement('div');t.className='toast toast-'+type;t.textContent=msg;document.body.appendChild(t);setTimeout(function(){t.style.opacity='0';t.style.transition='opacity 0.3s';setTimeout(function(){t.remove();},300);},2500);}
This is the same code but compressed — much smaller, well under 400KB limit.
