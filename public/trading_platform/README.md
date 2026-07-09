# Cova TradingView asset slot

This folder mirrors the architecture TradeZella uses: the app points TradingView widget construction at `/trading_platform/` and expects the official licensed TradingView Charting Library / Trading Platform files here.

Do **not** commit copied third-party TradingView assets unless Cova has the proper license/approval. Once licensed assets are available, drop the vendor-provided files here, including `charting_library.js` and its supporting bundles/static files. The Practice route will automatically switch from the SVG fallback to the hosted TradingView widget when `/trading_platform/charting_library.js` is served as JavaScript.
