"""
Extended tests for AlphaOptions broker integration - covering previously untested code paths.
"""

import pytest
from datetime import datetime, time, date
from decimal import Decimal
from unittest.mock import patch

from alphaoptions.broker import (
    AlpacaBroker,
    BrokerConfig,
    AccountInfo,
    MARKET_OPEN,
    MARKET_CLOSE,
    ALPACA_0DTE_CUTOFF,
)


class TestBrokerConfigExtended:
    """Tests for uncovered BrokerConfig code paths."""

    @pytest.mark.unit
    def test_config_from_env_success(self, monkeypatch):
        """Test config creation succeeds with env vars set."""
        monkeypatch.setenv("ALPACA_API_KEY", "test-api-key")
        monkeypatch.setenv("ALPACA_API_SECRET", "test-api-secret")

        config = BrokerConfig.from_env()
        assert config.api_key == "test-api-key"
        assert config.api_secret == "test-api-secret"
        assert config.is_paper is True  # Default URL is paper

    @pytest.mark.unit
    def test_config_from_env_custom_base_url(self, monkeypatch):
        """Test config from env with custom base URL."""
        monkeypatch.setenv("ALPACA_API_KEY", "key")
        monkeypatch.setenv("ALPACA_API_SECRET", "secret")
        monkeypatch.setenv("ALPACA_BASE_URL", "https://api.alpaca.markets")

        config = BrokerConfig.from_env()
        assert config.base_url == "https://api.alpaca.markets"
        assert config.is_paper is False

    @pytest.mark.unit
    def test_config_from_env_empty_key(self, monkeypatch):
        """Test config creation fails with empty API key."""
        monkeypatch.setenv("ALPACA_API_KEY", "")
        monkeypatch.setenv("ALPACA_API_SECRET", "test-secret")

        with pytest.raises(ValueError):
            BrokerConfig.from_env()

    @pytest.mark.unit
    def test_config_from_env_empty_secret(self, monkeypatch):
        """Test config creation fails with empty API secret."""
        monkeypatch.setenv("ALPACA_API_KEY", "test-key")
        monkeypatch.setenv("ALPACA_API_SECRET", "")

        with pytest.raises(ValueError):
            BrokerConfig.from_env()


class TestAlpacaBrokerExtended:
    """Tests for uncovered AlpacaBroker code paths."""

    @pytest.mark.unit
    def test_broker_connect_without_config_no_env(self, monkeypatch):
        """Test broker connect fails when no config and no env vars."""
        monkeypatch.delenv("ALPACA_API_KEY", raising=False)
        monkeypatch.delenv("ALPACA_API_SECRET", raising=False)

        broker = AlpacaBroker(config=None)
        result = broker.connect()
        assert result is False
        assert broker.is_connected is False

    @pytest.mark.unit
    def test_broker_connect_without_config_with_env(self, monkeypatch):
        """Test broker connect succeeds from env vars when no config."""
        monkeypatch.setenv("ALPACA_API_KEY", "test-key")
        monkeypatch.setenv("ALPACA_API_SECRET", "test-secret")

        broker = AlpacaBroker(config=None)
        result = broker.connect()
        assert result is True
        assert broker.is_connected is True

    @pytest.mark.unit
    def test_is_market_open_during_hours(self, broker_config):
        """Test is_market_open returns True during market hours."""
        broker = AlpacaBroker(config=broker_config)
        # Mock datetime.now() to return a time during market hours
        with patch("alphaoptions.broker.datetime") as mock_dt:
            mock_dt.now.return_value = datetime(2024, 1, 15, 12, 0)  # Noon
            mock_dt.combine = datetime.combine
            result = broker.is_market_open()
            assert result is True

    @pytest.mark.unit
    def test_is_market_open_outside_hours(self, broker_config):
        """Test is_market_open returns False outside market hours."""
        broker = AlpacaBroker(config=broker_config)
        with patch("alphaoptions.broker.datetime") as mock_dt:
            mock_dt.now.return_value = datetime(2024, 1, 15, 20, 0)  # 8 PM
            result = broker.is_market_open()
            assert result is False

    @pytest.mark.unit
    def test_can_trade_0dte_before_cutoff(self, broker_config):
        """Test can_trade_0dte returns True before cutoff."""
        broker = AlpacaBroker(config=broker_config)
        with patch("alphaoptions.broker.datetime") as mock_dt:
            mock_dt.now.return_value = datetime(2024, 1, 15, 10, 0)  # 10 AM
            result = broker.can_trade_0dte()
            assert result is True

    @pytest.mark.unit
    def test_can_trade_0dte_after_cutoff(self, broker_config):
        """Test can_trade_0dte returns False after cutoff."""
        broker = AlpacaBroker(config=broker_config)
        with patch("alphaoptions.broker.datetime") as mock_dt:
            mock_dt.now.return_value = datetime(2024, 1, 15, 15, 30)  # 3:30 PM
            result = broker.can_trade_0dte()
            assert result is False

    @pytest.mark.unit
    def test_get_time_to_cutoff_before_cutoff(self, broker_config):
        """Test get_time_to_cutoff returns positive seconds before cutoff."""
        broker = AlpacaBroker(config=broker_config)
        with patch("alphaoptions.broker.datetime") as mock_dt:
            mock_now = datetime(2024, 1, 15, 14, 15)  # 2:15 PM (1 hour before cutoff)
            mock_dt.now.return_value = mock_now
            mock_dt.combine = datetime.combine
            # Manually check the time() method
            mock_now_time = mock_now.time()

            result = broker.get_time_to_cutoff()
            assert result is not None
            assert result > 0

    @pytest.mark.unit
    def test_get_time_to_cutoff_after_cutoff(self, broker_config):
        """Test get_time_to_cutoff returns None after cutoff."""
        broker = AlpacaBroker(config=broker_config)
        with patch("alphaoptions.broker.datetime") as mock_dt:
            mock_now = datetime(2024, 1, 15, 16, 0)  # 4:00 PM (past cutoff)
            mock_dt.now.return_value = mock_now
            mock_dt.combine = datetime.combine
            result = broker.get_time_to_cutoff()
            assert result is None

    @pytest.mark.unit
    def test_get_option_chain_connected(self, broker_config):
        """Test get_option_chain when connected returns list."""
        broker = AlpacaBroker(config=broker_config)
        broker.connect()
        chain = broker.get_option_chain("SPY")
        assert isinstance(chain, list)

    @pytest.mark.unit
    def test_get_option_chain_with_expiration(self, broker_config):
        """Test get_option_chain with specific expiration date."""
        broker = AlpacaBroker(config=broker_config)
        broker.connect()
        chain = broker.get_option_chain("SPY", expiration=date.today())
        assert isinstance(chain, list)

    @pytest.mark.unit
    def test_get_positions_connected(self, broker_config):
        """Test get_positions when connected."""
        broker = AlpacaBroker(config=broker_config)
        broker.connect()
        positions = broker.get_positions()
        assert isinstance(positions, list)

    @pytest.mark.unit
    def test_submit_order_market_type(self, broker_config):
        """Test submitting a market order (no limit price needed)."""
        broker = AlpacaBroker(config=broker_config)
        broker.connect()
        order_id = broker.submit_order(
            symbol="SPY231222C00475000",
            qty=1,
            side="buy",
            order_type="market",
            limit_price=None,
        )
        assert order_id is not None

    @pytest.mark.unit
    def test_submit_order_sell_side(self, broker_config):
        """Test submitting a sell order."""
        broker = AlpacaBroker(config=broker_config)
        broker.connect()
        order_id = broker.submit_order(
            symbol="SPY231222C00475000",
            qty=1,
            side="sell",
            order_type="limit",
            limit_price=Decimal("2.50"),
        )
        assert order_id is not None

    @pytest.mark.unit
    def test_disconnect_clears_account(self, broker_config):
        """Test disconnect clears cached account info."""
        broker = AlpacaBroker(config=broker_config)
        broker.connect()
        account = broker.get_account()
        assert account is not None

        broker.disconnect()
        assert broker._account is None
        assert broker.is_connected is False
