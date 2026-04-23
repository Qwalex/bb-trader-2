# Legacy Parity Backlog

Focused list of still-partial areas after the logic-bug rescan implementation pass.

## Trader / Bybit Parity

- Full DCA sizing policy parity with legacy edge-case handling.
- Advanced TP/SL orchestration parity (partial scaling and trailing variants).
- Exchange reconciliation pass for uncertain cancel/close outcomes under API timeouts.
- Strong duplicate-exposure lock across concurrent worker jobs.

## Classifier / Transcript Parity

- Richer transcript extraction prompt parity for noisy multilingual signals.
- Golden message set for extraction regressions across primary and fallback models.
- Additional validation for partial signal normalization edge cases.

## Diagnostics / Observability

- Persisted queue-level lag/throughput counters for historical trend analysis.
- Structured rendering of diagnostic step payloads (full expandable JSON).
- Built-in incident timeline view linking ingest -> draft -> orders -> lifecycle.

## Analytics Surfaces

- Richer trades and orders analytics cards (entry quality, slippage, execution latency).
- Deeper dashboard drill-down for source reliability and cabinet-level risk outcomes.
