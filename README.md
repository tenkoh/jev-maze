# Voice Maze (jev-maze)

3 秒間の音声指示だけでキャラクターをゴールへ導く迷路ゲーム。発話は TypeSafe の Jev が 1 ステップずつ行動に翻訳する。仕様は [docs/spec.md](docs/spec.md)。

## セットアップ

```sh
pnpm install
cp .dev.vars.example .dev.vars   # TYPESAFE_API_KEY を記入（git 管理外）
pnpm dev                         # http://localhost:5173
```

- 音声認識は Web Speech API を使う（Chrome 推奨、マイク許可が必要）。
- iPhone では Safari だけが対象。他のブラウザでは「Safari で開いてください」と案内する。Safari でも、iOS がマイクに完全な無音を渡すことがあるため、音量を測って無音なら再読み込みを促す（[調査記録](docs/experiments/2026-09-27-ios-safari-silent-mic.md)）。
- `?debug` を付けると、テキストで発話を入力できる。ステージ選択と、Jev の回答（確信度・レイテンシ）も表示する。音声認識のイベント・マイクの音量・UA のログも出す。
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
- 方向はすべて画面上の方向として扱う。キャラクターに向きはないので、「右に曲がって」も画面の右になる。仕様書の「曲がる は `current_facing` 基準」から変更した。方向の値は、Jev の選択肢からアプリ内部まで `up / down / left / right` に統一している（仕様書の東西南北は使わない）。
- 「何番目の移動か」（`next_step_number`）はコードが数えて state に入れる。方向の質問には「方向語が出るたびに次の移動」という区切りのルールを書き、別の移動を選んでしまう誤りを防ぐ。
- 迷路の壁やゴールは state に入れない（仕様の「忠実な翻訳者」方針）。
- 距離の指定がない指示は `until_wall`（突き当たりまで）として答えさせる。以前は別の選択肢 `unspecified` にしていたが、同じ動きの選択肢が 2 つあると確率が割れて確信度が下がるだけなので、統合した。
- 音声認識の結果には読点がほとんど付かないので、Jev に渡す前に、文頭以外の方向の漢字の前へ読点を入れる（`separateMovements`、`worker/jev.ts`）。区切りがないと、後ろの移動の距離が前の移動のものとして読まれやすいため。
- 閾値（`DONE_TH = 0.8`、`CONF_TH = 0.7`、移動量が `until_wall` のときだけ `UNTIL_WALL_CONF_TH = 0.6`）は暫定値。実際の発話データで調整する。

## デプロイ

https://voice-maze.jevpoc.tenkoh.dev で公開している（Workers の Custom Domain。workers.dev の URL は無効）。

```sh
pnpm exec wrangler secret put TYPESAFE_API_KEY  # 初回のみ
pnpm build
pnpm exec wrangler deploy
```
