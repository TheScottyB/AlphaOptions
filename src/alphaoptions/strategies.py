"""
Options trading strategies for 0DTE trading.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, time, date
from decimal import Decimal
from typing import List, Optional, Tuple

from .models import OptionContract, OptionType, OrderSide, StrategyType, Order


# Alpaca's cutoff time for 0DTE options orders
ALPACA_0DTE_CUTOFF = time(15, 15)  # 3:15 PM ET


@dataclass
class StrategySignal:
    """Trading signal from a strategy."""

    strategy_type: StrategyType
    contracts: List[OptionContract]
    sides: List[OrderSide]
    quantities: List[int]
    confidence: float  # 0.0 to 1.0
    reason: str
    timestamp: datetime

    def validate(self) -> bool:
        """Validate signal parameters."""
        if not self.contracts:
            return False
        if len(self.contracts) != len(self.sides) != len(self.quantities):
            return False
        if not 0.0 <= self.confidence <= 1.0:
            return False
        return True


class BaseStrategy(ABC):
    """Base class for all trading strategies."""

    def __init__(
        self,
        max_position_size: int = 10,
        min_confidence: float = 0.6,
        respect_cutoff: bool = True,
    ):
        self.max_position_size = max_position_size
        self.min_confidence = min_confidence
        self.respect_cutoff = respect_cutoff
        self._name = self.__class__.__name__

    @property
    def name(self) -> str:
        """Strategy name."""
        return self._name

    @property
    @abstractmethod
    def strategy_type(self) -> StrategyType:
        """Type of strategy."""
        pass

    def is_within_trading_hours(self, current_time: Optional[datetime] = None) -> bool:
        """Check if within valid trading hours for 0DTE."""
        check_time = current_time or datetime.now()

        if self.respect_cutoff:
            # Alpaca 0DTE cutoff is 3:15 PM ET
            return check_time.time() < ALPACA_0DTE_CUTOFF
        return True

    @abstractmethod
    def generate_signal(
        self,
        underlying_price: Decimal,
        available_contracts: List[OptionContract],
        current_time: Optional[datetime] = None,
    ) -> Optional[StrategySignal]:
        """Generate trading signal based on market conditions."""
        pass

    def create_orders(self, signal: StrategySignal) -> List[Order]:
        """Create orders from a trading signal."""
        if not signal.validate():
            raise ValueError("Invalid signal")

        orders = []
        for contract, side, qty in zip(
            signal.contracts, signal.sides, signal.quantities
        ):
            order = Order(
                contract=contract,
                side=side,
                quantity=min(qty, self.max_position_size),
                limit_price=contract.mid_price,
            )
            orders.append(order)

        return orders

    def filter_0dte_contracts(
        self,
        contracts: List[OptionContract],
        reference_date: Optional[date] = None,
    ) -> List[OptionContract]:
        """Filter contracts to only include 0DTE options."""
        check_date = reference_date or date.today()
        return [c for c in contracts if c.is_0dte(check_date)]


class LongCallStrategy(BaseStrategy):
    """
    Long Call Strategy for bullish outlook.

    Buys call options expecting the underlying to move up significantly.
    Max loss is limited to premium paid.
    """

    def __init__(
        self,
        target_delta: float = 0.50,
        max_premium_pct: float = 2.0,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.target_delta = target_delta
        self.max_premium_pct = max_premium_pct

    @property
    def strategy_type(self) -> StrategyType:
        return StrategyType.LONG_CALL

    def generate_signal(
        self,
        underlying_price: Decimal,
        available_contracts: List[OptionContract],
        current_time: Optional[datetime] = None,
    ) -> Optional[StrategySignal]:
        """Generate long call signal."""
        if not self.is_within_trading_hours(current_time):
            return None

        # Filter for calls only
        calls = [c for c in available_contracts if c.option_type == OptionType.CALL]
        if not calls:
            return None

        # Find ATM or slightly OTM call closest to target delta
        best_contract = None
        best_delta_diff = float('inf')

        for contract in calls:
            if contract.delta is not None:
                delta_diff = abs(contract.delta - self.target_delta)
                if delta_diff < best_delta_diff:
                    best_delta_diff = delta_diff
                    best_contract = contract

        # Fallback to ATM if no delta available
        if best_contract is None:
            calls_sorted = sorted(
                calls, key=lambda c: abs(c.strike - underlying_price)
            )
            best_contract = calls_sorted[0] if calls_sorted else None

        if best_contract is None:
            return None

        # Check premium isn't too expensive
        if best_contract.mid_price:
            premium_pct = float(best_contract.mid_price / underlying_price * 100)
            if premium_pct > self.max_premium_pct:
                return None

        return StrategySignal(
            strategy_type=self.strategy_type,
            contracts=[best_contract],
            sides=[OrderSide.BUY],
            quantities=[1],
            confidence=0.7,
            reason=f"Long call on {best_contract.underlying} @ {best_contract.strike}",
            timestamp=current_time or datetime.now(),
        )


class LongPutStrategy(BaseStrategy):
    """
    Long Put Strategy for bearish outlook.

    Buys put options expecting the underlying to move down significantly.
    Max loss is limited to premium paid.
    """

    def __init__(
        self,
        target_delta: float = -0.50,
        max_premium_pct: float = 2.0,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.target_delta = target_delta
        self.max_premium_pct = max_premium_pct

    @property
    def strategy_type(self) -> StrategyType:
        return StrategyType.LONG_PUT

    def generate_signal(
        self,
        underlying_price: Decimal,
        available_contracts: List[OptionContract],
        current_time: Optional[datetime] = None,
    ) -> Optional[StrategySignal]:
        """Generate long put signal."""
        if not self.is_within_trading_hours(current_time):
            return None

        # Filter for puts only
        puts = [c for c in available_contracts if c.option_type == OptionType.PUT]
        if not puts:
            return None

        # Find ATM or slightly OTM put closest to target delta
        best_contract = None
        best_delta_diff = float('inf')

        for contract in puts:
            if contract.delta is not None:
                delta_diff = abs(contract.delta - self.target_delta)
                if delta_diff < best_delta_diff:
                    best_delta_diff = delta_diff
                    best_contract = contract

        # Fallback to ATM if no delta available
        if best_contract is None:
            puts_sorted = sorted(
                puts, key=lambda c: abs(c.strike - underlying_price)
            )
            best_contract = puts_sorted[0] if puts_sorted else None

        if best_contract is None:
            return None

        return StrategySignal(
            strategy_type=self.strategy_type,
            contracts=[best_contract],
            sides=[OrderSide.BUY],
            quantities=[1],
            confidence=0.7,
            reason=f"Long put on {best_contract.underlying} @ {best_contract.strike}",
            timestamp=current_time or datetime.now(),
        )


class StraddleStrategy(BaseStrategy):
    """
    Straddle Strategy for high volatility expectations.

    Buys both a call and put at the same strike price (usually ATM).
    Profits from large moves in either direction.
    """

    def __init__(
        self,
        max_total_premium_pct: float = 4.0,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.max_total_premium_pct = max_total_premium_pct

    @property
    def strategy_type(self) -> StrategyType:
        return StrategyType.STRADDLE

    def find_atm_strike(
        self,
        contracts: List[OptionContract],
        underlying_price: Decimal,
    ) -> Optional[Decimal]:
        """Find the at-the-money strike price."""
        strikes = set(c.strike for c in contracts)
        if not strikes:
            return None
        return min(strikes, key=lambda s: abs(s - underlying_price))

    def generate_signal(
        self,
        underlying_price: Decimal,
        available_contracts: List[OptionContract],
        current_time: Optional[datetime] = None,
    ) -> Optional[StrategySignal]:
        """Generate straddle signal."""
        if not self.is_within_trading_hours(current_time):
            return None

        atm_strike = self.find_atm_strike(available_contracts, underlying_price)
        if atm_strike is None:
            return None

        # Find ATM call and put
        atm_call = None
        atm_put = None

        for contract in available_contracts:
            if contract.strike == atm_strike:
                if contract.option_type == OptionType.CALL:
                    atm_call = contract
                elif contract.option_type == OptionType.PUT:
                    atm_put = contract

        if atm_call is None or atm_put is None:
            return None

        return StrategySignal(
            strategy_type=self.strategy_type,
            contracts=[atm_call, atm_put],
            sides=[OrderSide.BUY, OrderSide.BUY],
            quantities=[1, 1],
            confidence=0.65,
            reason=f"Straddle on {atm_call.underlying} @ {atm_strike}",
            timestamp=current_time or datetime.now(),
        )


class StrangleStrategy(BaseStrategy):
    """
    Strangle Strategy for high volatility with lower cost than straddle.

    Buys OTM call and OTM put at different strikes.
    Lower cost than straddle but needs larger move to profit.
    """

    def __init__(
        self,
        call_delta: float = 0.30,
        put_delta: float = -0.30,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.call_delta = call_delta
        self.put_delta = put_delta

    @property
    def strategy_type(self) -> StrategyType:
        return StrategyType.STRANGLE

    def generate_signal(
        self,
        underlying_price: Decimal,
        available_contracts: List[OptionContract],
        current_time: Optional[datetime] = None,
    ) -> Optional[StrategySignal]:
        """Generate strangle signal."""
        if not self.is_within_trading_hours(current_time):
            return None

        calls = [c for c in available_contracts if c.option_type == OptionType.CALL]
        puts = [c for c in available_contracts if c.option_type == OptionType.PUT]

        if not calls or not puts:
            return None

        # Select OTM call (strike above underlying)
        otm_calls = [c for c in calls if c.strike > underlying_price]
        otm_puts = [c for c in puts if c.strike < underlying_price]

        if not otm_calls or not otm_puts:
            return None

        # Select contracts closest to target deltas if available, else closest OTM
        selected_call = min(otm_calls, key=lambda c: c.strike)
        selected_put = max(otm_puts, key=lambda c: c.strike)

        return StrategySignal(
            strategy_type=self.strategy_type,
            contracts=[selected_call, selected_put],
            sides=[OrderSide.BUY, OrderSide.BUY],
            quantities=[1, 1],
            confidence=0.6,
            reason=f"Strangle: call@{selected_call.strike}, put@{selected_put.strike}",
            timestamp=current_time or datetime.now(),
        )
