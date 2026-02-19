"""
Extended tests for AlphaOptions risk management - covering previously untested code paths.
"""

import pytest
from datetime import date, datetime
from decimal import Decimal

from alphaoptions.models import (
    OptionContract,
    OptionType,
    OrderSide,
    Position,
    Order,
)
from alphaoptions.risk import RiskManager, RiskLimits, PositionSizer


class TestPositionSizerExtended:
    """Tests for uncovered PositionSizer code paths."""

    @pytest.mark.unit
    def test_calculate_position_size_zero_mid_price(self):
        """Test position sizing returns 0 when mid_price is zero."""
        sizer = PositionSizer(
            account_value=Decimal("100000"),
            risk_per_trade_pct=1.0,
            max_contracts=10,
        )
        contract = OptionContract(
            symbol="TEST",
            underlying="SPY",
            option_type=OptionType.CALL,
            strike=Decimal("475.00"),
            expiration=date.today(),
            bid=Decimal("0"),
            ask=Decimal("0"),
        )
        size = sizer.calculate_position_size(contract)
        assert size == 0

    @pytest.mark.unit
    def test_validate_position_size_exceeds_account_value(self):
        """Test validate_position_size returns False when position exceeds account."""
        sizer = PositionSizer(
            account_value=Decimal("1000"),  # Small account
            risk_per_trade_pct=1.0,
            max_contracts=100,  # High max
        )
        contract = OptionContract(
            symbol="TEST",
            underlying="SPY",
            option_type=OptionType.CALL,
            strike=Decimal("475.00"),
            expiration=date.today(),
            bid=Decimal("50.00"),
            ask=Decimal("51.00"),
        )
        # 50 contracts * ~50.5 mid * 100 = 252500 >> 1000
        assert sizer.validate_position_size(50, contract) is False

    @pytest.mark.unit
    def test_validate_position_size_none_mid_price(self):
        """Test validate_position_size returns False when mid_price is None."""
        sizer = PositionSizer(
            account_value=Decimal("100000"),
            risk_per_trade_pct=1.0,
            max_contracts=10,
        )
        contract = OptionContract(
            symbol="TEST",
            underlying="SPY",
            option_type=OptionType.CALL,
            strike=Decimal("475.00"),
            expiration=date.today(),
            bid=None,
            ask=None,
            last_price=None,
        )
        assert sizer.validate_position_size(5, contract) is False

    @pytest.mark.unit
    def test_calculate_position_size_capped_at_max(self):
        """Test position size is capped at max_contracts."""
        sizer = PositionSizer(
            account_value=Decimal("10000000"),  # Very large account
            risk_per_trade_pct=10.0,  # High risk tolerance
            max_contracts=5,  # Small max
        )
        contract = OptionContract(
            symbol="TEST",
            underlying="SPY",
            option_type=OptionType.CALL,
            strike=Decimal("475.00"),
            expiration=date.today(),
            bid=Decimal("0.10"),
            ask=Decimal("0.20"),
        )
        size = sizer.calculate_position_size(contract)
        assert size <= 5


class TestRiskManagerExtended:
    """Tests for uncovered RiskManager code paths."""

    @pytest.mark.unit
    def test_portfolio_risk_pct_zero_account(self):
        """Test portfolio_risk_pct returns 0 when account value is zero."""
        rm = RiskManager(account_value=Decimal("0"), limits=RiskLimits())
        assert rm.portfolio_risk_pct == 0.0

    @pytest.mark.unit
    def test_portfolio_risk_short_positions_not_counted(self, sample_call_contract):
        """Test that short positions are not counted in portfolio risk."""
        rm = RiskManager(account_value=Decimal("100000"))
        short_position = Position(
            contract=sample_call_contract,
            quantity=5,
            entry_price=Decimal("2.55"),
            entry_time=datetime.now(),
            side=OrderSide.SELL,
        )
        rm.add_position(short_position)
        assert rm.portfolio_risk == Decimal("0")

    @pytest.mark.unit
    def test_can_take_trade_portfolio_risk_limit(self, sample_call_contract):
        """Test trade blocked when portfolio risk limit reached."""
        rm = RiskManager(
            account_value=Decimal("100000"),
            limits=RiskLimits(max_portfolio_risk_pct=0.001),  # Very low limit
        )
        # Add a position to fill up risk budget
        position = Position(
            contract=sample_call_contract,
            quantity=100,
            entry_price=Decimal("100.00"),
            entry_time=datetime.now(),
            side=OrderSide.BUY,
        )
        rm.add_position(position)

        order = Order(
            contract=sample_call_contract,
            side=OrderSide.BUY,
            quantity=1,
            order_type="limit",
            limit_price=Decimal("2.55"),
        )
        can_trade, reason = rm.can_take_trade(order)
        assert can_trade is False
        assert "Portfolio risk limit" in reason

    @pytest.mark.unit
    def test_can_take_trade_single_trade_risk_limit(self, sample_call_contract):
        """Test trade blocked when single trade risk exceeds limit."""
        rm = RiskManager(
            account_value=Decimal("10000"),
            limits=RiskLimits(
                max_single_trade_risk_pct=0.01,  # Very small
                max_position_size=1000,  # Allow large size
            ),
        )
        # High limit price * quantity exceeds single trade risk
        order = Order(
            contract=sample_call_contract,
            side=OrderSide.BUY,
            quantity=100,
            order_type="limit",
            limit_price=Decimal("50.00"),
        )
        can_trade, reason = rm.can_take_trade(order)
        assert can_trade is False
        assert "Trade risk" in reason

    @pytest.mark.unit
    def test_can_take_trade_concentration_limit(self, sample_call_contract):
        """Test trade blocked when concentration limit reached."""
        rm = RiskManager(
            account_value=Decimal("100000"),
            limits=RiskLimits(max_concentration_pct=0.001),  # Very low
        )
        # Add existing position for same underlying
        position = Position(
            contract=sample_call_contract,
            quantity=10,
            entry_price=Decimal("2.55"),
            entry_time=datetime.now(),
            side=OrderSide.BUY,
        )
        rm.add_position(position)

        order = Order(
            contract=sample_call_contract,
            side=OrderSide.BUY,
            quantity=1,
            order_type="limit",
            limit_price=Decimal("2.55"),
        )
        can_trade, reason = rm.can_take_trade(order)
        assert can_trade is False
        assert "Concentration limit" in reason

    @pytest.mark.unit
    def test_can_take_trade_no_limit_price(self, sample_call_contract):
        """Test can_take_trade with market order (no limit price)."""
        rm = RiskManager(account_value=Decimal("100000"))
        order = Order(
            contract=sample_call_contract,
            side=OrderSide.BUY,
            quantity=1,
            order_type="market",
            limit_price=None,
        )
        can_trade, reason = rm.can_take_trade(order)
        assert can_trade is True

    @pytest.mark.unit
    def test_remove_nonexistent_position(self, sample_call_contract):
        """Test removing a position that doesn't exist does nothing."""
        rm = RiskManager(account_value=Decimal("100000"))
        position = Position(
            contract=sample_call_contract,
            quantity=5,
            entry_price=Decimal("2.55"),
            entry_time=datetime.now(),
            side=OrderSide.BUY,
        )
        # Should not raise
        rm.remove_position(position)
        assert len(rm.open_positions) == 0

    @pytest.mark.unit
    def test_calculate_max_loss_short_positions_excluded(self, sample_call_contract):
        """Test max loss only counts long positions."""
        rm = RiskManager(account_value=Decimal("100000"))
        short_position = Position(
            contract=sample_call_contract,
            quantity=5,
            entry_price=Decimal("2.55"),
            entry_time=datetime.now(),
            side=OrderSide.SELL,
        )
        rm.add_position(short_position)
        assert rm.calculate_max_loss() == Decimal("0")

    @pytest.mark.unit
    def test_risk_summary_with_positions(self, sample_call_contract):
        """Test risk summary includes position data."""
        rm = RiskManager(account_value=Decimal("100000"))
        position = Position(
            contract=sample_call_contract,
            quantity=5,
            entry_price=Decimal("2.55"),
            entry_time=datetime.now(),
            side=OrderSide.BUY,
        )
        rm.add_position(position)
        rm.update_daily_pnl(Decimal("150"))

        summary = rm.get_risk_summary()
        assert summary["open_positions_count"] == 1
        assert summary["daily_pnl"] == 150.0
        assert summary["portfolio_risk"] > 0
        assert summary["max_possible_loss"] > 0
