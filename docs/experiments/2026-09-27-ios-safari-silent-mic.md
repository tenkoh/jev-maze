# 調査: iPhone で音声が認識されない

2026-09-27

## 症状

デプロイ済みのサイトで、PC の Chrome では問題なく認識されるのに、iPhone では次のようになった。

- **iPhone の Chrome**：マイクの許可確認が何度も出て、毎回「声が聞き取れませんでした」になる。
- **iPhone の Safari**：うまく認識される回と、「声が聞き取れませんでした」になる回がある。リロード直後の 1 回目から失敗することもあれば、何回か続けて成功したあとに失敗することもある。

端末は iOS 27（UA は `iPhone OS 18_7 … Version/27.0 … Safari/604.1`。iOS 26 以降の Safari は、UA の OS バージョンを 18 系に固定している）。Bluetooth 機器はつないでおらず、他のアプリへの切り替えもしていない。

## 結論

- **iPhone の Safari**：ときどき、**iOS がページに完全な無音（サンプル値がすべて 0）を渡している**。Web Speech API の認識器も `getUserMedia` のストリームも同じ無音を受け取るので、アプリ側の作りでは回避できなかった。無音を検知して「マイクの音が届いていませんでした。ページを再読み込みしてお試しください」と表示するところまでを対策とした。
- **iPhone の Chrome**：WKWebView で動くため Safari とは事情が違う。WKWebView では Web Speech API が有効になっていないという報告があり、許可確認が毎回出るのも WKWebView の既知の挙動。「Safari で開いてください」と案内することにした。実機のログは取っていない。

## 調べ方

`?debug` のとき、認識器のイベント（`start` / `audiostart` / `soundstart` / `speechstart` / `result` / `error` / `stop()` / `end`）、`getUserMedia` の結果、マイクの許可の状態を、START からの経過時間つきで画面に出すようにした。iPhone の Safari で遊んでもらい、成功した回と失敗した回のログを比べた。

失敗した回は、どの条件でも同じ形になった。

```
start()
start
audiostart
（3 秒間、何も来ない）
stop()
audioend
error aborted
end
```

成功した回は、`audiostart` のあとに `speechstart` と `result` が続く。

## 試したこと

| 仮説 | 試したこと | 結果 |
| --- | --- | --- |
| 前回の認識器が `end` を出さずに残り、マイクを占有している | `stop()` のあと 1200ms たっても `end` が来なければ `abort()` する | 失敗は減らず。失敗した回も `end` は来ていた。対策自体は害がないので残した |
| START のたびに `getUserMedia` で開いてすぐ閉じるのが、認識器のマイクと競合している | 許可済みなら `getUserMedia` を呼ばない（skip）。開いたまま認識が終わるまで保つ（hold） | どちらも失敗した |
| タップから約 2.5 秒後に認識器を起動するので、ユーザー操作の直後と見なされていない | START のタップの中で認識器を起動する（`userActivation.isActive` は `true`） | 失敗した |
| `continuous = true` が iOS で不安定 | `continuous = false` にする | 何回か成功したあと、同じ形で失敗した |
| マイクの段階で音が来ていない | hold のストリームを `AnalyserNode` で測り、1 秒ごとの最大音量をログに出す | **失敗した回は、話している間もずっと `0.000`**。成功した回は、話すと 0.07〜0.53 になった |
| 無音になったストリームは取り直せば戻る | カウントダウン中に完全な無音を検知したら、閉じて `getUserMedia` し直す | 2 回取り直しても `0.000` のままだった |

実際のマイクは静かな部屋でも雑音を拾うので、最大音量がちょうど 0 になることはない。完全な 0 は、iOS が意図的に無音を渡していることを示す。

## 分かったこと

- **その回に許可のダイアログが出たかどうかと、成否がほぼ一致した。** ログでは、ダイアログが出た回は `permission=prompt` で、`getUserMedia`（または認識器の `start`）に 1〜8 秒かかる。こうした回はすべて成功した。`permission=granted` でダイアログが出なかった回は、失敗が多かった。例外として、`continuous = false` の回に、ダイアログなしで成功した回が数回あった。
- 「リロード直後なら成功しやすい」のは、Safari がリロードのたびに許可を忘れて、ダイアログを出し直すことがあるためと考えられる。
- 認識器の設定（`continuous`）、起動のタイミング、`getUserMedia` の使い方は、いずれも成否に関係しなかった。
- 同じ症状（`start` と `audiostart` しか発火しない）は、Apple Developer Forums で iOS 15.1 のころから報告されていて、解決していない。iOS 26.1 のベータ版でも、Safari のマイク入力が壊れて次のベータで直った例がある。今回は iOS 27 が出たばかりの時期なので、iOS 27 の不具合である可能性もある。

## 残した対応

- iPhone の Safari 以外のブラウザ（UA で判定）では、START の下と結果画面に「iPhone・iPad では Safari で開いてください」と表示する。
- iPhone の Safari では、START で開いたマイクを認識が終わるまで保ち、音量を測る。録音の 3 秒間の最大音量が完全な 0 だったら、「マイクの音が届いていませんでした。ページを再読み込みしてお試しください」と表示する。
  - iOS は、タップの中で作った `AudioContext` しか動かさないので、`AudioContext` は START のタップで作る。
  - `AudioContext` が `running` でないときは、測った値を使わない（止まっているときは 0 が読めて、無音と区別できないため）。
  - 測った回数が 5 回（約 0.5 秒）に満たないときは、無音と判定しない。
- `stop()` のあと `end` が来ないときの `abort()`。
- `?debug` のイベントログと音量ログ（UA も表示する）。

## 試していないこと

- Safari のサイトごとの設定で、マイクを「確認」にすること（ページメニュー → Web サイトの設定 → マイク）。毎回ダイアログが出るようになれば、「失敗したらリロード」で確実に直るかもしれない。
- iPhone の Chrome の実機ログ。案内だけで済ませた。
- Apple への報告。

## 参考

- [Web Speech API bugs in iOS 15.1 and macOS Monterey（Apple Developer Forums）](https://developer.apple.com/forums/thread/694847)
- [iOS 26.1 beta Safari audio input is broken（Apple Developer Forums）](https://developer.apple.com/forums/thread/802555)
- [Known audio issues in iOS Safari browser（twilio/twilio-video.js#941）](https://github.com/twilio/twilio-video.js/issues/941)
- [Why is SpeechRecognition not working correctly in Safari?（WICG/speech-api#96）](https://github.com/WebAudio/web-speech-api/issues/96)
