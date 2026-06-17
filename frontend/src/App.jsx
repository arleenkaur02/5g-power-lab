import React, { useEffect, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";
import * as THREE from "three";
import {
  Activity,
  BatteryCharging,
  Download,
  Gauge,
  Radio,
  RefreshCw,
  Signal,
  Zap,
} from "lucide-react";
import { compareScenario, exportCsv, getBenchmarks, simulateScenario } from "./api.js";

const initialScenario = {
  rat: "5G_NR",
  use_case: "video_streaming",
  rrc_state: "RRC_CONNECTED",
  rsrp_dbm: -92,
  sinr_db: 12,
  downlink_mbps: 80,
  uplink_mbps: 10,
  duration_s: 90,
  step_s: 1,
  battery_mah: 4500,
  battery_voltage_v: 3.85,
};

const ratOptions = [
  { value: "5G_NR", label: "5G NR" },
  { value: "LTE", label: "LTE" },
  { value: "4G", label: "4G" },
];

const useCaseOptions = [
  { value: "idle", label: "Idle" },
  { value: "video_streaming", label: "Video streaming" },
  { value: "data_transfer", label: "Data transfer" },
  { value: "handoff", label: "Handoff" },
];

const rrcOptions = ["RRC_IDLE", "RRC_CONNECTED", "DRX_SHORT", "DRX_LONG"];

function labelFor(options, value) {
  return options.find((item) => item.value === value)?.label ?? value;
}

function ControlPanel({ scenario, setScenario, onRun, onExport, loading }) {
  const update = (key, value) => setScenario((current) => ({ ...current, [key]: value }));

  return (
    <aside className="controls" aria-label="Simulation controls">
      <div className="controlHeader">
        <div>
          <p className="eyebrow">Scenario Controls</p>
          <h2>Network conditions</h2>
        </div>
        <button className="iconButton" onClick={onRun} disabled={loading} aria-label="Refresh simulation">
          <RefreshCw size={18} />
        </button>
      </div>

      <label>
        Network type
        <select value={scenario.rat} onChange={(event) => update("rat", event.target.value)}>
          {ratOptions.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Use case
        <select value={scenario.use_case} onChange={(event) => update("use_case", event.target.value)}>
          {useCaseOptions.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        RRC / DRX state
        <select value={scenario.rrc_state} onChange={(event) => update("rrc_state", event.target.value)}>
          {rrcOptions.map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <Slider label="RSRP" suffix="dBm" min="-125" max="-60" value={scenario.rsrp_dbm} onChange={(value) => update("rsrp_dbm", value)} />
      <Slider label="SINR" suffix="dB" min="-10" max="35" value={scenario.sinr_db} onChange={(value) => update("sinr_db", value)} />
      <Slider label="Downlink" suffix="Mbps" min="0" max="1200" value={scenario.downlink_mbps} onChange={(value) => update("downlink_mbps", value)} />
      <Slider label="Uplink" suffix="Mbps" min="0" max="200" value={scenario.uplink_mbps} onChange={(value) => update("uplink_mbps", value)} />
      <Slider label="Duration" suffix="s" min="5" max="300" value={scenario.duration_s} onChange={(value) => update("duration_s", value)} />
      <Slider label="Battery" suffix="mAh" min="2000" max="7000" step="100" value={scenario.battery_mah} onChange={(value) => update("battery_mah", value)} />

      <button className="primaryButton" onClick={onExport}>
        <Download size={18} />
        Export CSV
      </button>
    </aside>
  );
}

function Slider({ label, suffix, min, max, step = "1", value, onChange }) {
  return (
    <label className="sliderLabel">
      <span>
        {label}
        <strong>
          {value} {suffix}
        </strong>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Metric({ icon, label, value, tone }) {
  return (
    <div className={`metric ${tone ?? ""}`}>
      <span className="metricIcon">{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function makeLabelSprite(text, color = "#10272d") {
  const canvas = document.createElement("canvas");
  canvas.width = 360;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255,255,255,0.86)";
  context.strokeStyle = "rgba(18,33,38,0.18)";
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(12, 14, 336, 68, 18);
  context.fill();
  context.stroke();
  context.fillStyle = color;
  context.font = "800 30px Inter, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 180, 49);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.55, 0.42, 1);
  return sprite;
}

function makeRoundedBox(width, height, depth, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function SignalScene({ scenario, averagePower }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 1.15, 8.6);
    camera.lookAt(0, 0.15, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    group.position.set(1.15, -0.1, 0);
    group.scale.setScalar(0.78);
    scene.add(group);

    const ambient = new THREE.AmbientLight(0xffffff, 1.8);
    const keyLight = new THREE.PointLight(0x55f3df, 75, 18);
    keyLight.position.set(-3, 4, 5);
    const warmLight = new THREE.PointLight(0xff9b54, 55, 18);
    warmLight.position.set(4, -1, 4);
    keyLight.castShadow = true;
    scene.add(ambient, keyLight, warmLight);

    const towerMaterial = new THREE.MeshStandardMaterial({
      color: 0x20373d,
      metalness: 0.72,
      roughness: 0.28,
      emissive: 0x031c1a,
      emissiveIntensity: 0.4,
    });
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: 0x17d6c5,
      metalness: 0.45,
      roughness: 0.2,
      emissive: 0x0a615c,
      emissiveIntensity: 0.9,
    });
    const hotMaterial = new THREE.MeshStandardMaterial({
      color: 0xff8f4a,
      metalness: 0.35,
      roughness: 0.22,
      emissive: 0x873100,
      emissiveIntensity: 0.72,
    });
    const graphiteMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a2b30,
      metalness: 0.52,
      roughness: 0.32,
      emissive: 0x041616,
      emissiveIntensity: 0.22,
    });
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x0b1b20,
      metalness: 0.2,
      roughness: 0.12,
      transparent: true,
      opacity: 0.88,
      emissive: 0x0f7770,
      emissiveIntensity: 0.72,
    });
    const batteryMaterial = new THREE.MeshStandardMaterial({
      color: 0x243940,
      metalness: 0.48,
      roughness: 0.28,
      emissive: 0x08231f,
      emissiveIntensity: 0.35,
    });
    const batteryFillMaterial = new THREE.MeshStandardMaterial({
      color: 0x42d7c7,
      metalness: 0.25,
      roughness: 0.2,
      emissive: 0x0da898,
      emissiveIntensity: 0.95,
    });

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 3.6, 32), towerMaterial);
    mast.position.y = -0.4;
    mast.castShadow = true;
    group.add(mast);

    const antennaPanels = [];
    for (let index = 0; index < 3; index += 1) {
      const panel = makeRoundedBox(0.18, 1.05, 0.08, accentMaterial);
      panel.position.set(Math.cos(index * 2.1) * 0.42, 1.42, Math.sin(index * 2.1) * 0.42);
      panel.rotation.y = -index * 2.1;
      antennaPanels.push(panel);
      group.add(panel);
    }

    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.58, 2), accentMaterial);
    core.position.y = 1.65;
    core.castShadow = true;
    group.add(core);

    const device = makeRoundedBox(1.0, 1.75, 0.16, hotMaterial);
    device.position.set(2.45, -0.95, 0.5);
    device.rotation.set(-0.15, -0.45, 0.08);
    group.add(device);

    const deviceScreen = makeRoundedBox(0.78, 1.38, 0.04, glassMaterial);
    deviceScreen.position.set(2.4, -0.95, 0.39);
    deviceScreen.rotation.copy(device.rotation);
    group.add(deviceScreen);

    const labModule = new THREE.Group();
    labModule.position.set(0.2, -0.12, 0.1);
    labModule.rotation.set(-0.22, 0.15, 0.04);
    group.add(labModule);

    const moduleBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.05, 0.32, 6),
      new THREE.MeshStandardMaterial({
        color: 0x152a30,
        metalness: 0.68,
        roughness: 0.22,
        emissive: 0x051b1c,
        emissiveIntensity: 0.45,
      })
    );
    moduleBase.rotation.x = Math.PI / 2;
    moduleBase.castShadow = true;
    labModule.add(moduleBase);

    const moduleGlass = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.72, 2),
      new THREE.MeshStandardMaterial({
        color: 0x42d7c7,
        metalness: 0.18,
        roughness: 0.06,
        transparent: true,
        opacity: 0.72,
        emissive: 0x0ca99a,
        emissiveIntensity: 1.12,
      })
    );
    moduleGlass.position.z = 0.28;
    labModule.add(moduleGlass);

    const moduleOrbit = new THREE.Mesh(
      new THREE.TorusGeometry(1.02, 0.018, 12, 112),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72 })
    );
    moduleOrbit.rotation.x = Math.PI / 2.6;
    labModule.add(moduleOrbit);

    const chipGroup = new THREE.Group();
    chipGroup.position.set(-2.35, -0.98, 0.28);
    chipGroup.rotation.set(-0.2, 0.45, -0.08);
    group.add(chipGroup);

    const chip = makeRoundedBox(1.32, 0.92, 0.18, graphiteMaterial);
    chipGroup.add(chip);
    const chipCore = makeRoundedBox(0.68, 0.42, 0.08, accentMaterial);
    chipCore.position.z = 0.13;
    chipGroup.add(chipCore);
    const pins = [];
    for (let index = 0; index < 8; index += 1) {
      const pin = makeRoundedBox(0.045, 0.16, 0.035, accentMaterial);
      pin.position.set(-0.55 + index * 0.16, 0.56, 0.02);
      pins.push(pin);
      chipGroup.add(pin);
      const lowerPin = makeRoundedBox(0.045, 0.16, 0.035, accentMaterial);
      lowerPin.position.set(-0.55 + index * 0.16, -0.56, 0.02);
      pins.push(lowerPin);
      chipGroup.add(lowerPin);
    }

    const batteryGroup = new THREE.Group();
    batteryGroup.position.set(0.95, -1.35, -0.45);
    batteryGroup.rotation.set(-0.32, -0.18, 0.06);
    group.add(batteryGroup);
    const batteryShell = makeRoundedBox(1.2, 0.58, 0.28, batteryMaterial);
    batteryGroup.add(batteryShell);
    const batteryCap = makeRoundedBox(0.16, 0.32, 0.2, batteryMaterial);
    batteryCap.position.x = 0.68;
    batteryGroup.add(batteryCap);
    const batteryFill = makeRoundedBox(0.78, 0.34, 0.31, batteryFillMaterial);
    batteryFill.position.set(-0.11, 0, 0.02);
    batteryGroup.add(batteryFill);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(3.7, 96),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 })
    );
    floor.position.y = -1.76;
    floor.rotation.x = -Math.PI / 2;
    group.add(floor);

    const rings = [];
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x49e8d8,
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide,
    });
    for (let index = 0; index < 4; index += 1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05 + index * 0.55, 0.012, 12, 96), ringMaterial.clone());
      ring.rotation.x = Math.PI / 2.35;
      ring.position.y = 1.65;
      rings.push(ring);
      group.add(ring);
    }

    const linkMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.62 });
    const links = [];
    const linkTargets = [
      [-2.2, 0.35, -0.1],
      [-1.55, 2.15, 0.2],
      [0.95, 2.75, -0.15],
      [2.45, -0.35, 0.52],
      [1.7, 0.75, -0.9],
      [-2.35, -0.98, 0.28],
      [0.95, -1.35, -0.45],
    ];
    linkTargets.forEach((target) => {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 1.65, 0),
        new THREE.Vector3(...target),
      ]);
      const line = new THREE.Line(geometry, linkMaterial.clone());
      links.push(line);
      group.add(line);
    });

    const nodeMaterial = new THREE.MeshStandardMaterial({
      color: 0xf5fbfb,
      metalness: 0.3,
      roughness: 0.18,
      emissive: 0x17998e,
      emissiveIntensity: 0.4,
    });
    linkTargets.forEach((target, index) => {
      const node = new THREE.Mesh(new THREE.SphereGeometry(index === 3 ? 0.12 : 0.08, 24, 24), nodeMaterial);
      node.position.set(...target);
      group.add(node);
    });

    const labels = [
      { text: "RRC + DRX", position: [-1.95, 2.75, 0.1], color: "#0b6f68" },
      { text: "RF MODEM", position: [-2.45, -1.72, 0.32], color: "#10272d" },
      { text: "POWER mW", position: [1.0, -2.05, -0.3], color: "#b9571b" },
      { text: scenario.rat === "5G_NR" ? "5G NR" : scenario.rat, position: [2.65, 0.35, 0.58], color: "#0b6f68" },
    ].map((label) => {
      const sprite = makeLabelSprite(label.text, label.color);
      sprite.position.set(...label.position);
      group.add(sprite);
      return sprite;
    });

    sceneRef.current = {
      camera,
      renderer,
      group,
      core,
      rings,
      links,
      device,
      chipGroup,
      chipCore,
      batteryGroup,
      batteryFill,
      labModule,
      moduleGlass,
      moduleOrbit,
      antennaPanels,
      labels,
      mount,
    };

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      if (width < 720) {
        group.position.set(0, -0.22, 0);
        group.scale.setScalar(0.56);
      } else {
        group.position.set(1.15, -0.1, 0);
        group.scale.setScalar(0.78);
      }
      camera.updateProjectionMatrix();
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);

    let frameId = 0;
    const animate = (time) => {
      const t = time / 1000;
      group.rotation.y = t * 0.42;
      group.rotation.x = Math.sin(t * 0.55) * 0.04;
      core.rotation.x = t * 0.38;
      core.rotation.y = t * 0.56;
      labModule.rotation.y = t * 0.95;
      labModule.rotation.z = 0.04 + Math.sin(t * 0.8) * 0.08;
      moduleGlass.rotation.x = t * 0.72;
      moduleGlass.rotation.y = t * 1.05;
      moduleOrbit.rotation.z = t * 1.4;
      device.position.y = -0.95 + Math.sin(t * 1.4) * 0.04;
      chipGroup.rotation.z = -0.08 + Math.sin(t * 1.15) * 0.035;
      chipCore.scale.setScalar(1 + Math.abs(Math.sin(t * 2.1)) * 0.08);
      batteryGroup.position.y = -1.35 + Math.sin(t * 1.05 + 1.1) * 0.04;
      antennaPanels.forEach((panel, index) => {
        panel.material.emissiveIntensity = 0.55 + Math.abs(Math.sin(t * 1.6 + index)) * 0.45;
      });
      rings.forEach((ring, index) => {
        ring.rotation.z = t * (0.32 + index * 0.08);
        ring.material.opacity = 0.17 + Math.abs(Math.sin(t * 1.5 - index * 0.7)) * 0.31;
      });
      links.forEach((line, index) => {
        line.material.opacity = 0.22 + Math.abs(Math.sin(t * 1.8 + index)) * 0.42;
      });
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };
    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
          else object.material.dispose();
        }
      });
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const is5g = scenario.rat === "5G_NR";
    const weakSignal = Math.min(1, Math.max(0, (-82 - scenario.rsrp_dbm) / 38));
    const powerPulse = Math.min(1, Math.max(0.2, (averagePower || 850) / 1800));
    scene.core.scale.setScalar(is5g ? 1.1 + powerPulse * 0.18 : 0.95 + powerPulse * 0.12);
    scene.chipCore.material.color.set(scenario.rrc_state.includes("DRX") ? 0x42d7c7 : 0xff9b54);
    scene.chipCore.material.emissive.set(scenario.rrc_state.includes("DRX") ? 0x0da898 : 0x873100);
    scene.batteryFill.scale.x = Math.max(0.28, 1 - powerPulse * 0.46);
    scene.batteryFill.position.x = -0.11 - (1 - scene.batteryFill.scale.x) * 0.2;
    scene.rings.forEach((ring, index) => {
      const scale = 1 + weakSignal * 0.22 + index * 0.015;
      ring.scale.set(scale, scale, scale);
      ring.material.color.set(is5g ? 0x49e8d8 : 0x6d8dff);
    });
    scene.links.forEach((line) => {
      line.material.color.set(scenario.use_case === "handoff" ? 0xff9b54 : 0xffffff);
    });
  }, [scenario, averagePower]);

  return <div className="signalScene" ref={mountRef} aria-hidden="true" />;
}

function App() {
  const [scenario, setScenario] = useState(initialScenario);
  const [result, setResult] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [benchmarks, setBenchmarks] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runSimulation = async () => {
    setLoading(true);
    setError("");
    try {
      const [simulation, compare] = await Promise.all([
        simulateScenario(scenario),
        compareScenario(scenario),
      ]);
      setResult(simulation);
      setComparison(compare);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runSimulation();
    getBenchmarks().then(setBenchmarks).catch(() => setBenchmarks(null));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(runSimulation, 250);
    return () => window.clearTimeout(timer);
  }, [scenario]);

  const powerTrace = useMemo(() => {
    if (!result) return [];
    return [
      {
        x: result.points.map((point) => point.time_s),
        y: result.points.map((point) => point.power_mw),
        type: "scatter",
        mode: "lines",
        fill: "tozeroy",
        name: labelFor(ratOptions, scenario.rat),
        line: { color: "#12a594", width: 3 },
        fillcolor: "rgba(18, 165, 148, 0.16)",
      },
    ];
  }, [result, scenario.rat]);

  const compareTrace = useMemo(() => {
    if (!comparison) return [];
    const colors = { LTE: "#4c6fff", "5G_NR": "#ff7a45", "4G": "#6b7280" };
    return comparison.results.map((item) => ({
      x: item.points.map((point) => point.time_s),
      y: item.points.map((point) => point.power_mw),
      type: "scatter",
      mode: "lines",
      name: item.scenario.rat === "5G_NR" ? "5G NR" : item.scenario.rat,
      line: { color: colors[item.scenario.rat], width: 3 },
    }));
  }, [comparison]);

  const benchmark = benchmarks?.[scenario.use_case];

  return (
    <main className="appShell">
      <ControlPanel scenario={scenario} setScenario={setScenario} onRun={runSimulation} onExport={() => exportCsv(scenario)} loading={loading} />

      <section className="workspace">
        <header className="labHero">
          <SignalScene scenario={scenario} averagePower={result?.summary.average_power_mw} />
          <div className="heroContent">
            <div>
              <p className="eyebrow">5G Power Lab</p>
              <h1>Interactive 5G/LTE power consumption visualizer</h1>
            </div>
            <div className="statusPill">
              <Radio size={16} />
              {labelFor(ratOptions, scenario.rat)} · {scenario.rrc_state}
            </div>
          </div>
          <div className="heroReadout">
            <span>{scenario.rsrp_dbm} dBm RSRP</span>
            <span>{scenario.sinr_db} dB SINR</span>
            <span>{labelFor(useCaseOptions, scenario.use_case)}</span>
          </div>
        </header>

        {error && <div className="errorBox">Backend unavailable: {error}</div>}

        {result && (
          <>
            <div className="metricsGrid">
              <Metric icon={<Zap size={18} />} label="Average power" value={`${result.summary.average_power_mw} mW`} />
              <Metric icon={<Gauge size={18} />} label="Peak power" value={`${result.summary.peak_power_mw} mW`} tone="warm" />
              <Metric icon={<BatteryCharging size={18} />} label="Battery drain" value={`${result.summary.battery_drain_percent_per_hour}%/hr`} />
              <Metric icon={<Signal size={18} />} label="Validation" value={result.summary.validation_label} tone="blue" />
            </div>

            <div className="chartBand">
              <div className="sectionTitle">
                <div>
                  <p className="eyebrow">Live Simulation</p>
                  <h2>Power draw over time</h2>
                </div>
                <span>{labelFor(useCaseOptions, scenario.use_case)}</span>
              </div>
              <Plot
                data={powerTrace}
                layout={{
                  autosize: true,
                  margin: { l: 58, r: 24, t: 18, b: 48 },
                  paper_bgcolor: "transparent",
                  plot_bgcolor: "transparent",
                  font: { color: "#263238", family: "Inter, system-ui, sans-serif" },
                  xaxis: { title: "Time (s)", gridcolor: "#e6ecef" },
                  yaxis: { title: "Power (mW)", gridcolor: "#e6ecef" },
                  showlegend: false,
                }}
                config={{ displayModeBar: false, responsive: true }}
                className="plot"
                useResizeHandler
              />
            </div>

            <div className="twoColumn">
              <section className="panel">
                <div className="sectionTitle">
                  <div>
                    <p className="eyebrow">Comparison Mode</p>
                    <h2>LTE vs 5G NR</h2>
                  </div>
                  <Activity size={20} />
                </div>
                <Plot
                  data={compareTrace}
                  layout={{
                    autosize: true,
                    margin: { l: 54, r: 18, t: 12, b: 42 },
                    paper_bgcolor: "transparent",
                    plot_bgcolor: "transparent",
                    font: { color: "#263238", family: "Inter, system-ui, sans-serif" },
                    xaxis: { title: "Time (s)", gridcolor: "#e6ecef" },
                    yaxis: { title: "Power (mW)", gridcolor: "#e6ecef" },
                    legend: { orientation: "h", x: 0, y: 1.16 },
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  className="plot small"
                  useResizeHandler
                />
              </section>

              <section className="panel">
                <div className="sectionTitle">
                  <div>
                    <p className="eyebrow">Validation</p>
                    <h2>Reference band</h2>
                  </div>
                  <span className="bandLabel">{benchmark ? `${benchmark.low_mw}-${benchmark.high_mw} mW` : "Loading"}</span>
                </div>
                <div className="validationMeter">
                  <div
                    className="validationFill"
                    style={{
                      width: `${Math.min(100, (result.summary.average_power_mw / Math.max(benchmark?.high_mw ?? 1, 1)) * 100)}%`,
                    }}
                  />
                </div>
                <dl className="detailsList">
                  <div>
                    <dt>Use case</dt>
                    <dd>{labelFor(useCaseOptions, scenario.use_case)}</dd>
                  </div>
                  <div>
                    <dt>Efficiency</dt>
                    <dd>{result.summary.efficiency_mw_per_mbps} mW/Mbps</dd>
                  </div>
                  <div>
                    <dt>Energy</dt>
                    <dd>{result.summary.energy_mj} mJ</dd>
                  </div>
                  <div>
                    <dt>Thermal index</dt>
                    <dd>{result.summary.thermal_index}</dd>
                  </div>
                </dl>
                <p className="note">{benchmark?.notes ?? "Reference targets load from the FastAPI backend."}</p>
              </section>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default App;
