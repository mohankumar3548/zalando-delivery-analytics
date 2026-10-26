# Zalando Delivery Doctor

AI solution 11 of 14 · Operations · built for **Zalando**

Prepared by **K Mohan Kumar**.

**Live website:** https://mohankumar3548.github.io/zalando-delivery-analytics/

## Problem statement

An e-commerce company is experiencing increasing delivery delays and customer complaints despite having adequate logistics capacity. Develop an AI system that analyzes orders, warehouses, routes, staffing, inventory and delivery data to identify the root causes and recommend operational improvements.

## Why Zalando

Zalando ships fashion across Europe from several large fulfillment centres, and late parcels turn straight into complaints and returns. This tool breaks every order into its stages, finds what makes parcels late and tests fixes.

## Project structure

```
zalando-delivery-analytics/
├── index.html                 Website entry point (served by GitHub Pages)
├── frontend/
│   ├── css/style.css          Layout, typography, light and dark themes
│   └── js/
│       ├── engine.js          Maths, models, charts, page layout and AI analyst panel
│       └── model.js           Sample data and the algorithm for this problem (browser version)
├── app.py                     Streamlit dashboard (Python version of the website)
├── src/
│   ├── data_generator.py      Builds the sample dataset and saves it to data/
│   ├── model.py               The algorithm in Python (pandas, NumPy, scikit-learn)
│   ├── report.py              Writes results to reports/
│   ├── utils.py               Formatting and forecasting helpers
│   └── meta.json              Problem statement, company and algorithm steps
├── data/                      Sample data as CSV
├── reports/                   Results: results.json, summary.md and CSV tables
├── tests/test_model.py        pytest tests for the data and the model
├── requirements.txt
└── pytest.ini
```

## Algorithm

1. **Collect order and ops data**: Orders, warehouses, shifts, staffing, stock location, carriers, delivery scans
2. **Split the order timeline**: Order→pick, pick→pack, pack→dispatch, dispatch→delivery
3. **Late-delivery model**: Logistic regression with feature contributions
4. **Root cause by site and shift**: Late rate heatmap, warehouse × shift
5. **Stock placement check**: Orders shipped from a far warehouse because stock sat elsewhere
6. **Route optimisation**: Nearest-neighbour + 2-opt on a last-mile route
7. **Complaint text**: Keyword grouping of complaint messages
8. **Improvement plan**: Simulate staffing and stock fixes with the model

The same algorithm is implemented twice: in JavaScript (`frontend/js/model.js`) so the website runs in any browser with no server, and in Python (`src/model.py`) for analysis, the Streamlit dashboard and the tests.

## How to run

**Website:** open the live link above, or open `index.html` in a browser.

**Python:**

```bash
pip install -r requirements.txt
python -m src.data_generator     # create the sample data in data/
python -m src.model              # run the algorithm and write reports/
streamlit run app.py             # open the interactive dashboard
pytest                           # run the tests
```

## Data

6,000 orders from 4 fulfillment centres over 4 weeks with stage timestamps, staffing, carriers and complaints (sample data). Files: `data/orders.csv`, `data/route_stops.csv`. All figures are illustrative and are not Zalando's actual numbers.

## Results (default settings, Python run)

| Measure | Value | Note |
|---|---|---|
| Late deliveries | 17.7% | 1,062 of 6,000 orders |
| Worst cell | Erfurt Night | 37% late, staffing 68% of plan |
| Top root cause | Stock in wrong warehouse | Largest push on late orders |
| Late rate after fixes | 14.0% | 333,330 fewer late parcels a year |
| Cost avoided | €1.5M | At €4.5 per late parcel |

### Recommended actions

1. **Add 20% pickers to the Erfurt Night shift.** It runs at 68% of planned staffing, so picking runs past the carrier cut-off and parcels wait most of a day.
2. **Rebalance stock for 60% of split orders.** 11% of orders ship from a far site. 66% of those are late vs 12% of others.
3. **Move cross-border volume from Hermes to DPD.** Hermes is late on 36% of Poland and France orders.
4. **Plan routes with 2-opt every morning.** The sample route is 51% shorter after optimisation.

Full output: [`reports/summary.md`](reports/summary.md) and [`reports/results.json`](reports/results.json).

## AI analyst panel

The website includes an "Ask the AI analyst" panel that answers questions about the results through Claude. It works when the page is opened as a Claude artifact on claude.ai. On GitHub Pages the models, charts and controls run in full and the panel shows that it is unavailable.
