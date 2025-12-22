"""
Pytest fixtures for AlphaOptions tests.
"""

import pytest
from datetime import date, datetime
from decimal import Decimal

import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from alphaoptions.models import OptionContract, OptionType, OrderSide, Position, Order
from alphaoptions.strategies import LongCallStrategy, LongPutStrategy, StraddleStrategy
from alphaoptions.risk import RiskManager, RiskLimits, PositionSizer
from alphaoptions.broker import AlpacaBroker, BrokerConfig


@pytest.fixture
def sample_call_contract():
    """Create a sample call option contract."""
    return OptionContract(
        symbol="SPY231222C00475000",
        underlying="SPY",
        option_type=OptionType.CALL,
        strike=Decimal("475.00"),
        expiration=date.today(),
        bid=Decimal("2.50"),
        ask=Decimal("2.60"),
        last_price=Decimal("2.55"),
        volume=1000,
        open_interest=5000,
        implied_volatility=0.20,
        delta=0.50,
        gamma=0.05,
        theta=-0.10,
        vega=0.15,
    )


@pytest.fixture
def sample_put_contract():
    """Create a sample put option contract at same strike as call (475)."""
    return OptionContract(
        symbol="SPY231222P00475000",
        underlying="SPY",
        option_type=OptionType.PUT,
        strike=Decimal("475.00"),  # Same strike as sample_call_contract
        expiration=date.today(),
        bid=Decimal("1.80"),
        ask=Decimal("1.90"),
        last_price=Decimal("1.85"),
        volume=800,
        open_interest=4000,
        implied_volatility=0.18,
        delta=-0.45,
        gamma=0.04,
        theta=-0.08,
        vega=0.12,
    )


@pytest.fixture
def option_chain(sample_call_contract, sample_put_contract):
    """Create a sample option chain with multiple strikes."""
    contracts = [sample_call_contract, sample_put_contract]

    # Add more strikes
    for i, strike_offset in enumerate([-10, -5, 5, 10]):
        call = OptionContract(
            symbol=f"SPY231222C00{475 + strike_offset}000",
            underlying="SPY",
            option_type=OptionType.CALL,
            strike=Decimal(str(475 + strike_offset)),
            expiration=date.today(),
            bid=Decimal("1.50") + Decimal(str(0.1 * i)),
            ask=Decimal("1.60") + Decimal(str(0.1 * i)),
            delta=0.30 + (0.05 * i) if strike_offset < 0 else 0.30 - (0.05 * i),
        )
        put = OptionContract(
            symbol=f"SPY231222P00{475 + strike_offset}000",
            underlying="SPY",
            option_type=OptionType.PUT,
            strike=Decimal(str(475 + strike_offset)),
            expiration=date.today(),
            bid=Decimal("1.30") + Decimal(str(0.1 * i)),
            ask=Decimal("1.40") + Decimal(str(0.1 * i)),
            delta=-0.30 - (0.05 * i) if strike_offset > 0 else -0.30 + (0.05 * i),
        )
        contracts.extend([call, put])

    return contracts


@pytest.fixture
def sample_position(sample_call_contract):
    """Create a sample position."""
    return Position(
        contract=sample_call_contract,
        quantity=5,
        entry_price=Decimal("2.55"),
        entry_time=datetime.now(),
        side=OrderSide.BUY,
    )


@pytest.fixture
def sample_order(sample_call_contract):
    """Create a sample order."""
    return Order(
        contract=sample_call_contract,
        side=OrderSide.BUY,
        quantity=2,
        order_type="limit",
        limit_price=Decimal("2.55"),
    )


@pytest.fixture
def risk_manager():
    """Create a risk manager with default limits."""
    return RiskManager(
        account_value=Decimal("100000"),
        limits=RiskLimits(),
    )


@pytest.fixture
def position_sizer():
    """Create a position sizer."""
    return PositionSizer(
        account_value=Decimal("100000"),
        risk_per_trade_pct=1.0,
        max_contracts=10,
    )


@pytest.fixture
def long_call_strategy():
    """Create a long call strategy."""
    return LongCallStrategy(
        max_position_size=10,
        min_confidence=0.6,
        respect_cutoff=False,  # Disable for testing
    )


@pytest.fixture
def long_put_strategy():
    """Create a long put strategy."""
    return LongPutStrategy(
        max_position_size=10,
        min_confidence=0.6,
        respect_cutoff=False,
    )


@pytest.fixture
def straddle_strategy():
    """Create a straddle strategy."""
    return StraddleStrategy(
        max_position_size=10,
        min_confidence=0.6,
        respect_cutoff=False,
    )


@pytest.fixture
def broker_config():
    """Create a broker config for testing."""
    return BrokerConfig(
        api_key="test-key",
        api_secret="test-secret",
        base_url="https://paper-api.alpaca.markets",
    )


@pytest.fixture
def broker(broker_config):
    """Create a broker instance."""
    return AlpacaBroker(config=broker_config)
