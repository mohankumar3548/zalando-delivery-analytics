"""Late-delivery root causes, site and shift hotspots, route optimisation and fix simulation for Zalando."""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import StandardScaler

from src.utils import bar, kpi, money, num, pct, rec, scatter, table

META = json.loads(Path(__file__).with_name("meta.json").read_text())
PARAMS = [
    {"name": "extra_pickers_pct", "label": "Extra pickers on the worst shift (%)", "min": 0, "max": 40, "step": 5, "default": 20},
    {"name": "stock_fix_pct", "label": "Fix stock placement for (% of mismatches)", "min": 0, "max": 100, "step": 10, "default": 60},
]
FEATS = {"staffing_vs_plan": "Staffing vs plan", "peak_day": "Peak day", "stock_in_wrong_site": "Stock in wrong warehouse", "missed_cutoff": "Missed carrier cutoff",
         "distance_band": "Cross-border distance", "hermes_xborder": "Hermes cross-border", "pick_hrs": "Pick time (hrs)"}
THEMES = {"Late delivery": ["late", "waiting", "promised"], "Wrong or missing item": ["wrong", "missing"], "Damaged parcel": ["damaged", "crushed"], "Courier behaviour": ["courier", "neighbour"]}
SCALE, COST_PER_LATE = 1500, 4.5


def route_length(order, pts, depot):
    path = [depot] + [pts[i] for i in order] + [depot]
    return sum(np.hypot(*(np.array(a) - np.array(b))) for a, b in zip(path, path[1:]))


def two_opt(pts, depot):
    left, cur, order = list(range(len(pts))), depot, []
    while left:  # nearest neighbour start
        j = min(left, key=lambda k: np.hypot(pts[k][0] - cur[0], pts[k][1] - cur[1])); order.append(j); left.remove(j); cur = pts[j]
    improved = True
    while improved:
        improved = False
        for i in range(len(order) - 1):
            for k in range(i + 1, len(order)):
                cand = order[:i] + order[i:k + 1][::-1] + order[k + 1:]
                if route_length(cand, pts, depot) < route_length(order, pts, depot) - 1e-9:
                    order, improved = cand, True
    return order


def run(data, extra_pickers_pct=20, stock_fix_pct=60):
    O = data["orders"].copy(); O["complaint"] = O.complaint.fillna("")
    O["hermes_xborder"] = ((O.carrier == "Hermes") & (O.distance_band == 2)).astype(int)
    cols = list(FEATS); sc = StandardScaler().fit(O[cols])
    m = LogisticRegression(max_iter=1000).fit(sc.transform(O[cols]), O.late)
    p = m.predict_proba(sc.transform(O[cols]))[:, 1]; auc = roc_auc_score(O.late, p)
    contrib = sc.transform(O[cols]) * m.coef_[0]
    causes = pd.DataFrame({"factor": [FEATS[c] for c in cols], "avg_push_on_late_orders": contrib[O.late.values == 1].mean(0).round(3)}).sort_values("avg_push_on_late_orders", ascending=False)
    heat = O.pivot_table(index="warehouse", columns="shift", values="late", aggfunc="mean").round(3)[["Early", "Late", "Night"]]
    wh, shf = heat.stack().idxmax(); worst_rate = heat.loc[wh, shf]
    staff = O.groupby(["warehouse", "shift"]).staffing_vs_plan.first()
    stages = O.groupby("warehouse")[["pick_hrs", "pack_hrs", "dispatch_wait_hrs", "transit_hrs"]].mean().round(1).reset_index()
    mis_late, ok_late = O[O.stock_in_wrong_site == 1].late.mean(), O[O.stock_in_wrong_site == 0].late.mean()
    carriers = O[O.distance_band == 2].groupby("carrier").late.mean().round(3).rename("late_rate").reset_index().sort_values("late_rate")
    complaints = O[O.complaint != ""]
    themes = pd.DataFrame([{"theme": k, "complaints": int(complaints.complaint.apply(lambda s: any(w in s for w in ws)).sum())} for k, ws in THEMES.items()]).sort_values("complaints", ascending=False)

    S = data["route_stops"]; pts = list(zip(S.x_km, S.y_km)); depot = (5.0, 3.5)
    naive_len = route_length(list(range(len(pts))), pts, depot); best = two_opt(pts, depot); best_len = route_length(best, pts, depot)
    route = pd.DataFrame({"x_km": [depot[0]] + [pts[i][0] for i in best], "y_km": [depot[1]] + [pts[i][1] for i in best], "label": ["Depot"] + [S.stop[i] for i in best]})
    route["sequence"] = range(len(route))

    X2 = O[cols].copy(); cell = (O.warehouse == wh) & (O.shift == shf)
    new_st = O.staffing_vs_plan * (1 + extra_pickers_pct / 100)
    X2.loc[cell, "pick_hrs"] = np.maximum(0.3, O.pick_hrs[cell] * (O.staffing_vs_plan[cell] / new_st[cell]) ** 2.2)
    X2.loc[cell, "staffing_vs_plan"] = new_st[cell]
    fix = (O.stock_in_wrong_site == 1) & (np.arange(len(O)) % 100 < stock_fix_pct); X2.loc[fix, "stock_in_wrong_site"] = 0
    new_rate = O.late.mean() + (m.predict_proba(sc.transform(X2))[:, 1].mean() - p.mean())
    fewer = (O.late.mean() - new_rate) * len(O) * SCALE
    worst_carrier, best_carrier = carriers.iloc[-1], carriers.iloc[0]
    return {
        "steps": [f"{len(O):,} orders, {pct(O.late.mean())} late", f"Average order-to-door {(O.pick_hrs + O.pack_hrs + O.dispatch_wait_hrs + O.transit_hrs).mean():.0f} hrs",
                  f"AUC {auc:.3f}; top cause {causes.iloc[0].factor}", f"Worst: {wh} {shf} shift at {pct(worst_rate, 0)} late",
                  f"{pct(O.stock_in_wrong_site.mean(), 0)} of orders shipped from the wrong site; {pct(mis_late, 0)} of those late",
                  f"Route {pct(1 - best_len / naive_len, 0)} shorter after 2-opt", f"{len(complaints)} complaints, top theme {themes.iloc[0].theme}",
                  f"Late rate {pct(O.late.mean())} -> {pct(new_rate)}"],
        "kpis": [kpi("Late deliveries", pct(O.late.mean()), f"{int(O.late.sum()):,} of {len(O):,} orders"), kpi("Worst cell", f"{wh} {shf}", f"{pct(worst_rate, 0)} late, staffing {pct(staff[(wh, shf)], 0)} of plan"),
                 kpi("Top root cause", causes.iloc[0].factor, "Largest push on late orders"), kpi("Late rate after fixes", pct(new_rate), f"{num(fewer)} fewer late parcels a year"),
                 kpi("Cost avoided", money(fewer * COST_PER_LATE, "€"), f"At €{COST_PER_LATE} per late parcel")],
        "charts": [bar("Why late orders were late", causes, "factor", "avg_push_on_late_orders"),
                   bar("Hours spent in each stage", stages, "warehouse", ["pick_hrs", "pack_hrs", "dispatch_wait_hrs", "transit_hrs"]),
                   scatter(f"Optimised last-mile route ({best_len:.1f} km vs {naive_len:.1f} km in order received)", route, "x_km", "y_km"),
                   bar("Cross-border late rate by carrier", carriers, "carrier", "late_rate"), bar("Complaints by theme", themes, "theme", "complaints")],
        "tables": [table("Late rate by site and shift", heat.reset_index()), table("Optimised stop sequence", route[["sequence", "label", "x_km", "y_km"]])],
        "recs": [rec(f"Add {extra_pickers_pct}% pickers to the {wh} {shf} shift", f"It runs at {pct(staff[(wh, shf)], 0)} of planned staffing, so picking runs past the carrier cut-off and parcels wait most of a day.", f"{pct(worst_rate, 0)} late now"),
                 rec(f"Rebalance stock for {stock_fix_pct}% of split orders", f"{pct(O.stock_in_wrong_site.mean(), 0)} of orders ship from a far site. {pct(mis_late, 0)} of those are late vs {pct(ok_late, 0)} of others.", "Weekly placement run"),
                 rec(f"Move cross-border volume from {worst_carrier.carrier} to {best_carrier.carrier}", f"{worst_carrier.carrier} is late on {pct(worst_carrier.late_rate, 0)} of Poland and France orders.", "Carrier SLA"),
                 rec("Plan routes with 2-opt every morning", f"The sample route is {pct(1 - best_len / naive_len, 0)} shorter after optimisation.", f"-{pct(1 - best_len / naive_len, 0)} km")],
    }


if __name__ == "__main__":
    from src.data_generator import load_or_generate
    from src.report import write_reports

    out = run(load_or_generate(), **{p["name"]: p["default"] for p in PARAMS})
    for k in out["kpis"]:
        print(f"{k['label']}: {k['value']}  {k['note']}")
    print("Reports written to", write_reports(out, META, Path(__file__).resolve().parent.parent / "reports"))
