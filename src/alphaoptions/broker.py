"""
Broker integration module for Alpaca.
"""

from dataclasses import dataclass
from datetime import datetime, time, date
from decimal import Decimal
from typing import List, Optional
import os


# Trading hours configuration
MARKET_OPEN = time(9, 30)  # 9:30 AM ET
MARKET_CLOSE = time(16, 0)  # 4:00 PM ET
ALPACA_0DTE_CUTOFF = time(15, 15)  # 3:15 PM ET for 0DTE orders


@dataclass
class BrokerConfig:
    """Configuration for broker connection."""

    api_key: str
    api_secret: str
    base_url: str = "https://paper-api.alpaca.markets"  # Paper trading by default
    data_url: str = "https://data.alpaca.markets"

    @classmethod
    def from_env(cls) -> "BrokerConfig":
        """Create config from environment variables."""
        api_key = os.environ.get("ALPACA_API_KEY", "")
        api_secret = os.environ.get("ALPACA_API_SECRET", "")
        base_url = os.environ.get(
            "ALPACA_BASE_URL", "https://paper-api.alpaca.markets"
        )

        if not api_key or not api_secret:
            raise ValueError(
                "ALPACA_API_KEY and ALPACA_API_SECRET must be set"
            )

        return cls(
            api_key=api_key,
            api_secret=api_secret,
            base_url=base_url,
        )

    @property
    def is_paper(self) -> bool:
        """Check if using paper trading."""
        return "paper" in self.base_url.lower()


@dataclass
class AccountInfo:
    """Broker account information."""

    account_id: str
    buying_power: Decimal
    cash: Decimal
    portfolio_value: Decimal
    equity: Decimal
    pattern_day_trader: bool
    trading_blocked: bool
    options_approved: bool
    options_level: int  # 1-4 typically

    def can_trade_options(self) -> bool:
        """Check if account can trade options."""
        return self.options_approved and not self.trading_blocked


class AlpacaBroker:
    """
    Alpaca broker integration for options trading.

    This is a stub implementation that will be connected to the
    actual Alpaca API.
    """

    def __init__(self, config: Optional[BrokerConfig] = None):
        self.config = config
        self._connected = False
        self._account: Optional[AccountInfo] = None

    @property
    def is_connected(self) -> bool:
        """Check if connected to broker."""
        return self._connected

    def connect(self) -> bool:
        """
        Establish connection to Alpaca.

        Returns:
            True if connection successful
        """
        if self.config is None:
            try:
                self.config = BrokerConfig.from_env()
            except ValueError:
                return False

        # Placeholder for actual connection logic
        # In production, this would authenticate with Alpaca API
        self._connected = True
        return True

    def disconnect(self) -> None:
        """Disconnect from broker."""
        self._connected = False
        self._account = None

    def get_account(self) -> Optional[AccountInfo]:
        """
        Fetch account information.

        Returns:
            AccountInfo or None if not connected
        """
        if not self._connected:
            return None

        # Placeholder - would fetch from Alpaca API
        # For testing, return mock data
        if self._account is None:
            self._account = AccountInfo(
                account_id="test-account",
                buying_power=Decimal("100000"),
                cash=Decimal("100000"),
                portfolio_value=Decimal("100000"),
                equity=Decimal("100000"),
                pattern_day_trader=False,
                trading_blocked=False,
                options_approved=True,
                options_level=2,
            )

        return self._account

    def is_market_open(self) -> bool:
        """Check if market is currently open."""
        now = datetime.now().time()
        return MARKET_OPEN <= now <= MARKET_CLOSE

    def can_trade_0dte(self) -> bool:
        """Check if 0DTE orders can still be placed."""
        now = datetime.now().time()
        return now < ALPACA_0DTE_CUTOFF

    def get_time_to_cutoff(self) -> Optional[int]:
        """
        Get seconds until 0DTE order cutoff.

        Returns:
            Seconds until cutoff, or None if past cutoff
        """
        now = datetime.now()
        cutoff = datetime.combine(now.date(), ALPACA_0DTE_CUTOFF)

        if now.time() >= ALPACA_0DTE_CUTOFF:
            return None

        delta = cutoff - now
        return int(delta.total_seconds())

    def get_option_chain(
        self,
        underlying: str,
        expiration: Optional[date] = None,
    ) -> List[dict]:
        """
        Fetch option chain for underlying.

        Args:
            underlying: Ticker symbol
            expiration: Target expiration date (default: today for 0DTE)

        Returns:
            List of option contract data
        """
        if not self._connected:
            return []

        # Placeholder - would fetch from Alpaca API
        exp_date = expiration or date.today()

        # Return empty list - actual implementation would query API
        return []

    def submit_order(
        self,
        symbol: str,
        qty: int,
        side: str,
        order_type: str = "limit",
        limit_price: Optional[Decimal] = None,
        time_in_force: str = "day",
    ) -> Optional[str]:
        """
        Submit an order to Alpaca.

        Args:
            symbol: Option symbol
            qty: Number of contracts
            side: 'buy' or 'sell'
            order_type: 'market' or 'limit'
            limit_price: Limit price (required for limit orders)
            time_in_force: Order duration

        Returns:
            Order ID if successful, None otherwise
        """
        if not self._connected:
            return None

        # Validate inputs
        if order_type == "limit" and limit_price is None:
            return None

        if qty <= 0:
            return None

        if side not in ("buy", "sell"):
            return None

        # Placeholder - would submit to Alpaca API
        # For now, return a mock order ID
        return f"order-{datetime.now().timestamp()}"

    def cancel_order(self, order_id: str) -> bool:
        """
        Cancel an open order.

        Args:
            order_id: The order ID to cancel

        Returns:
            True if cancellation successful
        """
        if not self._connected:
            return False

        # Placeholder - would cancel via Alpaca API
        return True

    def get_order_status(self, order_id: str) -> Optional[dict]:
        """
        Get status of an order.

        Args:
            order_id: The order ID to check

        Returns:
            Order status dict or None
        """
        if not self._connected:
            return None

        # Placeholder - would query Alpaca API
        return {
            "order_id": order_id,
            "status": "new",
            "filled_qty": 0,
        }

    def get_positions(self) -> List[dict]:
        """
        Get all open positions.

        Returns:
            List of position data
        """
        if not self._connected:
            return []

        # Placeholder - would fetch from Alpaca API
        return []
