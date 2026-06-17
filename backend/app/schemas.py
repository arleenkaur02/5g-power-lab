from enum import Enum
from typing import List

try:
    from pydantic import BaseModel, Field
except ModuleNotFoundError:
    def Field(default, **_kwargs):
        return default

    class BaseModel:
        def __init__(self, **kwargs):
            annotations = getattr(self, "__annotations__", {})
            for name in annotations:
                class_value = getattr(self.__class__, name, None)
                if name in kwargs:
                    value = kwargs[name]
                elif class_value is not None:
                    value = class_value.copy() if isinstance(class_value, list) else class_value
                else:
                    continue
                setattr(self, name, value)

        def model_dump(self, exclude=None):
            exclude = set(exclude or [])
            return {
                name: getattr(self, name)
                for name in getattr(self, "__annotations__", {})
                if name not in exclude and hasattr(self, name)
            }

        def model_copy(self, update=None):
            data = self.model_dump()
            data.update(update or {})
            return self.__class__(**data)


class RadioAccess(str, Enum):
    LTE = "LTE"
    FOUR_G = "4G"
    NR5G = "5G_NR"


class UseCase(str, Enum):
    IDLE = "idle"
    VIDEO_STREAMING = "video_streaming"
    DATA_TRANSFER = "data_transfer"
    HANDOFF = "handoff"


class RrcState(str, Enum):
    RRC_IDLE = "RRC_IDLE"
    RRC_CONNECTED = "RRC_CONNECTED"
    DRX_SHORT = "DRX_SHORT"
    DRX_LONG = "DRX_LONG"


class SimulationRequest(BaseModel):
    rat: RadioAccess = RadioAccess.NR5G
    use_case: UseCase = UseCase.VIDEO_STREAMING
    rrc_state: RrcState = RrcState.RRC_CONNECTED
    rsrp_dbm: float = Field(default=-92, ge=-125, le=-60)
    sinr_db: float = Field(default=12, ge=-10, le=35)
    downlink_mbps: float = Field(default=80, ge=0, le=1200)
    uplink_mbps: float = Field(default=10, ge=0, le=200)
    duration_s: int = Field(default=60, ge=5, le=600)
    step_s: int = Field(default=1, ge=1, le=10)
    battery_mah: float = Field(default=4500, ge=2000, le=7000)
    battery_voltage_v: float = Field(default=3.85, ge=3.0, le=4.5)


class PowerPoint(BaseModel):
    time_s: int
    power_mw: float
    rsrp_dbm: float
    rrc_state: RrcState
    rat: RadioAccess
    phase: str


class KpiSummary(BaseModel):
    average_power_mw: float
    peak_power_mw: float
    min_power_mw: float
    energy_mj: float
    battery_drain_percent_per_hour: float
    efficiency_mw_per_mbps: float
    thermal_index: float
    validation_label: str


class SimulationResponse(BaseModel):
    scenario: SimulationRequest
    points: List[PowerPoint]
    summary: KpiSummary


class CompareRequest(SimulationRequest):
    rats: List[RadioAccess] = [RadioAccess.LTE, RadioAccess.NR5G]


class CompareResponse(BaseModel):
    results: List[SimulationResponse]
