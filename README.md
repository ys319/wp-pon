# WP-Pon

ローカル開発用に雑にWordPressコンテナを作るツール！

検証環境なんでアップロード制限とかめっちゃ緩くしてある。

## 使い方

```bash
deno install -gWfn wp-pon --allow-run=chmod main.ts
wp-pon hello_world -p 8000 -v latest
```
