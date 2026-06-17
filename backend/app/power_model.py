from __future__ import annotations

import math
from dataclasses import dataclass
from statistics import mean

from .schemas import (
    KpiSummary,
    PowerPoint,
    RadioAccess,
    RrcState,
    SimulationRequest,
    SimulationResponse,
    UseCase,
)


REFERENCE_BENCHMARKS = {
    "idle": {"low_mw": 35, "high_mw": 180, "notes": "Paging and background cell monitoring."},
    "connected": {"low_mw": 180, "high_mw": 620, "notes": "Control channel active without heavy payload."},
    "video_streaming": {"low_mw": 500, "high_mw": 1450, "notes": "Sustained downlink with DRX opportunities."},
    "data_transfer": {"low_mw": 700, "high_mw": 2200, "notes": "High throughput, scheduler activity, uplink ACKs."},
    "handoff": {"low_mw": 900, "high_mw": 2600, "notes": "Measurements, search, and transition overhead."},
}


@dataclass(frozen=True)
class PowerComponents:
    baseline_mw: float
    signal_penalty_mw: float
    traffic_mw: float
    rrc_multiplier: float
    drx_duty_cycle: float
    handoff_mw: float


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(value, high))


def rat_baseline(rat: RadioAccess) -> float:
    return {
        RadioAccess.FOUR_G: 170.0,
        RadioAccess.LTE: 190.0,
        RadioAccess.NR5G: 310.0,
    }[rat]


def use_case_load(use_case: UseCase) -> tuple[float, float]:
    return {
        UseCase.IDLE: (0.0, 0.0),
        UseCase.VIDEO_STREAMING: (65.0, 3.0),
        UseCase.DATA_TRANSFER: (300.0, 28.0),
        UseCase.HANDOFF: (45.0, 6.0),
    }[use_case]


def rrc_profile(rrc_state: RrcState) -> tuple[float, float]:
    if rrc_state == RrcState.RRC_IDLE:
        return 0.32, 0.08
    if rrc_state == RrcState.DRX_LONG:
        return 0.58, 0.28
    if rrc_state == RrcState.DRX_SHORT:
        return 0.76, 0.46
    return 1.0, 1.0


def signal_penalty(rsrp_dbm: float, sinr_db: float, rat: RadioAccess) -> float:
    weak_rsrp = clamp((-85.0 - rsrp_dbm) / 38.0, 0.0, 1.35)
    poor_sinr = clamp((14.0 - sinr_db) / 26.0, 0.0, 1.0)
    rat_factor = 1.18 if rat == RadioAccess.NR5G else 1.0
    return rat_factor * ((weak_rsrp * 310.0) + (poor_sinr * 190.0))


def traffic_power(rat: RadioAccess, downlink_mbps: float, uplink_mbps: float) -> float:
    dl = max(0.0, downlink_mbps)
    ul = max(0.0, uplink_mbps)
    total = dl + ul
    if total == 0:
        return 0.0

    if rat == RadioAccess.NR5G:
        dl_coeff = 4.6
        ul_coeff = 13.8
        bandwidth_overhead = 240.0 * (1.0 - math.exp(-total / 190.0))
    else:
        dl_coeff = 7.0 if rat == RadioAccess.LTE else 7.8
        ul_coeff = 11.2 if rat == RadioAccess.LTE else 12.0
        bandwidth_overhead = 125.0 * (1.0 - math.exp(-total / 85.0))

    return (dl * dl_coeff) + (ul * ul_coeff) + bandwidth_overhead


def phase_multiplier(use_case: UseCase, second: int) -> tuple[str, float]:
    if use_case == UseCase.IDLE:
        return ("paging", 1.55) if second % 10 == 0 else ("idle", 0.82)
    if use_case == UseCase.VIDEO_STREAMING:
        return ("buffer_fill", 1.24) if second % 18 < 5 else ("playback_drx", 0.86)
    if use_case == UseCase.DATA_TRANSFER:
        cycle = second % 12
        if cycle < 7:
            return "burst_transfer", 1.18
        return "scheduler_gap", 0.78
    if second % 20 < 6:
        return "handoff_measurement", 1.38
    return "post_handoff_stabilize", 0.95


def handoff_power(use_case: UseCase, rsrp_dbm: float, second: int) -> float:
    if use_case != UseCase.HANDOFF:
        return 0.0
    if second % 20 >= 6:
        return 80.0
    weak_signal_multiplier = 1.0 + clamp((-95.0 - rsrp_dbm) / 25.0, 0.0, 0.9)
    return 310.0 * weak_signal_multiplier


def components_for(request: SimulationRequest, second: int) -> PowerComponents:
    default_dl, default_ul = use_case_load(request.use_case)
    downlink = request.downlink_mbps if request.downlink_mbps > 0 else default_dl
    uplink = request.uplink_mbps if request.uplink_mbps > 0 else default_ul
    rrc_multiplier, drx_duty_cycle = rrc_profile(request.rrc_state)

    if request.use_case == UseCase.IDLE:
        rrc_multiplier, drx_duty_cycle = rrc_profile(RrcState.RRC_IDLE)

    return PowerComponents(
        baseline_mw=rat_baseline(request.rat),
        signal_penalty_mw=signal_penalty(request.rsrp_dbm, request.sinr_db, request.rat),
        traffic_mw=traffic_power(request.rat, downlink, uplink),
        rrc_multiplier=rrc_multiplier,
        drx_duty_cycle=drx_duty_cycle,
        handoff_mw=handoff_power(request.use_case, request.rsrp_dbm, second),
    )


def power_at_second(request: SimulationRequest, second: int) -> tuple[float, str]:
    phase, multiplier = phase_multiplier(request.use_case, second)
    c = components_for(request, second)
    active_power = c.baseline_mw + c.signal_penalty_mw + c.traffic_mw + c.handoff_mw
    sleep_floor = 32.0 if request.rat != RadioAccess.NR5G else 58.0
    averaged_power = (active_power * c.drx_duty_cycle) + (sleep_floor * (1.0 - c.drx_duty_cycle))
    return max(0.0, averaged_power * c.rrc_multiplier * multiplier), phase


def validation_label(use_case: UseCase, average_power_mw: float) -> str:
    band = REFERENCE_BENCHMARKS[use_case.value]
    if band["low_mw"] <= average_power_mw <= band["high_mw"]:
        return "within reference band"
    if average_power_mw < band["low_mw"]:
        return "below reference band"
    return "above reference band"


def simulate(request: SimulationRequest) -> SimulationResponse:
    points: list[PowerPoint] = []
    for second in range(0, request.duration_s + 1, request.step_s):
        power_mw, phase = power_at_second(request, second)
        points.append(
            PowerPoint(
                time_s=second,
                power_mw=round(power_mw, 2),
                rsrp_dbm=request.rsrp_dbm,
                rrc_state=request.rrc_state,
                rat=request.rat,
                phase=phase,
            )
        )

    powers = [point.power_mw for point in points]
    avg_power = mean(powers)
    peak_power = max(powers)
    min_power = min(powers)
    energy_mj = avg_power * request.duration_s
    battery_wh = request.battery_mah * request.battery_voltage_v / 1000.0
    drain_percent_per_hour = (avg_power / 1000.0) / battery_wh * 100.0
    throughput = max(0.0, request.downlink_mbps + request.uplink_mbps)
    efficiency = avg_power / throughput if throughput > 0 else avg_power
    thermal_index = clamp((peak_power - 420.0) / 1900.0, 0.0, 1.0)

    summary = KpiSummary(
        average_power_mw=round(avg_power, 2),
        peak_power_mw=round(peak_power, 2),
        min_power_mw=round(min_power, 2),
        energy_mj=round(energy_mj, 2),
        battery_drain_percent_per_hour=round(drain_percent_per_hour, 3),
        efficiency_mw_per_mbps=round(efficiency, 3),
        thermal_index=round(thermal_index, 3),
        validation_label=validation_label(request.use_case, avg_power),
    )
    return SimulationResponse(scenario=request, points=points, summary=summary)

