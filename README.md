# Voice Maze (jev-maze)

3 秒間の音声指示だけでキャラクターをゴールへ導く迷路ゲーム。発話は TypeSafe の Jev が 1 ステップずつ行動に翻訳する。仕様は [docs/spec.md](docs/spec.md)。

## セットアップ

```sh
pnpm install
cp .dev.vars.example .dev.vars   # TYPESAFE_API_KEY を記入（git 管理外）
pnpm dev                         # http://localhost:5173
```

- 音声認識は Web Speech API を使う（Chrome 推奨、マイク許可が必要）。
- `?debug` を付けると、テキストで発話を入力できる。ステージ選択と、Jev の回答（確信度・レイテンシ）も表示する。
- `?stage=stage-3` で、ステージを指定できる。

## 開発ループ（品質ゲート）

```sh
pnpm check   # format:check → lint → typecheck → test
```

| コマンド                       | 内容                                         |
| ------------------------------ | -------------------------------------------- |
| `pnpm format` / `format:check` | oxfmt                                        |
| `pnpm lint`                    | oxlint（警告もエラー扱い）                   |
| `pnpm typecheck`               | tsc（app / worker / node の 3 構成）         |
| `pnpm test`                    | vitest（迷路・移動・解釈ループ・Worker API） |

## サプライチェーン対策（pnpm-workspace.yaml）

- `minimumReleaseAge: 10080`：公開から 1 週間未満のバージョンはインストールしない。
- `strictDepBuilds: true`：依存パッケージのインストールスクリプト（postinstall など）は既定で実行しない。未審査のスクリプトがあればインストールを失敗させる。
- `allowBuilds`：`esbuild` と `workerd` は `false`（実行しない）。どちらのスクリプトも、バイナリを取り直すための予備手段にすぎない。バイナリ本体は optionalDependencies で入る。

## 構成

```
shared/protocol.ts     ブラウザと Worker で共有する型・定数
worker/                Hono API（/api/next-step）と Jev の質問定義
src/game/              迷路・移動計算・難易度 BFS・解釈ループ・移動キュー（純粋ロジック＋テスト）
src/components/        SVG の盤面・ロボット・各フェーズのパネル
src/App.tsx            ゲームフロー（カウントダウン → 録音 → 解釈と移動 → 判定）
```

### Jev の使い方（仕様からの補足）

- 1 リクエストで `next_direction`（Choice）、`next_count`（Choice）、`is_done`（Noul）の 3 問を並列に聞く。
- 「曲がる」の変換表（`turns_from_current_facing`）と「何番目の移動か」（`next_step_number`）は、コードが計算して state に入れる。Jev には表を引かせるだけにして、数える処理や間接的な推論を避ける。
- 迷路の壁やゴールは state に入れない（仕様の「忠実な翻訳者」方針）。
- `until_wall` と `unspecified` は同じ動きになる。このため確率がこの 2 つに割れているときは合算して判定する（`GROUP_PROB_TH = 0.85`、`src/game/interpret.ts`）。
- 閾値（`DONE_TH = 0.8`、`CONF_TH = 0.7`）は暫定値。実際の発話データで調整する。

## デプロイ（未実施）

```sh
pnpm build
pnpm exec wrangler secret put TYPESAFE_API_KEY
pnpm exec wrangler deploy
```
