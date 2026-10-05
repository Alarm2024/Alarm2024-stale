# stale

How many slots does your Solana RPC trail a reference endpoint? stale asks both
for `getSlot` at `processed` commitment once a second and says **FRESH**,
**STALE** or **UNKNOWN** — UNKNOWN whenever it cannot tell.

```bash
go install github.com/Alarm2024/stale/cmd/stale@latest
stale check https://your-rpc.example --ref https://api.mainnet-beta.solana.com
stale serve --upstream https://your-rpc.example --ref https://api.mainnet-beta.solana.com
```

What it does not measure is on the page: https://stale.elghaly.dev/#limits

MIT · read-only · needs no keys and no wallet

## License

Code: MIT, see [LICENSE](LICENSE).
Docs and images: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), © elghaly. Third-party fonts, logos and screenshots of other services keep their own licenses.
