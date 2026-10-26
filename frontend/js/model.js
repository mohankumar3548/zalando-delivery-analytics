/* Zalando Delivery Doctor: sample data generator and algorithm for Zalando. */
const TOOL = {
  num: 11, area: "Operations", product: "Delivery Performance Root Cause", seed: 111,
  title: "Zalando Delivery Doctor", company: "Zalando",
  why: "Zalando ships fashion across Europe from several large fulfillment centres, and late parcels turn straight into complaints and returns. This tool breaks every order into its stages, finds what makes parcels late and tests fixes.",
  statement: "An e-commerce company is experiencing increasing delivery delays and customer complaints despite having adequate logistics capacity. Develop an AI system that analyzes orders, warehouses, routes, staffing, inventory and delivery data to identify the root causes and recommend operational improvements.",
  dataNote: "6,000 orders from 4 fulfillment centres over 4 weeks with stage timestamps, staffing, carriers and complaints (sample data).",
  steps: [
    ["Collect order and ops data", "Orders, warehouses, shifts, staffing, stock location, carriers, delivery scans"],
    ["Split the order timeline", "Order→pick, pick→pack, pack→dispatch, dispatch→delivery"],
    ["Late-delivery model", "Logistic regression with feature contributions"],
    ["Root cause by site and shift", "Late rate heatmap, warehouse × shift"],
    ["Stock placement check", "Orders shipped from a far warehouse because stock sat elsewhere"],
    ["Route optimisation", "Nearest-neighbour + 2-opt on a last-mile route"],
    ["Complaint text", "Keyword grouping of complaint messages"],
    ["Improvement plan", "Simulate staffing and stock fixes with the model"]
  ],
  params: [
    { id: "staff", label: "Extra pickers on the worst shift", min: 0, max: 40, step: 5, value: 20, fmt: v => "+" + v + "%" },
    { id: "rebal", label: "Fix stock placement for", min: 0, max: 100, step: 10, value: 60, fmt: v => v + "% of mismatches" }
  ],
  questions: ["What is the main reason parcels are late?", "Which warehouse and shift should we fix first?", "Is the carrier the problem or our warehouses?", "Draft a note to the Erfurt site lead"],
  generate(r) {
    const wh = [{ n: "Erfurt", cap: 1 }, { n: "Mönchengladbach", cap: 1.05 }, { n: "Lahr", cap: 0.95 }, { n: "Brieselang", cap: 1 }];
    const shifts = ["Early", "Late", "Night"], carriers = ["DHL", "Hermes", "DPD", "GLS"], regions = [["Germany North", 0], ["Germany South", 0], ["Austria", 1], ["Netherlands", 1], ["Poland", 2], ["France", 2]];
    const staffing = wh.map((w, i) => shifts.map((s, j) => (i === 0 && j === 2) ? 0.68 : (i === 2 && j === 1) ? 0.8 : r.u(0.92, 1.1)));
    const tpl = { late: ["parcel arrived three days late", "still waiting, tracking not updated", "delivery was promised Tuesday, came Friday"], wrong: ["received the wrong size", "item missing from the parcel"], damaged: ["box arrived damaged", "shoes box crushed"], courier: ["courier never rang the bell", "left at a neighbour I do not know"] };
    const orders = S.range(6000).map(i => {
      const w = r.wpick(S.range(4), [3, 3, 2, 2]), sh = r.wpick([0, 1, 2], [4, 4, 2]), rg = r.pick(regions), cr = rg[1] === 2 ? r.wpick(carriers, [1, 2, 1, 1]) : r.wpick(carriers, [3, 2, 1, 1]);
      const st = staffing[w][sh], peak = r.chance(0.2) ? 1 : 0, mismatch = r.chance(0.11) ? 1 : 0;
      const pick = Math.max(0.3, r.n(2.2 / st ** 2.2 * (1 + 0.5 * peak), 0.8)), pack = Math.max(0.2, r.n(0.9, 0.3));
      const cutoffMiss = r() < S.sigmoid(-3 + 1.1 * (pick + pack - 3)) ? 1 : 0, disp = cutoffMiss ? r.u(14, 24) : r.u(1, 6);
      const transit = Math.max(8, r.n(22 + 16 * rg[1] + (cr === "Hermes" && rg[1] === 2 ? 22 : 0) + 24 * mismatch, 11));
      const total = pick + pack + disp + transit, promise = rg[1] === 0 ? 44 : rg[1] === 1 ? 68 : 92, late = total > promise ? 1 : 0;
      const cmp = late && r.chance(0.35) ? r.pick(tpl.late) : r.chance(0.02) ? r.pick(r.pick([tpl.wrong, tpl.damaged, tpl.courier])) : "";
      return { w, sh, rg: rg[0], dist: rg[1], cr, st, peak, mismatch, pick, pack, disp, transit, total, promise, late, cutoffMiss, cmp };
    });
    const pts = S.range(14).map(() => ({ x: r.u(0, 100), y: r.u(0, 70) }));
    return { wh, shifts, carriers, staffing, orders, pts };
  },
  analyze(D, P, r) {
    const O = D.orders, wh = D.wh.map(w => w.n);
    const rate = S.mean(O.map(o => o.late));
    const fn = ["Staffing vs plan", "Peak day", "Stock in wrong warehouse", "Missed carrier cutoff", "Cross-border distance", "Hermes cross-border", "Pick time (hrs)"];
    const x = o => [o.st, o.peak, o.mismatch, o.cutoffMiss, o.dist, o.cr === "Hermes" && o.dist === 2 ? 1 : 0, o.pick];
    const m = M.logit(O.map(x), O.map(o => o.late), { iters: 350, lr: 0.5 });
    const auc = M.auc(O.map(o => m.predict(x(o))), O.map(o => o.late));
    const contrib = fn.map((n, j) => ({ name: n, v: S.mean(O.filter(o => o.late).map(o => m.contrib(x(o))[j])) })).sort((a, b) => b.v - a.v);
    const heat = wh.map((_, i) => D.shifts.map((_, j) => { const g = O.filter(o => o.w === i && o.sh === j); return S.mean(g.map(o => o.late)); }));
    let wi = 0, wj = 0; heat.forEach((row, i) => row.forEach((v, j) => { if (v > heat[wi][wj]) { wi = i; wj = j; } }));
    const stageW = wh.map((_, i) => { const g = O.filter(o => o.w === i); return ["pick", "pack", "disp", "transit"].map(k => S.mean(g.map(o => o[k]))); });
    const mis = O.filter(o => o.mismatch), misLate = S.mean(mis.map(o => o.late)), okLate = S.mean(O.filter(o => !o.mismatch).map(o => o.late));
    const carrier = D.carriers.map(c => { const g = O.filter(o => o.cr === c && o.dist === 2); return { c, n: g.length, late: S.mean(g.map(o => o.late)) }; });
    // route opt
    const pts = D.pts, dep = { x: 50, y: 35 }, d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), len = rt => S.sum(rt.map((p, i) => d(i ? rt[i - 1] : dep, p))) + d(rt[rt.length - 1], dep);
    const naive = pts.slice(); let nn = [], left = pts.slice(), cur = dep; while (left.length) { left.sort((a, b) => d(cur, a) - d(cur, b)); cur = left.shift(); nn.push(cur); }
    let best = nn.slice(), imp = true; while (imp) { imp = false; for (let i = 0; i < best.length - 1; i++) for (let k = i + 1; k < best.length; k++) { const c = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1)); if (len(c) < len(best) - 1e-9) { best = c; imp = true; } } }
    const saveKm = 1 - len(best) / len(naive);
    // complaints
    const th = { "Late delivery": ["late", "waiting", "promised"], "Wrong or missing item": ["wrong", "missing"], "Damaged parcel": ["damaged", "crushed"], "Courier behaviour": ["courier", "neighbour"] };
    const cm = O.filter(o => o.cmp); const themes = Object.entries(th).map(([k, ws]) => ({ label: k, value: cm.filter(o => ws.some(w => o.cmp.includes(w))).length })).sort((a, b) => b.value - a.value);
    // simulation
    const sim = O.map((o, oi) => { let st = o.st, pick = o.pick, mis = o.mismatch; if (o.w === wi && o.sh === wj) { st = o.st * (1 + P.staff / 100); pick = Math.max(0.3, o.pick * (o.st / st) ** 2.2); } if (mis && (oi % 100) < P.rebal) mis = 0; const cutoff = (pick + o.pack - 3) > 0 ? o.cutoffMiss && (pick + o.pack) > 3.5 ? 1 : 0 : 0; return m.predict([st, o.peak, mis, cutoff, o.dist, o.cr === "Hermes" && o.dist === 2 ? 1 : 0, pick]); });
    const newRate = S.mean(sim), base = S.mean(O.map(o => m.predict(x(o))));
    const projRate = rate + (newRate - base);
    const SC = 1500, cpl = 4.5; // orders/yr scale and cost per late parcel (service + refund)
    const routeSvg = (() => { const W = 640, Hh = 300, sx = v => 20 + v / 100 * (W - 40), sy = v => 20 + v / 70 * (Hh - 40); const path = rt => [dep, ...rt, dep].map((p, i) => (i ? "L" : "M") + sx(p.x).toFixed(1) + " " + sy(p.y).toFixed(1)).join(""); let g = `<path d="${path(naive)}" fill="none" stroke="var(--ink-3)" stroke-dasharray="3 3"/><path d="${path(best)}" fill="none" stroke="var(--ink)" stroke-width="2"/>`; pts.forEach((p, i) => { g += `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="4" fill="var(--bg)" stroke="var(--ink)"/>`; }); g += `<rect x="${sx(dep.x) - 6}" y="${sy(dep.y) - 6}" width="12" height="12" fill="var(--bad)"/><text class="ct" x="${sx(dep.x) + 10}" y="${sy(dep.y) + 4}">Depot</text>`; return C.svg(Hh, g, "Delivery route before and after optimisation"); })();
    return {
      steps: [`${F.num(O.length)} orders, ${F.pct(rate)} late`, `Avg order-to-door ${S.mean(O.map(o => o.total)).toFixed(0)} hrs`, `AUC ${auc.toFixed(3)}; top cause ${contrib[0].name}`, `Worst: ${wh[wi]} ${D.shifts[wj]} shift at ${F.pct(heat[wi][wj], 0)} late`, `${F.pct(mis.length / O.length, 0)} of orders shipped from the wrong site; ${F.pct(misLate, 0)} of those late`, `Route ${F.pct(saveKm, 0)} shorter after 2-opt`, `${cm.length} complaints, top theme ${themes[0].label}`, `Late rate ${F.pct(rate)} → ${F.pct(projRate)}`],
      kpis: [
        { label: "Late deliveries", value: F.pct(rate), note: `${F.num(O.filter(o => o.late).length)} of ${F.num(O.length)} orders`, tone: "bad" },
        { label: "Worst cell", value: `${wh[wi]} · ${D.shifts[wj]}`, note: `${F.pct(heat[wi][wj], 0)} late, staffing at ${F.pct(D.staffing[wi][wj], 0)} of plan`, tone: "bad" },
        { label: "Top root cause", value: contrib[0].name, note: "Largest push on late orders", tone: "warn" },
        { label: "Late rate after fixes", value: F.pct(projRate), note: `${F.num((rate - projRate) * O.length * SC)} fewer late parcels a year`, tone: "good" },
        { label: "Cost avoided", value: F.money((rate - projRate) * O.length * SC * cpl, "€"), note: `At €${cpl} per late parcel` }
      ],
      sections: [
        { pair: [
          { title: "Why late orders were late", note: "Average push of each factor on the late-probability of orders that arrived late.", chart: C.bar(contrib.map(c => ({ label: c.name, value: c.v, tone: c.v > 0.3 ? "bad" : c.v > 0 ? "warn" : "" })), { fmt: v => v.toFixed(2), labelW: 180 }) },
          { title: "Late rate by site and shift", chart: C.heat(wh, D.shifts, heat, { fmt: v => F.pct(v, 0), color: "var(--bad)", rowW: 130, cell: 90, lo: 0 }) + `<p class="small">Staffing vs plan: ${wh.map((w, i) => `${w} ${D.shifts.map((s, j) => F.pct(D.staffing[i][j], 0)).join("/")}`).join(" · ")}</p>` }
        ] },
        { title: "Hours spent in each stage", note: "Average per order. Dispatch waits jump when picking runs past the carrier cut-off.", chart: C.grouped(wh, [{ name: "Pick", values: stageW.map(s => s[0]), tone: "c3" }, { name: "Pack", values: stageW.map(s => s[1]), tone: "c6" }, { name: "Wait for dispatch", values: stageW.map(s => s[2]), tone: "c2" }, { name: "Transit", values: stageW.map(s => s[3]), tone: "c1" }], { fmt: v => v.toFixed(1) + "h", labelW: 130 }) + C.legend([{ label: "Pick", tone: "c3" }, { label: "Pack", tone: "c6" }, { label: "Wait for dispatch", tone: "c2" }, { label: "Transit", tone: "c1" }]) },
        { pair: [
          { title: "Last-mile route, Berlin sample", note: `Dashed: stops in order received (${(len(naive) / 10).toFixed(1)} km). Solid: optimised (${(len(best) / 10).toFixed(1)} km).`, chart: routeSvg },
          { title: "Cross-border carriers", note: "Late rate on Poland and France orders.", chart: C.bar(carrier.map(c => ({ label: c.c, value: c.late, tone: c.late > 0.3 ? "bad" : "" })), { fmt: v => F.pct(v, 0), labelW: 80 }) + `<div style="margin-top:12px">${C.bar(themes.map(t => ({ label: t.label, value: t.value, tone: "c3" })), { fmt: v => F.num(v), labelW: 160 })}</div><p class="small">Complaints by theme.</p>` }
        ] }
      ],
      recs: [
        { title: `Add ${P.staff}% pickers to the ${wh[wi]} ${D.shifts[wj]} shift`, body: `It runs at ${F.pct(D.staffing[wi][wj], 0)} of planned staffing. Slow picking pushes parcels past the carrier cut-off, which adds most of a day before dispatch.`, impact: F.pct(heat[wi][wj], 0) + " late now", tone: "bad" },
        { title: `Rebalance stock for ${P.rebal}% of split orders`, body: `${F.pct(mis.length / O.length, 0)} of orders ship from a site far from the customer because the item was not in the nearest warehouse. ${F.pct(misLate, 0)} of those arrive late vs ${F.pct(okLate, 0)} of others. Re-run stock placement weekly on fast movers.`, impact: `${F.pct(misLate, 0)} vs ${F.pct(okLate, 0)} late`, tone: "warn" },
        { title: `Move cross-border volume away from ${[...carrier].sort((a, b) => b.late - a.late)[0].c}`, body: `It is late on ${F.pct([...carrier].sort((a, b) => b.late - a.late)[0].late, 0)} of Poland and France orders. Shift volume to ${[...carrier].sort((a, b) => a.late - b.late)[0].c} and review the SLA.`, impact: "Carrier SLA", tone: "warn" },
        { title: "Plan routes with 2-opt every morning", body: `The sample route is ${F.pct(saveKm, 0)} shorter after optimisation, which frees drivers for more stops per day.`, impact: `-${F.pct(saveKm, 0)} km`, tone: "good" }
      ],
      context: { late_rate: +rate.toFixed(3), projected_late_rate: +projRate.toFixed(3), model_auc: +auc.toFixed(3), causes: contrib.map(c => ({ factor: c.name, avg_contribution_on_late_orders: +c.v.toFixed(2) })), late_by_site_shift: Object.fromEntries(wh.map((w, i) => [w, Object.fromEntries(D.shifts.map((s, j) => [s, +heat[i][j].toFixed(2)]))])), staffing_vs_plan: Object.fromEntries(wh.map((w, i) => [w, D.staffing[i].map(v => +v.toFixed(2))])), stage_hours: Object.fromEntries(wh.map((w, i) => [w, { pick: +stageW[i][0].toFixed(1), pack: +stageW[i][1].toFixed(1), dispatch_wait: +stageW[i][2].toFixed(1), transit: +stageW[i][3].toFixed(1) }])), wrong_site_share: +(mis.length / O.length).toFixed(2), wrong_site_late: +misLate.toFixed(2), cross_border_carriers: carrier.map(c => ({ carrier: c.c, late: +c.late.toFixed(2) })), complaints: themes, route_saving: +saveKm.toFixed(2), scenario: { extra_pickers_pct: P.staff, stock_fix_pct: P.rebal } }
    };
  }
};
