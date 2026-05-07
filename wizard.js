/* ============================================================
   CAMPAIGN WIZARD — SHARED JAVASCRIPT
   ============================================================ */

/* ── API key helpers ── */
const ApiKey = {
  _key: 'cw_api_key',
  get()  { return localStorage.getItem(this._key) || ''; },
  set(v) { localStorage.setItem(this._key, v.trim()); },
  has()  { return !!this.get(); }
};

/* ── Storage helpers ── */
const Store = {
  prefix: 'cw_',
  save(stage, data) {
    try { localStorage.setItem(this.prefix + stage, JSON.stringify(data)); }
    catch(e) { console.warn('Storage save failed:', e); }
  },
  load(stage) {
    try { const r = localStorage.getItem(this.prefix + stage); return r ? JSON.parse(r) : {}; }
    catch(e) { return {}; }
  },
  isComplete(stage) { return !!localStorage.getItem(this.prefix + stage); },
  clearAll() {
    ['stage1','stage2','stage3','stage4','stage5','stage6']
      .forEach(s => localStorage.removeItem(this.prefix + s));
  },
  completedCount() {
    return ['stage1','stage2','stage3','stage4','stage5','stage6']
      .filter(s => this.isComplete(s)).length;
  }
};

/* ── Progress nav ── */
function initProgressNav(activeIndex) {
  const links  = document.querySelectorAll('.progress-nav a');
  const stages = ['stage1','stage2','stage3','stage4','stage5','stage6'];
  links.forEach((link, i) => {
    link.classList.remove('active','completed');
    if (i === activeIndex)          link.classList.add('active');
    else if (Store.isComplete(stages[i])) link.classList.add('completed');
  });
}

/* ── Save indicator ── */
function flashSaved() {
  const el = document.getElementById('saved-msg');
  if (!el) return;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 1800);
}

/* ── Form collect / populate ── */
function collectForm(fieldIds, checkGroups) {
  const data = {};
  fieldIds.forEach(id => { const el = document.getElementById(id); if (el) data[id] = el.value; });
  Object.entries(checkGroups || {}).forEach(([group, ids]) => {
    data[group] = ids.filter(id => document.getElementById(id)?.checked)
                     .map(id => document.getElementById(id).value);
  });
  return data;
}

function populateForm(data, fieldIds, checkGroups) {
  fieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (el && data[id] !== undefined) el.value = data[id];
  });
  Object.entries(checkGroups || {}).forEach(([group, ids]) => {
    if (!data[group]) return;
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.checked = data[group].includes(el.value);
    });
  });
}

/* ── Auto-save ── */
function initAutoSave(stageName, fieldIds, checkGroups) {
  function save() {
    Store.save(stageName, collectForm(fieldIds, checkGroups));
    flashSaved();
  }
  document.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('change', save);
    el.addEventListener('input',  save);
  });
}

/* ── Range slider ── */
function initRangeSlider(sliderId, displayId, formatFn) {
  const slider  = document.getElementById(sliderId);
  const display = document.getElementById(displayId);
  if (!slider || !display) return;
  const update = () => { display.textContent = formatFn(slider.value); };
  slider.addEventListener('input', update);
  update();
}

/* ── Full stage initialiser ── */
function initStage(config) {
  const { stageName, navIndex, fieldIds, checkGroups, onLoad } = config;
  initProgressNav(navIndex);
  const saved = Store.load(stageName);
  populateForm(saved, fieldIds, checkGroups);
  if (typeof onLoad === 'function') onLoad(saved);
  initAutoSave(stageName, fieldIds, checkGroups);
}

/* ============================================================
   AI HELPERS
   ============================================================ */

const CLAUDE_MODEL = 'claude-sonnet-4-5';

/* Low-level API call — returns parsed JSON or throws */
async function callClaude(systemPrompt, userMessage, maxTokens = 4096) {
  const key = ApiKey.get();
  if (!key) throw new Error('NO_API_KEY');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });
  if (!res.ok) throw new Error('API error ' + res.status);
  const data = await res.json();
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
  // Strip markdown fences if present
  const clean = text
  .replace(/^```json\s*/i, '')
  .replace(/\s*```$/i, '')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .trim();
return JSON.parse(clean);
}

/* ── UPFRONT: fill ALL stages from a single campaign description ── */
async function aiPrefillAll(description) {
  const system = `You are a senior marketing strategist. The user will describe their campaign in plain language.
Return ONLY a valid JSON object (no markdown, no commentary) with these exact keys populated from the description.
Leave a key as an empty string "" if there is not enough information to fill it confidently.
Checkbox/multi-select arrays should contain only values from the allowed lists shown.

Keys and allowed values:
{
  "stage1": {
    "campaign_name": "",
    "campaign_objective": "Brand Awareness|Lead Generation|Customer Acquisition|Product Launch|Customer Retention / Re-engagement|Event Promotion|Revenue / Sales Growth|Content & Thought Leadership",
    "objective_detail": "",
    "target_audience": "",
    "audience_size": "Under 10,000|10,000 – 100,000|100,000 – 500,000|500,000 – 2M|2M – 10M|10M+",
    "budget": "",
    "budget_split": "70",
    "channels": ["Paid Social","Organic Social","Email Marketing","Paid Search (SEM)","SEO / Content","Display / Programmatic","PR / Earned Media","Events / Webinars","Influencer / Partnerships","Podcast / Audio","OOH / Print","Affiliate"],
    "kpis": ["Impressions / Reach","Clicks / CTR","Leads / Sign-ups","Cost per Lead (CPL)","Customer Acquisition Cost (CAC)","Revenue / Pipeline","ROAS","Engagement Rate","Conversion Rate","Brand Lift"],
    "kpi_targets": "",
    "start_date": "",
    "end_date": "",
    "competitors": ""
  },
  "stage2": {
    "core_message": "",
    "value_prop": "",
    "pain_points": "",
    "tone": ["Bold & Confident","Friendly & Approachable","Expert & Authoritative","Playful & Witty","Urgent & Direct","Empathetic & Human","Premium & Refined","Data-Driven & Precise","Inspirational","Minimal & Clean"],
    "headlines": "",
    "cta_text": "",
    "cta_url": "",
    "cta2_text": "",
    "cta2_url": "",
    "assets": ["Social Ad Creatives","Display Banners","Landing Page","Email Sequence","Video (Hero)","Short-form Video","Blog / SEO Content","eBook / Guide","Case Study","Webinar / Slides","Press Release","Influencer Brief"],
    "visual_style": "",
    "restrictions": ""
  },
  "stage3": {
    "tracking": ["Google Analytics 4","Google Tag Manager","Meta Pixel","LinkedIn Insight Tag","HubSpot Tracking","Salesforce CRM","Segment","Hotjar / Session Recording","Custom / Data Warehouse"],
    "conversion_events": "",
    "utm_source": "",
    "utm_medium": "",
    "utm_campaign": "",
    "qa": ["All links and CTAs tested","Form submissions tested end-to-end","Mobile responsiveness verified","Tracking pixels firing correctly","Copy proofread and approved","Legal / compliance review","Brand guidelines checked","Page speed optimized","Email rendering tested across clients","Ad specs and sizes verified"],
    "stakeholder_plan": "",
    "warmup_type": "None — cold launch|Email teaser to existing list|Organic social posts before paid activates|Early access / waitlist|Partner / influencer pre-seeding|Press / media embargo lift|Community / forum seeding",
    "warmup_details": "",
    "go_nogo": ""
  },
  "stage4": {
    "launch_date": "",
    "launch_time": "",
    "channel_order": "",
    "paid_plan": "",
    "organic_plan": "",
    "email_plan": "",
    "pr_plan": "",
    "team_owners": "",
    "monitoring_plan": "",
    "early_signals": "",
    "escalation": "Real-time — decision maker on standby during launch|Within 1 hour — decision maker available same day|Within 4 hours — next business day acceptable for minor issues|Documented — team has pre-authorized decision tree"
  },
  "stage5": {
    "opt_cadence": "Daily (high-spend or short campaigns)|Every 2–3 days|Weekly|Bi-weekly",
    "ab_creative": "",
    "ab_copy": "",
    "ab_audience": "",
    "stat_sig": "80% — faster decisions, lower-volume campaigns|90% — standard for most marketing tests|95% — higher confidence required before acting|Minimum sample size rule instead|Directional — act on clear trends without formal significance",
    "budget_rules": "",
    "kill_criteria": "",
    "scale_criteria": "",
    "lp_optimization": "",
    "audience_refinement": ""
  },
  "stage6": {
    "reporting": ["Daily performance snapshot","Weekly report","Bi-weekly executive summary","Mid-campaign review","Final campaign report"],
    "report_recipients": "",
    "dashboard_tool": "Google Looker Studio|HubSpot Reporting|Salesforce Reports|Tableau|Power BI|Custom Spreadsheet (Google Sheets / Excel)|Native platform dashboards (Meta, Google Ads, etc.)|Databox|Triple Whale|Other / TBD",
    "success_def": "",
    "attribution_model": "Last-touch attribution|First-touch attribution|Linear (equal credit across all touches)|Time-decay (more credit to recent touches)|Position-based / U-shaped (first + last touch weighted)|Data-driven / algorithmic (GA4 or platform model)|Multi-touch custom model|Single channel — no attribution needed",
    "roi_method": "",
    "retro_format": "Internal slide deck (Google Slides / PowerPoint)|Written brief / document (Notion, Google Doc)|Team retrospective meeting with action items|Shared dashboard with annotations|All of the above|We don't have a formal process yet",
    "strategic_questions": "",
    "learnings_template": "",
    "next_cycle": "",
    "asset_archive": ""
  }
}`;

  return await callClaude(system, `Campaign description:\n\n${description}`);
}

/* ── PER-STAGE: refine a single stage based on user instruction ── */
async function aiRefineStage(stageName, currentData, instruction, fieldIds, checkGroups) {
  const system = `You are a senior marketing strategist helping refine a marketing campaign brief.
The user will give you the current field values for ${stageName} and an instruction to improve or change them.
Return ONLY a valid JSON object (no markdown, no commentary) with the same keys as the input, updated per the instruction.
Only change fields that are relevant to the instruction. Keep all other values exactly as they are.
For array/checkbox fields, return arrays of strings using only the exact values already present in the current data or from the known allowed lists.`;

  const userMsg = `Current ${stageName} data:\n${JSON.stringify(currentData, null, 2)}\n\nInstruction: ${instruction}`;
  return await callClaude(system, userMsg);
}

/* ── AI panel toggle ── */
function initAiPanel(stageName, fieldIds, checkGroups) {
  const toggle  = document.getElementById('ai-panel-toggle');
  const panel   = document.getElementById('ai-panel');
  const input   = document.getElementById('ai-refine-input');
  const btn     = document.getElementById('ai-refine-btn');
  const spinner = document.getElementById('ai-refine-spinner');
  const error   = document.getElementById('ai-refine-error');

  if (!toggle || !panel) return;

  toggle.addEventListener('click', () => {
    const open = panel.classList.toggle('open');
    toggle.textContent = open ? 'Hide AI Assistant ↑' : 'AI Assistant ✦';
  });

  btn.addEventListener('click', async () => {
    const instruction = input.value.trim();
    if (!instruction) return;

    btn.disabled    = true;
    spinner.style.display = 'inline';
    error.textContent     = '';

    try {
      const current = Store.load(stageName);
      const updated = await aiRefineStage(stageName, current, instruction, fieldIds, checkGroups);
      // Merge: updated values take precedence, keep existing for untouched keys
      const merged = { ...current, ...updated };
      Store.save(stageName, merged);
      populateForm(merged, fieldIds, checkGroups);
      flashSaved();
      input.value = '';
      // Flash the fields visually
      document.querySelectorAll('.form-section input, .form-section select, .form-section textarea').forEach(el => {
        el.classList.add('ai-updated');
        setTimeout(() => el.classList.remove('ai-updated'), 1200);
      });
    } catch(e) {
      error.textContent = e.message === 'NO_API_KEY'
        ? 'No API key — click ⚙ to add your Anthropic key.'
        : 'AI update failed — check your connection and try again.';
      console.error(e);
    } finally {
      btn.disabled          = false;
      spinner.style.display = 'none';
    }
  });

  // Allow Enter+Ctrl/Cmd to submit
  input.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') btn.click();
  });
}

/* ── Index page: upfront AI prefill ── */
function initIndexAi() {
  const btn     = document.getElementById('ai-prefill-btn');
  const input   = document.getElementById('ai-campaign-input');
  const spinner = document.getElementById('ai-prefill-spinner');
  const error   = document.getElementById('ai-prefill-error');
  const panel   = document.getElementById('ai-prefill-panel');

  if (!btn) return;

  // On index: auto-open settings on first visit if no key is saved
  if (!ApiKey.has()) {
    setTimeout(() => {
      const overlay = document.querySelector('.settings-overlay');
      if (overlay) overlay.classList.add('show');
    }, 500);
  }

  btn.addEventListener('click', async () => {
    const description = input.value.trim();
    if (!description) return;

    btn.disabled          = true;
    spinner.style.display = 'inline';
    error.textContent     = '';

    try {
      const result = await aiPrefillAll(description);

      // Save each stage
      ['stage1','stage2','stage3','stage4','stage5','stage6'].forEach(s => {
        if (result[s] && Object.keys(result[s]).length) {
          Store.save(s, result[s]);
        }
      });

      // Update badges
      initIndexCards();

      // Show success state
      panel.classList.add('prefill-success');
      panel.innerHTML = `
        <div class="prefill-success-msg">
          <span class="prefill-check">✓</span>
          <div>
            <strong>All stages pre-filled.</strong>
            <p>Review and refine each stage — the AI does a first pass, you make it yours.</p>
          </div>
          <a href="stage1.html" class="btn btn-primary" style="margin-left:auto;">Review Stage 1 →</a>
        </div>`;

    } catch(e) {
      error.textContent = e.message === 'NO_API_KEY'
        ? 'No API key — click ⚙ (bottom right) to add your Anthropic key.'
        : 'Something went wrong — try again or fill manually.';
      console.error(e);
    } finally {
      btn.disabled          = false;
      spinner.style.display = 'none';
    }
  });

  input.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') btn.click();
  });
}

/* ── Index cards ── */
function initIndexCards() {
  document.querySelectorAll('.stage-card').forEach((card, i) => {
    setTimeout(() => card.classList.add('visible'), 150 + i * 110);
  });
  ['1','2','3','4','5','6'].forEach(n => {
    const badge = document.getElementById('s' + n + '-badge');
    if (badge && Store.isComplete('stage' + n)) {
      badge.textContent = 'Complete';
      badge.classList.add('done');
    }
  });
  const cta   = document.getElementById('main-cta');
  const note  = document.getElementById('start-note');
  const count = Store.completedCount();
  if (!cta) return;
  if (count === 6) {
    cta.href = 'brief.html'; cta.textContent = 'View Campaign Brief →'; cta.classList.add('resume');
  } else if (count > 0) {
    cta.href = 'stage' + (count + 1) + '.html';
    cta.textContent = 'Resume Stage ' + (count + 1) + ' →';
    cta.classList.add('resume');
    if (note) note.innerHTML = count + ' of 6 stages complete. Pick up where you left off.';
  }
}

/* ============================================================
   BRIEF PAGE UTILITIES
   ============================================================ */
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}
function escPlain(str) {
  return String(str).replace(/<br>/g, '\n');
}

function briefField(label, value) {
  const empty = !value || !String(value).trim();
  return `<div class="brief-field">
    <div class="field-name">${label}</div>
    <div class="field-value${empty ? ' empty' : ''}">${empty ? 'Not provided' : escHtml(value)}</div>
  </div>`;
}
function briefPills(label, arr) {
  const pills = (arr && arr.length)
    ? arr.map(p => `<span class="pill-item">${escHtml(p)}</span>`).join('')
    : '<span class="field-value empty">Not selected</span>';
  return `<div class="brief-field"><div class="field-name">${label}</div><div class="pill-list">${pills}</div></div>`;
}
function briefRow(...fields) {
  return `<div class="field-row">${fields.join('')}</div>`;
}
function briefSection(num, color, headingHtml, bodyHtml, delay) {
  return `<div class="brief-section" style="--stage-color:${color}; animation-delay:${delay}s;">
    <div class="section-header">
      <div class="section-num" style="--stage-color:${color}">${num}</div>
      <div class="section-heading">${headingHtml}</div>
    </div>${bodyHtml}</div>`;
}

/* ── Plain-text version of the brief for clipboard ── */
function buildBriefPlainText(s1, s2, s3, s4, s5, s6) {
  const name = s1.campaign_name || 'Untitled Campaign';
  const splitVal = s1.budget_split || '70';
  const splitLabel = splitVal + '% Media / ' + (100 - parseInt(splitVal)) + '% Production';

  function field(label, value) {
    if (!value || !String(value).trim()) return '';
    return `${label.toUpperCase()}\n${String(value).replace(/<br>/g,'\n')}\n\n`;
  }
  function pills(label, arr) {
    if (!arr || !arr.length) return '';
    return `${label.toUpperCase()}\n${arr.join(', ')}\n\n`;
  }

  return `CAMPAIGN BRIEF
${'='.repeat(60)}
${name}
Generated: ${new Date().toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'})}
${s1.campaign_objective ? 'Objective: ' + s1.campaign_objective : ''}
${s1.budget ? 'Budget: ' + s1.budget : ''}
${(s1.start_date && s1.end_date) ? 'Dates: ' + s1.start_date + ' → ' + s1.end_date : ''}

${'─'.repeat(60)}
01. STRATEGY & PLANNING
${'─'.repeat(60)}
${field('Campaign Objective', s1.campaign_objective)}${field('Objective Detail', s1.objective_detail)}${field('Target Audience', s1.target_audience)}${field('Audience Size', s1.audience_size)}${field('Total Budget', s1.budget)}${field('Budget Split', splitLabel)}${pills('Channel Mix', s1.channels)}${pills('Primary KPIs', s1.kpis)}${field('KPI Targets', s1.kpi_targets)}${field('Campaign Dates', (s1.start_date && s1.end_date) ? s1.start_date + ' → ' + s1.end_date : '')}${field('Competitors to Watch', s1.competitors)}
${'─'.repeat(60)}
02. CREATIVE DEVELOPMENT
${'─'.repeat(60)}
${field('Core Campaign Message', s2.core_message)}${field('Value Proposition', s2.value_prop)}${field('Pain Points Addressed', s2.pain_points)}${pills('Tone of Voice', s2.tone)}${field('Headline Directions', s2.headlines)}${field('Primary CTA', s2.cta_text ? s2.cta_text + (s2.cta_url ? ' — ' + s2.cta_url : '') : '')}${field('Secondary CTA', s2.cta2_text ? s2.cta2_text + (s2.cta2_url ? ' — ' + s2.cta2_url : '') : '')}${pills('Assets to Produce', s2.assets)}${field('Visual Style Direction', s2.visual_style)}${field('Content Restrictions', s2.restrictions)}
${'─'.repeat(60)}
03. PRE-LAUNCH
${'─'.repeat(60)}
${pills('Tracking Stack', s3.tracking)}${field('Conversion Events', s3.conversion_events)}${field('UTM Source Format', s3.utm_source)}${field('UTM Medium Format', s3.utm_medium)}${field('UTM Campaign Naming', s3.utm_campaign)}${pills('QA Checklist Areas', s3.qa)}${field('Stakeholder Briefing Plan', s3.stakeholder_plan)}${field('Warm-Up Strategy', s3.warmup_type)}${field('Warm-Up Details', s3.warmup_details)}${field('Go / No-Go Criteria', s3.go_nogo)}
${'─'.repeat(60)}
04. LAUNCH & ACTIVATION
${'─'.repeat(60)}
${field('Launch Date', s4.launch_date)}${field('Launch Time', s4.launch_time)}${field('Channel Activation Order', s4.channel_order)}${field('Paid Media Plan', s4.paid_plan)}${field('Organic Content Plan', s4.organic_plan)}${field('Email Launch Sequence', s4.email_plan)}${field('PR & Earned Media Plan', s4.pr_plan)}${field('Team & Channel Owners', s4.team_owners)}${field('Monitoring Plan', s4.monitoring_plan)}${field('Early Signal Thresholds', s4.early_signals)}${field('Escalation Path', s4.escalation)}
${'─'.repeat(60)}
05. OPTIMIZATION
${'─'.repeat(60)}
${field('Optimization Cadence', s5.opt_cadence)}${field('A/B Testing — Creative', s5.ab_creative)}${field('A/B Testing — Copy & Messaging', s5.ab_copy)}${field('A/B Testing — Audience', s5.ab_audience)}${field('Statistical Significance', s5.stat_sig)}${field('Budget Reallocation Rules', s5.budget_rules)}${field('Kill Criteria', s5.kill_criteria)}${field('Scale Criteria', s5.scale_criteria)}${field('Landing Page Optimization', s5.lp_optimization)}${field('Audience Refinement Plan', s5.audience_refinement)}
${'─'.repeat(60)}
06. REPORTING & ITERATION
${'─'.repeat(60)}
${pills('Reporting Cadence', s6.reporting)}${field('Report Recipients', s6.report_recipients)}${field('Reporting Dashboard', s6.dashboard_tool)}${field('Success Definition', s6.success_def)}${field('Attribution Model', s6.attribution_model)}${field('ROI Calculation Method', s6.roi_method)}${field('Post-Campaign Review Format', s6.retro_format)}${field('Strategic Questions', s6.strategic_questions)}${field('Learnings Template', s6.learnings_template)}${field('Next Campaign Trigger', s6.next_cycle)}${field('Asset Archive Plan', s6.asset_archive)}`;
}

/* ── CSV export for Google Sheets ── */
function buildBriefCsv(s1, s2, s3, s4, s5, s6) {
  const splitVal   = s1.budget_split || '70';
  const splitLabel = splitVal + '% Media / ' + (100 - parseInt(splitVal)) + '% Production';

  function e(v) {
    const s = String(v || '').replace(/\r?\n/g, ' ').trim();
    return (s.includes(',') || s.includes('"')) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function a(v) { return e((v && v.length) ? v.join('; ') : ''); }

  const rows = [
    ['Section', 'Field', 'Value'],
    ['Strategy & Planning','Campaign Name',e(s1.campaign_name)],
    ['Strategy & Planning','Campaign Objective',e(s1.campaign_objective)],
    ['Strategy & Planning','Objective Detail',e(s1.objective_detail)],
    ['Strategy & Planning','Target Audience',e(s1.target_audience)],
    ['Strategy & Planning','Audience Size',e(s1.audience_size)],
    ['Strategy & Planning','Total Budget',e(s1.budget)],
    ['Strategy & Planning','Budget Split',e(splitLabel)],
    ['Strategy & Planning','Channel Mix',a(s1.channels)],
    ['Strategy & Planning','Primary KPIs',a(s1.kpis)],
    ['Strategy & Planning','KPI Targets',e(s1.kpi_targets)],
    ['Strategy & Planning','Start Date',e(s1.start_date)],
    ['Strategy & Planning','End Date',e(s1.end_date)],
    ['Strategy & Planning','Competitors to Watch',e(s1.competitors)],
    ['Creative Development','Core Campaign Message',e(s2.core_message)],
    ['Creative Development','Value Proposition',e(s2.value_prop)],
    ['Creative Development','Pain Points Addressed',e(s2.pain_points)],
    ['Creative Development','Tone of Voice',a(s2.tone)],
    ['Creative Development','Headline Directions',e(s2.headlines)],
    ['Creative Development','Primary CTA Text',e(s2.cta_text)],
    ['Creative Development','Primary CTA URL',e(s2.cta_url)],
    ['Creative Development','Secondary CTA Text',e(s2.cta2_text)],
    ['Creative Development','Secondary CTA URL',e(s2.cta2_url)],
    ['Creative Development','Assets to Produce',a(s2.assets)],
    ['Creative Development','Visual Style Direction',e(s2.visual_style)],
    ['Creative Development','Content Restrictions',e(s2.restrictions)],
    ['Pre-Launch','Tracking Stack',a(s3.tracking)],
    ['Pre-Launch','Conversion Events',e(s3.conversion_events)],
    ['Pre-Launch','UTM Source Format',e(s3.utm_source)],
    ['Pre-Launch','UTM Medium Format',e(s3.utm_medium)],
    ['Pre-Launch','UTM Campaign Naming',e(s3.utm_campaign)],
    ['Pre-Launch','QA Checklist Areas',a(s3.qa)],
    ['Pre-Launch','Stakeholder Briefing Plan',e(s3.stakeholder_plan)],
    ['Pre-Launch','Warm-Up Strategy',e(s3.warmup_type)],
    ['Pre-Launch','Warm-Up Details',e(s3.warmup_details)],
    ['Pre-Launch','Go / No-Go Criteria',e(s3.go_nogo)],
    ['Launch & Activation','Launch Date',e(s4.launch_date)],
    ['Launch & Activation','Launch Time',e(s4.launch_time)],
    ['Launch & Activation','Channel Activation Order',e(s4.channel_order)],
    ['Launch & Activation','Paid Media Plan',e(s4.paid_plan)],
    ['Launch & Activation','Organic Content Plan',e(s4.organic_plan)],
    ['Launch & Activation','Email Launch Sequence',e(s4.email_plan)],
    ['Launch & Activation','PR & Earned Media Plan',e(s4.pr_plan)],
    ['Launch & Activation','Team & Channel Owners',e(s4.team_owners)],
    ['Launch & Activation','Monitoring Plan',e(s4.monitoring_plan)],
    ['Launch & Activation','Early Signal Thresholds',e(s4.early_signals)],
    ['Launch & Activation','Escalation Path',e(s4.escalation)],
    ['Optimization','Optimization Cadence',e(s5.opt_cadence)],
    ['Optimization','A/B Testing — Creative',e(s5.ab_creative)],
    ['Optimization','A/B Testing — Copy & Messaging',e(s5.ab_copy)],
    ['Optimization','A/B Testing — Audience',e(s5.ab_audience)],
    ['Optimization','Statistical Significance',e(s5.stat_sig)],
    ['Optimization','Budget Reallocation Rules',e(s5.budget_rules)],
    ['Optimization','Kill Criteria',e(s5.kill_criteria)],
    ['Optimization','Scale Criteria',e(s5.scale_criteria)],
    ['Optimization','Landing Page Optimization',e(s5.lp_optimization)],
    ['Optimization','Audience Refinement Plan',e(s5.audience_refinement)],
    ['Reporting & Iteration','Reporting Cadence',a(s6.reporting)],
    ['Reporting & Iteration','Report Recipients',e(s6.report_recipients)],
    ['Reporting & Iteration','Reporting Dashboard',e(s6.dashboard_tool)],
    ['Reporting & Iteration','Success Definition',e(s6.success_def)],
    ['Reporting & Iteration','Attribution Model',e(s6.attribution_model)],
    ['Reporting & Iteration','ROI Calculation Method',e(s6.roi_method)],
    ['Reporting & Iteration','Post-Campaign Review Format',e(s6.retro_format)],
    ['Reporting & Iteration','Strategic Questions',e(s6.strategic_questions)],
    ['Reporting & Iteration','Learnings Template',e(s6.learnings_template)],
    ['Reporting & Iteration','Next Campaign Trigger',e(s6.next_cycle)],
    ['Reporting & Iteration','Asset Archive Plan',e(s6.asset_archive)],
  ];

  return rows.map(r => r.join(',')).join('\r\n');
}

function downloadCsv(s1, s2, s3, s4, s5, s6) {
  const name = (s1.campaign_name || 'Campaign Brief').replace(/[^\w\s-]/g, '').trim() || 'Campaign Brief';
  const csv  = buildBriefCsv(s1, s2, s3, s4, s5, s6);
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = name + '.csv';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('Spreadsheet downloaded — <a href="https://sheets.new" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;">Open Google Sheets ↗</a>');
}

/* ── HTML brief for clipboard (pastes cleanly into Google Docs) ── */
function buildBriefHtml(s1, s2, s3, s4, s5, s6) {
  const name     = s1.campaign_name || 'Untitled Campaign';
  const splitVal = s1.budget_split  || '70';
  const splitLabel = splitVal + '% Media / ' + (100 - parseInt(splitVal)) + '% Production';

  const lbl  = 'font-size:10px;color:#6b21a8;text-transform:uppercase;letter-spacing:.1em;font-weight:700;margin:10px 0 2px;font-family:Arial,sans-serif;';
  const val  = 'font-size:13px;color:#111;margin:0 0 6px;line-height:1.6;font-family:Arial,sans-serif;';
  const pill = 'display:inline-block;font-size:11px;background:#f3e8ff;color:#6b21a8;border:1px solid #ddd6fe;border-radius:4px;padding:2px 10px;margin:2px 2px 4px;font-family:Arial,sans-serif;';
  const h2   = 'font-size:15px;color:#111;border-bottom:1px solid #e5e7eb;padding-bottom:5px;margin:22px 0 10px;font-family:Arial,sans-serif;';

  function f(label, value) {
    if (!value || !String(value).trim()) return '';
    return `<p style="${lbl}">${label}</p><p style="${val}">${String(value).replace(/\n/g,'<br>')}</p>`;
  }
  function p(label, arr) {
    if (!arr || !arr.length) return '';
    return `<p style="${lbl}">${label}</p><p style="margin:0 0 8px;">${arr.map(v=>`<span style="${pill}">${v}</span>`).join(' ')}</p>`;
  }
  function sec(num, title, body) {
    return `<h2 style="${h2}">${num} — ${title}</h2>${body}`;
  }

  const meta = [
    s1.campaign_objective ? `<strong>Objective:</strong> ${s1.campaign_objective}` : '',
    s1.budget             ? `<strong>Budget:</strong> ${s1.budget}` : '',
    (s1.start_date && s1.end_date) ? `<strong>Dates:</strong> ${s1.start_date} → ${s1.end_date}` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#111;background:#fff;max-width:780px;margin:0;padding:28px;">
<h1 style="font-size:22px;color:#111;margin:0 0 4px;font-family:Georgia,serif;">${name}</h1>
<p style="font-size:11px;color:#777;margin:0 0 ${meta?'8px':'20px'};">Campaign Brief — ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</p>
${meta?`<p style="font-size:12px;color:#555;margin:0 0 18px;">${meta}</p>`:''}
<hr style="border:none;border-top:2px solid #e5e7eb;margin:0 0 4px;">
${sec('01','Strategy &amp; Planning',`${f('Campaign Objective',s1.campaign_objective)}${f('Objective Detail',s1.objective_detail)}${f('Target Audience',s1.target_audience)}${f('Audience Size',s1.audience_size)}${f('Total Budget',s1.budget)}${f('Budget Split',splitLabel)}${p('Channel Mix',s1.channels)}${p('Primary KPIs',s1.kpis)}${f('KPI Targets',s1.kpi_targets)}${f('Campaign Dates',(s1.start_date&&s1.end_date)?s1.start_date+' → '+s1.end_date:'')}${f('Competitors to Watch',s1.competitors)}`)}
${sec('02','Creative Development',`${f('Core Campaign Message',s2.core_message)}${f('Value Proposition',s2.value_prop)}${f('Pain Points Addressed',s2.pain_points)}${p('Tone of Voice',s2.tone)}${f('Headline Directions',s2.headlines)}${f('Primary CTA',s2.cta_text?(s2.cta_text+(s2.cta_url?' — '+s2.cta_url:'')):'')}${f('Secondary CTA',s2.cta2_text?(s2.cta2_text+(s2.cta2_url?' — '+s2.cta2_url:'')):'')}${p('Assets to Produce',s2.assets)}${f('Visual Style Direction',s2.visual_style)}${f('Content Restrictions',s2.restrictions)}`)}
${sec('03','Pre-Launch Setup',`${p('Tracking Stack',s3.tracking)}${f('Conversion Events',s3.conversion_events)}${f('UTM Source Format',s3.utm_source)}${f('UTM Medium Format',s3.utm_medium)}${f('UTM Campaign Naming',s3.utm_campaign)}${p('QA Checklist Areas',s3.qa)}${f('Stakeholder Briefing Plan',s3.stakeholder_plan)}${f('Warm-Up Strategy',s3.warmup_type)}${f('Warm-Up Details',s3.warmup_details)}${f('Go / No-Go Criteria',s3.go_nogo)}`)}
${sec('04','Launch &amp; Activation',`${f('Launch Date',s4.launch_date)}${f('Launch Time',s4.launch_time)}${f('Channel Activation Order',s4.channel_order)}${f('Paid Media Plan',s4.paid_plan)}${f('Organic Content Plan',s4.organic_plan)}${f('Email Launch Sequence',s4.email_plan)}${f('PR &amp; Earned Media Plan',s4.pr_plan)}${f('Team &amp; Channel Owners',s4.team_owners)}${f('Monitoring Plan',s4.monitoring_plan)}${f('Early Signal Thresholds',s4.early_signals)}${f('Escalation Path',s4.escalation)}`)}
${sec('05','Optimization Framework',`${f('Optimization Cadence',s5.opt_cadence)}${f('A/B Testing — Creative',s5.ab_creative)}${f('A/B Testing — Copy &amp; Messaging',s5.ab_copy)}${f('A/B Testing — Audience',s5.ab_audience)}${f('Statistical Significance',s5.stat_sig)}${f('Budget Reallocation Rules',s5.budget_rules)}${f('Kill Criteria',s5.kill_criteria)}${f('Scale Criteria',s5.scale_criteria)}${f('Landing Page Optimization',s5.lp_optimization)}${f('Audience Refinement Plan',s5.audience_refinement)}`)}
${sec('06','Reporting &amp; Iteration',`${p('Reporting Cadence',s6.reporting)}${f('Report Recipients',s6.report_recipients)}${f('Reporting Dashboard',s6.dashboard_tool)}${f('Success Definition',s6.success_def)}${f('Attribution Model',s6.attribution_model)}${f('ROI Calculation Method',s6.roi_method)}${f('Post-Campaign Review Format',s6.retro_format)}${f('Strategic Questions',s6.strategic_questions)}${f('Learnings Template',s6.learnings_template)}${f('Next Campaign Trigger',s6.next_cycle)}${f('Asset Archive Plan',s6.asset_archive)}`)}
</body></html>`;
}

/* ── Copy brief to clipboard (HTML + plain text fallback) ── */
async function copyBrief(s1, s2, s3, s4, s5, s6) {
  const plain = buildBriefPlainText(s1, s2, s3, s4, s5, s6);
  const html  = buildBriefHtml(s1, s2, s3, s4, s5, s6);

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html':  new Blob([html],  { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' })
      })
    ]);
  } catch(e) {
    try { await navigator.clipboard.writeText(plain); }
    catch(e2) {
      const ta = document.createElement('textarea');
      ta.value = plain;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
      document.body.appendChild(ta);
      ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  showToast('Brief copied — <a href="https://docs.google.com/document/create" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;white-space:nowrap;">Open Google Docs ↗</a>');
}

/* ── Toast notification ── */
function showToast(message) {
  let toast = document.getElementById('wizard-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'wizard-toast';
    toast.className = 'wizard-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = message;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 5000);
}

/* ── Google OAuth + Drive export ── */
const GOOGLE_CLIENT_ID = '610429325492-bqi1tbv2nn3kscen3fkgcqnlbdru8ftb.apps.googleusercontent.com';
let _gTokenClient = null;
let _gAccessToken = null;
let _gTokenExpiry  = 0;

function initGoogleAuth() {
  if (!window.google?.accounts?.oauth2) return;
  _gTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets',
    callback: '' // assigned per request
  });
}

function getGoogleToken() {
  return new Promise((resolve, reject) => {
    if (_gAccessToken && Date.now() < _gTokenExpiry) { resolve(_gAccessToken); return; }
    if (!_gTokenClient) { reject(new Error('Google auth not initialised — try again in a moment.')); return; }
    _gTokenClient.callback = (resp) => {
      if (resp.error) { reject(new Error(resp.error)); return; }
      _gAccessToken = resp.access_token;
      _gTokenExpiry  = Date.now() + (resp.expires_in - 60) * 1000;
      resolve(_gAccessToken);
    };
    _gTokenClient.requestAccessToken({ prompt: '' });
  });
}

async function _driveUpload(title, appMime, contentType, content) {
  const token    = await getGoogleToken();
  const boundary = 'BriefMaker_' + Date.now();
  const meta     = JSON.stringify({ name: title, mimeType: appMime });
  const body     = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n${content}\r\n--${boundary}--`;
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
    body
  });
  if (!res.ok) throw new Error('Drive API error ' + res.status);
  return res.json();
}

async function openInGoogleDocs(s1, s2, s3, s4, s5, s6) {
  const name = s1.campaign_name || 'Campaign Brief';
  const file = await _driveUpload(name, 'application/vnd.google-apps.document', 'text/html', buildBriefHtml(s1, s2, s3, s4, s5, s6));
  window.open(`https://docs.google.com/document/d/${file.id}/edit`, '_blank');
}

async function _formatSheet(spreadsheetId) {
  const token = await getGoogleToken();
  const requests = [
    // Bold + freeze header row
    { repeatCell: { range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.96, green: 0.96, blue: 0.96 } } }, fields: 'userEnteredFormat(textFormat,backgroundColor)' } },
    { updateSheetProperties: { properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
    // Column widths: Section (col 0) = 180px, Field (col 1) = 240px, Value (col 2) = 520px
    { updateDimensionProperties: { range: { sheetId: 0, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 180 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: 0, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 240 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: 0, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 520 }, fields: 'pixelSize' } },
    // Wrap text in value column
    { repeatCell: { range: { sheetId: 0, startColumnIndex: 2, endColumnIndex: 3 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)' } },
    // Vertical align top for section + field columns
    { repeatCell: { range: { sheetId: 0, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { verticalAlignment: 'TOP' } }, fields: 'userEnteredFormat.verticalAlignment' } },
  ];
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests })
  });
}

async function openInGoogleSheets(s1, s2, s3, s4, s5, s6) {
  const name = (s1.campaign_name || 'Campaign Brief').replace(/[^\w\s-]/g, '').trim() || 'Campaign Brief';
  const file = await _driveUpload(name, 'application/vnd.google-apps.spreadsheet', 'text/csv', buildBriefCsv(s1, s2, s3, s4, s5, s6));
  await _formatSheet(file.id).catch(() => {}); // best-effort — don't block opening if format fails
  window.open(`https://docs.google.com/spreadsheets/d/${file.id}/edit`, '_blank');
}

/* ── Brief polish — tighten for at-a-glance consumption ── */
async function polishStage(stageName, data) {
  const system = `You are editing one stage of a marketing campaign brief for at-a-glance readability.
Same information — leaner, cleaner format. Apply these rules to every non-empty string value:
• Prose longer than ~15 words → rewrite as 3–5 tight bullets, each starting with "• ", joined by \\n
• Trim filler words — fewer words, same meaning
• Sentence case throughout
• Values already under 12 words: leave exactly as-is
• Array fields, dates, numbers, URLs: leave completely unchanged
• Empty strings stay empty

Return ONLY valid JSON with the exact same keys. No markdown fences, no commentary.`;

  return await callClaude(system, `Stage: ${stageName}\n\n${JSON.stringify(data, null, 2)}`, 2048);
}

async function polishBrief(s1, s2, s3, s4, s5, s6) {
  const [r1, r2, r3, r4, r5, r6] = await Promise.all([
    polishStage('stage1', s1),
    polishStage('stage2', s2),
    polishStage('stage3', s3),
    polishStage('stage4', s4),
    polishStage('stage5', s5),
    polishStage('stage6', s6),
  ]);
  return { s1: r1, s2: r2, s3: r3, s4: r4, s5: r5, s6: r6 };
}

/* ── Reset modal ── */
function initResetModal() {
  const overlay = document.querySelector('.reset-overlay');
  if (!overlay) return;
  document.querySelector('[data-action="open-reset"]')
    ?.addEventListener('click', () => overlay.classList.add('show'));
  document.querySelector('[data-action="cancel-reset"]')
    ?.addEventListener('click', () => overlay.classList.remove('show'));
  document.querySelector('[data-action="confirm-reset"]')
    ?.addEventListener('click', () => { Store.clearAll(); window.location.href = 'index.html'; });
}

/* ── Settings UI (gear button + modal, injected on every page) ── */
function initSettingsUI() {
  // Gear button
  const btn = document.createElement('button');
  btn.className = 'settings-btn' + (ApiKey.has() ? ' key-set' : '');
  btn.title = 'API Settings';
  btn.setAttribute('aria-label', 'API Settings');
  btn.textContent = '⚙';
  document.body.appendChild(btn);

  // Modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'settings-overlay';
  overlay.innerHTML = `
    <div class="settings-box">
      <h3>API Settings</h3>
      <p>Enter your <a href="https://console.anthropic.com/" target="_blank" rel="noopener">Anthropic API key</a> to enable AI features. Your key is saved only in this browser — it is never sent anywhere except directly to Anthropic.</p>
      <label class="field-label" for="settings-api-key">Anthropic API Key</label>
      <input type="password" id="settings-api-key" placeholder="sk-ant-…" autocomplete="off" spellcheck="false">
      <div class="settings-actions">
        <button class="btn btn-ghost" id="settings-cancel">Cancel</button>
        <button class="btn btn-primary" id="settings-save">Save Key</button>
      </div>
      <div class="settings-status" id="settings-status"></div>
    </div>`;
  document.body.appendChild(overlay);

  const input  = overlay.querySelector('#settings-api-key');
  const status = overlay.querySelector('#settings-status');

  function openSettings() {
    input.value = ApiKey.get();
    status.textContent = '';
    overlay.classList.add('show');
    setTimeout(() => input.focus(), 50);
  }

  btn.addEventListener('click', openSettings);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('show');
  });

  overlay.querySelector('#settings-cancel').addEventListener('click', () => {
    overlay.classList.remove('show');
  });

  overlay.querySelector('#settings-save').addEventListener('click', () => {
    const val = input.value.trim();
    if (!val) { status.textContent = 'Please enter a key.'; return; }
    ApiKey.set(val);
    btn.classList.add('key-set');
    status.textContent = '✓ Key saved.';
    setTimeout(() => overlay.classList.remove('show'), 900);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') overlay.querySelector('#settings-save').click();
    if (e.key === 'Escape') overlay.classList.remove('show');
  });
}

initSettingsUI();
