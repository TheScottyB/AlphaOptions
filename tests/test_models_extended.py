"""
Extended tests for AlphaOptions data models - covering previously untested code paths.
"""

import pytest
from datetime import date, datetime, timedelta
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


class TestOptionContractExtended:
    """Tests for uncovered OptionContract code paths."""

    @pytest.mark.unit
    def test_mid_price_falls_back_to_last_price(self):
        """Test mid_price returns last_price when bid/ask are None."""
        contract = OptionContract(
            symbol="SPY231222C00475000",
            underlying="SPY",
            option_type=OptionType.CALL,
            strike=Decimal("475.00"),
            expiration=date.today(),
            bid=None,
            ask=None,
            last_price=Decimal("2.55"),
        )
        assert contract.mid_price == Decimal("2.55")

    @pytest.mark.unit
    def test_mid_price_returns_none_when_all_none(self):
        """Test mid_price returns None when bid, ask, and last_price are all None."""
        contract = OptionContract(
            symbol="SPY231222C00475000",
            underlying="SPY",
            option_type=OptionType.CALL,
            strike=Decimal("475.00"),
            expiration=date.today(),
            bid=None,
            ask=None,
            last_price=None,
        )
        assert contract.mid_price is None

    @pytest.mark.unit
    def test_spread_returns_none_when_no_bid_ask(self):
        """Test spread returns None when bid or ask is None."""
        contract = OptionContract(
            symbol="SPY231222C00475000",
            underlying="SPY",
            option_type=OptionType.CALL,
            strike=Decimal("475.00"),
            expiration=date.today(),
            bid=Decimal("2.50"),
            ask=None,
        )
        assert contract.spread is None

    @pytest.mark.unit
    def test_validate_negative_bid(self):
        """Test validation fails for negative bid price."""
        contract = OptionContract(
            symbol="SPY231222C00475000",
            underlying="SPY",
            option_type=OptionType.CALL,
            strike=Decimal("475.00"),
            expiration=date.today(),
            bid=Decimal("-1.00"),
            ask=Decimal("2.00"),
        )
        assert contract.validate() is False

    @pytest.mark.unit
    def test_validate_negative_ask(self):
        """Test validation fails for negative ask price."""
        contract = OptionContract(
            symbol="SPY231222C00475000",
            underlying="SPY",
            option_type=OptionType.CALL,
            strike=Decimal("475.00"),
            expiration=date.today(),
            bid=Decimal("2.00"),
            ask=Decimal("-1.00"),
        )
        assert contract.validate() is False

    @pytest.mark.unit
    def test_validate_empty_underlying(self):
        """Test validation fails for empty underlying."""
        contract = OptionContract(
            symbol="SPY231222C00475000",
            underlying="",
            option_type=OptionType.CALL,
            strike=Decimal("475.00"),
            expiration=date.today(),
        )
        assert contract.validate() is False

    @pytest.mark.unit
    def test_validate_negative_strike(self):
        """Test validation fails for negative strike."""
        contract = OptionContract(
            symbol="SPY231222C00475000",
            underlying="SPY",
            option_type=OptionType.CALL,
            strike=Decimal("-10"),
            expiration=date.today(),
        )
        assert contract.validate() is False

    @pytest.mark.unit
    def test_validate_no_bid_ask_passes(self):
        """Test validation passes when bid/ask are both None."""
        contract = OptionContract(
            symbol="SPY231222C00475000",
            underlying="SPY",
            option_type=OptionType.CALL,
            strike=Decimal("475.00"),
            expiration=date.today(),
            bid=None,
            ask=None,
        )
        assert contract.validate() is True

    @pytest.mark.unit
    def test_is_0dte_with_explicit_reference_date(self):
        """Test is_0dte with an explicit reference date matching expiration."""
        expiration = date(2024, 3, 15)
        contract = OptionContract(
            symbol="SPY240315C00475000",
            underlying="SPY",
            option_type=OptionType.CALL,
            strike=Decimal("475.00"),
            expiration=expiration,
        )
        assert contract.is_0dte(date(2024, 3, 15)) is True
        assert contract.is_0dte(date(2024, 3, 16)) is False


class TestPositionExtended:
    """Tests for uncovered Position code paths."""

    @pytest.mark.unit
    def test_short_position_is_long_false(self, sample_call_contract):
        """Test is_long returns False for sell-side positions."""
        position = Position(
            contract=sample_call_contract,
            quantity=5,
            entry_price=Decimal("2.55"),
            entry_time=datetime.now(),
            side=OrderSide.SELL,
        )
        assert position.is_long is False

    @pytest.mark.unit
    def test_unrealized_pnl_short_position(self, sample_call_contract):
        """Test unrealized P&L for a short position (inverted direction)."""
        position = Position(
            contract=sample_call_contract,
            quantity=5,
            entry_price=Decimal("2.55"),
            entry_time=datetime.now(),
            side=OrderSide.SELL,
        )
        # Short position profits when price goes down
        current_price = Decimal("2.00")
        pnl = position.unrealized_pnl(current_price)
        # For short: -(current - entry) * qty * 100 = -(2.00 - 2.55) * 5 * 100 = 275
        expected = Decimal("275.00")
        assert pnl == expected
        assert pnl > 0  # Profitable short

    @pytest.mark.unit
    def test_unrealized_pnl_short_loss(self, sample_call_contract):
        """Test unrealized P&L for a short position at a loss."""
        position = Position(
            contract=sample_call_contract,
            quantity=5,
            entry_price=Decimal("2.55"),
            entry_time=datetime.now(),
            side=OrderSide.SELL,
        )
        # Short position loses when price goes up
        current_price = Decimal("3.00")
        pnl = position.unrealized_pnl(current_price)
        assert pnl < 0


class TestOrderExtended:
    """Tests for uncovered Order code paths."""

    @pytest.mark.unit
    def test_order_validate_negative_limit_price(self, sample_call_contract):
        """Test validation fails for negative limit price."""
        order = Order(
            contract=sample_call_contract,
            side=OrderSide.BUY,
            quantity=5,
            order_type="limit",
            limit_price=Decimal("-1.00"),
        )
        assert order.validate() is False

    @pytest.mark.unit
    def test_order_validate_market_order_no_price(self, sample_call_contract):
        """Test market order validates without limit price."""
        order = Order(
            contract=sample_call_contract,
            side=OrderSide.BUY,
            quantity=5,
            order_type="market",
            limit_price=None,
        )
        assert order.validate() is True

    @pytest.mark.unit
    def test_order_validate_zero_limit_price(self, sample_call_contract):
        """Test validation fails for zero limit price."""
        order = Order(
            contract=sample_call_contract,
            side=OrderSide.BUY,
            quantity=5,
            order_type="limit",
            limit_price=Decimal("0"),
        )
        assert order.validate() is False


class TestTradeResultExtended:
    """Tests for uncovered TradeResult code paths."""

    @pytest.mark.unit
    def test_return_pct_zero_entry_price(self):
        """Test return_pct handles zero entry price."""
        result = TradeResult(
            strategy_type=StrategyType.LONG_CALL,
            entry_time=datetime.now(),
            exit_time=datetime.now(),
            entry_price=Decimal("0"),
            exit_price=Decimal("3.00"),
            quantity=5,
            pnl=Decimal("500.00"),
        )
        assert result.return_pct == 0.0

    @pytest.mark.unit
    def test_return_pct_negative(self):
        """Test return_pct for a losing trade."""
        result = TradeResult(
            strategy_type=StrategyType.LONG_CALL,
            entry_time=datetime.now(),
            exit_time=datetime.now(),
            entry_price=Decimal("3.00"),
            exit_price=Decimal("2.00"),
            quantity=5,
            pnl=Decimal("-500.00"),
        )
        expected = float((Decimal("2.00") - Decimal("3.00")) / Decimal("3.00") * 100)
        assert abs(result.return_pct - expected) < 0.01

    @pytest.mark.unit
    def test_net_pnl_with_zero_commission(self):
        """Test net_pnl when commission is zero (default)."""
        result = TradeResult(
            strategy_type=StrategyType.LONG_CALL,
            entry_time=datetime.now(),
            exit_time=datetime.now(),
            entry_price=Decimal("2.00"),
            exit_price=Decimal("3.00"),
            quantity=5,
            pnl=Decimal("500.00"),
        )
        assert result.net_pnl == Decimal("500.00")
