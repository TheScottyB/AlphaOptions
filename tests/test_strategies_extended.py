"""
Extended tests for AlphaOptions strategies - covering previously untested code paths.
"""

import pytest
from datetime import datetime, date, time
from decimal import Decimal

from alphaoptions.models import (
    OptionContract,
    OptionType,
    OrderSide,
    StrategyType,
)
from alphaoptions.strategies import (
    LongCallStrategy,
    LongPutStrategy,
    StraddleStrategy,
    StrangleStrategy,
    StrategySignal,
    ALPACA_0DTE_CUTOFF,
)


class TestStrategySignalExtended:
    """Tests for uncovered StrategySignal code paths."""

    @pytest.mark.unit
    def test_signal_validation_mismatched_lengths(self, sample_call_contract):
        """Test signal with mismatched list lengths fails validation."""
        signal = StrategySignal(
            strategy_type=StrategyType.LONG_CALL,
            contracts=[sample_call_contract],
            sides=[OrderSide.BUY, OrderSide.BUY],  # 2 sides but 1 contract
            quantities=[1],
            confidence=0.7,
            reason="Mismatched",
            timestamp=datetime.now(),
        )
        assert signal.validate() is False

    @pytest.mark.unit
    def test_signal_validation_negative_confidence(self, sample_call_contract):
        """Test signal with negative confidence fails validation."""
        signal = StrategySignal(
            strategy_type=StrategyType.LONG_CALL,
            contracts=[sample_call_contract],
            sides=[OrderSide.BUY],
            quantities=[1],
            confidence=-0.5,
            reason="Negative confidence",
            timestamp=datetime.now(),
        )
        assert signal.validate() is False

    @pytest.mark.unit
    def test_signal_validation_zero_confidence(self, sample_call_contract):
        """Test signal with zero confidence passes validation."""
        signal = StrategySignal(
            strategy_type=StrategyType.LONG_CALL,
            contracts=[sample_call_contract],
            sides=[OrderSide.BUY],
            quantities=[1],
            confidence=0.0,
            reason="Zero confidence",
            timestamp=datetime.now(),
        )
        assert signal.validate() is True


class TestLongCallStrategyExtended:
    """Tests for uncovered LongCallStrategy code paths."""

    @pytest.mark.unit
    def test_generate_signal_respects_cutoff(self, option_chain):
        """Test signal generation returns None when past cutoff."""
        strategy = LongCallStrategy(respect_cutoff=True)
        after_cutoff = datetime(2024, 1, 15, 15, 30)
        signal = strategy.generate_signal(
            underlying_price=Decimal("475.00"),
            available_contracts=option_chain,
            current_time=after_cutoff,
        )
        assert signal is None

    @pytest.mark.unit
    def test_generate_signal_no_delta_fallback(self):
        """Test signal generation falls back to ATM when no delta available."""
        strategy = LongCallStrategy(respect_cutoff=False)
        # Contracts without delta
        contracts = [
            OptionContract(
                symbol="SPY231222C00470000",
                underlying="SPY",
                option_type=OptionType.CALL,
                strike=Decimal("470.00"),
                expiration=date.today(),
                bid=Decimal("7.00"),
                ask=Decimal("7.20"),
                delta=None,
            ),
            OptionContract(
                symbol="SPY231222C00480000",
                underlying="SPY",
                option_type=OptionType.CALL,
                strike=Decimal("480.00"),
                expiration=date.today(),
                bid=Decimal("2.00"),
                ask=Decimal("2.20"),
                delta=None,
            ),
        ]
        signal = strategy.generate_signal(
            underlying_price=Decimal("475.00"),
            available_contracts=contracts,
        )
        assert signal is not None
        # Should pick closest to underlying price (470)
        assert signal.contracts[0].strike == Decimal("470.00")

    @pytest.mark.unit
    def test_generate_signal_premium_too_expensive(self):
        """Test signal returns None when premium exceeds max_premium_pct."""
        strategy = LongCallStrategy(
            respect_cutoff=False,
            max_premium_pct=0.01,  # Very low threshold
        )
        contracts = [
            OptionContract(
                symbol="SPY231222C00475000",
                underlying="SPY",
                option_type=OptionType.CALL,
                strike=Decimal("475.00"),
                expiration=date.today(),
                bid=Decimal("50.00"),
                ask=Decimal("51.00"),
                delta=None,
            ),
        ]
        signal = strategy.generate_signal(
            underlying_price=Decimal("475.00"),
            available_contracts=contracts,
        )
        assert signal is None

    @pytest.mark.unit
    def test_create_orders_capped_at_max_position(self, sample_call_contract):
        """Test create_orders caps quantity at max_position_size."""
        strategy = LongCallStrategy(max_position_size=3, respect_cutoff=False)
        signal = StrategySignal(
            strategy_type=StrategyType.LONG_CALL,
            contracts=[sample_call_contract],
            sides=[OrderSide.BUY],
            quantities=[100],  # Much larger than max
            confidence=0.7,
            reason="Test",
            timestamp=datetime.now(),
        )
        orders = strategy.create_orders(signal)
        assert orders[0].quantity == 3

    @pytest.mark.unit
    def test_create_orders_invalid_signal_raises(self, sample_call_contract):
        """Test create_orders raises ValueError for invalid signal."""
        strategy = LongCallStrategy(respect_cutoff=False)
        signal = StrategySignal(
            strategy_type=StrategyType.LONG_CALL,
            contracts=[],
            sides=[],
            quantities=[],
            confidence=0.7,
            reason="Invalid",
            timestamp=datetime.now(),
        )
        with pytest.raises(ValueError, match="Invalid signal"):
            strategy.create_orders(signal)

    @pytest.mark.unit
    def test_generate_signal_with_delta_selection(self):
        """Test signal picks contract closest to target delta."""
        strategy = LongCallStrategy(target_delta=0.50, respect_cutoff=False)
        contracts = [
            OptionContract(
                symbol="SPY231222C00470000",
                underlying="SPY",
                option_type=OptionType.CALL,
                strike=Decimal("470.00"),
                expiration=date.today(),
                bid=Decimal("7.00"),
                ask=Decimal("7.20"),
                delta=0.70,
            ),
            OptionContract(
                symbol="SPY231222C00475000",
                underlying="SPY",
                option_type=OptionType.CALL,
                strike=Decimal("475.00"),
                expiration=date.today(),
                bid=Decimal("2.50"),
                ask=Decimal("2.60"),
                delta=0.50,
            ),
            OptionContract(
                symbol="SPY231222C00480000",
                underlying="SPY",
                option_type=OptionType.CALL,
                strike=Decimal("480.00"),
                expiration=date.today(),
                bid=Decimal("0.50"),
                ask=Decimal("0.60"),
                delta=0.30,
            ),
        ]
        signal = strategy.generate_signal(
            underlying_price=Decimal("475.00"),
            available_contracts=contracts,
        )
        assert signal is not None
        assert signal.contracts[0].delta == 0.50


class TestLongPutStrategyExtended:
    """Tests for uncovered LongPutStrategy code paths."""

    @pytest.mark.unit
    def test_generate_signal_respects_cutoff(self, option_chain):
        """Test signal generation returns None when past cutoff."""
        strategy = LongPutStrategy(respect_cutoff=True)
        after_cutoff = datetime(2024, 1, 15, 15, 30)
        signal = strategy.generate_signal(
            underlying_price=Decimal("475.00"),
            available_contracts=option_chain,
            current_time=after_cutoff,
        )
        assert signal is None

    @pytest.mark.unit
    def test_generate_signal_no_delta_fallback(self):
        """Test signal generation falls back to ATM when no delta available."""
        strategy = LongPutStrategy(respect_cutoff=False)
        contracts = [
            OptionContract(
                symbol="SPY231222P00470000",
                underlying="SPY",
                option_type=OptionType.PUT,
                strike=Decimal("470.00"),
                expiration=date.today(),
                bid=Decimal("1.50"),
                ask=Decimal("1.60"),
                delta=None,
            ),
            OptionContract(
                symbol="SPY231222P00480000",
                underlying="SPY",
                option_type=OptionType.PUT,
                strike=Decimal("480.00"),
                expiration=date.today(),
                bid=Decimal("6.00"),
                ask=Decimal("6.20"),
                delta=None,
            ),
        ]
        signal = strategy.generate_signal(
            underlying_price=Decimal("475.00"),
            available_contracts=contracts,
        )
        assert signal is not None

    @pytest.mark.unit
    def test_generate_signal_with_delta_selection(self):
        """Test signal picks put closest to target delta."""
        strategy = LongPutStrategy(target_delta=-0.50, respect_cutoff=False)
        contracts = [
            OptionContract(
                symbol="SPY231222P00470000",
                underlying="SPY",
                option_type=OptionType.PUT,
                strike=Decimal("470.00"),
                expiration=date.today(),
                bid=Decimal("1.50"),
                ask=Decimal("1.60"),
                delta=-0.30,
            ),
            OptionContract(
                symbol="SPY231222P00475000",
                underlying="SPY",
                option_type=OptionType.PUT,
                strike=Decimal("475.00"),
                expiration=date.today(),
                bid=Decimal("3.00"),
                ask=Decimal("3.10"),
                delta=-0.50,
            ),
            OptionContract(
                symbol="SPY231222P00480000",
                underlying="SPY",
                option_type=OptionType.PUT,
                strike=Decimal("480.00"),
                expiration=date.today(),
                bid=Decimal("6.00"),
                ask=Decimal("6.20"),
                delta=-0.70,
            ),
        ]
        signal = strategy.generate_signal(
            underlying_price=Decimal("475.00"),
            available_contracts=contracts,
        )
        assert signal is not None
        assert signal.contracts[0].delta == -0.50


class TestStraddleStrategyExtended:
    """Tests for uncovered StraddleStrategy code paths."""

    @pytest.mark.unit
    def test_generate_signal_empty_chain(self):
        """Test signal returns None for empty chain."""
        strategy = StraddleStrategy(respect_cutoff=False)
        signal = strategy.generate_signal(
            underlying_price=Decimal("475.00"),
            available_contracts=[],
        )
        assert signal is None

    @pytest.mark.unit
    def test_generate_signal_respects_cutoff(self, option_chain):
        """Test signal returns None when past cutoff."""
        strategy = StraddleStrategy(respect_cutoff=True)
        after_cutoff = datetime(2024, 1, 15, 15, 30)
        signal = strategy.generate_signal(
            underlying_price=Decimal("475.00"),
            available_contracts=option_chain,
            current_time=after_cutoff,
        )
        assert signal is None

    @pytest.mark.unit
    def test_generate_signal_missing_call(self):
        """Test signal returns None when ATM call is missing."""
        strategy = StraddleStrategy(respect_cutoff=False)
        # Only puts at the ATM strike
        contracts = [
            OptionContract(
                symbol="SPY231222P00475000",
                underlying="SPY",
                option_type=OptionType.PUT,
                strike=Decimal("475.00"),
                expiration=date.today(),
                bid=Decimal("2.00"),
                ask=Decimal("2.10"),
            ),
        ]
        signal = strategy.generate_signal(
            underlying_price=Decimal("475.00"),
            available_contracts=contracts,
        )
        assert signal is None

    @pytest.mark.unit
    def test_generate_signal_missing_put(self):
        """Test signal returns None when ATM put is missing."""
        strategy = StraddleStrategy(respect_cutoff=False)
        # Only calls at the ATM strike
        contracts = [
            OptionContract(
                symbol="SPY231222C00475000",
                underlying="SPY",
                option_type=OptionType.CALL,
                strike=Decimal("475.00"),
                expiration=date.today(),
                bid=Decimal("2.50"),
                ask=Decimal("2.60"),
            ),
        ]
        signal = strategy.generate_signal(
            underlying_price=Decimal("475.00"),
            available_contracts=contracts,
        )
        assert signal is None

    @pytest.mark.unit
    def test_find_atm_strike_empty_contracts(self):
        """Test find_atm_strike returns None for empty list."""
        strategy = StraddleStrategy(respect_cutoff=False)
        result = strategy.find_atm_strike([], Decimal("475.00"))
        assert result is None


class TestStrangleStrategyExtended:
    """Tests for uncovered StrangleStrategy code paths."""

    @pytest.mark.unit
    def test_generate_signal_respects_cutoff(self, option_chain):
        """Test signal returns None when past cutoff."""
        strategy = StrangleStrategy(respect_cutoff=True)
        after_cutoff = datetime(2024, 1, 15, 15, 30)
        signal = strategy.generate_signal(
            underlying_price=Decimal("475.00"),
            available_contracts=option_chain,
            current_time=after_cutoff,
        )
        assert signal is None

    @pytest.mark.unit
    def test_generate_signal_no_otm_calls(self):
        """Test signal returns None when no OTM calls exist."""
        strategy = StrangleStrategy(respect_cutoff=False)
        # All calls are ITM (below underlying price)
        contracts = [
            OptionContract(
                symbol="SPY231222C00470000",
                underlying="SPY",
                option_type=OptionType.CALL,
                strike=Decimal("470.00"),
                expiration=date.today(),
                bid=Decimal("7.00"),
                ask=Decimal("7.20"),
            ),
            OptionContract(
                symbol="SPY231222P00470000",
                underlying="SPY",
                option_type=OptionType.PUT,
                strike=Decimal("470.00"),
                expiration=date.today(),
                bid=Decimal("1.50"),
                ask=Decimal("1.60"),
            ),
        ]
        signal = strategy.generate_signal(
            underlying_price=Decimal("475.00"),
            available_contracts=contracts,
        )
        assert signal is None

    @pytest.mark.unit
    def test_generate_signal_no_otm_puts(self):
        """Test signal returns None when no OTM puts exist."""
        strategy = StrangleStrategy(respect_cutoff=False)
        # All puts are ITM (above underlying price)
        contracts = [
            OptionContract(
                symbol="SPY231222C00480000",
                underlying="SPY",
                option_type=OptionType.CALL,
                strike=Decimal("480.00"),
                expiration=date.today(),
                bid=Decimal("2.00"),
                ask=Decimal("2.10"),
            ),
            OptionContract(
                symbol="SPY231222P00480000",
                underlying="SPY",
                option_type=OptionType.PUT,
                strike=Decimal("480.00"),
                expiration=date.today(),
                bid=Decimal("6.00"),
                ask=Decimal("6.20"),
            ),
        ]
        signal = strategy.generate_signal(
            underlying_price=Decimal("475.00"),
            available_contracts=contracts,
        )
        assert signal is None

    @pytest.mark.unit
    def test_generate_signal_only_calls_no_puts(self):
        """Test signal returns None when only calls available."""
        strategy = StrangleStrategy(respect_cutoff=False)
        contracts = [
            OptionContract(
                symbol="SPY231222C00480000",
                underlying="SPY",
                option_type=OptionType.CALL,
                strike=Decimal("480.00"),
                expiration=date.today(),
                bid=Decimal("2.00"),
                ask=Decimal("2.10"),
            ),
        ]
        signal = strategy.generate_signal(
            underlying_price=Decimal("475.00"),
            available_contracts=contracts,
        )
        assert signal is None

    @pytest.mark.unit
    def test_generate_signal_only_puts_no_calls(self):
        """Test signal returns None when only puts available."""
        strategy = StrangleStrategy(respect_cutoff=False)
        contracts = [
            OptionContract(
                symbol="SPY231222P00470000",
                underlying="SPY",
                option_type=OptionType.PUT,
                strike=Decimal("470.00"),
                expiration=date.today(),
                bid=Decimal("1.50"),
                ask=Decimal("1.60"),
            ),
        ]
        signal = strategy.generate_signal(
            underlying_price=Decimal("475.00"),
            available_contracts=contracts,
        )
        assert signal is None

    @pytest.mark.unit
    def test_generate_signal_selects_closest_otm(self):
        """Test strangle selects closest OTM options."""
        strategy = StrangleStrategy(respect_cutoff=False)
        contracts = [
            OptionContract(
                symbol="SPY231222C00480000",
                underlying="SPY",
                option_type=OptionType.CALL,
                strike=Decimal("480.00"),
                expiration=date.today(),
                bid=Decimal("2.00"),
                ask=Decimal("2.10"),
            ),
            OptionContract(
                symbol="SPY231222C00490000",
                underlying="SPY",
                option_type=OptionType.CALL,
                strike=Decimal("490.00"),
                expiration=date.today(),
                bid=Decimal("0.50"),
                ask=Decimal("0.60"),
            ),
            OptionContract(
                symbol="SPY231222P00470000",
                underlying="SPY",
                option_type=OptionType.PUT,
                strike=Decimal("470.00"),
                expiration=date.today(),
                bid=Decimal("1.50"),
                ask=Decimal("1.60"),
            ),
            OptionContract(
                symbol="SPY231222P00460000",
                underlying="SPY",
                option_type=OptionType.PUT,
                strike=Decimal("460.00"),
                expiration=date.today(),
                bid=Decimal("0.30"),
                ask=Decimal("0.40"),
            ),
        ]
        signal = strategy.generate_signal(
            underlying_price=Decimal("475.00"),
            available_contracts=contracts,
        )
        assert signal is not None
        call = [c for c in signal.contracts if c.option_type == OptionType.CALL][0]
        put = [c for c in signal.contracts if c.option_type == OptionType.PUT][0]
        # Should pick closest OTM: 480 call and 470 put
        assert call.strike == Decimal("480.00")
        assert put.strike == Decimal("470.00")


class TestFilterContracts:
    """Tests for filter_0dte_contracts."""

    @pytest.mark.unit
    def test_filter_0dte_excludes_non_today(self):
        """Test filter_0dte_contracts excludes contracts not expiring today."""
        strategy = LongCallStrategy(respect_cutoff=False)
        tomorrow = date.today() + __import__("datetime").timedelta(days=1)
        contracts = [
            OptionContract(
                symbol="SPY231222C00475000",
                underlying="SPY",
                option_type=OptionType.CALL,
                strike=Decimal("475.00"),
                expiration=date.today(),
                bid=Decimal("2.50"),
                ask=Decimal("2.60"),
            ),
            OptionContract(
                symbol="SPY231223C00475000",
                underlying="SPY",
                option_type=OptionType.CALL,
                strike=Decimal("475.00"),
                expiration=tomorrow,
                bid=Decimal("3.50"),
                ask=Decimal("3.60"),
            ),
        ]
        filtered = strategy.filter_0dte_contracts(contracts)
        assert len(filtered) == 1
        assert filtered[0].expiration == date.today()
