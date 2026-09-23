# DataEx SIMPLE-FLOW-2.0 実装・検証報告

2026-09-20。今回の範囲：承認エラー、一方向の操作、統合CSV、同じアウトカムの研究間確認、観測できたローカル重複処理。

## 結果

必須の初回承認、選択行内の操作、累積4研究、統合CSV実保存・再読込は合格。VITALの新規抽出は実行せず、今回の新規結果262 Raw / 46 Outcome / 314 Sourceの保存済みコピーを使用した。旧238/65/59へ件数を合わせていない。自動操作の採用者は「研究者承認ではない」と明記。実研究者の承認には数えない。

## 原因と修正

- R15 Death from cancer：空欄可と案内された確認者が、出典検査では必須だった。初回承認時に一度、本人入力の氏名または任意IDを保存し、同じ承認操作を続行する。過去の担当者を補完しない。
- 内部の確認方法を表示ラベルから分離し、旧記録の契約と互換の固定定数を使用。確認・位置特定・承認を分離したまま、各値の版に対応する新規承認を保存する。
- 数値表の選択行と承認・CSVボタンを同じ枠に配置。承認後は留まる。次研究は別ボタン。
- 比較→大カテゴリー→日本語の意味／原著名→時点の行へ整理。全群・全候補・Rawを保持。3群以上では既存のA/B比較を選択する。効果方向や未存在比較は生成しない。
- 標準は統合CSV一種類。左に独立数値、右に値別出典・定義・履歴・ID。従来形式は詳細・互換機能に残す。HRとCIだけの場合に、SEやlog HRを自動生成・採用しない。
- 編集時に簡略なlegacy sourceへ戻ってしまう経路を修正。既存editDefaults/native evidenceを再利用し、同じ値ID・出典ID・PDF名・原文・ページで確認できた資料識別・位置・取得方法を保持。既存承認を現在値へ合わせない。修正後は再承認待ち。
- 同revisionの内容変更も、保存前の内容比較で拒否。研究と解析表所属をIndexedDBの同一transactionで保存する。保存失敗・競合時に次へ進まない。

## 実画面の検証

1. 未採用VITALコピー：R15 HR 0.83、CI 0.67～1.02、水準95。担当者を一度設定→承認→同じ行に留まる→CSV実保存。PDF p.6 Table 2と対応。数値ごとの出典補記は不要。
2. 架空A/B/C/D：大分類・同じアウトカム・12 weeksを保持し、各研究自身のPDFへ切替。イベント数/分母は順に5/40対2/39、6/40対3/39、7/40対4/39、8/40対5/39。累積1→2→3→4行と実保存を確認。
3. 値左クリックで原著の黄色表示、右クリックとF2でクリック値の編集。キャンセルでは値・承認を保持。取消後は未採用となり、出力が拒否される。再承認で復帰。
4. 別の専用DBコピーで架空Dを8→7（未採用）→8へ訂正し、明示的に再承認。4研究CSVをDataEx自身から実保存し、修正履歴・出典・承認版を再読込で確認。Rawは8のまま。
5. 実際の2タブで同じrevision・内容を取得。Aのみ保存成功、Bは同revisionの内容変化で拒否。Aの保存を保持（two-real-tabs.json）。
6. 再読込後に「続きから再開」で4研究・承認・担当者・解析表が保持されることを確認。PDFはブラウザメモリに保持されるため再読込後は再接続が必要。

## 検査数と範囲

今回実行した自動チェックは723件、全件合格。内訳：既存21スクリプト420、関連／追加13スクリプト282、実IndexedDBの異常系21。過去873等を流用していない。実画面の操作試験はこの件数と別記。

異常系は値改変、固定承認欠落、旧版・未保存、保存途中のtransaction失敗、同revision変更、PDF違い、定義・型・方向の不一致、共有対照・重複、候補なし、停止・遅延返却、保存ダイアログ中の変更、取消、コピー拒否を対象とする。すべてを実GUIで故障注入したわけではなく、GUI／純粋関数／実IndexedDBを区別したログを添付する。

## 実出力

- evidence/VITAL-R15-unified-final.csv：1結果行・86列。HR/CI/水準の各独立数値と各専用出典列。GIVは未採用。
- evidence/A-D-unified-final.csv：4結果行・45列。直接承認の累積表。
- evidence/A-D-edited-final.csv：4結果行・45列。架空Dの8→7→8、修正理由、対応出典、新しい承認を含む。
- evidence/A-D-numbers.tsv：同じ順序の4研究×4数値。アプリが表示したTSVを保存。CSVから別生成してアプリ出力を代用していない。
- evidence/edited-csv-roundtrip.json：実CSVの16数値・全Raw不変・承認ID・履歴照合。

いただいた初期CSVは退避コピーで1行103列・0.83/0.67/1.02/95を確認。現在版は全行空欄の列だけを省いた86列。数値と文章は別セル。Desktopの添付元パスは最終再確認時に存在しなかったため、退避済みコピーと新たな実出力を納品する。

## 時間の観測

|対象|重複した同一検査をもう一度実行|再利用後|短縮|
|---|---:|---:|---:|
|simple-flow-test-real|346.2 ms|194.5 ms|151.7 ms|
|simple-flow-test-synthetic|183.1 ms|111.0 ms|72.0 ms|

5反復の中央値。同じ保存済み値・出典・承認を用い、出力semantic diffは0。比較前は同じ処理へ重複projectionを追加した対照実験であり、旧リリース全体の速度比較ではない。必須出力ゲートは省いていない。

区間：PDF準備・原文取得は既存pageData Promiseキャッシュ、documentVault、PDF識別WeakMapを再利用。新しい重複キャッシュ・新ページバッチは追加していない。AI推論・ツール全文往復・新規結果構造化は今回再抽出しないため未測定。承認クリックから保存済み表示までの参考値973msにはブラウザ操作ツールの往復も含み、純粋IndexedDB時間ではない。保存・描画単独時間と実PDF読取時間は未分離。AI短縮は主張しない。

## 保全と保存先

本番dataex-review-workspaceの4レコードは前後payload完全一致。Raw/Source/承認/履歴を含む。旧VITAL238/65/59、新規VITAL259/43/311、今回新規VITAL262/46/314、Schwartzman195/53/60（承認1件）を保全。本番55設定キーのpayloadも一致。

検証はdataex-simple-flow-studies-20260920／projects／cache、dataex:simple-flow-20260920:、修正試験はdataex-simple-edit-studies-20260920等へ分離。同じoriginでもDB・キーを別にしている。原子的保存試験と2タブ試験も別DB。VITALは再抽出せず、元PDF・元JSONを編集していない。Core/Prompt/計算/比較方向/共通preflightExportは不変。preflightExport以降のコードは元とバイト相当比較で一致。

## 制限・未実施

- AI抽出は依頼文コピー→チャット送信→既存site toolsまたはJSON返却。アプリ単独ワンクリック抽出ではない。今回新規抽出を実行していない。
- コピーAPIの成功とアプリの表示TSVは確認。外部OSクリップボードの読み返しは異なる内容を返し、連携経路の検証ができなかった。実RevMan貼付は未実施。数値の手動コピー欄も提供する。
- 最初のVITAL CSVの実ファイル保存は確認済み。以後の内蔵ブラウザのnative保存先ダイアログは自動操作できず、「保存ダイアログが使えない場合→同じCSVをダウンロード」で実ファイルを確認。利用者の取消後に勝手にダウンロードする経路は追加していない。
- 隔離アプリでは既存設定保存処理の警告が出た。localStorage消去は行っていない。IndexedDBの承認と表の保存は正常で、再開ボタンから復元できた。現在作業の自動再選択はこの環境では保証しない。
- 反復異常系試験で長い履歴を積んだ別DBでは、既存のCSV1セル32767文字上限を超えて出力を停止した。切捨てや履歴削除をせず、当該DBを保全。通常の修正1往復は別コピーからCSV出力まで合格。長大な履歴のCSV内分割は今回未実装。
- 架空4研究は操作の試験であり、実4論文の独立精度評価ではない。全論文の正確性保証、広範な再抽出・監査は行わない。

## 起動・版・戻し方

SIMPLE-FLOW-2.0 / OUTPUT-GATE-1.0 / CSV-TRACE-1.1。起動方法・host/portは維持。

```powershell
& 'F:\マイドライブ\2016年works\AI\作成アプリ\データ抽出について\start-dataex.ps1'
```

http://127.0.0.1:8766/dataex-chatgpt.html

更新前はwork/simple-flow-20260920/before、DBはworkspace-before.json.gz・settings-before.json.gzに退避。release-manifest.jsonに更新前後SHA-256を保存。Rollback-SimpleFlow.ps1は現在ファイルが今回版と一致するときだけ変更済みファイルを戻す。以後の変更があれば停止する。新規ファイルは未参照のまま残し、削除しない。DB・Raw・承認はロールバックしない。DB復元は専用の別DBへ検証してから行い、既存DBを自動上書きしない。

push/deploy（外部公開）、Git reset/clean、commit、ファイル整理削除は実行していない。今回のローカル資産反映だけを行う。

## 変更一覧

- dataex-chatgpt.html
- dataex-confirmation.js
- dataex-csv-trace.js
- dataex-focus-review.js
- dataex-outcome-workflow-ui.js
- dataex-outcome-workflow.js
- dataex-review-store.js
- dataex-review-workspace.js
- dataex-simple-flow-ui.js
- dataex-simple-flow.css
- dataex-simple-flow.js
- dataex-work-session-ui.js
- dataex-work-session.js
- README.md

補助成果物：この報告書、PDF手順書、検証コード／ログ／実画面、実CSV／TSV、保全manifest、戻し用スクリプト。

## 本体反映後の最終照合

14資産の実配信内容とrelease-manifest.jsonのSHA-256が一致。manifest SHA-256: a2512a09acd39389ae6100b9a3851fd19c1eea0d1ceca44d58f531429bfaa7d5。
新しい本体タブで保存済みVITALへ同じ原著を再接続し、12ページ、Raw262、採用0件を確認。0.83の左クリックでPDF p.6 Table 2のDeath from cancer / HR列が黄色表示された（evidence/production-final.png）。本番では承認していない。
反映・再接続・原著表示後にも本番4レコードと55設定キーを再退避し、開始前payloadとの完全一致を確認。Git refsも不変。実測結果はevidence/post-install-integrity.json。
