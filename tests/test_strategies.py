"""
Sanity tests for AlphaOptions trading strategies.
"""

import pytest
from datetime import datetime, time
from decimal import Decimal

from alphaoptions.models import OptionType, OrderSide, StrategyType
from alphaoptions.strategies import (
    BaseStrategy,
    LongCallStrategy,
    LongPutStrategy,
    StraddleStrategy,
    StrangleStrategy,
    StrategySignal,
    ALPACA_0DTE_CUTOFF,
)


class TestStrategySignal:
    """Sanity tests for StrategySignal."""

    @pytest.mark.sanity
    def test_signal_validation_valid(self, sample_call_contract):
        """Test valid signal passes validation."""
        signal = StrategySignal(
            strategy_type=StrategyType.LONG_CALL,
            contracts=[sample_call_contract],
            sides=[OrderSide.BUY],
            quantities=[1],
            confidence=0.7,
            reason="Test signal",
            timestamp=datetime.now(),
        )
        assert signal.validate() is True

    @pytest.mark.sanity
    def test_signal_validation_empty_contracts(self):
        """Test signal with no contracts fails validation."""
        signal = StrategySignal(
            strategy_type=StrategyType.LONG_CALL,
            contracts=[],
            sides=[],
            quantities=[],
            confidence=0.7,
            reason="Test signal",
            timestamp=datetime.now(),
        )
        assert signal.validate() is False

    @pytest.mark.sanity
    def test_signal_validation_invalid_confidence(self, sample_call_contract):
        """Test signal with invalid confidence fails validation."""
        signal = StrategySignal(
            strategy_type=StrategyType.LONG_CALL,
            contracts=[sample_call_contract],
            sides=[OrderSide.BUY],
            quantities=[1],
            confidence=1.5,  # Invalid: > 1.0
            reason="Test signal",
            timestamp=datetime.now(),
        )
        assert signal.validate() is False


class TestLongCallStrategy:
    """Sanity tests for LongCallStrategy."""

    @pytest.mark.sanity
    def test_strategy_creation(self, long_call_strategy):
        """Test strategy initialization."""
        assert long_call_strategy.name == "LongCallStrategy"
        assert long_call_strategy.strategy_type == StrategyType.LONG_CALL
        assert long_call_strategy.max_position_size == 10

    @pytest.mark.sanity
    def test_generate_signal_basic(self, long_call_strategy, option_chain):
        """Test basic signal generation."""
        underlying_price = Decimal("475.00")
        signal = long_call_strategy.generate_signal(
            underlying_price=underlying_price,
            available_contracts=option_chain,
        )
        assert signal is not None
        assert signal.strategy_type == StrategyType.LONG_CALL
        assert len(signal.contracts) == 1
        assert signal.contracts[0].option_type == OptionType.CALL
        assert signal.sides[0] == OrderSide.BUY

    @pytest.mark.sanity
    def test_generate_signal_no_calls(self, long_call_strategy, sample_put_contract):
        """Test no signal when no calls available."""
        signal = long_call_strategy.generate_signal(
            underlying_price=Decimal("475.00"),
            available_contracts=[sample_put_contract],  # Only puts
        )
        assert signal is None

    @pytest.mark.sanity
    def test_filter_0dte_contracts(self, long_call_strategy, option_chain):
        """Test 0DTE contract filtering."""
        filtered = long_call_strategy.filter_0dte_contracts(option_chain)
        # All contracts in our fixture are 0DTE
        assert len(filtered) == len(option_chain)

    @pytest.mark.sanity
    def test_create_orders_from_signal(
        self, long_call_strategy, sample_call_contract
    ):
        """Test order creation from signal."""
        signal = StrategySignal(
            strategy_type=StrategyType.LONG_CALL,
            contracts=[sample_call_contract],
            sides=[OrderSide.BUY],
            quantities=[5],
            confidence=0.7,
            reason="Test",
            timestamp=datetime.now(),
        )
        orders = long_call_strategy.create_orders(signal)
        assert len(orders) == 1
        assert orders[0].quantity == 5
        assert orders[0].side == OrderSide.BUY


class TestLongPutStrategy:
    """Sanity tests for LongPutStrategy."""

    @pytest.mark.sanity
    def test_strategy_creation(self, long_put_strategy):
        """Test strategy initialization."""
        assert long_put_strategy.name == "LongPutStrategy"
        assert long_put_strategy.strategy_type == StrategyType.LONG_PUT

    @pytest.mark.sanity
    def test_generate_signal_basic(self, long_put_strategy, option_chain):
        """Test basic signal generation."""
        underlying_price = Decimal("475.00")
        signal = long_put_strategy.generate_signal(
            underlying_price=underlying_price,
            available_contracts=option_chain,
        )
        assert signal is not None
        assert signal.strategy_type == StrategyType.LONG_PUT
        assert len(signal.contracts) == 1
        assert signal.contracts[0].option_type == OptionType.PUT

    @pytest.mark.sanity
    def test_generate_signal_no_puts(self, long_put_strategy, sample_call_contract):
        """Test no signal when no puts available."""
        signal = long_put_strategy.generate_signal(
            underlying_price=Decimal("475.00"),
            available_contracts=[sample_call_contract],  # Only calls
        )
        assert signal is None


class TestStraddleStrategy:
    """Sanity tests for StraddleStrategy."""

    @pytest.mark.sanity
    def test_strategy_creation(self, straddle_strategy):
        """Test strategy initialization."""
        assert straddle_strategy.name == "StraddleStrategy"
        assert straddle_strategy.strategy_type == StrategyType.STRADDLE

    @pytest.mark.sanity
    def test_find_atm_strike(self, straddle_strategy, option_chain):
        """Test ATM strike finding."""
        underlying_price = Decimal("473.00")
        atm_strike = straddle_strategy.find_atm_strike(option_chain, underlying_price)
        # Should find closest strike to 473
        assert atm_strike is not None
        # ATM should be within a reasonable distance
        assert abs(atm_strike - underlying_price) <= Decimal("10")

    @pytest.mark.sanity
    def test_generate_signal_basic(self, straddle_strategy, option_chain):
        """Test basic straddle signal generation."""
        underlying_price = Decimal("475.00")
        signal = straddle_strategy.generate_signal(
            underlying_price=underlying_price,
            available_contracts=option_chain,
        )
        assert signal is not None
        assert signal.strategy_type == StrategyType.STRADDLE
        # Straddle has 2 legs: call and put
        assert len(signal.contracts) == 2
        # Both should be buys
        assert all(s == OrderSide.BUY for s in signal.sides)
        # One call and one put
        types = [c.option_type for c in signal.contracts]
        assert OptionType.CALL in types
        assert OptionType.PUT in types


class TestStrangleStrategy:
    """Sanity tests for StrangleStrategy."""

    @pytest.mark.sanity
    def test_strategy_creation(self):
        """Test strategy initialization."""
        strategy = StrangleStrategy(respect_cutoff=False)
        assert strategy.name == "StrangleStrategy"
        assert strategy.strategy_type == StrategyType.STRANGLE

    @pytest.mark.sanity
    def test_generate_signal_basic(self, option_chain):
        """Test basic strangle signal generation."""
        strategy = StrangleStrategy(respect_cutoff=False)
        underlying_price = Decimal("475.00")
        signal = strategy.generate_signal(
            underlying_price=underlying_price,
            available_contracts=option_chain,
        )
        assert signal is not None
        assert signal.strategy_type == StrategyType.STRANGLE
        # Strangle has 2 legs
        assert len(signal.contracts) == 2
        # Should be OTM options
        call = [c for c in signal.contracts if c.option_type == OptionType.CALL][0]
        put = [c for c in signal.contracts if c.option_type == OptionType.PUT][0]
        # Call strike should be above underlying
        assert call.strike > underlying_price
        # Put strike should be below underlying
        assert put.strike < underlying_price


class TestTradingHours:
    """Sanity tests for trading hours logic."""

    @pytest.mark.sanity
    def test_alpaca_cutoff_time(self):
        """Test Alpaca cutoff time is correctly set."""
        assert ALPACA_0DTE_CUTOFF == time(15, 15)

    @pytest.mark.sanity
    def test_within_trading_hours_before_cutoff(self, long_call_strategy):
        """Test trading allowed before cutoff."""
        # Set respect_cutoff to True for this test
        strategy = LongCallStrategy(respect_cutoff=True)
        before_cutoff = datetime(2024, 1, 15, 10, 0)  # 10:00 AM
        assert strategy.is_within_trading_hours(before_cutoff) is True

    @pytest.mark.sanity
    def test_within_trading_hours_after_cutoff(self):
        """Test trading blocked after cutoff."""
        strategy = LongCallStrategy(respect_cutoff=True)
        after_cutoff = datetime(2024, 1, 15, 15, 30)  # 3:30 PM
        assert strategy.is_within_trading_hours(after_cutoff) is False

    @pytest.mark.sanity
    def test_respect_cutoff_disabled(self, long_call_strategy):
        """Test cutoff can be disabled."""
        # long_call_strategy fixture has respect_cutoff=False
        after_cutoff = datetime(2024, 1, 15, 15, 30)
        assert long_call_strategy.is_within_trading_hours(after_cutoff) is True
