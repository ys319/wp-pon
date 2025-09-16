# WP-Pon

ローカル開発用に雑にWordPressコンテナ環境を作るツール！Deno製！

実行するとdocker-compose.ymlとかが良い感じにこう…良い感じになります！

検証環境なんでアップロード制限とかめっちゃ緩くしてある！(1TBってなんだよ)

## 使い方

```bash
deno install -gWfn wp-pon --allow-run=chmod main.ts
wp-pon hello_world -p 8000 -v latest
```

## 雑インストール

```bash
deno install -gWfn wp-pon --allow-run=chmod https://raw.githubusercontent.com/ys319/wp-pon/refs/heads/main/main.ts
```
