# 5G Power Lab

Interactive 5G/LTE modem power consumption visualizer built with React, FastAPI, and Plotly.

This project models modem power behavior across radio access technologies, signal conditions, traffic profiles, and 3GPP-inspired RRC power states. It is designed as a portfolio project for modem power analysis, power validation, and 4G/5G tradeoff conversations.

## Resume Bullet

Built a 5G/LTE power consumption simulation platform modeling 3GPP RRC power states (`RRC_IDLE`, `RRC_CONNECTED`, DRX cycles) across network conditions, visualizing modem power tradeoffs between 4G and 5G NR with a React frontend and Python FastAPI backend.

## Features

- React controls for RAT, use case, RSRP, SINR, RRC state, DRX cycle, throughput, and battery size
- FastAPI backend with simulation, comparison, benchmark, and CSV export endpoints
- Real-time Plotly charts for modem power draw over time
- Side-by-side LTE vs 5G NR comparison mode
- CSV report export for KPI analysis
- 3GPP-inspired states: `RRC_IDLE`, `RRC_CONNECTED`, `DRX_SHORT`, `DRX_LONG`
- Power validation view comparing simulated results against reference benchmark bands

## Project Structure

```text
5g-power-lab/
  backend/
    app/
      main.py          FastAPI routes
      power_model.py   Modem power simulation model
      schemas.py       API request/response schemas
    requirements.txt
  frontend/
    index.html
    package.json
    src/
      App.jsx
      api.js
      main.jsx
      styles.css
  tests/
    test_power_model.py
```

## Run Locally

Open two terminals.

Terminal 1:

```bash
cd outputs/5g-power-lab/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Terminal 2:

```bash
cd outputs/5g-power-lab/frontend
npm install
npm run dev
```

Then open the local URL printed by Vite, usually:

```text
http://localhost:5173
```

## GitHub Pages

The deployed GitHub Pages site runs as a static React app. If the FastAPI backend is not available, the frontend automatically uses the same power model logic in the browser so charts, comparison mode, and CSV export still work live.

## API Endpoints

- `GET /health` - backend health check
- `POST /api/simulate` - simulate one network scenario over time
- `POST /api/compare` - compare LTE, 4G, and 5G NR for the same conditions
- `POST /api/export.csv` - export a scenario result as CSV
- `GET /api/benchmarks` - reference power bands used for validation

## Power Model Notes

The model is intentionally explainable rather than vendor-calibrated. It uses engineering assumptions that map cleanly to real modem power concepts:

- `RRC_IDLE`: low baseline power with paging wakeups
- `RRC_CONNECTED`: control-plane active, higher baseline
- `DRX_SHORT`: connected-mode sleep/wake cycle with frequent monitoring
- `DRX_LONG`: longer connected-mode sleep cycle with lower average power
- Weak RSRP and low SINR increase power due to higher transmit power, retransmissions, and longer active time
- Uplink traffic is weighted more heavily than downlink traffic because device transmit power is expensive
- 5G NR has a higher connected baseline but better high-throughput efficiency than LTE
- Handoff scenarios add measurement, search, and control-plane overhead

The dashboard’s validation panel compares simulated outputs to broad reference bands for idle, connected, streaming, transfer, and handoff behavior. Those bands are not chipset measurements; they are intentionally labeled as reference targets for model sanity checks.

## Interview Talking Points

- Explain how RRC state and DRX duty cycle change average power.
- Discuss why weak RSRP raises power even at the same application throughput.
- Compare LTE and 5G NR: 5G can consume more baseline power but can be more efficient at high throughput.
- Show the CSV export as KPI-style reporting for validation workflows.
- Describe how the backend model can later be calibrated using lab measurements.
