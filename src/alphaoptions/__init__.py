"""
AlphaOptions - Automated 0DTE Options Trading Framework

A Python framework for implementing and backtesting zero-days-to-expiration
options trading strategies using the Alpaca trading API.
"""

__version__ = "0.1.0"
__author__ = "AlphaOptions Team"

from .models import OptionContract, OptionType, OrderSide, StrategyType
from .strategies import (
    BaseStrategy,
    LongCallStrategy,
    LongPutStrategy,
    StraddleStrategy,
    StrangleStrategy,
)
from .risk import RiskManager, PositionSizer
from .broker import AlpacaBroker

__all__ = [
    # Models
    "OptionContract",
    "OptionType",
    "OrderSide",
    "StrategyType",
    # Strategies
    "BaseStrategy",
    "LongCallStrategy",
    "LongPutStrategy",
    "StraddleStrategy",
    "StrangleStrategy",
    # Risk Management
    "RiskManager",
    "PositionSizer",
    # Broker
    "AlpacaBroker",
]
