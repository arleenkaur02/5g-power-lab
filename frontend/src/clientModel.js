const BENCHMARKS = {
  idle: { low_mw: 35, high_mw: 180, notes: "Paging and background cell monitoring." },
  connected: { low_mw: 180, high_mw: 620, notes: "Control channel active without heavy payload." },
  video_streaming: { low_mw: 500, high_mw: 1450, notes: "Sustained downlink with DRX opportunities." },
  data_transfer: { low_mw: 700, high_mw: 2200, notes: "High throughput, scheduler activity, uplink ACKs." },
  handoff: { low_mw: 900, high_mw: 2600, notes: "Measurements, search, and transition overhead." },
};

function clamp(value, low, high) {
  return Math.max(low, Math.min(value, high));
}

function ratBaseline(rat) {
  return { "4G": 170, LTE: 190, "5G_NR": 310 }[rat] ?? 190;
}

function rrcProfile(rrcState) {
  if (rrcState === "RRC_IDLE") return [0.32, 0.08];
  if (rrcState === "DRX_LONG") return [0.58, 0.28];
  if (rrcState === "DRX_SHORT") return [0.76, 0.46];
  return [1.0, 1.0];
}

function signalPenalty(rsrpDbm, sinrDb, rat) {
  const weakRsrp = clamp((-85 - rsrpDbm) / 38, 0, 1.35);
  const poorSinr = clamp((14 - sinrDb) / 26, 0, 1);
  const ratFactor = rat === "5G_NR" ? 1.18 : 1;
  return ratFactor * (weakRsrp * 310 + poorSinr * 190);
}

function trafficPower(rat, downlinkMbps, uplinkMbps) {
  const total = Math.max(0, downlinkMbps) + Math.max(0, uplinkMbps);
  if (total === 0) return 0;

  if (rat === "5G_NR") {
    return downlinkMbps * 4.6 + uplinkMbps * 13.8 + 240 * (1 - Math.exp(-total / 190));
  }

  const dlCoeff = rat === "LTE" ? 7.0 : 7.8;
  const ulCoeff = rat === "LTE" ? 11.2 : 12.0;
  return downlinkMbps * dlCoeff + uplinkMbps * ulCoeff + 125 * (1 - Math.exp(-total / 85));
}

function phaseMultiplier(useCase, second) {
  if (useCase === "idle") return second % 10 === 0 ? ["paging", 1.55] : ["idle", 0.82];
  if (useCase === "video_streaming") return second % 18 < 5 ? ["buffer_fill", 1.24] : ["playback_drx", 0.86];
  if (useCase === "data_transfer") return second % 12 < 7 ? ["burst_transfer", 1.18] : ["scheduler_gap", 0.78];
  return second % 20 < 6 ? ["handoff_measurement", 1.38] : ["post_handoff_stabilize", 0.95];
}

function handoffPower(useCase, rsrpDbm, second) {
  if (useCase !== "handoff") return 0;
  if (second % 20 >= 6) return 80;
  return 310 * (1 + clamp((-95 - rsrpDbm) / 25, 0, 0.9));
}

function validationLabel(useCase, averagePowerMw) {
  const band = BENCHMARKS[useCase];
  if (averagePowerMw >= band.low_mw && averagePowerMw <= band.high_mw) return "within reference band";
  return averagePowerMw < band.low_mw ? "below reference band" : "above reference band";
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function localBenchmarks() {
  return BENCHMARKS;
}

export function localSimulate(payload) {
  const points = [];
  const rrcState = payload.use_case === "idle" ? "RRC_IDLE" : payload.rrc_state;
  const [rrcMultiplier, drxDutyCycle] = rrcProfile(rrcState);

  for (let second = 0; second <= payload.duration_s; second += payload.step_s) {
    const [phase, multiplier] = phaseMultiplier(payload.use_case, second);
    const activePower =
      ratBaseline(payload.rat) +
      signalPenalty(payload.rsrp_dbm, payload.sinr_db, payload.rat) +
      trafficPower(payload.rat, payload.downlink_mbps, payload.uplink_mbps) +
      handoffPower(payload.use_case, payload.rsrp_dbm, second);
    const sleepFloor = payload.rat === "5G_NR" ? 58 : 32;
    const averagedPower = activePower * drxDutyCycle + sleepFloor * (1 - drxDutyCycle);
    points.push({
      time_s: second,
      power_mw: round(Math.max(0, averagedPower * rrcMultiplier * multiplier)),
      rsrp_dbm: payload.rsrp_dbm,
      rrc_state: payload.rrc_state,
      rat: payload.rat,
      phase,
    });
  }

  const powers = points.map((point) => point.power_mw);
  const averagePower = powers.reduce((sum, value) => sum + value, 0) / powers.length;
  const peakPower = Math.max(...powers);
  const minPower = Math.min(...powers);
  const batteryWh = (payload.battery_mah * payload.battery_voltage_v) / 1000;
  const throughput = Math.max(0, payload.downlink_mbps + payload.uplink_mbps);

  return {
    scenario: payload,
    points,
    summary: {
      average_power_mw: round(averagePower),
      peak_power_mw: round(peakPower),
      min_power_mw: round(minPower),
      energy_mj: round(averagePower * payload.duration_s),
      battery_drain_percent_per_hour: round(((averagePower / 1000) / batteryWh) * 100, 3),
      efficiency_mw_per_mbps: round(throughput > 0 ? averagePower / throughput : averagePower, 3),
      thermal_index: round(clamp((peakPower - 420) / 1900, 0, 1), 3),
      validation_label: validationLabel(payload.use_case, averagePower),
    },
  };
}

export function localCompare(payload) {
  return {
    results: ["LTE", "5G_NR"].map((rat) => localSimulate({ ...payload, rat })),
  };
}

export function localCsv(payload) {
  const result = localSimulate(payload);
  const rows = [
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
    ],
    ...result.points.map((point) => [
      point.time_s,
      point.rat,
      point.rrc_state,
      payload.use_case,
      point.rsrp_dbm,
      payload.sinr_db,
      point.phase,
      point.power_mw,
      result.summary.average_power_mw,
      result.summary.battery_drain_percent_per_hour,
      result.summary.validation_label,
    ]),
  ];

  return rows.map((row) => row.join(",")).join("\n");
}

