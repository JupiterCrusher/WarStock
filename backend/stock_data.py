import yfinance as yf

TICKERS = ["LMT", "NOC", "RTX", "GD", "BA"]
NORMALIZER = 5  # percent movement that maps to max score of 1.0

def get_stock_signal():
    scores = []
    for ticker in TICKERS:
        data = yf.Ticker(ticker).history(period="2d")
        if len(data) < 2:
            continue
        prev_close = data["Close"].iloc[-2]
        curr_close = data["Close"].iloc[-1]
        percent_change = ((curr_close - prev_close) / prev_close) * 100
        score = min(max(percent_change / NORMALIZER, 0), 1)
        scores.append(score)
    return sum(scores) / len(scores) if scores else 0.5