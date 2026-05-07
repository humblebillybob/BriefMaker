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
  const name = s1.campaign_name || 'Untitled Campaign';
  const splitVal = s1.budget_split || '70';
  const splitLabel = splitVal + '% Media / ' + (100 - parseInt(splitVal)) + '% Production';

  // Section color palette matching the web UI
  const COLORS = ['#b89af5','#70a5f9','#3dd8e8','#4ade95','#fbbf50','#fb7185'];
  const TINTS  = ['#f6f3fe','#eef4fe','#e8fafc','#e9fbf2','#fef7ea','#feeef0'];
  const TITLES = [
    'Strategy &amp; <em>Planning</em>',
    'Creative <em>Development</em>',
    '<em>Pre-Launch</em> Setup',
    'Launch &amp; <em>Activation</em>',
    '<em>Optimization</em> Framework',
    'Reporting &amp; <em>Iteration</em>',
  ];

  // Factory: returns {f, p, r2, wrap} scoped to this section's color
  function makeSec(i) {
    const color = COLORS[i], tint = TINTS[i], num = String(i+1).padStart(2,'0'), title = TITLES[i];
    const lbl = `font-size:9px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.12em;margin:0 0 4px;font-family:Arial,sans-serif;`;
    const val = `font-size:13px;color:#111;line-height:1.65;margin:0;font-family:Arial,sans-serif;`;
    const fieldTd = `padding:10px 18px 12px;border-left:3px solid ${color};border-top:1px solid #f0f0f0;vertical-align:top;`;

    function f(label, value) {
      if (!value || !String(value).trim()) return '';
      return `<tr><td colspan="2" style="${fieldTd}"><p style="${lbl}">${label}</p><p style="${val}">${String(value).replace(/\n/g,'<br>')}</p></td></tr>`;
    }
    function p(label, arr) {
      if (!arr || !arr.length) return '';
      const pills = arr.map(v => `<span style="display:inline-block;font-size:11px;color:${color};border:1px solid ${color};padding:2px 9px;margin:0 4px 3px 0;font-family:Arial,sans-serif;">${v}</span>`).join('');
      return `<tr><td colspan="2" style="${fieldTd}"><p style="${lbl}">${label}</p><p style="margin:2px 0 0;font-family:Arial,sans-serif;">${pills}</p></td></tr>`;
    }
    function r2(l1, v1, l2, v2) {
      const has1 = v1 && String(v1).trim(), has2 = v2 && String(v2).trim();
      if (!has1 && !has2) return '';
      const td2a = `width:50%;padding:10px 14px 12px 18px;border-left:3px solid ${color};border-top:1px solid #f0f0f0;vertical-align:top;`;
      const td2b = `width:50%;padding:10px 18px 12px 14px;border-top:1px solid #f0f0f0;vertical-align:top;`;
      const cell = (l, v, sty) => !v || !String(v).trim() ? `<td style="${sty}"></td>` :
        `<td style="${sty}"><p style="${lbl}">${l}</p><p style="${val}">${String(v).replace(/\n/g,'<br>')}</p></td>`;
      return `<tr>${cell(l1,v1,td2a)}${cell(l2,v2,td2b)}</tr>`;
    }
    function wrap(rows) {
      return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 26px;border:1px solid #e5e7eb;border-top:3px solid ${color};">` +
        `<tr><td colspan="2" style="background:${tint};padding:10px 18px;">` +
        `<table cellpadding="0" cellspacing="0"><tr>` +
        `<td style="width:28px;height:28px;border:2px solid ${color};text-align:center;vertical-align:middle;font-size:10px;font-weight:700;color:${color};font-family:Arial,sans-serif;">${num}</td>` +
        `<td style="padding-left:10px;font-family:Georgia,'Times New Roman',serif;font-size:17px;color:#111;">${title}</td>` +
        `</tr></table></td></tr>${rows}</table>`;
    }
    return { f, p, r2, wrap };
  }

  const S = [0,1,2,3,4,5].map(makeSec);
  const meta = [
    s1.campaign_objective ? `<b>Objective:</b> ${s1.campaign_objective}` : '',
    s1.budget             ? `<b>Budget:</b> ${s1.budget}` : '',
    (s1.start_date && s1.end_date) ? `<b>Dates:</b> ${s1.start_date} → ${s1.end_date}` : '',
  ].filter(Boolean).join(' &nbsp;&middot;&nbsp; ');
  const d = new Date().toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'});

  const sec1 = S[0].wrap(
    S[0].f('Campaign Objective', s1.campaign_objective) +
    S[0].f('Objective Detail',   s1.objective_detail) +
    S[0].f('Target Audience',    s1.target_audience) +
    S[0].r2('Audience Size', s1.audience_size, 'Total Budget', s1.budget) +
    S[0].r2('Budget Split', splitLabel, 'Campaign Dates', (s1.start_date&&s1.end_date)?s1.start_date+' → '+s1.end_date:'') +
    S[0].p('Channel Mix',  s1.channels) +
    S[0].p('Primary KPIs', s1.kpis) +
    S[0].f('KPI Targets',  s1.kpi_targets) +
    S[0].f('Competitors to Watch', s1.competitors));

  const sec2 = S[1].wrap(
    S[1].f('Core Campaign Message', s2.core_message) +
    S[1].f('Value Proposition',     s2.value_prop) +
    S[1].f('Pain Points Addressed', s2.pain_points) +
    S[1].p('Tone of Voice', s2.tone) +
    S[1].f('Headline Directions', s2.headlines) +
    S[1].r2('Primary CTA', s2.cta_text?(s2.cta_text+(s2.cta_url?' — '+s2.cta_url:'')):'', 'Secondary CTA', s2.cta2_text?(s2.cta2_text+(s2.cta2_url?' — '+s2.cta2_url:'')):'') +
    S[1].p('Assets to Produce', s2.assets) +
    S[1].f('Visual Style Direction', s2.visual_style) +
    S[1].f('Content Restrictions',   s2.restrictions));

  const sec3 = S[2].wrap(
    S[2].p('Tracking Stack', s3.tracking) +
    S[2].f('Conversion Events', s3.conversion_events) +
    S[2].r2('UTM Source Format', s3.utm_source, 'UTM Medium Format', s3.utm_medium) +
    S[2].f('UTM Campaign Naming', s3.utm_campaign) +
    S[2].p('QA Checklist Areas', s3.qa) +
    S[2].f('Stakeholder Briefing Plan', s3.stakeholder_plan) +
    S[2].r2('Warm-Up Strategy', s3.warmup_type, 'Warm-Up Details', s3.warmup_details) +
    S[2].f('Go / No-Go Criteria', s3.go_nogo));

  const sec4 = S[3].wrap(
    S[3].r2('Launch Date', s4.launch_date, 'Launch Time', s4.launch_time) +
    S[3].f('Channel Activation Order',       s4.channel_order) +
    S[3].f('Paid Media Plan',                s4.paid_plan) +
    S[3].f('Organic Content Plan',           s4.organic_plan) +
    S[3].f('Email Launch Sequence',          s4.email_plan) +
    S[3].f('PR &amp; Earned Media Plan',     s4.pr_plan) +
    S[3].f('Team &amp; Channel Owners',      s4.team_owners) +
    S[3].f('Monitoring Plan (First 72 hrs)', s4.monitoring_plan) +
    S[3].f('Early Signal Thresholds',        s4.early_signals) +
    S[3].f('Escalation Path',                s4.escalation));

  const sec5 = S[4].wrap(
    S[4].f('Optimization Cadence',               s5.opt_cadence) +
    S[4].f('A/B Testing — Creative',             s5.ab_creative) +
    S[4].f('A/B Testing — Copy &amp; Messaging', s5.ab_copy) +
    S[4].f('A/B Testing — Audience',             s5.ab_audience) +
    S[4].f('Statistical Significance',           s5.stat_sig) +
    S[4].f('Budget Reallocation Rules',          s5.budget_rules) +
    S[4].r2('Kill Criteria', s5.kill_criteria, 'Scale Criteria', s5.scale_criteria) +
    S[4].f('Landing Page Optimization', s5.lp_optimization) +
    S[4].f('Audience Refinement Plan',  s5.audience_refinement));

  const sec6 = S[5].wrap(
    S[5].p('Reporting Cadence', s6.reporting) +
    S[5].f('Report Recipients',   s6.report_recipients) +
    S[5].f('Reporting Dashboard', s6.dashboard_tool) +
    S[5].f('Success Definition',  s6.success_def) +
    S[5].r2('Attribution Model', s6.attribution_model, 'Post-Campaign Review Format', s6.retro_format) +
    S[5].f('ROI Calculation Method', s6.roi_method) +
    S[5].f('Strategic Questions',    s6.strategic_questions) +
    S[5].f('Learnings Template',     s6.learnings_template) +
    S[5].r2('Next Campaign Trigger', s6.next_cycle, 'Asset Archive Plan', s6.asset_archive));

  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#111;background:#fff;max-width:760px;margin:0;padding:32px 28px;">` +
    `<h1 style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-style:italic;font-weight:400;color:#111;margin:0 0 6px;">${name}</h1>` +
    `<p style="font-size:11px;color:#999;margin:0 0 ${meta?'10':'22'}px;font-family:Arial,sans-serif;">Campaign Brief — ${d}</p>` +
    (meta ? `<p style="font-size:12px;color:#555;margin:0 0 20px;font-family:Arial,sans-serif;">${meta}</p>` : '') +
    `<hr style="border:none;border-top:2px solid #e5e7eb;margin:0 0 26px;">` +
    sec1 + sec2 + sec3 + sec4 + sec5 + sec6 +
    `</body></html>`;
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

async function openInGoogleSheets(s1, s2, s3, s4, s5, s6) {
  const token    = await getGoogleToken();
  const campName = (s1.campaign_name || 'Campaign Brief').replace(/[^\w\s-]/g,'').trim() || 'Campaign Brief';
  const splitVal = s1.budget_split || '70';
  const splitLabel = splitVal + '% Media / ' + (100 - parseInt(splitVal)) + '% Production';
  const campDates  = (s1.start_date && s1.end_date) ? s1.start_date + ' → ' + s1.end_date : '';
  const genDate    = new Date().toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'});

  // Section palette — colors must use { red, green, blue } for Sheets API
  const SECS = [
    { num:'01', name:'Strategy & Planning',   color:{red:0.722,green:0.604,blue:0.961}, tint:{red:0.965,green:0.953,blue:0.996} },
    { num:'02', name:'Creative Development',  color:{red:0.439,green:0.647,blue:0.976}, tint:{red:0.933,green:0.957,blue:0.996} },
    { num:'03', name:'Pre-Launch Setup',      color:{red:0.239,green:0.847,blue:0.910}, tint:{red:0.910,green:0.980,blue:0.988} },
    { num:'04', name:'Launch & Activation',   color:{red:0.290,green:0.867,blue:0.584}, tint:{red:0.914,green:0.984,blue:0.949} },
    { num:'05', name:'Optimization',          color:{red:0.984,green:0.749,blue:0.314}, tint:{red:0.996,green:0.969,blue:0.918} },
    { num:'06', name:'Reporting & Iteration', color:{red:0.984,green:0.443,blue:0.522}, tint:{red:0.996,green:0.933,blue:0.941} },
  ];

  // ── 1. Create empty spreadsheet ──
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: campName, mimeType: 'application/vnd.google-apps.spreadsheet' })
  });
  if (!createRes.ok) throw new Error('Drive API error ' + createRes.status);
  const { id } = await createRes.json();

  // ── 2. Get default sheet ID ──
  const metaJson = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties`, {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(r => r.json());
  const defaultId = metaJson.sheets[0].properties.sheetId;

  // ── 3. Create all 7 tabs (Overview + 6 sections) ──
  const setupJson = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [
      { updateSheetProperties: { properties: { sheetId: defaultId, title: '📋 Overview' }, fields: 'title' } },
      ...SECS.map((s, i) => ({
        addSheet: { properties: { title: s.num + ' — ' + s.name, index: i + 1, tabColorStyle: { rgbColor: s.color } } }
      }))
    ]})
  }).then(r => r.json());

  const secIds   = setupJson.replies.filter(r => r.addSheet).map(r => r.addSheet.properties.sheetId);
  const tabNames = ['📋 Overview', ...SECS.map(s => s.num + ' — ' + s.name)];
  const sheetIds = [defaultId, ...secIds];

  // ── 4. Build tab data ──
  // Helper: collect field rows, skipping empty values and collapsing consecutive spacers
  function fr(...items) {
    const out = []; let wasSpacer = true;
    for (const item of items) {
      if (!item) { if (!wasSpacer) { out.push([]); wasSpacer = true; } }
      else {
        const v = item[1];
        if (v !== null && v !== undefined && String(v).trim() !== '') { out.push(item); wasSpacer = false; }
      }
    }
    while (out.length && out[out.length-1].length === 0) out.pop();
    return out;
  }
  const join = arr => (arr && arr.length) ? arr.join('  ·  ') : '';

  const tabData = [
    // ── Overview: fixed 15 rows for predictable formatting ──
    [
      [campName],
      ['Campaign Brief — ' + genDate],
      [],
      ['Objective', s1.campaign_objective || ''],
      ['Budget',    s1.budget             || ''],
      ['Dates',     campDates             || ''],
      ['Launch',    s4.launch_date        || ''],
      [],
      ['PHASE', 'SECTION', 'KEY SIGNAL'],
      ['01', 'Strategy & Planning',   s1.campaign_objective || ''],
      ['02', 'Creative Development',  s2.core_message       || ''],
      ['03', 'Pre-Launch Setup',      s3.go_nogo || s3.warmup_type || ''],
      ['04', 'Launch & Activation',   [s4.launch_date, s4.launch_time].filter(Boolean).join(' @ ')],
      ['05', 'Optimization',          s5.opt_cadence        || ''],
      ['06', 'Reporting & Iteration', s6.success_def        || ''],
    ],
    // ── 01 Strategy & Planning ──
    [ ['01 — Strategy & Planning'], [],
      ...fr(
        ['Campaign Objective', s1.campaign_objective], ['Objective Detail', s1.objective_detail], null,
        ['Target Audience', s1.target_audience], ['Audience Size', s1.audience_size], null,
        ['Total Budget', s1.budget], ['Budget Split', splitLabel], ['Campaign Dates', campDates], null,
        ['Channel Mix', join(s1.channels)], ['Primary KPIs', join(s1.kpis)], ['KPI Targets', s1.kpi_targets], null,
        ['Competitors to Watch', s1.competitors],
      )],
    // ── 02 Creative Development ──
    [ ['02 — Creative Development'], [],
      ...fr(
        ['Core Campaign Message', s2.core_message], ['Value Proposition', s2.value_prop], ['Pain Points Addressed', s2.pain_points], null,
        ['Tone of Voice', join(s2.tone)], ['Headline Directions', s2.headlines], null,
        ['Primary CTA',   s2.cta_text   ? s2.cta_text   + (s2.cta_url   ? '  →  ' + s2.cta_url   : '') : null],
        ['Secondary CTA', s2.cta2_text  ? s2.cta2_text  + (s2.cta2_url  ? '  →  ' + s2.cta2_url  : '') : null], null,
        ['Assets to Produce', join(s2.assets)], ['Visual Style Direction', s2.visual_style], ['Content Restrictions', s2.restrictions],
      )],
    // ── 03 Pre-Launch Setup ──
    [ ['03 — Pre-Launch Setup'], [],
      ...fr(
        ['Tracking Stack', join(s3.tracking)], ['Conversion Events', s3.conversion_events], null,
        ['UTM Source Format', s3.utm_source], ['UTM Medium Format', s3.utm_medium], ['UTM Campaign Naming', s3.utm_campaign], null,
        ['QA Checklist', join(s3.qa)], null,
        ['Stakeholder Briefing Plan', s3.stakeholder_plan], ['Warm-Up Strategy', s3.warmup_type], ['Warm-Up Details', s3.warmup_details], null,
        ['Go / No-Go Criteria', s3.go_nogo],
      )],
    // ── 04 Launch & Activation ──
    [ ['04 — Launch & Activation'], [],
      ...fr(
        ['Launch Date', s4.launch_date], ['Launch Time', s4.launch_time], null,
        ['Channel Activation Order', s4.channel_order], ['Paid Media Plan', s4.paid_plan],
        ['Organic Content Plan', s4.organic_plan], ['Email Launch Sequence', s4.email_plan],
        ['PR & Earned Media Plan', s4.pr_plan], null,
        ['Team & Channel Owners', s4.team_owners], ['Monitoring Plan (First 72 hrs)', s4.monitoring_plan],
        ['Early Signal Thresholds', s4.early_signals], ['Escalation Path', s4.escalation],
      )],
    // ── 05 Optimization Framework ──
    [ ['05 — Optimization Framework'], [],
      ...fr(
        ['Optimization Cadence', s5.opt_cadence], null,
        ['A/B Testing — Creative', s5.ab_creative], ['A/B Testing — Copy & Messaging', s5.ab_copy],
        ['A/B Testing — Audience', s5.ab_audience], ['Statistical Significance', s5.stat_sig], null,
        ['Budget Reallocation Rules', s5.budget_rules], ['Kill Criteria', s5.kill_criteria], ['Scale Criteria', s5.scale_criteria], null,
        ['Landing Page Optimization', s5.lp_optimization], ['Audience Refinement Plan', s5.audience_refinement],
      )],
    // ── 06 Reporting & Iteration ──
    [ ['06 — Reporting & Iteration'], [],
      ...fr(
        ['Reporting Cadence', join(s6.reporting)], ['Report Recipients', s6.report_recipients], ['Reporting Dashboard', s6.dashboard_tool], null,
        ['Success Definition', s6.success_def], ['Attribution Model', s6.attribution_model], ['ROI Calculation Method', s6.roi_method], null,
        ['Post-Campaign Review Format', s6.retro_format], ['Strategic Questions', s6.strategic_questions],
        ['Learnings Template', s6.learnings_template], null,
        ['Next Campaign Trigger', s6.next_cycle], ['Asset Archive Plan', s6.asset_archive],
      )],
  ];

  // ── 5. Populate all tabs ──
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: tabData.map((rows, i) => ({
        range: "'" + tabNames[i] + "'!A1",
        values: rows.map(r => r.length === 0 ? [''] : r)
      }))
    })
  });

  // ── 6. Format all tabs ──
  const DARK = { red:0.118, green:0.161, blue:0.231 };
  const WHITE = { rgbColor: { red:1, green:1, blue:1 } };
  const fmt = [];

  // Overview formatting
  const ov = defaultId;
  fmt.push(
    { mergeCells: { range: { sheetId:ov, startRowIndex:0, endRowIndex:1, startColumnIndex:0, endColumnIndex:3 }, mergeType:'MERGE_ALL' } },
    { repeatCell: { range: { sheetId:ov, startRowIndex:0, endRowIndex:1 }, cell: { userEnteredFormat: { textFormat: { bold:true, fontSize:16 } } }, fields:'userEnteredFormat.textFormat' } },
    { mergeCells: { range: { sheetId:ov, startRowIndex:1, endRowIndex:2, startColumnIndex:0, endColumnIndex:3 }, mergeType:'MERGE_ALL' } },
    { repeatCell: { range: { sheetId:ov, startRowIndex:1, endRowIndex:2 }, cell: { userEnteredFormat: { textFormat: { foregroundColorStyle: { rgbColor: { red:0.6, green:0.6, blue:0.6 } } } } }, fields:'userEnteredFormat.textFormat' } },
    // Meta labels (rows 3-6) col A: bold
    { repeatCell: { range: { sheetId:ov, startRowIndex:3, endRowIndex:7, startColumnIndex:0, endColumnIndex:1 }, cell: { userEnteredFormat: { textFormat: { bold:true } } }, fields:'userEnteredFormat.textFormat' } },
    // Timeline header row 8: dark bg, white bold
    { repeatCell: { range: { sheetId:ov, startRowIndex:8, endRowIndex:9 }, cell: { userEnteredFormat: { textFormat: { bold:true, foregroundColorStyle: WHITE }, backgroundColor: DARK } }, fields:'userEnteredFormat(textFormat,backgroundColor)' } },
    // Section rows 9-14: tinted backgrounds
    ...SECS.map((s, i) => ({ repeatCell: { range: { sheetId:ov, startRowIndex:9+i, endRowIndex:10+i }, cell: { userEnteredFormat: { backgroundColor: s.tint } }, fields:'userEnteredFormat.backgroundColor' } })),
    // Phase number (col A, rows 9-14): bold + section color
    ...SECS.map((s, i) => ({ repeatCell: { range: { sheetId:ov, startRowIndex:9+i, endRowIndex:10+i, startColumnIndex:0, endColumnIndex:1 }, cell: { userEnteredFormat: { textFormat: { bold:true, foregroundColorStyle: { rgbColor: s.color } } } }, fields:'userEnteredFormat.textFormat' } })),
    // Col C (key signal): wrap
    { repeatCell: { range: { sheetId:ov, startRowIndex:0, endRowIndex:200, startColumnIndex:2, endColumnIndex:3 }, cell: { userEnteredFormat: { wrapStrategy:'WRAP', verticalAlignment:'TOP' } }, fields:'userEnteredFormat(wrapStrategy,verticalAlignment)' } },
    // Overview column widths: A=60, B=220, C=480
    { updateDimensionProperties: { range: { sheetId:ov, dimension:'COLUMNS', startIndex:0, endIndex:1 }, properties:{ pixelSize:60  }, fields:'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId:ov, dimension:'COLUMNS', startIndex:1, endIndex:2 }, properties:{ pixelSize:220 }, fields:'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId:ov, dimension:'COLUMNS', startIndex:2, endIndex:3 }, properties:{ pixelSize:480 }, fields:'pixelSize' } },
  );

  // Section tab formatting
  SECS.forEach((s, i) => {
    const sid = secIds[i];
    fmt.push(
      // Row 0: merge A:B, tint bg, bold section-colored title
      { mergeCells: { range: { sheetId:sid, startRowIndex:0, endRowIndex:1, startColumnIndex:0, endColumnIndex:2 }, mergeType:'MERGE_ALL' } },
      { repeatCell: { range: { sheetId:sid, startRowIndex:0, endRowIndex:1 }, cell: { userEnteredFormat: { textFormat: { bold:true, fontSize:14, foregroundColorStyle: { rgbColor: s.color } }, backgroundColor: s.tint } }, fields:'userEnteredFormat(textFormat,backgroundColor)' } },
      // Col A (rows 2+): bold, section color, small font
      { repeatCell: { range: { sheetId:sid, startRowIndex:2, endRowIndex:500, startColumnIndex:0, endColumnIndex:1 }, cell: { userEnteredFormat: { textFormat: { bold:true, fontSize:9, foregroundColorStyle: { rgbColor: s.color } }, verticalAlignment:'TOP' } }, fields:'userEnteredFormat(textFormat,verticalAlignment)' } },
      // Col B: wrap, top-align
      { repeatCell: { range: { sheetId:sid, startRowIndex:0, endRowIndex:500, startColumnIndex:1, endColumnIndex:2 }, cell: { userEnteredFormat: { wrapStrategy:'WRAP', verticalAlignment:'TOP' } }, fields:'userEnteredFormat(wrapStrategy,verticalAlignment)' } },
      // Column widths: A=220, B=500
      { updateDimensionProperties: { range: { sheetId:sid, dimension:'COLUMNS', startIndex:0, endIndex:1 }, properties:{ pixelSize:220 }, fields:'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId:sid, dimension:'COLUMNS', startIndex:1, endIndex:2 }, properties:{ pixelSize:500 }, fields:'pixelSize' } },
    );
  });

  const fmtRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: fmt })
  });
  if (!fmtRes.ok) console.warn('Sheets format failed:', (await fmtRes.json().catch(()=>({}))).error?.message);

  window.open(`https://docs.google.com/spreadsheets/d/${id}/edit`, '_blank');
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
