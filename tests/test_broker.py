"""
Sanity tests for AlphaOptions broker integration.
"""

import pytest
from datetime import time
from decimal import Decimal

from alphaoptions.broker import (
    AlpacaBroker,
    BrokerConfig,
    AccountInfo,
    MARKET_OPEN,
    MARKET_CLOSE,
    ALPACA_0DTE_CUTOFF,
)


class TestBrokerConfig:
    """Sanity tests for BrokerConfig."""

    @pytest.mark.sanity
    def test_config_creation(self, broker_config):
        """Test broker config initialization."""
        assert broker_config.api_key == "test-key"
        assert broker_config.api_secret == "test-secret"
        assert "paper" in broker_config.base_url

    @pytest.mark.sanity
    def test_is_paper_trading(self, broker_config):
        """Test paper trading detection."""
        assert broker_config.is_paper is True

        live_config = BrokerConfig(
            api_key="test",
            api_secret="test",
            base_url="https://api.alpaca.markets",
        )
        assert live_config.is_paper is False

    @pytest.mark.sanity
    def test_config_from_env_missing(self, monkeypatch):
        """Test config creation fails without env vars."""
        monkeypatch.delenv("ALPACA_API_KEY", raising=False)
        monkeypatch.delenv("ALPACA_API_SECRET", raising=False)

        with pytest.raises(ValueError):
            BrokerConfig.from_env()


class TestAccountInfo:
    """Sanity tests for AccountInfo."""

    @pytest.mark.sanity
    def test_account_info_creation(self):
        """Test account info initialization."""
        account = AccountInfo(
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
        assert account.account_id == "test-account"
        assert account.buying_power == Decimal("100000")

    @pytest.mark.sanity
    def test_can_trade_options_approved(self):
        """Test options trading approval check."""
        account = AccountInfo(
            account_id="test",
            buying_power=Decimal("100000"),
            cash=Decimal("100000"),
            portfolio_value=Decimal("100000"),
            equity=Decimal("100000"),
            pattern_day_trader=False,
            trading_blocked=False,
            options_approved=True,
            options_level=2,
        )
        assert account.can_trade_options() is True

    @pytest.mark.sanity
    def test_can_trade_options_blocked(self):
        """Test blocked account cannot trade."""
        account = AccountInfo(
            account_id="test",
            buying_power=Decimal("100000"),
            cash=Decimal("100000"),
            portfolio_value=Decimal("100000"),
            equity=Decimal("100000"),
            pattern_day_trader=False,
            trading_blocked=True,
            options_approved=True,
            options_level=2,
        )
        assert account.can_trade_options() is False

    @pytest.mark.sanity
    def test_can_trade_options_not_approved(self):
        """Test options-not-approved account cannot trade."""
        account = AccountInfo(
            account_id="test",
            buying_power=Decimal("100000"),
            cash=Decimal("100000"),
            portfolio_value=Decimal("100000"),
            equity=Decimal("100000"),
            pattern_day_trader=False,
            trading_blocked=False,
            options_approved=False,
            options_level=0,
        )
        assert account.can_trade_options() is False


class TestAlpacaBroker:
    """Sanity tests for AlpacaBroker."""

    @pytest.mark.sanity
    def test_broker_creation(self, broker):
        """Test broker initialization."""
        assert broker.is_connected is False

    @pytest.mark.sanity
    def test_broker_connect(self, broker):
        """Test broker connection."""
        result = broker.connect()
        assert result is True
        assert broker.is_connected is True

    @pytest.mark.sanity
    def test_broker_disconnect(self, broker):
        """Test broker disconnection."""
        broker.connect()
        broker.disconnect()
        assert broker.is_connected is False

    @pytest.mark.sanity
    def test_get_account_not_connected(self, broker):
        """Test get account when not connected."""
        account = broker.get_account()
        assert account is None

    @pytest.mark.sanity
    def test_get_account_connected(self, broker):
        """Test get account when connected."""
        broker.connect()
        account = broker.get_account()
        assert account is not None
        assert isinstance(account, AccountInfo)

    @pytest.mark.sanity
    def test_submit_order_not_connected(self, broker):
        """Test order submission when not connected."""
        order_id = broker.submit_order(
            symbol="SPY231222C00475000",
            qty=1,
            side="buy",
            limit_price=Decimal("2.50"),
        )
        assert order_id is None

    @pytest.mark.sanity
    def test_submit_order_connected(self, broker):
        """Test order submission when connected."""
        broker.connect()
        order_id = broker.submit_order(
            symbol="SPY231222C00475000",
            qty=1,
            side="buy",
            order_type="limit",
            limit_price=Decimal("2.50"),
        )
        assert order_id is not None
        assert order_id.startswith("order-")

    @pytest.mark.sanity
    def test_submit_order_invalid_side(self, broker):
        """Test order with invalid side."""
        broker.connect()
        order_id = broker.submit_order(
            symbol="SPY231222C00475000",
            qty=1,
            side="invalid",
            limit_price=Decimal("2.50"),
        )
        assert order_id is None

    @pytest.mark.sanity
    def test_submit_order_invalid_qty(self, broker):
        """Test order with invalid quantity."""
        broker.connect()
        order_id = broker.submit_order(
            symbol="SPY231222C00475000",
            qty=0,
            side="buy",
            limit_price=Decimal("2.50"),
        )
        assert order_id is None

    @pytest.mark.sanity
    def test_submit_order_limit_without_price(self, broker):
        """Test limit order without price."""
        broker.connect()
        order_id = broker.submit_order(
            symbol="SPY231222C00475000",
            qty=1,
            side="buy",
            order_type="limit",
            limit_price=None,
        )
        assert order_id is None

    @pytest.mark.sanity
    def test_cancel_order_not_connected(self, broker):
        """Test order cancellation when not connected."""
        result = broker.cancel_order("test-order")
        assert result is False

    @pytest.mark.sanity
    def test_cancel_order_connected(self, broker):
        """Test order cancellation when connected."""
        broker.connect()
        result = broker.cancel_order("test-order")
        assert result is True

    @pytest.mark.sanity
    def test_get_order_status_not_connected(self, broker):
        """Test order status when not connected."""
        status = broker.get_order_status("test-order")
        assert status is None

    @pytest.mark.sanity
    def test_get_order_status_connected(self, broker):
        """Test order status when connected."""
        broker.connect()
        status = broker.get_order_status("test-order")
        assert status is not None
        assert "status" in status

    @pytest.mark.sanity
    def test_get_positions_not_connected(self, broker):
        """Test get positions when not connected."""
        positions = broker.get_positions()
        assert positions == []

    @pytest.mark.sanity
    def test_get_option_chain_not_connected(self, broker):
        """Test get option chain when not connected."""
        chain = broker.get_option_chain("SPY")
        assert chain == []


class TestTradingConstants:
    """Sanity tests for trading hour constants."""

    @pytest.mark.sanity
    def test_market_hours(self):
        """Test market hour constants."""
        assert MARKET_OPEN == time(9, 30)
        assert MARKET_CLOSE == time(16, 0)

    @pytest.mark.sanity
    def test_alpaca_cutoff(self):
        """Test Alpaca 0DTE cutoff time."""
        assert ALPACA_0DTE_CUTOFF == time(15, 15)

    @pytest.mark.sanity
    def test_cutoff_before_close(self):
        """Test cutoff is before market close."""
        assert ALPACA_0DTE_CUTOFF < MARKET_CLOSE
