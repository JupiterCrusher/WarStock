import math
import unittest
from unittest.mock import patch

import main
import news_data
import stock_data


class ModelTests(unittest.TestCase):
    def test_moving_average_uses_recent_valid_scores(self):
        scores = [
            {"raw_score": 10},
            {"raw_score": float("nan")},
            {"raw_score": 30},
            {"raw_score": 50},
        ]
        self.assertEqual(main.calculate_moving_average(scores, window=3), 40)

    def test_previous_score_skips_invalid_values(self):
        scores = [
            {"stock_score": 0.25},
            {"stock_score": math.inf},
        ]
        self.assertEqual(main.previous_score(scores, "stock_score"), 0.25)

    @patch.object(news_data, "fetch_feed")
    def test_news_signal_weights_high_severity_terms(self, fetch_feed):
        entry = {"title": "Nuclear warning after border clash", "summary": ""}
        fetch_feed.return_value.entries = [entry]
        self.assertAlmostEqual(news_data.get_news_signal(), 0.6)

    @patch.object(stock_data.yf, "Ticker")
    def test_stock_signal_falls_back_without_market_data(self, ticker):
        ticker.return_value.history.return_value = []
        self.assertEqual(stock_data.get_stock_signal(), 0.5)


if __name__ == "__main__":
    unittest.main()
