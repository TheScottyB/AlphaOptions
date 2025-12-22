"""
Sanity tests for AlphaOptions risk management.
"""

import pytest
from decimal import Decimal

from alphaoptions.models import OrderSide
from alphaoptions.risk import RiskManager, RiskLimits, PositionSizer


class TestRiskLimits:
    """Sanity tests for RiskLimits configuration."""

    @pytest.mark.sanity
    def test_default_limits(self):
        """Test default risk limit values."""
        limits = RiskLimits()
        assert limits.max_portfolio_risk_pct == 5.0
        assert limits.max_position_size == 10
        assert limits.max_daily_loss_pct == 2.0
        assert limits.max_single_trade_risk_pct == 1.0
        assert limits.min_buying_power_reserve_pct == 20.0
        assert limits.max_concentration_pct == 25.0

    @pytest.mark.sanity
    def test_custom_limits(self):
        """Test custom risk limits."""
        limits = RiskLimits(
            max_portfolio_risk_pct=10.0,
            max_position_size=20,
        )
        assert limits.max_portfolio_risk_pct == 10.0
        assert limits.max_position_size == 20


class TestPositionSizer:
    """Sanity tests for PositionSizer."""

    @pytest.mark.sanity
    def test_position_sizer_creation(self, position_sizer):
        """Test position sizer initialization."""
        assert position_sizer.account_value == Decimal("100000")
        assert position_sizer.risk_per_trade_pct == 1.0
        assert position_sizer.max_contracts == 10

    @pytest.mark.sanity
    def test_calculate_position_size(self, position_sizer, sample_call_contract):
        """Test position size calculation."""
        size = position_sizer.calculate_position_size(
            sample_call_contract, stop_loss_pct=50.0
        )
        # Should return a positive integer
        assert size > 0
        assert isinstance(size, int)
        # Should not exceed max contracts
        assert size <= position_sizer.max_contracts

    @pytest.mark.sanity
    def test_calculate_position_size_no_price(self, position_sizer):
        """Test position sizing with no price returns 0."""
        from alphaoptions.models import OptionContract, OptionType
        from datetime import date

        contract = OptionContract(
            symbol="TEST",
            underlying="SPY",
            option_type=OptionType.CALL,
            strike=Decimal("475.00"),
            expiration=date.today(),
            bid=None,
            ask=None,
        )
        size = position_sizer.calculate_position_size(contract)
        assert size == 0

    @pytest.mark.sanity
    def test_validate_position_size_valid(self, position_sizer, sample_call_contract):
        """Test valid position size validation."""
        assert position_sizer.validate_position_size(5, sample_call_contract) is True

    @pytest.mark.sanity
    def test_validate_position_size_invalid(self, position_sizer, sample_call_contract):
        """Test invalid position sizes."""
        # Zero quantity
        assert position_sizer.validate_position_size(0, sample_call_contract) is False
        # Negative quantity
        assert position_sizer.validate_position_size(-1, sample_call_contract) is False
        # Exceeds max
        assert position_sizer.validate_position_size(100, sample_call_contract) is False


class TestRiskManager:
    """Sanity tests for RiskManager."""

    @pytest.mark.sanity
    def test_risk_manager_creation(self, risk_manager):
        """Test risk manager initialization."""
        assert risk_manager.account_value == Decimal("100000")
        assert risk_manager.daily_pnl == Decimal("0")
        assert len(risk_manager.open_positions) == 0

    @pytest.mark.sanity
    def test_portfolio_risk_empty(self, risk_manager):
        """Test portfolio risk with no positions."""
        assert risk_manager.portfolio_risk == Decimal("0")
        assert risk_manager.portfolio_risk_pct == 0.0

    @pytest.mark.sanity
    def test_portfolio_risk_with_position(self, risk_manager, sample_position):
        """Test portfolio risk with open position."""
        risk_manager.add_position(sample_position)
        assert risk_manager.portfolio_risk > Decimal("0")
        assert risk_manager.portfolio_risk_pct > 0.0

    @pytest.mark.sanity
    def test_available_risk_budget(self, risk_manager):
        """Test available risk budget calculation."""
        budget = risk_manager.available_risk_budget
        # With no positions, full budget is available
        max_risk = Decimal("100000") * Decimal("0.05")  # 5% of account
        assert budget == max_risk

    @pytest.mark.sanity
    def test_can_take_trade_valid(self, risk_manager, sample_order):
        """Test valid trade approval."""
        can_trade, reason = risk_manager.can_take_trade(sample_order)
        assert can_trade is True
        assert reason == "Trade approved"

    @pytest.mark.sanity
    def test_can_take_trade_daily_loss_limit(self, risk_manager, sample_order):
        """Test trade blocked at daily loss limit."""
        # Simulate hitting daily loss limit
        daily_loss_limit = risk_manager.account_value * Decimal("0.02")
        risk_manager.daily_pnl = -daily_loss_limit - Decimal("1")

        can_trade, reason = risk_manager.can_take_trade(sample_order)
        assert can_trade is False
        assert "Daily loss limit" in reason

    @pytest.mark.sanity
    def test_can_take_trade_position_size_limit(self, risk_manager, sample_call_contract):
        """Test trade blocked for oversized position."""
        from alphaoptions.models import Order, OrderSide

        large_order = Order(
            contract=sample_call_contract,
            side=OrderSide.BUY,
            quantity=100,  # Exceeds limit
            order_type="limit",
            limit_price=Decimal("0.05"),  # Small price to avoid trade risk limit
        )
        can_trade, reason = risk_manager.can_take_trade(large_order)
        assert can_trade is False
        assert "Position size" in reason

    @pytest.mark.sanity
    def test_update_daily_pnl(self, risk_manager):
        """Test daily P&L updates."""
        risk_manager.update_daily_pnl(Decimal("500"))
        assert risk_manager.daily_pnl == Decimal("500")

        risk_manager.update_daily_pnl(Decimal("-200"))
        assert risk_manager.daily_pnl == Decimal("300")

    @pytest.mark.sanity
    def test_reset_daily_pnl(self, risk_manager):
        """Test daily P&L reset."""
        risk_manager.update_daily_pnl(Decimal("500"))
        risk_manager.reset_daily_pnl()
        assert risk_manager.daily_pnl == Decimal("0")

    @pytest.mark.sanity
    def test_add_remove_position(self, risk_manager, sample_position):
        """Test position tracking."""
        # Add position
        risk_manager.add_position(sample_position)
        assert len(risk_manager.open_positions) == 1

        # Remove position
        risk_manager.remove_position(sample_position)
        assert len(risk_manager.open_positions) == 0

    @pytest.mark.sanity
    def test_calculate_max_loss(self, risk_manager, sample_position):
        """Test max loss calculation."""
        risk_manager.add_position(sample_position)
        max_loss = risk_manager.calculate_max_loss()
        # Max loss for long option is premium paid
        assert max_loss == sample_position.notional_value

    @pytest.mark.sanity
    def test_get_risk_summary(self, risk_manager):
        """Test risk summary generation."""
        summary = risk_manager.get_risk_summary()

        assert "account_value" in summary
        assert "portfolio_risk" in summary
        assert "portfolio_risk_pct" in summary
        assert "daily_pnl" in summary
        assert "available_risk_budget" in summary
        assert "max_possible_loss" in summary
        assert "open_positions_count" in summary

        assert summary["account_value"] == 100000.0
        assert summary["open_positions_count"] == 0
