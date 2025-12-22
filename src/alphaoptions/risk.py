"""
Risk management module for AlphaOptions.
"""

from dataclasses import dataclass
from decimal import Decimal
from typing import List, Optional

from .models import Position, Order, OptionContract


@dataclass
class RiskLimits:
    """Configuration for risk limits."""

    max_portfolio_risk_pct: float = 5.0  # Max % of portfolio at risk
    max_position_size: int = 10  # Max contracts per position
    max_daily_loss_pct: float = 2.0  # Max daily loss as % of portfolio
    max_single_trade_risk_pct: float = 1.0  # Max risk per trade as % of portfolio
    min_buying_power_reserve_pct: float = 20.0  # Reserve buying power %
    max_concentration_pct: float = 25.0  # Max % in single underlying


class PositionSizer:
    """Calculates appropriate position sizes based on risk parameters."""

    def __init__(
        self,
        account_value: Decimal,
        risk_per_trade_pct: float = 1.0,
        max_contracts: int = 10,
    ):
        self.account_value = account_value
        self.risk_per_trade_pct = risk_per_trade_pct
        self.max_contracts = max_contracts

    def calculate_position_size(
        self,
        contract: OptionContract,
        stop_loss_pct: float = 50.0,
    ) -> int:
        """
        Calculate position size based on risk parameters.

        Args:
            contract: The option contract to size
            stop_loss_pct: Stop loss as percentage of premium (default 50%)

        Returns:
            Number of contracts to trade
        """
        if contract.mid_price is None or contract.mid_price <= 0:
            return 0

        # Maximum dollar risk per trade
        max_risk = self.account_value * Decimal(str(self.risk_per_trade_pct / 100))

        # Risk per contract (premium * stop_loss_pct * 100 shares)
        risk_per_contract = contract.mid_price * Decimal(str(stop_loss_pct / 100)) * 100

        if risk_per_contract <= 0:
            return 0

        # Calculate position size
        position_size = int(max_risk / risk_per_contract)

        # Apply maximum constraint
        return min(position_size, self.max_contracts)

    def validate_position_size(
        self,
        contracts: int,
        contract: OptionContract,
    ) -> bool:
        """Validate if position size is within acceptable limits."""
        if contracts <= 0:
            return False
        if contracts > self.max_contracts:
            return False
        if contract.mid_price is None:
            return False

        # Check total position value doesn't exceed account value
        position_value = contract.mid_price * contracts * 100
        if position_value > self.account_value:
            return False

        return True


class RiskManager:
    """Manages portfolio risk and validates trades."""

    def __init__(
        self,
        account_value: Decimal,
        limits: Optional[RiskLimits] = None,
    ):
        self.account_value = account_value
        self.limits = limits or RiskLimits()
        self.daily_pnl = Decimal("0")
        self.open_positions: List[Position] = []

    @property
    def portfolio_risk(self) -> Decimal:
        """Calculate total portfolio risk from open positions."""
        total_risk = Decimal("0")
        for position in self.open_positions:
            # For long options, max risk is premium paid
            if position.is_long:
                total_risk += position.notional_value
        return total_risk

    @property
    def portfolio_risk_pct(self) -> float:
        """Portfolio risk as percentage of account value."""
        if self.account_value <= 0:
            return 0.0
        return float(self.portfolio_risk / self.account_value * 100)

    @property
    def available_risk_budget(self) -> Decimal:
        """Calculate remaining risk budget."""
        max_risk = self.account_value * Decimal(
            str(self.limits.max_portfolio_risk_pct / 100)
        )
        return max(Decimal("0"), max_risk - self.portfolio_risk)

    def can_take_trade(self, order: Order) -> tuple[bool, str]:
        """
        Validate if a trade can be taken based on risk limits.

        Returns:
            Tuple of (can_trade, reason)
        """
        # Check daily loss limit
        daily_loss_limit = self.account_value * Decimal(
            str(self.limits.max_daily_loss_pct / 100)
        )
        if self.daily_pnl < -daily_loss_limit:
            return False, "Daily loss limit reached"

        # Check portfolio risk limit
        if self.portfolio_risk_pct >= self.limits.max_portfolio_risk_pct:
            return False, "Portfolio risk limit reached"

        # Check single trade risk
        if order.limit_price is not None:
            trade_risk = order.limit_price * order.quantity * 100
            max_trade_risk = self.account_value * Decimal(
                str(self.limits.max_single_trade_risk_pct / 100)
            )
            if trade_risk > max_trade_risk:
                return False, f"Trade risk ${trade_risk} exceeds limit ${max_trade_risk}"

        # Check position size limit
        if order.quantity > self.limits.max_position_size:
            return False, f"Position size {order.quantity} exceeds limit"

        # Check concentration limit
        underlying = order.contract.underlying
        underlying_exposure = sum(
            p.notional_value
            for p in self.open_positions
            if p.contract.underlying == underlying
        )
        max_concentration = self.account_value * Decimal(
            str(self.limits.max_concentration_pct / 100)
        )
        if order.limit_price is not None:
            new_exposure = underlying_exposure + (order.limit_price * order.quantity * 100)
            if new_exposure > max_concentration:
                return False, f"Concentration limit reached for {underlying}"

        return True, "Trade approved"

    def update_daily_pnl(self, pnl: Decimal) -> None:
        """Update daily P&L."""
        self.daily_pnl += pnl

    def reset_daily_pnl(self) -> None:
        """Reset daily P&L (call at start of trading day)."""
        self.daily_pnl = Decimal("0")

    def add_position(self, position: Position) -> None:
        """Add a new position to track."""
        self.open_positions.append(position)

    def remove_position(self, position: Position) -> None:
        """Remove a closed position."""
        if position in self.open_positions:
            self.open_positions.remove(position)

    def calculate_max_loss(self) -> Decimal:
        """Calculate maximum possible loss from all positions."""
        max_loss = Decimal("0")
        for position in self.open_positions:
            if position.is_long:
                # Max loss is premium paid for long options
                max_loss += position.notional_value
        return max_loss

    def get_risk_summary(self) -> dict:
        """Get summary of current risk metrics."""
        return {
            "account_value": float(self.account_value),
            "portfolio_risk": float(self.portfolio_risk),
            "portfolio_risk_pct": self.portfolio_risk_pct,
            "daily_pnl": float(self.daily_pnl),
            "available_risk_budget": float(self.available_risk_budget),
            "max_possible_loss": float(self.calculate_max_loss()),
            "open_positions_count": len(self.open_positions),
        }
