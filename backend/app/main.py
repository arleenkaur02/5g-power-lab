from __future__ import annotations

import csv
import io
from typing import Dict, Union

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .power_model import REFERENCE_BENCHMARKS, simulate
from .schemas import CompareRequest, CompareResponse, SimulationRequest


app = FastAPI(
    title="5G Power Lab API",
    description="FastAPI backend for interactive LTE/5G modem power simulation.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/benchmarks")
def benchmarks() -> Dict[str, Dict[str, Union[float, str]]]:
    return REFERENCE_BENCHMARKS


@app.post("/api/simulate")
def simulate_scenario(request: SimulationRequest):
    return simulate(request)


@app.post("/api/compare")
def compare_scenario(request: CompareRequest) -> CompareResponse:
    results = []
    for rat in request.rats:
        scenario = request.model_copy(update={"rat": rat})
        results.append(simulate(SimulationRequest(**scenario.model_dump(exclude={"rats"}))))
    return CompareResponse(results=results)


@app.post("/api/export.csv")
def export_csv(request: SimulationRequest):
    result = simulate(request)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "time_s",
            "rat",
            "rrc_state",
            "use_case",
            "rsrp_dbm",
            "sinr_db",
            "phase",
            "power_mw",
            "average_power_mw",
            "battery_drain_percent_per_hour",
            "validation_label",
        ]
    )
    for point in result.points:
        writer.writerow(
            [
                point.time_s,
                point.rat,
                point.rrc_state,
                request.use_case,
                point.rsrp_dbm,
                request.sinr_db,
                point.phase,
                point.power_mw,
                result.summary.average_power_mw,
                result.summary.battery_drain_percent_per_hour,
                result.summary.validation_label,
            ]
        )
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=5g_power_lab_report.csv"},
    )
