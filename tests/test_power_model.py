import unittest

from backend.app.power_model import simulate
from backend.app.schemas import RadioAccess, RrcState, SimulationRequest, UseCase


class PowerModelTests(unittest.TestCase):
    def test_weak_signal_draws_more_power(self):
        weak = simulate(SimulationRequest(rat=RadioAccess.LTE, rsrp_dbm=-115, sinr_db=2))
        strong = simulate(SimulationRequest(rat=RadioAccess.LTE, rsrp_dbm=-75, sinr_db=24))

        self.assertGreater(weak.summary.average_power_mw, strong.summary.average_power_mw)

    def test_drx_long_reduces_power_vs_connected(self):
        connected = simulate(SimulationRequest(rrc_state=RrcState.RRC_CONNECTED))
        drx = simulate(SimulationRequest(rrc_state=RrcState.DRX_LONG))

        self.assertGreater(connected.summary.average_power_mw, drx.summary.average_power_mw)

    def test_handoff_has_higher_peak_than_idle(self):
        handoff = simulate(SimulationRequest(use_case=UseCase.HANDOFF, rrc_state=RrcState.RRC_CONNECTED))
        idle = simulate(SimulationRequest(use_case=UseCase.IDLE, rrc_state=RrcState.RRC_IDLE))

        self.assertGreater(handoff.summary.peak_power_mw, idle.summary.peak_power_mw)


if __name__ == "__main__":
    unittest.main()

