"""Sample data for Zalando: 6,000 orders from 4 fulfillment centres with stage times, staffing, carriers and complaints."""
from pathlib import Path

import numpy as np
import pandas as pd

WAREHOUSES = ["Erfurt", "Mönchengladbach", "Lahr", "Brieselang"]
SHIFTS = ["Early", "Late", "Night"]
CARRIERS = ["DHL", "Hermes", "DPD", "GLS"]
REGIONS = [("Germany North", 0), ("Germany South", 0), ("Austria", 1), ("Netherlands", 1), ("Poland", 2), ("France", 2)]
COMPLAINTS = {"late": ["parcel arrived three days late", "still waiting, tracking not updated", "delivery was promised Tuesday, came Friday"],
              "other": ["received the wrong size", "item missing from the parcel", "box arrived damaged", "shoes box crushed", "courier never rang the bell", "left at a neighbour I do not know"]}


def generate(seed: int = 42) -> dict:
    rng = np.random.default_rng(seed)
    staffing = rng.uniform(0.92, 1.1, (4, 3)); staffing[0, 2], staffing[2, 1] = 0.68, 0.8
    rows = []
    for i in range(6000):
        w = rng.choice(4, p=[0.3, 0.3, 0.2, 0.2]); sh = rng.choice(3, p=[0.4, 0.4, 0.2])
        region, dist = REGIONS[rng.integers(6)]
        carrier = rng.choice(CARRIERS, p=[0.2, 0.4, 0.2, 0.2] if dist == 2 else [3 / 7, 2 / 7, 1 / 7, 1 / 7])
        st = staffing[w, sh]; peak = int(rng.random() < 0.2); mismatch = int(rng.random() < 0.11)
        pick = max(0.3, rng.normal(2.2 / st ** 2.2 * (1 + 0.5 * peak), 0.8)); pack = max(0.2, rng.normal(0.9, 0.3))
        cut = int(rng.random() < 1 / (1 + np.exp(-(-3 + 1.1 * (pick + pack - 3)))))
        disp = rng.uniform(14, 24) if cut else rng.uniform(1, 6)
        transit = max(8, rng.normal(22 + 16 * dist + (22 if carrier == "Hermes" and dist == 2 else 0) + 24 * mismatch, 11))
        total, promise = pick + pack + disp + transit, [44, 68, 92][dist]
        late = int(total > promise)
        comp = rng.choice(COMPLAINTS["late"]) if late and rng.random() < 0.35 else (rng.choice(COMPLAINTS["other"]) if rng.random() < 0.02 else "")
        rows.append({"order_id": f"O{900000 + i}", "warehouse": WAREHOUSES[w], "shift": SHIFTS[sh], "staffing_vs_plan": round(st, 3), "region": region,
                     "distance_band": dist, "carrier": carrier, "peak_day": peak, "stock_in_wrong_site": mismatch, "pick_hrs": round(pick, 2), "pack_hrs": round(pack, 2),
                     "missed_cutoff": cut, "dispatch_wait_hrs": round(disp, 2), "transit_hrs": round(transit, 2), "promise_hrs": promise, "late": late, "complaint": comp})
    stops = pd.DataFrame({"stop": [f"Stop {i + 1}" for i in range(14)], "x_km": rng.uniform(0, 10, 14).round(2), "y_km": rng.uniform(0, 7, 14).round(2)})
    return {"orders": pd.DataFrame(rows), "route_stops": stops}


# ---------------------------------------------------------------------------
# Save and load helpers
# ---------------------------------------------------------------------------
DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def save(data: dict, folder: Path = DATA_DIR) -> None:
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    for name, df in data.items():
        df.to_csv(folder / f"{name}.csv", index=False)


def load_or_generate(folder: Path = DATA_DIR, seed: int = 42) -> dict:
    """Read the CSVs in data/ if they exist, otherwise generate fresh sample data."""
    folder = Path(folder)
    names = list(generate(seed).keys())
    if all((folder / f"{n}.csv").exists() for n in names):
        return {n: pd.read_csv(folder / f"{n}.csv") for n in names}
    return generate(seed)


if __name__ == "__main__":
    d = generate(42)
    save(d)
    for n, df in d.items():
        print(f"data/{n}.csv  {len(df):,} rows x {df.shape[1]} columns")
