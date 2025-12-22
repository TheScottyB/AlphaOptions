"""
Sanity tests for AlphaOptions data models.
"""

import pytest
from datetime import date, datetime
from decimal import Decimal

from alphaoptions.models import (
    OptionContract,
    OptionType,
    OrderSide,
    StrategyType,
    Position,
    Order,
    TradeResult,
)


class TestOptionContract:
    """Sanity tests for OptionContract model."""

    @pytest.mark.sanity
    def test_contract_creation(self, sample_call_contract):
        """Test basic contract creation."""
        assert sample_call_contract.symbol == "SPY231222C00475000"
        assert sample_call_contract.underlying == "SPY"
        assert sample_call_contract.option_type == OptionType.CALL
        assert sample_call_contract.strike == Decimal("475.00")

    @pytest.mark.sanity
    def test_mid_price_calculation(self, sample_call_contract):
        """Test mid price is calculated correctly from bid/ask."""
        expected_mid = (Decimal("2.50") + Decimal("2.60")) / 2
        assert sample_call_contract.mid_price == expected_mid

    @pytest.mark.sanity
    def test_spread_calculation(self, sample_call_contract):
        """Test bid-ask spread calculation."""
        expected_spread = Decimal("2.60") - Decimal("2.50")
        assert sample_call_contract.spread == expected_spread

    @pytest.mark.sanity
    def test_is_0dte(self, sample_call_contract):
        """Test 0DTE detection."""
        # Contract expires today
        assert sample_call_contract.is_0dte() is True

        # Check with different reference date
        from datetime import timedelta
        tomorrow = date.today() + timedelta(days=1)
        assert sample_call_contract.is_0dte(tomorrow) is False

    @pytest.mark.sanity
    def test_validate_valid_contract(self, sample_call_contract):
        """Test validation passes for valid contract."""
        assert sample_call_contract.validate() is True

    @pytest.mark.sanity
    def test_validate_invalid_contract(self):
        """Test validation fails for invalid contract."""
        # Empty symbol
        invalid = OptionContract(
            symbol="",
            underlying="SPY",
            option_type=OptionType.CALL,
            strike=Decimal("475.00"),
            expiration=date.today(),
        )
        assert invalid.validate() is False

        # Zero strike
        invalid2 = OptionContract(
            symbol="TEST",
            underlying="SPY",
            option_type=OptionType.CALL,
            strike=Decimal("0"),
            expiration=date.today(),
        )
        assert invalid2.validate() is False

        # Bid > Ask (invalid)
        invalid3 = OptionContract(
            symbol="TEST",
            underlying="SPY",
            option_type=OptionType.CALL,
            strike=Decimal("100"),
            expiration=date.today(),
            bid=Decimal("5.00"),
            ask=Decimal("4.00"),
        )
        assert invalid3.validate() is False


class TestOptionType:
    """Sanity tests for OptionType enum."""

    @pytest.mark.sanity
    def test_option_types(self):
        """Test option type values."""
        assert OptionType.CALL.value == "call"
        assert OptionType.PUT.value == "put"


class TestOrderSide:
    """Sanity tests for OrderSide enum."""

    @pytest.mark.sanity
    def test_order_sides(self):
        """Test order side values."""
        assert OrderSide.BUY.value == "buy"
        assert OrderSide.SELL.value == "sell"


class TestStrategyType:
    """Sanity tests for StrategyType enum."""

    @pytest.mark.sanity
    def test_strategy_types(self):
        """Test all strategy types exist."""
        assert StrategyType.LONG_CALL.value == "long_call"
        assert StrategyType.LONG_PUT.value == "long_put"
        assert StrategyType.STRADDLE.value == "straddle"
        assert StrategyType.STRANGLE.value == "strangle"
        assert StrategyType.VERTICAL_SPREAD.value == "vertical_spread"


class TestPosition:
    """Sanity tests for Position model."""

    @pytest.mark.sanity
    def test_position_creation(self, sample_position):
        """Test basic position creation."""
        assert sample_position.quantity == 5
        assert sample_position.entry_price == Decimal("2.55")

    @pytest.mark.sanity
    def test_is_long(self, sample_position):
        """Test long position detection."""
        assert sample_position.is_long is True

    @pytest.mark.sanity
    def test_notional_value(self, sample_position):
        """Test notional value calculation (price * qty * 100)."""
        expected = Decimal("2.55") * 5 * 100
        assert sample_position.notional_value == expected

    @pytest.mark.sanity
    def test_unrealized_pnl_profit(self, sample_position):
        """Test unrealized P&L when in profit."""
        current_price = Decimal("3.00")
        expected_pnl = (Decimal("3.00") - Decimal("2.55")) * 5 * 100
        assert sample_position.unrealized_pnl(current_price) == expected_pnl

    @pytest.mark.sanity
    def test_unrealized_pnl_loss(self, sample_position):
        """Test unrealized P&L when at loss."""
        current_price = Decimal("2.00")
        expected_pnl = (Decimal("2.00") - Decimal("2.55")) * 5 * 100
        assert sample_position.unrealized_pnl(current_price) == expected_pnl
        assert sample_position.unrealized_pnl(current_price) < 0


class TestOrder:
    """Sanity tests for Order model."""

    @pytest.mark.sanity
    def test_order_creation(self, sample_order):
        """Test basic order creation."""
        assert sample_order.quantity == 2
        assert sample_order.order_type == "limit"
        assert sample_order.limit_price == Decimal("2.55")

    @pytest.mark.sanity
    def test_order_validate_valid(self, sample_order):
        """Test validation for valid order."""
        assert sample_order.validate() is True

    @pytest.mark.sanity
    def test_order_validate_invalid_qty(self, sample_call_contract):
        """Test validation fails for zero quantity."""
        order = Order(
            contract=sample_call_contract,
            side=OrderSide.BUY,
            quantity=0,
            order_type="limit",
            limit_price=Decimal("2.55"),
        )
        assert order.validate() is False

    @pytest.mark.sanity
    def test_order_validate_limit_without_price(self, sample_call_contract):
        """Test validation fails for limit order without price."""
        order = Order(
            contract=sample_call_contract,
            side=OrderSide.BUY,
            quantity=5,
            order_type="limit",
            limit_price=None,
        )
        assert order.validate() is False


class TestTradeResult:
    """Sanity tests for TradeResult model."""

    @pytest.mark.sanity
    def test_trade_result_creation(self):
        """Test trade result creation."""
        result = TradeResult(
            strategy_type=StrategyType.LONG_CALL,
            entry_time=datetime.now(),
            exit_time=datetime.now(),
            entry_price=Decimal("2.00"),
            exit_price=Decimal("3.00"),
            quantity=5,
            pnl=Decimal("500.00"),
            commission=Decimal("5.00"),
        )
        assert result.pnl == Decimal("500.00")

    @pytest.mark.sanity
    def test_net_pnl(self):
        """Test net P&L after commissions."""
        result = TradeResult(
            strategy_type=StrategyType.LONG_CALL,
            entry_time=datetime.now(),
            exit_time=datetime.now(),
            entry_price=Decimal("2.00"),
            exit_price=Decimal("3.00"),
            quantity=5,
            pnl=Decimal("500.00"),
            commission=Decimal("5.00"),
        )
        assert result.net_pnl == Decimal("495.00")

    @pytest.mark.sanity
    def test_return_pct(self):
        """Test percentage return calculation."""
        result = TradeResult(
            strategy_type=StrategyType.LONG_CALL,
            entry_time=datetime.now(),
            exit_time=datetime.now(),
            entry_price=Decimal("2.00"),
            exit_price=Decimal("3.00"),
            quantity=5,
            pnl=Decimal("500.00"),
        )
        assert result.return_pct == 50.0  # (3-2)/2 * 100 = 50%
