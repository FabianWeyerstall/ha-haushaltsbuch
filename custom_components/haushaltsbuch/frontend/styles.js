/* Haushaltsbuch panel – Styles of the panel (shadow DOM).
 * Split out of haushaltsbuch-panel.js; plain ES module without build step.
 */
const STYLES = `
  :host { --viz-1: #2a78d6; --viz-2: #eb6834; --viz-3: #1baf7a; --viz-4: #eda100; --viz-5: #e87ba4; --viz-6: #6250d6; --viz-other: #9e9d98; }
  :host(.dark) { --viz-1: #3987e5; --viz-2: #d95926; --viz-3: #199e70; --viz-4: #c98500; --viz-5: #d55181; --viz-6: #9085e9; --viz-other: #6e6d68; }
  :host { display: block; min-height: 100vh; background: var(--primary-background-color); color: var(--primary-text-color); font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif); }
  * { box-sizing: border-box; }
  .toolbar { display: flex; align-items: center; gap: 8px; height: var(--header-height, 56px); padding: 0 12px; background: var(--app-header-background-color, var(--primary-color)); color: var(--app-header-text-color, #fff); }
  .title { flex: 1; font-size: 20px; white-space: nowrap; }
  .title-short { display: none; }
  @media (max-width: 520px) { .title-long { display: none; } .title-short { display: inline; } }
  .scope { max-width: 50vw; background: rgba(255,255,255,0.15); color: inherit; border: 1px solid rgba(255,255,255,0.4); border-radius: 6px; padding: 6px 8px; font-size: 14px; }
  /* Native dropdown lists: the browser draws them with its own (often white) background, but
     options inherit the theme's text colour. With a dark HA theme that gave light grey on white. */
  select option, select optgroup { color: var(--primary-text-color); background-color: var(--card-background-color, var(--primary-background-color)); }
  select option:disabled { color: var(--secondary-text-color); }
  .tabs { display: flex; gap: 4px; overflow-x: auto; padding: 0 8px; background: var(--app-header-background-color, var(--primary-color)); }
  .tab { display: flex; align-items: center; gap: 6px; background: none; border: none; border-bottom: 3px solid transparent; color: var(--app-header-text-color, #fff); opacity: 0.75; padding: 10px 12px; font-size: 14px; cursor: pointer; white-space: nowrap; border-radius: 0; }
  .tab.active { opacity: 1; border-bottom-color: var(--app-header-text-color, #fff); }
  .content { max-width: 900px; margin: 0 auto; padding: 16px; }
  .card { background: var(--card-background-color); border-radius: var(--ha-card-border-radius, 12px); box-shadow: var(--ha-card-box-shadow, 0 1px 3px rgba(0,0,0,0.12)); border: var(--ha-card-border-width, 1px) solid var(--divider-color, transparent); padding: 16px; margin-bottom: 16px; }
  h2 { margin: 0 0 12px; font-size: 20px; font-weight: 500; }
  h3 { margin: 0; font-size: 16px; font-weight: 500; }
  .hint { color: var(--secondary-text-color); font-size: 13px; margin: 8px 0; }
  .label { color: var(--secondary-text-color); font-size: 12px; }
  .big { font-size: 22px; font-weight: 500; }
  .sub { color: var(--secondary-text-color); font-size: 12px; }
  .neg { color: var(--error-color, #db4437); }
  .pos { color: var(--success-color, #43a047); }
  .kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 20px; }
  @media (min-width: 700px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .kpi-value { font-size: 22px; font-weight: 500; margin: 2px 0; }
  .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
  .split { display: flex; gap: 2px; height: 8px; margin: 12px 0 8px; }
  .split span { border-radius: 4px; min-width: 2px; }
  .split-list { display: flex; flex-direction: column; }
  .split-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--divider-color); }
  .split-row:last-child { border-bottom: none; }
  .split-name { flex: 1; font-size: 14px; }
  .split-name small, .split-value small { display: block; color: var(--secondary-text-color); font-size: 12px; }
  .split-value { text-align: right; font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; }
  .split-value small { font-weight: 400; }
  .s1 { background: var(--viz-1); } .s2 { background: var(--viz-2); } .s3 { background: var(--viz-3); }
  .c-sure { background: var(--success-color, #43a047); } .c-likely { background: var(--warning-color, #ffa000); } .c-unsure { background: var(--secondary-text-color, #888); opacity: 0.6; }
  .help { position: relative; display: inline-flex; align-items: center; justify-content: center; margin-left: 6px; width: 18px; height: 18px; font-size: 13px; font-weight: 400; color: var(--secondary-text-color); cursor: help; border-radius: 50%; vertical-align: 1px; }
  .help:hover, .help:focus { color: var(--primary-color); outline: none; }
  .help-tip { position: fixed; z-index: 20; max-width: min(300px, calc(100vw - 16px)); background: var(--card-background-color, #fff); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,.2); padding: 8px 10px; font-size: 12px; line-height: 1.45; pointer-events: none; }
  .split-row.clickable, .cat-row.clickable { cursor: pointer; border-radius: 6px; }
  .split-row.clickable:hover, .cat-row.clickable:hover { background: var(--secondary-background-color, rgba(0,0,0,.04)); }
  .split-row.open, .cat-row.open { background: var(--secondary-background-color, rgba(0,0,0,.04)); }
  .split-row { padding-left: 4px; padding-right: 4px; }
  .chevron { color: var(--secondary-text-color); width: 12px; text-align: center; }
  .split span[data-action], .pie svg [data-action] { cursor: pointer; }
  .split span.active { outline: 2px solid var(--primary-text-color); outline-offset: 1px; }
  .pie svg .active { stroke: var(--primary-text-color); stroke-width: 3; }
  .details { margin: 4px 0 8px 22px; padding-left: 10px; border-left: 2px solid var(--divider-color); }
  .details .hint { margin: 4px 0; }
  .detail-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; cursor: pointer; }
  .detail-row:hover .detail-name { color: var(--primary-color); }
  .detail-icon { display: inline-flex; color: var(--primary-color); }
  .detail-name { flex: 1; font-size: 13px; }
  .detail-name small, .detail-value small { display: block; color: var(--secondary-text-color); font-size: 11px; }
  .detail-value { text-align: right; font-size: 13px; font-variant-numeric: tabular-nums; }
  .pie-wrap { display: flex; flex-wrap: wrap; align-items: center; gap: 16px 28px; margin-top: 8px; }
  .pie-wrap .income-share { flex-basis: 100%; margin: 0; text-align: center; }
  .pie { position: relative; width: 180px; height: 180px; margin: 0 auto; flex-shrink: 0; }
  .pie svg path, .pie svg circle { stroke: var(--card-background-color, #fff); stroke-width: 2; stroke-linejoin: round; }
  .pie svg circle { stroke: currentColor; }
  .pie-center { position: absolute; inset: 0; pointer-events: none; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 15px; font-weight: 500; text-align: center; }
  .pie-center small { font-size: 11px; font-weight: 400; color: var(--secondary-text-color); }
  .pie-list { flex: 1; min-width: 220px; }
  path.p1 { fill: var(--viz-1); } path.p2 { fill: var(--viz-2); } path.p3 { fill: var(--viz-3); } path.p4 { fill: var(--viz-4); } path.p5 { fill: var(--viz-5); } path.p-other { fill: var(--viz-other); }
  circle.p1 { color: var(--viz-1); } circle.p2 { color: var(--viz-2); } circle.p3 { color: var(--viz-3); } circle.p4 { color: var(--viz-4); } circle.p5 { color: var(--viz-5); } circle.p-other { color: var(--viz-other); }
  .swatch.p1 { background: var(--viz-1); } .swatch.p2 { background: var(--viz-2); } .swatch.p3 { background: var(--viz-3); } .swatch.p4 { background: var(--viz-4); } .swatch.p5 { background: var(--viz-5); } .swatch.p-other { background: var(--viz-other); }
  .cat-icon { display: inline-flex; vertical-align: -3px; margin-right: 6px; color: var(--primary-color); }
  .balance { display: flex; flex-wrap: wrap; align-items: center; gap: 24px; }
  .balance > button { margin-left: auto; }
  .totals { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 12px; }
  /* Posten: figures in columns (two on the phone, up to four when there is room), so they line up. */
  .totals.four { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px 24px; }
  .row-between { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .day { margin-top: 12px; }
  .day-head { display: flex; justify-content: space-between; font-size: 13px; font-weight: 500; color: var(--secondary-text-color); padding: 6px 0; border-bottom: 1px solid var(--divider-color); }
  .day-balance { font-variant-numeric: tabular-nums; }
  .pending-date { font-size: 12px; color: var(--secondary-text-color); margin-top: 8px; }
  .entry { display: flex; align-items: center; gap: 12px; padding: 10px 4px; cursor: pointer; border-radius: 8px; flex-wrap: wrap; }
  .entry:hover { background: var(--secondary-background-color); }
  .entry.budget-row { opacity: 0.8; }
  .budgets h3 .period, .budgets h3 small { font-size: 12px; color: var(--secondary-text-color); font-weight: 400; margin-left: 4px; }
  .budget-block { border-top: 1px solid var(--divider-color); padding: 10px 0 4px; }
  .budgets .row-between + .budget-block { border-top: none; }
  .budget-sub { font-size: 12px; color: var(--secondary-text-color); margin-top: 2px; }
  .budget-sub.neg { color: var(--error-color, #db4437); }
  .budget-sub .chev { font-size: 10px; }
  .budget-line { display: flex; gap: 12px; align-items: flex-start; }
  .budget-line[data-action] { cursor: pointer; }
  .budget-main { flex: 1; min-width: 0; }
  .budget-head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
  .budget-figures { font-size: 14px; white-space: nowrap; }
  .budget-bar { position: relative; height: 10px; margin: 6px 0 4px; background: var(--secondary-background-color); border-radius: 5px; overflow: hidden; }
  .budget-bar span { display: block; height: 100%; background: var(--success-color, #43a047); border-radius: 5px; }
  .budget-bar.ahead span { background: var(--warning-color, #ffa600); }
  .budget-bar.over span { background: var(--error-color, #db4437); }
  .budget-bar i { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--primary-text-color); opacity: 0.45; }
  .spendings { margin: 6px 0 6px 48px; }
  .spending { cursor: pointer; display: flex; gap: 10px; align-items: center; padding: 4px 0; font-size: 14px; border-bottom: 1px dashed var(--divider-color); }
  .spending-date { color: var(--secondary-text-color); min-width: 44px; }
  .spending-note { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .spending-amount { white-space: nowrap; }
  .spendings > button { margin-top: 8px; }
  .icon-button.small-x { width: 28px; height: 28px; font-size: 13px; padding: 0; }
  .budget-in-form { background: var(--secondary-background-color); border-radius: 8px; padding: 8px 12px 10px; margin-bottom: 12px; }
  .budget-in-form .budget-block { border: none; padding-top: 0; }
  .entry.budget-row:not([data-action]) { cursor: default; }
  .entry.budget-row .entry-name { font-style: italic; }
  .entry-icon { width: 40px; height: 40px; border-radius: 50%; background: var(--secondary-background-color); display: flex; align-items: center; justify-content: center; color: var(--primary-color); flex-shrink: 0; }
  .entry-main { flex: 1; min-width: 0; }
  .entry-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .entry-meta { font-size: 12px; color: var(--secondary-text-color); display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 2px; }
  .entry-amount { font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .entry-actions { display: flex; gap: 6px; width: 100%; justify-content: flex-end; }
  .skipped-row { opacity: 0.5; text-decoration: line-through; }
  .owner { background: var(--secondary-background-color); border-radius: 10px; padding: 1px 8px; }
  .chip { border: 1px solid var(--chip); color: var(--chip); border-radius: 10px; padding: 0 8px; font-size: 11px; line-height: 18px; }
  .chip.booked { --chip: var(--success-color, #43a047); }
  .chip.skipped { --chip: var(--secondary-text-color); }
  .chip.shared { --chip: var(--primary-color); }
  .day.past { opacity: 0.6; }
  .special-settings { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 4px 0 12px; font-size: 13px; }
  .special-settings select { width: auto; flex: 1 1 180px; padding: 4px 8px; font-size: 13px; }
  .inline-amount { flex-direction: row; align-items: center; gap: 6px; color: var(--primary-text-color); }
  .inline-amount input { width: 80px; padding: 4px 8px; font-size: 13px; }
  .chip.budget { --chip: var(--info-color, #039be5); }
  .chip.contract { --chip: var(--primary-color); }
  .chip.contract.urgent { --chip: var(--error-color, #db4437); }
  .price-note { display: block; font-size: 11px; font-weight: 400; color: var(--secondary-text-color); }
  .price-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; align-items: end; margin-bottom: 8px; }
  .unit { align-self: center; font-size: 14px; color: var(--primary-text-color); }
  .deadline { text-align: right; font-size: 13px; font-weight: 500; color: var(--primary-color); white-space: nowrap; }
  .deadline small { display: block; font-weight: 400; color: var(--secondary-text-color); }
  .deadline.urgent { color: var(--error-color, #db4437); }
  .search { margin-top: 12px; }
  [hidden] { display: none !important; }
  .cat-row { display: grid; grid-template-columns: minmax(0, 40%) 1fr 92px; gap: 10px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--divider-color); }
  .cat-name { font-size: 14px; overflow: hidden; }
  .cat-name small, .cat-sum small { display: block; font-size: 11px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cat-bar { height: 10px; background: var(--secondary-background-color); border-radius: 5px; overflow: hidden; }
  .cat-bar span { display: block; height: 100%; background: var(--error-color, #db4437); opacity: 0.75; border-radius: 5px; }
  .cat-sum { text-align: right; font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .chip.special { --chip: var(--warning-color, #ffa600); background: var(--chip); color: #000; border: none; }
  .month-specials { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; padding-left: 64px; }
  .special-pill { display: inline-flex; align-items: center; gap: 4px; background: rgba(255, 166, 0, 0.18); border-left: 3px solid var(--warning-color, #ffa600); color: var(--primary-text-color); border-radius: 6px; padding: 1px 8px 1px 6px; font-size: 12px; line-height: 20px; }
  .special-pill b { font-weight: 500; color: var(--error-color, #db4437); font-variant-numeric: tabular-nums; }
  .special-pill.income b { color: var(--success-color, #43a047); }
  .special-pill ha-icon { color: var(--warning-color, #ffa600); }
  .special-pill.inline { padding: 0 6px; }
  .month-section { display: flex; justify-content: space-between; font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; color: var(--secondary-text-color); padding: 12px 4px 0; }
  .month-section.special { color: var(--warning-color, #c77c00); }
  .chip.planned { --chip: var(--success-color, #43a047); background: var(--chip); color: var(--text-primary-color, #fff); }
  .inline-fields { display: flex; gap: 8px; }
  .inline-fields input { width: 80px; flex: none; }
  .icon-fallback { display: inline-block; width: calc(var(--size) * 0.5); height: calc(var(--size) * 0.5); border-radius: 50%; background: var(--primary-color); opacity: 0.5; }
  .empty { color: var(--secondary-text-color); text-align: center; padding: 24px 8px; }
  .error { background: var(--error-color, #db4437); color: #fff; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; }
  button { font: inherit; font-size: 14px; border: none; border-radius: 8px; padding: 8px 14px; background: var(--primary-color); color: var(--text-primary-color, #fff); cursor: pointer; }
  button.secondary { background: var(--secondary-background-color); color: var(--primary-text-color); }
  button.danger { background: none; color: var(--error-color, #db4437); }
  button.small { padding: 4px 10px; font-size: 12px; }
  .icon-button { background: none; color: var(--primary-text-color); font-size: 22px; padding: 4px 12px; }
  .segmented { display: flex; background: var(--secondary-background-color); border-radius: 8px; padding: 2px; }
  .segmented button { background: none; color: var(--primary-text-color); padding: 4px 10px; font-size: 13px; }
  .segmented button.active { background: var(--card-background-color); box-shadow: 0 1px 2px rgba(0,0,0,0.15); }
  .cal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; margin-top: 12px; }
  .cal-head { text-align: center; font-size: 12px; color: var(--secondary-text-color); padding: 4px 0; }
  .cal-cell { min-height: 72px; background: var(--secondary-background-color); color: var(--primary-text-color); border-radius: 8px; padding: 4px; display: flex; flex-direction: column; align-items: stretch; gap: 2px; text-align: left; border: 2px solid transparent; }
  .cal-cell.blank { background: none; }
  .cal-cell.today { border-color: var(--primary-color); }
  .cal-cell.selected { background: var(--primary-color); color: var(--text-primary-color, #fff); }
  .cal-cell.selected .neg, .cal-cell.selected .pos { color: inherit; }
  .cal-day { font-size: 12px; font-weight: 500; }
  .cal-icons { display: flex; flex-wrap: wrap; gap: 1px; color: var(--primary-color); }
  .cal-cell.selected .cal-icons { color: inherit; }
  .more { font-size: 10px; }
  .cal-sum { font-size: 10px; margin-top: auto; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .months { margin-top: 12px; }
  .month-block { border-bottom: 1px solid var(--divider-color); }
  .month-row { display: grid; grid-template-columns: 56px 1fr 96px; gap: 8px; align-items: center; padding: 8px 0; width: 100%; background: none; color: var(--primary-text-color); border-radius: 0; text-align: left; }
  .month-row:hover, .month-row.open { background: var(--secondary-background-color); }
  .month-entries { padding: 0 4px 8px; }
  .month-name { font-size: 13px; }
  .month-name small { display: block; font-size: 10px; color: var(--secondary-text-color); white-space: nowrap; }
  .bar-line { display: flex; align-items: center; height: 16px; gap: 0; }
  .bar { height: 10px; display: inline-block; }
  .bar:first-child { border-radius: 4px 0 0 4px; }
  .pos-bg { background: var(--success-color, #43a047); }
  .neg-bg { background: var(--error-color, #db4437); }
  .light { opacity: 0.35; }
  .bar-value { font-size: 11px; color: var(--secondary-text-color); margin-left: 6px; white-space: nowrap; }
  .month-net { text-align: right; font-weight: 500; font-size: 13px; font-variant-numeric: tabular-nums; }
  .switch-row { display: flex; gap: 10px; align-items: flex-start; margin-top: 12px; font-size: 14px; }
  .switch-row small { color: var(--secondary-text-color); }
  .actions { display: flex; gap: 6px; }
  .row-actions { display: flex; gap: 8px; margin-top: 8px; }
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 10; padding: 16px; }
  .dialog { background: var(--card-background-color); color: var(--primary-text-color); border-radius: 16px; padding: 20px; width: 100%; max-width: 560px; max-height: calc(100vh - 32px); overflow-y: auto; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0; }
  .grid .full { grid-column: 1 / -1; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--secondary-text-color); }
  label.check { flex-direction: row; align-items: center; gap: 8px; color: var(--primary-text-color); font-size: 14px; padding: 4px 0; }
  input, select, textarea { font: inherit; font-size: 15px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--divider-color, #ccc); background: var(--input-fill-color, var(--secondary-background-color)); color: var(--primary-text-color); width: 100%; }
  input[type=checkbox], input[type=radio] { width: auto; flex-shrink: 0; }
  label.check.option { align-items: flex-start; }
  .csv-list { display: flex; flex-direction: column; gap: 2px; margin: 8px 0 12px; }
  .csv-row { display: flex; flex-direction: row; text-align: left; align-items: center; gap: 10px; padding: 8px 4px; border-radius: 8px; cursor: pointer; }
  .csv-row:hover { background: var(--secondary-background-color); }
  .csv-row > input[type="checkbox"] { width: 18px; height: 18px; flex-shrink: 0; margin: 0; }
  .csv-row .entry-main { flex: 1; min-width: 0; }
  .csv-row .entry-meta { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; }
  .csv-row.is-existing .entry-main, .csv-row.is-existing .entry-amount { opacity: 0.6; }
  input.csv-name { border: 1px solid transparent; background: transparent; padding: 2px 4px; margin-left: -5px; font: inherit; font-weight: 500; color: var(--primary-text-color); width: 100%; border-radius: 6px; box-sizing: border-box; }
  input.csv-name:hover, input.csv-name:focus { border-color: var(--divider-color); background: var(--card-background-color); }
  .csv-sub { margin: 16px 0 0; }
  .stats-head { flex-wrap: wrap; gap: 8px; }
  .backup-list { display: flex; flex-direction: column; margin: 8px 0; }
  .backup-row { display: flex; align-items: center; gap: 12px; padding: 8px 4px; border-top: 1px solid var(--divider-color); flex-wrap: wrap; }
  .backup-row .entry-main { flex: 1; min-width: 180px; }
  .backup-actions { display: flex; gap: 6px; }
  .stats-filters { display: flex; gap: 8px; }
  .stats-filters select { width: auto; padding: 4px 8px; font-size: 14px; }
  .delta { font-size: 12px; font-weight: 500; color: var(--secondary-text-color); }
  .delta.pos { color: var(--success-color, #43a047); }
  .delta.neg { color: var(--error-color, #db4437); }
  .stats-columns { display: flex; gap: 6px; align-items: flex-end; height: 170px; margin-top: 8px; }
  .stats-col { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; background: none; border: none; padding: 0; cursor: pointer; color: var(--secondary-text-color); font: inherit; }
  .stats-col[disabled] { cursor: default; }
  .stats-col.dim { opacity: 0.4; }
  .stats-col.active .stats-col-label { color: var(--primary-color); font-weight: 600; }
  .insight .insight-list { display: flex; flex-direction: column; }
  .insight-row { display: flex; gap: 12px; align-items: flex-start; padding: 10px 0; border-top: 1px solid var(--divider-color); }
  .insight-row .entry-main { flex: 1; min-width: 0; }
  .insight-row .entry-meta.plain { display: block; }
  .insight-price summary .entry-name { color: var(--primary-text-color); }
  .insight-change { color: var(--primary-text-color); }
  .insight-actions { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
  .insight-badge { font-size: 13px; color: var(--secondary-text-color); white-space: nowrap; }
  .insight-badge.neg { color: var(--error-color, #db4437); }
  .insight-badge.pos { color: var(--success-color, #43a047); }
  .insight-price { border-top: 1px solid var(--divider-color); padding: 8px 0; }
  .insight-price summary { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; cursor: pointer; list-style: none; }
  .insight-price summary::-webkit-details-marker { display: none; }
  .insight-price .entry-name { flex: 1 1 140px; }
  .insight-change { font-size: 13px; white-space: nowrap; }
  .insight-steps { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; color: var(--secondary-text-color); padding-top: 4px; }
  .stats-columns.season { height: 120px; }
  .bar-out.hot { opacity: 1; }
  .insight-tip { background: var(--secondary-background-color); border-radius: 8px; padding: 8px 12px; }
  .stats-sub.static { cursor: default; margin: 0; width: auto; padding: 4px 0; border-top: 1px solid var(--divider-color); }
  .stats-sub.static.total { font-weight: 600; border-top: none; }
  .stats-sub.static:hover { background: none; }
  .assign-line { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
  .assign-line > span { min-width: 0; }
  .assign-chip { flex-shrink: 0; background: none; border: 1px dashed var(--divider-color); border-radius: 10px; padding: 1px 8px; font: inherit; font-size: 11px; color: var(--secondary-text-color); cursor: pointer; }
  .assign-chip.set { border-style: solid; border-color: var(--primary-color); color: var(--primary-color); }
  .assign-row { margin: 0 0 12px; }
  .stats-month { list-style: none; margin: 0; padding: 0; font-size: 13px; color: var(--secondary-text-color); }
  .stats-month li { padding: 6px 0; border-top: 1px solid var(--divider-color); }
  .stats-month .csv-detail-head .entry-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
  .stats-month b.pos { color: var(--success-color, #43a047); }
  .stats-bars { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 2px; }
  .stats-bars span { width: 40%; max-width: 22px; border-radius: 3px 3px 0 0; min-height: 1px; }
  .bar-in, .legend.in { background: var(--success-color, #43a047); }
  .bar-out, .legend.out { background: var(--error-color, #db4437); opacity: 0.8; }
  .stats-col-label { font-size: 11px; }
  .legend { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin: 0 4px 0 8px; vertical-align: middle; }
  .legend.in { margin-left: 0; }
  .stats-cat { border-top: 1px solid var(--divider-color); }
  .stats-cat-row { display: flex; align-items: center; gap: 12px; padding: 10px 4px; cursor: pointer; }
  .stats-cat-main { flex: 1; min-width: 0; }
  .stats-cat-main .bar-line { margin-top: 4px; }
  .neg-bar { background: var(--error-color, #db4437); opacity: 0.7; border-radius: 3px; }
  .stats-cat-side { width: 200px; text-align: right; font-size: 12px; color: var(--secondary-text-color); }
  .stats-trend { display: block; }
  .stats-detail { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 0 4px 12px; }
  .stats-detail h4 { margin: 0 0 4px; font-size: 13px; color: var(--secondary-text-color); font-weight: 500; }
  .stats-sub { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; padding: 3px 4px; margin: 0 -4px; width: calc(100% + 8px); background: none; border: none; border-radius: 4px; color: inherit; font-family: inherit; text-align: left; cursor: pointer; }
  .stats-sub:hover { background: var(--secondary-background-color); }
  .stats-sub.active { background: var(--secondary-background-color); color: var(--primary-color); }
  .stats-bookings { padding: 0 4px 12px; font-size: 12px; color: var(--secondary-text-color); }
  .stats-bookings h4 { margin: 0; font-size: 13px; color: var(--primary-text-color); font-weight: 500; }
  .stats-bookings ul { list-style: none; margin: 4px 0 0; padding: 0; }
  .stats-bookings li { padding: 4px 0; border-top: 1px solid var(--divider-color); }
  .stats-bookings .csv-detail-head .what { margin-left: auto; color: var(--secondary-text-color); }
  button.link { background: none; border: none; padding: 4px 0; color: var(--primary-color); cursor: pointer; font: inherit; }
  .csv-map-table { overflow-x: auto; margin: 8px 0 12px; border: 1px solid var(--divider-color); border-radius: 8px; }
  .csv-map-table table { border-collapse: collapse; font-size: 12px; white-space: nowrap; }
  .csv-map-table th, .csv-map-table td { padding: 4px 8px; text-align: left; border-bottom: 1px solid var(--divider-color); }
  .csv-map-table th { background: var(--secondary-background-color); font-weight: 600; }
  .csv-map-fields label { font-size: 13px; }
  .csv-map-table th.on, .csv-map-table td.on { background: color-mix(in srgb, var(--primary-color) 10%, transparent); }
  .csv-col-tag { display: inline-block; font-size: 11px; font-weight: 600; color: var(--primary-color); }
  .csv-col-tag.off { color: var(--secondary-text-color); font-weight: 400; }
  .csv-check { font-size: 12px; }
  .csv-check.ok { color: var(--success-color, #43a047); }
  .csv-check.warn { color: var(--warning-color, #e68a00); }
  .csv-map-field { display: flex; flex-direction: column; gap: 2px; }
  .csv-map-label { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
  .csv-need { font-size: 11px; border-radius: 6px; padding: 0 6px; background: var(--secondary-background-color); color: var(--secondary-text-color); }
  .csv-need.must, .csv-need.one { background: color-mix(in srgb, var(--error-color, #db4437) 14%, transparent); color: var(--error-color, #db4437); }
  .csv-need.good { background: color-mix(in srgb, var(--primary-color) 14%, transparent); color: var(--primary-color); }
  .csv-map-example { font-size: 12px; color: var(--secondary-text-color); }
  .csv-map-value { font-size: 12px; color: var(--primary-text-color); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .csv-map-test { list-style: none; padding: 0; margin: 0; font-size: 13px; }
  .csv-map-test li { display: grid; grid-template-columns: 80px minmax(0, 1fr) auto; gap: 8px; padding: 4px 0; border-top: 1px solid var(--divider-color); }
  .csv-map-test li span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Statistics */
  .st-top { display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 10px; }
  .st-pills { display: inline-flex; background: var(--secondary-background-color); border-radius: 999px; padding: 3px; }
  .st-pills button { font: inherit; font-size: 13px; font-weight: 500; padding: 6px 14px; border: none; border-radius: 999px; background: none; color: var(--secondary-text-color); cursor: pointer; }
  .st-pills button.on { background: var(--card-background-color); color: var(--primary-text-color); box-shadow: 0 1px 3px rgba(0,0,0,0.15); }
  .st-nav { display: flex; align-items: center; gap: 8px; font-size: 17px; font-weight: 600; }
  .st-arrow { width: 32px; height: 32px; border-radius: 50%; border: none; display: grid; place-items: center; background: var(--secondary-background-color); color: var(--primary-text-color); font-size: 18px; line-height: 1; cursor: pointer; padding: 0; }
  .st-arrow:disabled { opacity: 0.35; cursor: default; }
  .st-chip { border: 1px solid var(--divider-color); border-radius: 999px; padding: 5px 12px; font: inherit; font-size: 13px; color: var(--primary-text-color); background: var(--card-background-color); width: auto; }
  .st-tabs { display: flex; gap: 20px; border-bottom: 1px solid var(--divider-color); margin: 0 0 14px; }
  .st-tabs button { font: inherit; font-weight: 500; background: none; border: none; color: var(--secondary-text-color); padding: 8px 0; cursor: pointer; }
  .st-tabs button.on { color: var(--primary-text-color); box-shadow: inset 0 -2px var(--primary-color); }
  .st-grid { display: grid; gap: 14px; grid-template-columns: minmax(0, 1fr); margin-bottom: 14px; }
  @media (min-width: 900px) { .st-grid:not(.single) { grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); } .st-span { grid-column: span 2; } }
  .st-grid .card { margin: 0; border-radius: 18px; padding: 18px; }
  .st-grid.single .card { margin: 0; }
  .st-label { font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--secondary-text-color); font-weight: 600; }
  .st-hero { display: flex; flex-direction: column; gap: 14px; }
  .st-hero .hint { margin: 4px 0 0; }
  .st-big-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
  .st-big { font-size: 40px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; }
  .st-big.neg { color: var(--error-color, #db4437); }
  .badge { display: inline-flex; align-items: center; gap: 4px; border-radius: 999px; padding: 2px 9px; font-size: 12px; font-weight: 600; background: var(--secondary-background-color); color: var(--secondary-text-color); white-space: nowrap; }
  .badge.good { background: color-mix(in srgb, var(--success-color, #1a8f5a) 16%, transparent); color: var(--success-color, #1a8f5a); }
  .badge.bad { background: color-mix(in srgb, var(--error-color, #d03b3b) 16%, transparent); color: var(--error-color, #d03b3b); }
  .st-rate { display: flex; align-items: center; gap: 12px; }
  .st-rate .hint { margin: 0; white-space: nowrap; }
  .st-rate-bar { flex: 1; height: 8px; border-radius: 99px; background: var(--secondary-background-color); overflow: hidden; }
  .st-rate-bar span { display: block; height: 100%; background: var(--success-color, #1baf7a); border-radius: 99px; }
  .st-kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .st-kpi { background: var(--secondary-background-color); border-radius: 14px; padding: 12px 14px; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
  .st-kpi-v { font-size: 20px; font-weight: 650; }
  .st-spark { width: 100%; height: 30px; }
  .st-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
  .st-head h3 { margin: 0; font-size: 16px; font-weight: 600; }
  .st-head .hint { margin: 0; }
  .st-legend { display: flex; gap: 14px; font-size: 12px; color: var(--secondary-text-color); }
  .st-legend span::before { content: ""; display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 6px; background: var(--c); }
  .st-chart { width: 100%; height: auto; display: block; overflow: visible; }
  .st-grid-line { stroke: var(--divider-color); stroke-width: 1; }
  .st-axis { font-size: 10px; fill: var(--secondary-text-color); }
  .st-xl.on { fill: var(--primary-text-color); font-weight: 700; }
  .st-col[data-action] { cursor: pointer; }
  .st-col.dim .st-in, .st-col.dim .st-out { opacity: 0.35; }
  .st-col-hl { fill: var(--secondary-background-color); }
  .st-hit { fill: transparent; }
  .st-col[data-action]:hover .st-in, .st-col[data-action]:hover .st-out { opacity: 1; filter: brightness(1.1); }
  .st-in { fill: var(--success-color, #1baf7a); }
  .st-out { fill: var(--error-color, #e34948); }
  .st-sel { display: flex; gap: 4px 14px; flex-wrap: wrap; align-items: baseline; margin-top: 6px; background: var(--secondary-background-color); border-radius: 10px; padding: 8px 12px; font-size: 13px; }
  .st-sel .pos { color: var(--success-color, #43a047); }
  .st-sel .neg { color: var(--error-color, #db4437); }
  .st-donut { display: flex; gap: 18px; align-items: flex-start; }
  .st-donut > svg { flex: 0 0 132px; width: 132px; height: 132px; }
  .st-ring-l { font-size: 9px; letter-spacing: 0.06em; fill: var(--secondary-text-color); font-weight: 600; }
  .st-ring-v { font-size: 15px; font-weight: 700; fill: var(--primary-text-color); }
  .st-cats { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .st-cat { border-top: 1px solid var(--divider-color); }
  .st-cat:first-child { border-top: none; }
  .st-cat-row { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 8px 0; width: 100%; background: none; border: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
  .st-cat.open .st-cat-n { color: var(--primary-color); }
  .st-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--c); }
  .st-cat-n { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .st-cat-a { font-weight: 600; font-variant-numeric: tabular-nums; }
  .st-cat-d { text-align: right; }
  .st-cat-d .badge { padding: 1px 6px; font-size: 11px; }
  .st-cat .stats-detail { grid-template-columns: 1fr; gap: 8px; padding: 0 0 10px 20px; }
  .st-cat .stats-sub { margin: 0; width: 100%; padding: 3px 0; min-width: 0; }
  .st-cat .stats-sub span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .st-cat .stats-sub span:last-child { flex-shrink: 0; font-variant-numeric: tabular-nums; }
  .st-cat .stats-detail > div { min-width: 0; }
  .st-cat .stats-bookings { padding: 0 0 12px 20px; }
  @media (max-width: 600px) { .st-donut { flex-direction: column; align-items: stretch; } .st-donut > svg { align-self: center; width: 150px; height: 150px; flex: none; } .st-big { font-size: 34px; } }
  .st-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .st-tile { background: var(--secondary-background-color); border: none; border-radius: 14px; padding: 12px; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-height: 104px; font: inherit; color: inherit; text-align: left; cursor: pointer; min-width: 0; }
  .st-tile-ic { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 18%, transparent); color: var(--c); }
  .st-tile-t { font-size: 12px; color: var(--secondary-text-color); }
  .st-tile-v { font-size: 15px; font-weight: 650; line-height: 1.25; overflow-wrap: break-word; hyphens: auto; }
  .st-day { font-size: 12px; color: var(--secondary-text-color); font-weight: 600; padding: 12px 0 4px; text-transform: uppercase; letter-spacing: 0.04em; }
  .st-tx { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 8px 0; }
  .st-av { width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center; font-weight: 700; font-size: 14px; color: #fff; background: var(--c); }
  .st-tx-n { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .st-tx-m { font-size: 12px; color: var(--secondary-text-color); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .st-tx-p { font-size: 12px; color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .st-tx-a { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .st-tx-a.pos { color: var(--success-color, #43a047); }
  .st-grid .insight h3 { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
  .insight-hidden { border-top: 1px solid var(--divider-color); padding-top: 6px; margin-top: 4px; }
  .insight-hidden ul, .insight-hits ul { list-style: none; margin: 4px 0 0; padding: 0; }
  .insight-hidden li { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid var(--divider-color); font-size: 13px; }
  .insight-hits { margin-top: 6px; font-size: 12px; color: var(--secondary-text-color); }
  .insight-hits summary { cursor: pointer; color: var(--primary-color); }
  .insight-hits li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; align-items: center; padding: 6px 0; border-top: 1px solid var(--divider-color); }
  .hit-main { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--primary-text-color); }
  .hit-main span { color: var(--secondary-text-color); margin-right: 4px; }
  .hit-actions { grid-column: 1 / -1; display: flex; gap: 6px; justify-content: flex-end; margin: 0; }
  .insight-hits li b { font-weight: 500; color: var(--primary-text-color); }
  @media (max-width: 600px) {
    .stats-cat-side { width: auto; max-width: 40%; }
    .stats-detail { grid-template-columns: 1fr; }
  }
  .csv-row-wrap { border-radius: 8px; }
  .csv-row-wrap > label.csv-price { margin: 0 0 6px 38px; width: calc(100% - 38px); box-sizing: border-box; }
  select.csv-target { width: auto; field-sizing: content; max-width: calc(100% - 92px); margin: -6px 0 6px 92px; padding: 2px 4px; border: none; background: transparent; color: var(--primary-color); font-size: 12px; cursor: pointer; }
  label.csv-price { font-size: 13px; }
  .csv-row .entry-meta.plain { display: block; }
  .csv-detail { margin: -4px 0 8px 38px; font-size: 12px; color: var(--secondary-text-color); }
  .csv-detail summary { cursor: pointer; color: var(--primary-color); }
  .csv-detail ul { list-style: none; margin: 4px 0 0; padding: 0; }
  .csv-detail li { padding: 4px 0; border-top: 1px solid var(--divider-color); }
  .csv-detail-head { display: flex; gap: 8px; align-items: baseline; color: var(--primary-text-color); }
  .csv-detail-head .what { margin-left: auto; color: var(--secondary-text-color); }
  .csv-detail-text { overflow-wrap: anywhere; }
  select.csv-spend { margin-left: auto; width: auto; field-sizing: content; max-width: 55%; padding: 0 2px; border: none; background: transparent; color: var(--primary-color); font-size: 12px; cursor: pointer; }
  .csv-detail-more { padding-top: 4px; }
  label.check.muted { color: var(--secondary-text-color); }
  label.check small { display: block; font-size: 12px; color: var(--secondary-text-color); }
  label.check.option input { margin-top: 3px; }
  details { margin: 8px 0; }
  summary { cursor: pointer; font-size: 14px; color: var(--primary-color); }
  .templates { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px; }
  .template { display: flex; align-items: center; gap: 4px; background: var(--secondary-background-color); color: var(--primary-text-color); white-space: nowrap; font-size: 13px; padding: 6px 10px; border-radius: 16px; }
  .icon-preview { display: inline-flex; vertical-align: middle; color: var(--primary-color); }
  .suggest-field { position: relative; }
  .incognito-toggle { background: none; color: inherit; padding: 6px; border-radius: 50%; display: inline-flex; line-height: 0; }
  .incognito-toggle.on { background: rgba(255,255,255,0.25); }
  :host(.incognito) .money { filter: blur(7px); user-select: none; }
  :host(.incognito) input[data-amount] { color: transparent; text-shadow: 0 0 10px var(--primary-text-color); }
  :host(.incognito) .money { display: inline-block; }
  .suggest { position: absolute; top: 100%; left: 0; right: 0; z-index: 5; max-height: 240px; overflow-y: auto; background: var(--card-background-color, #fff); border: 1px solid var(--divider-color); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); padding: 4px; }
  .suggest[hidden] { display: none; }
  .suggest button { display: flex; align-items: center; gap: 10px; width: 100%; background: none; color: var(--primary-text-color); text-align: left; padding: 6px 8px; border-radius: 6px; font-size: 14px; font-weight: normal; }
  .suggest button:hover, .suggest button:focus { background: var(--secondary-background-color); }
  .suggest ha-icon { color: var(--primary-color); flex-shrink: 0; }
  .members { margin: 12px 0; }
  .end-date { display: flex; flex-direction: column; gap: 4px; justify-content: flex-end; }
  .dialog-actions { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
  .dialog-actions > div { display: flex; gap: 8px; flex-wrap: wrap; }
  @media (max-width: 600px) {
    .content { padding: 8px; }
    .grid { grid-template-columns: 1fr; }
    .cal-cell { min-height: 56px; }
    .cal-sum { display: none; }
    .cal-dot ha-icon { display: none; }
    .cal-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--chip); margin: 1px; }
    .tab ha-icon { display: none; }
    .tab { padding: 10px 8px; font-size: 13px; }
    .month-row { grid-template-columns: 48px 1fr 80px; }
    .month-specials { padding-left: 0; }
  }
`;

export { STYLES };
