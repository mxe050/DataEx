# Final Review / Fuzzy ICO v4 実装・受入報告

実施日: 2026-09-09。継続検証・更新: 2026-09-10。対象ブランチ: `dataex-chatgpt-phase1`。

## 実装結果

AI候補とFinalを並べる編集画面、セルの鉛筆・操作メニュー、未保存の修正を保存してOutcomeを確定する操作、確定解除を追加した。数値の通常クリックは従来のClick-to-Sourceを使用する。

Finalizationは修正・残りの候補の採用・Outcome確定を一つの判断として保存する。無効な数値やIndexedDBの保存失敗では部分保存しない。RawとAI候補を上書きせず、変更前後のFinal、修正フィールド、理由、時刻、Outcomeの確定・解除を履歴に残す。既存の個別除外・保留は一括確定で採用へ戻さない。

ICO入力は推奨とし、必須にはしていない。Fuzzy Core本文を変更せず、その後へ意味対応の指示を付加する。既存の `outcomes[].mapping`、原著群の役割、提案を利用する。結果側にSR概念と原著用語を表示し、DisabilityとRoland等の既知の構成概念も対応候補として提示する。Bothersomeness / interference / pressure pain threshold / analgesic useをPain intensityやDisabilityへ誤って固定しない。Simulated / sham群を無条件に介入へ統合しない。

人間がOutcomeを確定した時点の名称と原著の尺度名を、当該Review Workspaceレコードの `reviewMapping` に保存する。同じレビューの次のbriefへ、出所付きの `mappingDecisions` として渡す。別研究での自動確定はしない。未確定・確定解除済みの対応は学習候補へ流さない。

事前入力欄、AI API、PDF送信、数値の新しい抽出・合算ロジックは追加していない。

## 変更ファイル（11ファイル）

| ファイル | 内容 |
|---|---|
| dataex-chatgpt.html | ICO推奨の文言、意味対応モジュール読込 |
| dataex-ico-mapping.js（新規） | 意味対応の指示、候補表示用の対応、確認済み用語の再利用 |
| dataex-fuzzy-workspace.js | briefへICO指示と同一レビューの確認済み用語を接続 |
| dataex-results-model.js | SRに対応するOutcome候補を提示 |
| dataex-results-ui.js | SRと原著用語・4群の対応候補を表示 |
| dataex-decisions.js | 一括Finalization、Outcome確定解除、対応の保存、履歴 |
| dataex-review-workspace.js | 鉛筆、AI/Final編集、未保存編集の確定、Studyサマリー |
| dataex-review.css | コンパクトな鉛筆と3列編集画面、狭い幅への対応。数値と鉛筆のクリック領域を別の行へ配置 |
| dataex-finalreview.test.cjs（新規） | 新規21件のモデル・契約テスト |
| dataex-decisions.browser.test.cjs | 従来19件を保持し、文言・確定ダイアログ・明示的確定解除へ操作を更新。375/960/1440pxで数値と鉛筆の領域・動作を検証する1件を追加（計20件） |
| DATAEX_FINAL_REVIEW_V4.md（本書） | 実装、検証方法、結果、制限 |

`dataex-fuzzy-core.js`、PDF操作・selection・caption・visual・source-navigation、既存Classic/公開indexは今回変更していない。

## Cherkin 2009 受入テスト1〜8

URL: `http://127.0.0.1:8766/dataex-chatgpt.html`。既存の `start-dataex.ps1` で8766の稼働を確認し、内蔵ブラウザの別タブで実施。

PDF: `F:/マイドライブ/2016年works/AI/作成アプリ/GRADEopen/DataExtraction/例３/Cherkin 2009.pdf`、22ページ。

現在の180 Raw / 31 inventory outcomesの既存抽出を、`TEST v4 — Cherkin 2009（6.4は動作確認用）` という別レビューへ複製した。これはUIの再生テストであり、新しいblind extractionや臨床値の訂正ではない。元レビューのMean 6.3は変更していない。

| Test | 結果 | 実画面で確認した内容 |
|---|---|---|
| 1 | PASS | I=Acupuncture、C=Usual care、O=Disability。主要にRolandを表示し、SR/原著用語の対応を表示。Bothersomenessは別OutcomeでDisabilityへの対応表示なし |
| 2 | PASS | Individualized / Standardized / Simulated / Usual careの4群を保持。最初の2群をAcupuncture候補、Usual careをComparator候補、Simulatedを別群・要確認と表示 |
| 3 | PASS | Standardized × 8 weeksの6.3 (5.7)からp.21 Table 2の該当値へ移動。黄色矩形は約25.6×11 CSS pxのセル領域。表示メッセージは「値を特定」 |
| 4 | PASS | 鉛筆からMean 6.4へテスト修正。AI 6.3 / Final 6.4を並列表示、保存後EDITED・修正済バッジ |
| 5 | PASS | 修正1件を含むOutcome確定ダイアログを経てFinal 6.4で確定。n未確定を許容。未保存の注記編集も「修正を保存して確定」で保存 |
| 6 | PASS | 「確定を解除して編集」で再開。編集画面はRaw 6.3 / Final 6.4 / SD 5.7 / n空欄を保持 |
| 7 | PASS | 通常CSVプレビューと実ファイルはFinal Mean 6.4・EDITED。auditはRaw Mean 6.3とFinal Mean 6.4およびPOINT / FINALIZE_OUTCOME / REOPEN_OUTCOMEの履歴を保持 |
| 8 | PASS | O空欄でbriefはDISCOVERY・extractionBlocked=false。既存Discovery RawからRoland / Bothersomenessの主要2件を自動分類して表示。新たなAI抽出精度の評価は対象外 |

追加の画面確認: Usual care 8.9 (6.0)→p.21該当セル、Rolandタイトル→p.21 Outcomeブロック、調整効果 -2.63 [-3.69,-1.56]→p.22該当値、Roland responder→p.17 Figure 4。PDF検索、黄色表示、手動の範囲選択・画像プレビュー・確定、Figure 4の近傍caption（MATCHED）も確認。375px幅で操作メニュー、AI/Final編集、保存・キャンセルの操作領域を確認後、通常幅へ戻した。

既存の作業タブは再読込せず保持。更新版タブは元レビューの180 Rawと原著6.3 (5.7)、p.21を表示して残した。6.4の検証レコードは明示したTESTレビュー内にある。

## 2026-09-10の継続検証

既存 `start-dataex.ps1` で127.0.0.1:8766を起動。前回のPlaywrightモジュール参照エラーは、すでにこのPCにある同梱Node、`NODE_PATH`、`DATAEX_PLAYWRIGHT_MODULE`、`DATAEX_PDFLIB_MODULE`を指定して解消した。新しいサーバー方式や外部AI接続は追加していない。自動ブラウザテストはユーザーの保存済みレビューとは別の一時ブラウザプロファイルで実行した。

実画面の狭い左ペインでは、hoverで現れる鉛筆が数値ボタンに重なり、原著へ進まず編集画面が開く不具合を確認した。960pxの追加テストでも修正前に462 CSS px²の重なりを検出した。数値を上段、鉛筆と操作メニューを下段に配置し、非表示の鉛筆がクリックを奪わないよう修正した。抽出・確定・CSVのロジックには追加変更をしていない。

修正後は375/960/1440pxのすべてで重なりが0、数値クリックでp.21の原著セルへ移動、鉛筆クリックで編集画面が開くことを実測した。元のDataEx内蔵ブラウザでも `fresh-r6` の6.3 (5.7)をクリックしてp.21の該当セルを黄色表示し、編集ダイアログが開かないことを確認。鉛筆からはMean 6.3 / SD 5.7の編集画面が開き、キャンセル後も原値を保持した。

PDFのネイティブ文字選択は、内蔵ブラウザのCherkin p.1「Abstract」の青い選択表示と、既存Fuzzyブラウザテストの実PDF文字ドラッグによる非空の選択文字列の両方で確認できた。PDF検索・手動ハイライト・図選択・caption取得も再合格した。

元レビューの180 Raw・20臨床Outcome、Standardized × 8 weeksの6.3 (5.7)を表示した更新版タブを右側に残した。テスト用の6.4を元レビューへ保存していない。この継続作業のリポジトリ変更は `dataex-review.css`、`dataex-decisions.browser.test.cjs`、本報告書の3ファイル。

## 自動テスト（最終状態）

| 対象 | PASS |
|---|---:|
| 既存Phase / Classic / Builder / Fuzzy一括ランナー（16スクリプト） | 155 |
| Results / Sourceモデル | 20 |
| Cherkin結果UI・Click-to-Sourceブラウザ | 19 |
| Decision / CSVモデル | 23 |
| Decision / CSVブラウザ（既存19＋クリック領域1） | 20 |
| Final Review v4追加モデル | 21 |
| **合計（21スクリプト）** | **258 / 258** |

既存236件＋v4追加21件＋クリック領域の回帰1件。最終修正後に全件を再実行して合格。Cherkin結果UIの受入A〜HとDecision/CSVの受入1〜10を含む。上記v4の受入1〜8も維持している。

前回の単体テスト内訳（今回も同じ127項目が合格）:

| 対象 | PASS |
|---|---:|
| Phase 2 | 18 |
| Phase 2.6.1 matcher | 1 |
| Phase 3.2.1 | 5 |
| Phase 3.2.2 | 3 |
| Prompt Builder | 16 |
| Fuzzy Core | 20 |
| Results / Source model | 20 |
| Decision / CSV既存 | 23 |
| Final Review v4追加 | 21 |
| **合計** | **127 / 127** |

既存106件＋追加21件。変更JavaScriptの構文確認も合格。

最終ログ・スクリーンショット: `C:/Users/yuasa/Documents/Codex/2026-09-06/f-2016-works-ai-x20/outputs/DataEx-FinalReview-v4/continuation-2026-09-10/final/`。

- `regression/suite-result.json`: 既存一括155件の全合格記録。
- `finalreview-suite.json`: Results / Decision / Final Reviewの103件の全合格記録。
- `dataex-decisions.browser.test.cjs/source-and-edit-targets.json`: 3幅で重なり0の座標記録。
- `dataex-decisions.browser.test.cjs/source-and-edit-375.png`、`source-and-edit-960.png`、`source-and-edit-1440.png`: 修正後の画面証跡。
- `dataex-results.browser.test.cjs/acceptance-A-H.json`、`dataex-decisions.browser.test.cjs/acceptance-1-10.json`: Cherkin受入結果、出典座標、通信・JavaScriptエラー確認。

前回の依存解決エラーのログと、今回の修正前の重なり検出ログは削除せず保持している。最終結果の失敗ではない。

## CSV証跡

実際のCSV保存ボタンからDownloadsへ保存後、CSVとして全行を読み取って確認し、作業場outputsへ複製した。

保存先: `C:/Users/yuasa/Documents/Codex/2026-09-06/f-2016-works-ai-x20/outputs/DataEx-FinalReview-v4/`

- `TEST v4 — Cherkin 2009（6.4は動作確認用）_master.csv`: 16行、10,845 bytes。
- `TEST v4 — Cherkin 2009（6.4は動作確認用）_audit.csv`: 180行、2,038,868 bytes。

テストの6.4を臨床抽出値として使用しない。通常CSVのn欄は空欄を保持する。完全なn等が必要なPairwise出力には従来の不足値チェックが適用される。

## 既知の制限

- 意味対応のMethods・製品名・投与方法等の解釈は、既存のChatGPT/CodexによるPDF読解経路で行う。クライアント側に独立したAIモデルやAPIは追加していない。対応表示は候補であり、人間の確定を経る。
- 未保存の編集は現在のタブのメモリ内に保持する。保存前のページ再読込や研究切替をまたぐドラフト復元は今回追加していない。

HEAD: `980fec695ad42bad05ed715c73b73571b7c749a3`。main: `f355b304970fe233c6c001ac2184e8d40a5466f2`。この作業でcommit / merge / pushは行っていない。
