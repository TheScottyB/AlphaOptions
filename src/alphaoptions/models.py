"""
Data models for AlphaOptions trading framework.
"""

from dataclasses import dataclass, field
from datetime import datetime, date
from decimal import Decimal
from enum import Enum
from typing import Optional


class OptionType(Enum):
    """Type of option contract."""
    CALL = "call"
    PUT = "put"


class OrderSide(Enum):
    """Side of the order."""
    BUY = "buy"
    SELL = "sell"


class StrategyType(Enum):
    """Type of trading strategy."""
    LONG_CALL = "long_call"
    LONG_PUT = "long_put"
    STRADDLE = "straddle"
    STRANGLE = "strangle"
    VERTICAL_SPREAD = "vertical_spread"


@dataclass
class OptionContract:
    """Represents an options contract."""

    symbol: str
    underlying: str
    option_type: OptionType
    strike: Decimal
    expiration: date
    bid: Optional[Decimal] = None
    ask: Optional[Decimal] = None
    last_price: Optional[Decimal] = None
    volume: int = 0
    open_interest: int = 0
    implied_volatility: Optional[float] = None
    delta: Optional[float] = None
    gamma: Optional[float] = None
    theta: Optional[float] = None
    vega: Optional[float] = None

    @property
    def mid_price(self) -> Optional[Decimal]:
        """Calculate mid price from bid/ask."""
        if self.bid is not None and self.ask is not None:
            return (self.bid + self.ask) / 2
        return self.last_price

    @property
    def spread(self) -> Optional[Decimal]:
        """Calculate bid-ask spread."""
        if self.bid is not None and self.ask is not None:
            return self.ask - self.bid
        return None

    @property
    def is_itm(self, underlying_price: Decimal) -> bool:
        """Check if option is in-the-money."""
        if self.option_type == OptionType.CALL:
            return underlying_price > self.strike
        return underlying_price < self.strike

    def is_0dte(self, reference_date: Optional[date] = None) -> bool:
        """Check if option expires today (0DTE)."""
        check_date = reference_date or date.today()
        return self.expiration == check_date

    def validate(self) -> bool:
        """Validate contract data is complete and sensible."""
        if not self.symbol or not self.underlying:
            return False
        if self.strike <= 0:
            return False
        if self.bid is not None and self.ask is not None:
            if self.bid < 0 or self.ask < 0:
                return False
            if self.bid > self.ask:
                return False
        return True


@dataclass
class Position:
    """Represents a trading position."""

    contract: OptionContract
    quantity: int
    entry_price: Decimal
    entry_time: datetime
    side: OrderSide

    @property
    def is_long(self) -> bool:
        """Check if position is long."""
        return self.side == OrderSide.BUY

    @property
    def notional_value(self) -> Decimal:
        """Calculate position notional value (per contract = 100 shares)."""
        return self.entry_price * self.quantity * 100

    def unrealized_pnl(self, current_price: Decimal) -> Decimal:
        """Calculate unrealized P&L."""
        price_diff = current_price - self.entry_price
        if not self.is_long:
            price_diff = -price_diff
        return price_diff * self.quantity * 100


@dataclass
class Order:
    """Represents a trading order."""

    contract: OptionContract
    side: OrderSide
    quantity: int
    order_type: str = "limit"
    limit_price: Optional[Decimal] = None
    time_in_force: str = "day"
    order_id: Optional[str] = None
    status: str = "new"
    filled_quantity: int = 0
    filled_price: Optional[Decimal] = None
    created_at: datetime = field(default_factory=datetime.now)

    def validate(self) -> bool:
        """Validate order parameters."""
        if self.quantity <= 0:
            return False
        if self.order_type == "limit" and self.limit_price is None:
            return False
        if self.limit_price is not None and self.limit_price <= 0:
            return False
        return True


@dataclass
class TradeResult:
    """Result of a completed trade."""

    strategy_type: StrategyType
    entry_time: datetime
    exit_time: datetime
    entry_price: Decimal
    exit_price: Decimal
    quantity: int
    pnl: Decimal
    commission: Decimal = Decimal("0")

    @property
    def net_pnl(self) -> Decimal:
        """Calculate net P&L after commissions."""
        return self.pnl - self.commission

    @property
    def return_pct(self) -> float:
        """Calculate percentage return."""
        if self.entry_price == 0:
            return 0.0
        return float((self.exit_price - self.entry_price) / self.entry_price * 100)
